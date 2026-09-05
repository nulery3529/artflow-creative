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

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    // Keep the app shell loadable even if Base44's external Google OAuth
    // configuration is temporarily invalid. The local login page can still
    // render and the SDK auth check can recover once the configuration is fixed.
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
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    publishSyncState({ status: 'syncing', at: new Date().toISOString() });
    try {
      // Launch-critical syncing runs entirely on the Vercel/Neon stack. The old
      // Base44 integration quota must never block login, navigation, or data refresh.
      const response = await fetch('/api/tracker-sync', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      const trackerUnavailable = response.status === 409;
      const state = {
        status: response.ok || trackerUnavailable ? 'ok' : 'error',
        at: new Date().toISOString(),
        tracker: response.ok ? data : null,
        message: trackerUnavailable ? (data.error || 'Tracker is not connected yet') : (!response.ok ? data.error : undefined),
      };
      publishSyncState(state);
      window.dispatchEvent(new CustomEvent('artflow:data-synced', { detail: state }));
    } catch (e) {
      // Existing Neon data remains usable even if Google is temporarily unavailable.
      const state = { status: 'ok', at: new Date().toISOString(), message: e?.message || 'Tracker refresh unavailable' };
      publishSyncState(state);
      window.dispatchEvent(new CustomEvent('artflow:data-synced', { detail: state }));
    } finally {
      syncInFlight.current = false;
    }
  }, [publishSyncState]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    // Automatic syncing belongs to the Art Flow session, not the legacy auth
    // provider. Run once after login and then every five minutes while the app
    // is open, regardless of whether the user signed in through Neon/Better Auth
    // or an older Base44 session. Individual providers remain isolated so an
    // unavailable connector never blocks the rest of the app.
    triggerLoginSync();
    const syncId = window.setInterval(() => triggerLoginSync(), 5 * 60 * 1000);
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

    // Art Flow authentication is independent from Google and Base44.
    // Better Auth on Vercel, backed by Neon, is the only login session.
    try {
      const sessionResult = await artflowAuthClient.getSession();
      const session = sessionResult?.data || sessionResult;
      if (session?.user) {
        let summary = null;
        try {
          const response = await fetch('/api/neon-data?op=summary', {
            credentials: 'include',
            cache: 'no-store',
          });
          if (response.ok) summary = await response.json();
        } catch {
          // A summary failure must not invalidate a valid login session.
        }

        const activeBusinessId = summary?.user?.activeBusinessId || null;
        const currentUser = {
          id: session.user.id,
          email: session.user.email,
          full_name: session.user.name || summary?.user?.name || 'Artist',
          name: session.user.name || summary?.user?.name || 'Artist',
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