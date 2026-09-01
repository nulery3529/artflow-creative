import React, { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";

export default function OfficialMarketplaceConnectionsCard() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [depop, setDepop] = useState({ configured: false, connected: false, username: "" });
  const [vinted, setVinted] = useState({ connected: false });
  const [vintedToken, setVintedToken] = useState("");
  const [showVintedToken, setShowVintedToken] = useState(false);

  const load = async () => {
    try {
      const [dr, vr] = await Promise.all([
        fetch("/api/depop-official", { credentials: "include", cache: "no-store" }),
        fetch("/api/vinted-official", { credentials: "include", cache: "no-store" }),
      ]);
      const [d, v] = await Promise.all([
        dr.json().catch(() => ({})),
        vr.json().catch(() => ({})),
      ]);
      if (dr.ok) setDepop({ configured: d.configured === true, connected: d.connected === true, username: d.username || "" });
      if (vr.ok) setVinted({ connected: v.connected === true });
    } catch (error) {
      console.error("Official marketplace status failed", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    const result = params.get("depop");
    if (result === "connected") {
      toast.success("Depop connected", { description: "Art Flow can now sync your Depop account without storing your password." });
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(load, 100);
    } else if (result === "error") {
      toast.error("Depop connection failed", { description: params.get("message") || "Try connecting again." });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const connectDepop = async () => {
    setBusy("depop-connect");
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
    setBusy("depop-sync");
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
    setBusy("depop-disconnect");
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

  const connectVinted = async () => {
    if (!vintedToken.trim()) {
      toast.info("Paste the Vinted Pro access token first.");
      return;
    }
    setBusy("vinted-connect");
    try {
      const r = await fetch("/api/vinted-official", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", access_token: vintedToken.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Could not connect Vinted Pro");
      setVintedToken("");
      setShowVintedToken(false);
      toast.success("Vinted Pro connected", { description: "The token was validated and stored encrypted." });
      await load();
    } catch (error) {
      toast.error("Could not connect Vinted Pro", { description: error?.message });
    } finally {
      setBusy("");
    }
  };

  const syncVinted = async () => {
    setBusy("vinted-sync");
    try {
      const r = await fetch("/api/vinted-official", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_imported" }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Vinted Pro sync failed");
      toast.success("Vinted Pro synced", { description: data.message || `${data.saved || 0} listings loaded.` });
      window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { platform: "Vinted", saved: data.saved || 0 } }));
    } catch (error) {
      toast.error("Could not sync Vinted Pro", { description: error?.message });
    } finally {
      setBusy("");
    }
  };

  const disconnectVinted = async () => {
    setBusy("vinted-disconnect");
    try {
      const r = await fetch("/api/vinted-official", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Could not disconnect Vinted Pro");
      toast.success("Vinted Pro disconnected");
      await load();
    } catch (error) {
      toast.error("Could not disconnect Vinted Pro", { description: error?.message });
    } finally {
      setBusy("");
    }
  };

  if (loading) return null;

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div>
        <h2 className="font-heading text-lg">Marketplace account connections</h2>
        <p className="text-sm text-muted-foreground mt-1">Use the marketplace's official connection method. Art Flow does not ask for or store your Depop or Vinted password.</p>
      </div>

      <div className="rounded-2xl border border-[hsl(var(--border))] p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold">Depop</p>
              {depop.connected && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {depop.connected ? `Connected${depop.username ? ` as @${depop.username}` : ""}. Official Depop OAuth — no Depop password stored.` : depop.configured ? "Ready for official Depop sign-in." : "Depop must approve Art Flow as a Partner OAuth app before this button can be enabled."}
            </p>
          </div>
        </div>

        {!depop.connected ? (
          <>
            <button onClick={connectDepop} disabled={busy === "depop-connect" || !depop.configured} className="w-full h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              {busy === "depop-connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              {depop.configured ? "Connect Depop" : "Depop Partner approval required"}
            </button>
            {!depop.configured && (
              <a href="https://partnerapi.depop.com/api-docs/concepts/authentication/" target="_blank" rel="noreferrer" className="w-full h-10 rounded-2xl bg-muted text-foreground text-xs font-semibold flex items-center justify-center gap-2">
                <ExternalLink className="w-4 h-4" /> Depop Partner OAuth requirements
              </a>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={syncDepop} disabled={!!busy} className="h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              {busy === "depop-sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync Depop
            </button>
            <button onClick={disconnectDepop} disabled={!!busy} className="h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              <Unlink className="w-4 h-4" /> Disconnect
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[hsl(var(--border))] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <p className="font-semibold">Vinted Pro</p>
          {vinted.connected && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
        </div>
        <p className="text-xs text-muted-foreground">
          {vinted.connected
            ? "Connected with an encrypted Vinted Pro access token. Art Flow never stores your Vinted password."
            : "Vinted's official API is for allowlisted Vinted Pro businesses. Generate an access token in the Vinted Pro Integrations Portal and paste it here once."}
        </p>

        {!vinted.connected ? (
          <>
            <div className="relative">
              <input
                type={showVintedToken ? "text" : "password"}
                value={vintedToken}
                onChange={(e) => setVintedToken(e.target.value)}
                placeholder="Vinted Pro access key,signing key"
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full h-11 pl-3 pr-11 rounded-2xl bg-background border border-[hsl(var(--border))] text-sm outline-none"
              />
              <button type="button" onClick={() => setShowVintedToken((v) => !v)} className="absolute right-1 top-1 w-9 h-9 flex items-center justify-center rounded-xl" aria-label={showVintedToken ? "Hide token" : "Show token"}>
                {showVintedToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button onClick={connectVinted} disabled={busy === "vinted-connect"} className="w-full h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              {busy === "vinted-connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Connect Vinted Pro
            </button>
            <a href="https://pro-docs.svc.vinted.com/" target="_blank" rel="noreferrer" className="w-full h-10 rounded-2xl bg-muted text-foreground text-xs font-semibold flex items-center justify-center gap-2">
              <ExternalLink className="w-4 h-4" /> Vinted Pro integration requirements
            </a>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={syncVinted} disabled={!!busy} className="h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              {busy === "vinted-sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync imported
            </button>
            <button onClick={disconnectVinted} disabled={!!busy} className="h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              <Unlink className="w-4 h-4" /> Disconnect
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
