import React, { useEffect, useState } from "react";
import { CheckCircle2, Copy, Download, Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react";
import { toast } from "sonner";

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
      if (!response.ok) throw new Error(data.error || "Could not load Browser Sync");
      setState({ key: data.key || "", enabled: data.enabled !== false });
    } catch (error) {
      console.error("Browser Sync setup error", error);
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
      if (!response.ok) throw new Error(data.error || "Could not update Browser Sync");
      setState({ key: data.key || state.key, enabled: data.enabled !== false });
      toast.success(data.enabled === false ? "Desktop Browser Sync paused" : "Desktop Browser Sync enabled");
    } catch (error) {
      toast.error("Could not update Browser Sync", { description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const copyKey = async () => {
    if (!state.key) return;
    try {
      await navigator.clipboard.writeText(state.key);
      toast.success("Browser Sync key copied");
    } catch {
      toast.error("Could not copy the key");
    }
  };

  if (loading) return null;

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center shrink-0">
          <KeyRound className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg">Desktop Browser Refresh</h2>
            {state.enabled && state.key && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Optional desktop fallback for Chrome. Phone users should use the official marketplace connection above when available.
          </p>
        </div>
      </div>

      {state.key && (
        <div className="rounded-2xl bg-muted p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Private sync key</p>
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
        </div>
      )}

      <a href="/downloads/artflow-browser-sync.zip" download className="w-full h-12 rounded-2xl bg-muted text-foreground font-semibold flex items-center justify-center gap-2">
        <Download className="w-4 h-4" /> Download Desktop Chrome Refresh v2.0
      </a>

      <button onClick={toggleEnabled} disabled={saving} className="w-full h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
        <RefreshCw className={`w-4 h-4 ${saving ? "animate-spin" : ""}`} />
        {state.enabled ? "Pause Desktop Browser Sync" : "Enable Desktop Browser Sync"}
      </button>
    </section>
  );
}
