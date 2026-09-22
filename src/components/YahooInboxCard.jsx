import React, { useEffect, useState } from "react";
import { CheckCircle2, Mail, RefreshCw, Unlink, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_YAHOO = "moe_moe_0069@yahoo.com";

const post = async (body) => {
  const response = await fetch("/api/yahoo-mail", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
};

export default function YahooInboxCard() {
  const [status, setStatus] = useState(null);
  const [email, setEmail] = useState(DEFAULT_YAHOO);
  const [appPassword, setAppPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = async () => {
    try {
      const response = await fetch("/api/yahoo-mail", { credentials:"include", cache:"no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not check Yahoo inbox");
      setStatus(data);
      if (data.email) setEmail(data.email);
      return data;
    } catch (error) {
      setStatus({ connected:false, last_error:error?.message || "Could not check Yahoo inbox" });
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const connect = async () => {
    if (busy) return;
    setBusy("connect");
    try {
      const { response, data } = await post({
        action:"connect",
        email,
        app_password:appPassword,
      });
      if (!response.ok) throw new Error(data.error || "Could not connect Yahoo");
      setAppPassword("");
      toast.success("Yahoo inbox connected", { description:data.message });
      window.dispatchEvent(new CustomEvent("artflow:data-synced", { detail:{ yahoo:data } }));
      await load();
    } catch (error) {
      toast.error("Could not connect Yahoo", { description:error?.message });
    } finally {
      setBusy("");
    }
  };

  const sync = async () => {
    if (busy) return;
    setBusy("sync");
    try {
      const { response, data } = await post({ action:"sync" });
      if (!response.ok) throw new Error(data.error || "Yahoo sync failed");
      toast.success("Yahoo checked", { description:data.message });
      window.dispatchEvent(new CustomEvent("artflow:data-synced", { detail:{ yahoo:data } }));
      await load();
    } catch (error) {
      toast.error("Yahoo sync needs attention", { description:error?.message });
      await load();
    } finally {
      setBusy("");
    }
  };

  const disconnect = async () => {
    if (busy) return;
    setBusy("disconnect");
    try {
      const { response, data } = await post({ action:"disconnect" });
      if (!response.ok) throw new Error(data.error || "Could not disconnect Yahoo");
      toast.success("Yahoo inbox disconnected");
      await load();
    } catch (error) {
      toast.error("Could not disconnect Yahoo", { description:error?.message });
    } finally {
      setBusy("");
    }
  };

  const connected = status?.connected === true;

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl pastel-lavender flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading text-lg">Yahoo eBay Inbox</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect Yahoo directly so Art Flow can read eBay sale confirmations from this inbox. Gmail forwarding is not required.
          </p>
        </div>
        {connected
          ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-1" />
          : status?.last_error
            ? <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-1" />
            : null}
      </div>

      {loading ? (
        <div className="h-12 rounded-2xl bg-muted animate-pulse" />
      ) : connected ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-muted/60 p-3">
            <p className="text-sm font-semibold">Yahoo connected directly</p>
            <p className="text-xs text-foreground mt-1 break-all">{status?.email}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Art Flow checks this inbox automatically for eBay sales every 15 minutes.
            </p>
            {status?.last_sync_at && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Last check: {new Date(status.last_sync_at).toLocaleString()}
              </p>
            )}
          </div>
          {status?.last_error && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950">
              {status.last_error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={sync}
              disabled={Boolean(busy)}
              className="h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${busy === "sync" ? "animate-spin" : ""}`} />
              {busy === "sync" ? "Checking…" : "Check Yahoo Now"}
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={Boolean(busy)}
              className="h-12 rounded-2xl bg-muted text-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Unlink className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Yahoo email"
            autoCapitalize="none"
            autoCorrect="off"
            className="form-input"
          />
          <input
            type="password"
            value={appPassword}
            onChange={(event) => setAppPassword(event.target.value)}
            placeholder="Yahoo app password"
            autoComplete="new-password"
            className="form-input"
          />
          <div className="rounded-2xl bg-muted/60 p-3 space-y-2">
            <p className="text-xs font-semibold">Yahoo requires an app password</p>
            <p className="text-xs text-muted-foreground">
              Do not enter your normal Yahoo sign-in password. Create a Yahoo app password under Account Security → External connections, then paste that generated password here. Art Flow encrypts it before saving it.
            </p>
            <a
              href="https://login.yahoo.com/account/security"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-11 px-4 rounded-xl border border-[hsl(var(--border))] bg-background text-foreground font-semibold flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Create Yahoo App Password
            </a>
          </div>
          {status?.last_error && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950">
              {status.last_error}
            </div>
          )}
          <button
            type="button"
            onClick={connect}
            disabled={busy === "connect" || !email.trim() || !appPassword.trim()}
            className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${busy === "connect" ? "animate-spin" : ""}`} />
            {busy === "connect" ? "Connecting Yahoo…" : "Connect Yahoo Inbox"}
          </button>
        </div>
      )}
    </section>
  );
}
