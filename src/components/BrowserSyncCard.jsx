import React, { useEffect, useState } from "react";
import { CheckCircle2, Copy, Download, Eye, EyeOff, ExternalLink, KeyRound, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";

const ORION_APP_STORE = "https://apps.apple.com/us/app/orion-browser-by-kagi/id1484498200";
const ORION_DEPOP_LOGIN = "orion://open-url?url=https%3A%2F%2Fwww.depop.com%2Flogin%2F";
const ORION_VINTED_LOGIN = "orion://open-url?url=https%3A%2F%2Fwww.vinted.com%2Fmember%2Fregister%2Fselect_type%3Fref_url%3D%252F";

export default function BrowserSyncCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [state, setState] = useState({ key: "", enabled: true });

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/browser-sync", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load marketplace sync");
      setState({ key: data.key || "", enabled: data.enabled !== false });
    } catch (error) {
      console.error("Marketplace sync setup error", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleEnabled = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/browser-sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", enabled: !state.enabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update marketplace sync");
      setState({ key: data.key || state.key, enabled: data.enabled !== false });
      toast.success(data.enabled === false ? "Marketplace sync paused" : "Marketplace sync enabled");
    } catch (error) {
      toast.error("Could not update marketplace sync", { description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const copyKey = async () => {
    if (!state.key) return;
    try {
      await navigator.clipboard.writeText(state.key);
      toast.success("Private sync key copied");
    } catch {
      toast.error("Could not copy the key");
    }
  };

  if (loading) return null;

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg">Depop & Vinted login sync</h2>
            {state.enabled && state.key && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            No marketplace API. Sign in on Depop or Vinted inside the browser, then Art Flow reads the seller page from that logged-in browser session.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[hsl(var(--border))] p-4 space-y-3">
        <p className="font-semibold text-sm">iPhone setup</p>
        <p className="text-xs text-muted-foreground">
          iPhone Chrome cannot run the Art Flow extension. Orion can install file-based Chrome/Firefox extensions on iPhone, so use Orion for the marketplace login and refresh.
        </p>

        <a href={ORION_APP_STORE} target="_blank" rel="noreferrer" className="w-full h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2">
          <ExternalLink className="w-4 h-4" /> Install Orion on iPhone
        </a>

        <a href="/downloads/artflow-orion-sync.zip" download className="w-full h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2">
          <Download className="w-4 h-4" /> Download iPhone Orion Refresh v2.1.2
        </a>

        <div className="grid grid-cols-2 gap-2">
          <a href={ORION_DEPOP_LOGIN} className="h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 text-center">
            Connect Depop
          </a>
          <a href={ORION_VINTED_LOGIN} className="h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 text-center">
            Connect Vinted
          </a>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>1. Install Orion, then Orion → ••• → Settings → enable Chrome extensions.</p>
          <p>2. Orion → ••• → Extensions → + → install the iPhone Orion Refresh ZIP you downloaded.</p>
          <p>3. Tap Connect Depop or Connect Vinted above and log in on the marketplace page itself.</p>
          <p>4. Depop sends a magic login link to your email. Vinted uses its normal email, Apple, Google, or Facebook login.</p>
          <p>5. Open your seller/profile listings page, open Art Flow Browser Sync from Orion Extensions, save the private key once, then tap Refresh active listings to Gallery.</p>
        </div>
      </div>

      {state.key && (
        <div className="rounded-2xl bg-muted p-3">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="w-4 h-4" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Private Art Flow sync key</p>
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 text-xs break-all bg-background rounded-xl px-3 py-2 border border-[hsl(var(--border))]">
              {showKey ? state.key : `${state.key.slice(0, 7)}••••••••••••••••••••${state.key.slice(-6)}`}
            </code>
            <button onClick={() => setShowKey((value) => !value)} className="w-10 h-10 rounded-xl bg-background flex items-center justify-center" aria-label={showKey ? "Hide sync key" : "Show sync key"}>
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button onClick={copyKey} className="w-10 h-10 rounded-xl bg-background flex items-center justify-center" aria-label="Copy sync key">
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">This key identifies your Art Flow workspace. It is not your Depop or Vinted password.</p>
        </div>
      )}

      <div className="rounded-2xl bg-muted/60 p-3 text-xs text-muted-foreground">
        Art Flow never asks for or stores your Depop/Vinted password, cookies, magic links, or login tokens. Your marketplace login stays inside Orion or your desktop browser.
      </div>

      <button onClick={toggleEnabled} disabled={saving} className="w-full h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
        <RefreshCw className={`w-4 h-4 ${saving ? "animate-spin" : ""}`} />
        {state.enabled ? "Pause marketplace login sync" : "Enable marketplace login sync"}
      </button>
    </section>
  );
}
