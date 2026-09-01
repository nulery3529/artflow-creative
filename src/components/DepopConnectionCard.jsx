import React, { useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function DepopConnectionCard() {
  const [status, setStatus] = useState("unknown");
  const [message, setMessage] = useState("One tap syncs every active Depop listing to Gallery through Vercel. No individual listing links required.");
  const [syncing, setSyncing] = useState(false);

  const syncDepop = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/depop-bulk-sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json().catch(() => ({}));
      if (data.needs_setup) {
        setStatus("setup");
        setMessage(data.error || "Vercel Depop connection needs setup.");
        toast.info("Depop connection needs one final setup step", { description: data.error });
        return;
      }
      if (!response.ok || data.error) throw new Error(data.error || "Depop bulk sync failed");

      const count = Number(data.saved || 0);
      const removed = Number(data.deactivated || 0);
      const listingMessage = data.message || `${count} active Depop listing${count === 1 ? "" : "s"} synced to Gallery${removed ? ` · ${removed} old listing${removed === 1 ? "" : "s"} removed` : ""}.`;
      window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { saved: count } }));
      setStatus("connected");
      setMessage(listingMessage);
      toast.success(listingMessage);
    } catch (error) {
      const text = error?.response?.data?.error || error?.message || "Depop sync failed";
      setStatus("error");
      setMessage(text);
      toast.error("Depop sync needs attention", { description: text });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-heading text-lg">Depop</h2>
          <p className="text-sm text-muted-foreground mt-1">Sync every active Depop listing to Gallery at once through Vercel. Sold or removed listings are cleared from the active Gallery snapshot.</p>
        </div>
        {status === "connected" ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        ) : status === "error" ? (
          <AlertCircle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0" />
        ) : null}
      </div>
      <div className="rounded-2xl bg-muted/60 p-3 mb-4">
        <p className="text-sm text-foreground">{message}</p>
      </div>
      <button
        onClick={syncDepop}
        disabled={syncing}
        className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Syncing all Depop listings…" : "Sync All Depop Listings"}
      </button>
    </section>
  );
}
