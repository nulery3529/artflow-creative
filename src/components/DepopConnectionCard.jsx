import React, { useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function DepopConnectionCard() {
  const [status, setStatus] = useState("unknown");
  const [message, setMessage] = useState("Depop webhooks keep listings, sales, refunds, and order updates current automatically through Vercel.");
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/depop-webhook-setup", { credentials: "include", cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (cancelled) return;
        if (response.ok && data.connected) {
          setStatus("connected");
          setMessage("Depop webhooks are connected. Listing and order changes will update Art Flow automatically.");
        } else if (data.needs_setup) {
          setStatus("setup");
          setMessage(data.error || "Depop Partner approval is still required before webhooks can be registered.");
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const refreshListings = async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/depop-bulk-sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || "Could not refresh Depop listings");
      const count = Number(data.saved || 0);
      window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { saved: count } }));
      const text = data.message || `${count} active Depop listing${count === 1 ? "" : "s"} refreshed.`;
      setMessage(text);
      toast.success("Depop listings refreshed", { description: text });
    } catch (error) {
      const text = error?.response?.data?.error || error?.message || "Depop refresh failed";
      setMessage(text);
      toast.error("Could not refresh Depop listings", { description: text });
    } finally {
      setRefreshing(false);
    }
  };

  const syncDepop = async () => {
    setSyncing(true);
    try {
      const setupResponse = await fetch("/api/depop-webhook-setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const setup = await setupResponse.json().catch(() => ({}));
      if (setup.needs_setup) {
        setStatus("setup");
        setMessage(setup.error || "Depop Partner approval is still required before webhooks can be registered.");
        toast.info("Depop webhook approval is still pending", { description: setup.error });
        return;
      }
      if (!setupResponse.ok || setup.error) throw new Error(setup.error || "Could not register Depop webhooks");

      // One initial reconciliation fills Gallery now. After that, webhooks keep it current.
      const snapshotResponse = await fetch("/api/depop-bulk-sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const snapshot = await snapshotResponse.json().catch(() => ({}));
      if (!snapshotResponse.ok || snapshot.error) throw new Error(snapshot.error || "Webhook connected, but the initial Depop snapshot failed");

      const count = Number(snapshot.saved || 0);
      window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { saved: count } }));
      setStatus("connected");
      const text = `Depop webhooks connected. ${count} active listing${count === 1 ? "" : "s"} loaded; future changes will update automatically.`;
      setMessage(text);
      toast.success("Depop webhooks connected");
    } catch (error) {
      const text = error?.response?.data?.error || error?.message || "Depop webhook setup failed";
      setStatus("error");
      setMessage(text);
      toast.error("Depop webhooks need attention", { description: text });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-heading text-lg">Depop</h2>
          <p className="text-sm text-muted-foreground mt-1">Real-time Depop webhooks send listing changes, new sales, refunds, and order updates straight to Art Flow through Vercel.</p>
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
      <div className="space-y-2">
        <button
          onClick={syncDepop}
          disabled={syncing || refreshing}
          className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Connecting Depop webhooks…" : status === "connected" ? "Reconnect Depop Webhooks" : "Connect Depop Webhooks"}
        </button>
        <button
          onClick={refreshListings}
          disabled={syncing || refreshing}
          className="w-full h-12 rounded-2xl bg-muted text-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing active listings…" : "Refresh Active Depop Listings"}
        </button>
      </div>
    </section>
  );
}
