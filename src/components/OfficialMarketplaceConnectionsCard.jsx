import React, { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";

export default function OfficialMarketplaceConnectionsCard() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [depop, setDepop] = useState({ configured: false, connected: false, username: "" });

  const load = async () => {
    try {
      const r = await fetch("/api/depop-official", { credentials: "include", cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (r.ok) setDepop({ configured: data.configured === true, connected: data.connected === true, username: data.username || "" });
    } catch (error) {
      console.error("Depop official status failed", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    const result = params.get("depop");
    if (result === "connected") {
      toast.success("Depop connected", { description: "Art Flow can now sync your active Depop listings without your password." });
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(load, 100);
    } else if (result === "error") {
      toast.error("Depop connection failed", { description: params.get("message") || "Try connecting again." });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const connectDepop = async () => {
    setBusy("connect");
    try {
      const r = await fetch("/api/depop-official", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Could not start Depop connection");
      if (!data.authorization_url) throw new Error("Depop authorization link was not returned");
      window.location.assign(data.authorization_url);
    } catch (error) {
      toast.error("Could not connect Depop", { description: error?.message });
      setBusy("");
    }
  };

  const syncDepop = async () => {
    setBusy("sync");
    try {
      const r = await fetch("/api/depop-official", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Depop sync failed");
      toast.success("Depop synced", { description: data.message || `${data.saved || 0} listings loaded.` });
      window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { platform: "Depop", saved: data.saved || 0 } }));
      await load();
    } catch (error) {
      toast.error("Could not sync Depop", { description: error?.message });
    } finally {
      setBusy("");
    }
  };

  const disconnectDepop = async () => {
    setBusy("disconnect");
    try {
      const r = await fetch("/api/depop-official", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Could not disconnect Depop");
      toast.success("Depop disconnected");
      await load();
    } catch (error) {
      toast.error("Could not disconnect Depop", { description: error?.message });
    } finally {
      setBusy("");
    }
  };

  if (loading) return null;

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div>
        <h2 className="font-heading text-lg">Marketplace account connections</h2>
        <p className="text-sm text-muted-foreground mt-1">Sign in with the marketplace itself. Art Flow never asks for or stores your marketplace password.</p>
      </div>

      <div className="rounded-2xl border border-[hsl(var(--border))] p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold">Depop</p>
              {depop.connected && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {depop.connected ? `Connected${depop.username ? ` as @${depop.username}` : ""}. Official OAuth — no Depop password stored.` : depop.configured ? "Ready for official Depop sign-in." : "Art Flow is ready for OAuth, but Depop Partner approval/client credentials are still required."}
            </p>
          </div>
        </div>

        {!depop.connected ? (
          <button onClick={connectDepop} disabled={busy === "connect" || !depop.configured} className="w-full h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy === "connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {depop.configured ? "Connect Depop" : "Depop Partner access required"}
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={syncDepop} disabled={!!busy} className="h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync Depop
            </button>
            <button onClick={disconnectDepop} disabled={!!busy} className="h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              <Unlink className="w-4 h-4" /> Disconnect
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[hsl(var(--border))] p-4 space-y-2">
        <div className="flex items-center gap-2">
          <p className="font-semibold">Vinted</p>
        </div>
        <p className="text-xs text-muted-foreground">Vinted does not currently offer a normal consumer OAuth connection for third-party apps. Its official Pro Integrations API is limited to allowlisted Vinted Pro businesses and uses an access token instead of your Vinted password.</p>
        <a href="https://pro-docs.svc.vinted.com/" target="_blank" rel="noreferrer" className="w-full h-10 rounded-2xl bg-muted text-foreground text-xs font-semibold flex items-center justify-center gap-2">
          <ExternalLink className="w-4 h-4" /> Vinted Pro integration requirements
        </a>
      </div>
    </section>
  );
}
