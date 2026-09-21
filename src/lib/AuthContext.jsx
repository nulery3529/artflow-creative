import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { artflowAuthClient } from '@/lib/artflowAuthClient';

const AuthContext = createContext();

const withTimeout = (promise, ms = 8000, label = 'Request') =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      window.setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    ),
  ]);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }
  const [authBackend, setAuthBackend] = useState(null);
  const syncInFlight = useRef(false);
  const lastAutoSyncAt = useRef(0);

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    // Keep the app shell loadable even if an optional Google connector is
    // temporarily unavailable. The local login page must still render.
    setIsLoadingPublicSettings(false);
    setAuthError(null);

    await checkUserAuth();
  };

  const publishSyncState = useCallback((state) => {
    try {
      localStorage.setItem('artflow_last_sync', JSON.stringify(state));
      window.dispatchEvent(new CustomEvent('artflow:sync-state', { detail: state }));
    } catch {}
  }, []);

  const triggerLoginSync = useCallback(async () => {
    const now = Date.now();
    if (syncInFlight.current || now - lastAutoSyncAt.current < 10 * 60 * 1000) return;
    syncInFlight.current = true;
    publishSyncState({ status: 'syncing', at: new Date().toISOString() });
    try {
      // Launch-critical syncing runs entirely on the Vercel/Neon stack. Gmail
      // sales sync is independent from the optional tracker so one connector can
      // recover current orders even when the other needs to be reconnected.
      const runSync = async (url) => {
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
        });
        return { response, data: await response.json().catch(() => ({})) };
      };
      // Run Google services sequentially. Parallel Gmail + Sheets calls against
      // the same account can exhaust Google's per-user quota during login.
      const gmail = await runSync('/api/gmail-sales-sync');
      const expenses = await runSync('/api/gmail-expense-sync');
      const tracker = await runSync('/api/tracker-sync');
      const results = [gmail, expenses, tracker];
      const hardFailure = results.find(({ response }) => !response.ok && response.status !== 409);
      const connectorMessage = results
        .filter(({ response }) => response.status === 409)
        .map(({ data }) => data?.error)
        .filter(Boolean)[0];
      const state = {
        status: hardFailure ? 'error' : 'ok',
        at: new Date().toISOString(),
        gmail: gmail.response.ok ? gmail.data : null,
        expenses: expenses.response.ok ? expenses.data : null,
        tracker: tracker.response.ok ? tracker.data : null,
        message: hardFailure?.data?.error || connectorMessage,
      };
      publishSyncState(state);
      window.dispatchEvent(new CustomEvent('artflow:data-synced', { detail: state }));
    } catch (e) {
      // Existing Neon data remains usable even if Google is temporarily unavailable.
      const state = { status: 'ok', at: new Date().toISOString(), message: e?.message || 'Tracker refresh unavailable' };
      publishSyncState(state);
      window.dispatchEvent(new CustomEvent('artflow:data-synced', { detail: state }));
    } finally {
      lastAutoSyncAt.current = Date.now();
      syncInFlight.current = false;
    }
  }, [publishSyncState]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    // Run once after login and every fifteen minutes while the app is open.
    // Individual connectors remain isolated so one unavailable service never
    // blocks the rest of the app.
    triggerLoginSync();
    const syncId = window.setInterval(() => triggerLoginSync(), 15 * 60 * 1000);
    const syncWhenActive = () => {
      if (document.visibilityState === 'visible') triggerLoginSync();
    };
    window.addEventListener('focus', syncWhenActive);
    window.addEventListener('online', syncWhenActive);
    document.addEventListener('visibilitychange', syncWhenActive);
    return () => {
      window.clearInterval(syncId);
      window.removeEventListener('focus', syncWhenActive);
      window.removeEventListener('online', syncWhenActive);
      document.removeEventListener('visibilitychange', syncWhenActive);
    };
  }, [isAuthenticated, authBackend, triggerLoginSync]);

  const checkUserAuth = async () => {
    setIsLoadingAuth(true);
    setAuthError(null);

    // Better Auth on Vercel, backed by Neon, is the only login session.
    // Ask both Better Auth and the protected Neon summary endpoint. The latter
    // can restore the signed-in app even if the client helper fails to expose
    // an otherwise valid HttpOnly session cookie after a deployment.
    try {
      const [sessionResult, summaryResponse] = await Promise.all([
        artflowAuthClient.getSession().catch(() => null),
        fetch('/api/neon-data?op=summary', {
          credentials: 'include',
          cache: 'no-store',
        }).catch(() => null),
      ]);

      const session = sessionResult?.data || sessionResult;
      let summary = null;
      if (summaryResponse?.ok) {
        summary = await summaryResponse.json().catch(() => null);
      }

      const sessionUser = session?.user || null;
      const summaryUser = summary?.user || null;
      const resolvedUser = sessionUser || (summaryUser ? {
        id: summaryUser.id,
        email: summaryUser.email,
        name: summaryUser.name,
      } : null);

      if (resolvedUser) {
        const activeBusinessId = summaryUser?.activeBusinessId || null;
        const currentUser = {
          id: resolvedUser.id,
          email: resolvedUser.email,
          full_name: resolvedUser.name || summaryUser?.name || 'Artist',
          name: resolvedUser.name || summaryUser?.name || 'Artist',
          role: 'user',
          active_business_id: activeBusinessId,
          data: { active_business_id: activeBusinessId },
          auth_backend: 'neon',
        };

        setUser(currentUser);
        setAuthBackend('neon');
        setIsAuthenticated(true);
        setIsLoadingAuth(false);
        setAuthChecked(true);
        return;
      }
    } catch (error) {
      console.warn('Neon auth check did not return a session:', error?.message || error);
    }

    setUser(null);
    setAuthBackend(null);
    setIsLoadingAuth(false);
    setIsAuthenticated(false);
    setAuthChecked(true);
    setAuthError({ type: 'auth_required', message: 'Authentication required' });
  };

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    setAuthError(null);
    setAuthBackend(null);

    try {
      await artflowAuthClient.signOut();
    } catch {
      // Continue clearing the legacy local session even if server sign-out fails.
    }

    if (shouldRedirect) {
      window.location.replace('/login?clear_access_token=true');
    }
  };

  const navigateToLogin = () => {
    window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
