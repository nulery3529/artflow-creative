import React, { useEffect, useState } from "react";
import { CheckCircle2, Mail, RefreshCw, AlertCircle } from "lucide-react";
import { artflowAuthClient } from "@/lib/artflowAuthClient";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

const RETURN_KEY = "artflow_connect_gmail";

export default function GmailSyncCard() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = async () => {
    try {
      const response = await fetch("/api/gmail-sales-sync", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not check Gmail connection");
      setStatus(data);
      return data;
    } catch (error) {
      setStatus({ connected: false, gmail_access: false, message: error?.message || "Could not check Gmail connection" });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const syncNow = async ({ quiet = false } = {}) => {
    if (syncing) return null;
    setSyncing(true);
    try {
      const response = await fetch("/api/gmail-sales-sync", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || "Gmail sync failed");
        error.code = data.code;
        throw error;
      }
      if (!quiet) toast.success(data.message || "Gmail sales are up to date");
      await loadStatus();
      window.dispatchEvent(new CustomEvent("artflow:data-synced", { detail: { gmail: data } }));
      return data;
    } catch (error) {
      if (!quiet) toast.error("Gmail sync needs attention", { description: error?.message });
      return null;
    } finally {
      setSyncing(false);
    }
  };

  const connectGmail = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      sessionStorage.setItem(RETURN_KEY, "1");
      const result = await artflowAuthClient.linkSocial({
        provider: "google",
        callbackURL: `${window.location.origin}/account?setup=gmail`,
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
        additionalParams: {
          access_type: "offline",
          include_granted_scopes: "true",
          prompt: "select_account",
          ...(user?.email ? { login_hint: user.email } : {}),
        },
      });
      if (result?.error) throw new Error(result.error.message || "Could not connect Gmail");
      if (result?.data?.url) {
        window.location.assign(result.data.url);
        return;
      }
      throw new Error("Google did not return a Gmail connection link.");
    } catch (error) {
      sessionStorage.removeItem(RETURN_KEY);
      toast.error("Could not connect Gmail", { description: error?.message });
      setConnecting(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const current = await loadStatus();
      if (!active) return;
      const returned = new URLSearchParams(window.location.search).get("setup") === "gmail";
      const pending = sessionStorage.getItem(RETURN_KEY) === "1";
      if (returned || pending) {
        sessionStorage.removeItem(RETURN_KEY);
        const synced = await syncNow({ quiet: true });
        if (synced) toast.success("Gmail connected", { description: synced.message || "Automatic sale-email syncing is ready." });
        const url = new URL(window.location.href);
        url.searchParams.delete("setup");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      } else if (current?.gmail_access && !current?.connected) {
        await syncNow({ quiet: true });
      }
    })();
    return () => { active = false; };
  }, []);

  if (user?.auth_backend !== "neon") return null;

  const accountEmail = status?.accounts?.find((item) => item.approved)?.email || status?.accounts?.[0]?.email || "";
  const connected = status?.connected === true;
  const needsReconnect = status?.reconnect_required === true;

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl pastel-blue flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading text-lg">Gmail Sales Inbox</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect the Gmail inbox that receives marketplace sale emails. Art Flow keeps this connection with your business workspace, not with another user's account.
          </p>
        </div>
        {connected ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-1" /> : needsReconnect ? <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-1" /> : null}
      </div>

      {loading ? (
        <div className="h-12 rounded-2xl bg-muted animate-pulse" />
      ) : connected ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-muted/60 p-3">
            <p className="text-sm font-semibold">Gmail connected{accountEmail ? ` · ${accountEmail}` : ""}</p>
            <p className="text-xs text-muted-foreground mt-1">Marketplace sale emails are checked automatically when you sign in and every five minutes while Art Flow is open.</p>
          </div>
          <button
            type="button"
            onClick={() => syncNow()}
            disabled={syncing}
            className="w-full h-12 rounded-2xl bg-muted text-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Checking Gmail…" : "Check Gmail Now"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl bg-muted/60 p-3 text-xs text-muted-foreground">
            {needsReconnect ? "Google is linked, but Gmail read permission needs to be approved again." : status?.message || "Connect Gmail to turn on automatic marketplace sale-email syncing."}
          </div>
          <button
            type="button"
            onClick={connectGmail}
            disabled={connecting}
            className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${connecting ? "animate-spin" : ""}`} />
            {connecting ? "Opening Google…" : needsReconnect ? "Reconnect Gmail" : "Connect Gmail"}
          </button>
        </div>
      )}
    </section>
  );
}