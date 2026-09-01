import React, { useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function DepopConnectionCard() {
  const [status, setStatus] = useState("unknown");
  const [message, setMessage] = useState("One tap syncs all active Depop listings to Gallery, plus Depop sales when Partner API access is connected.");
  const [syncing, setSyncing] = useState(false);

  const syncDepop = async () => {
    setSyncing(true);
    try {
      // Pull the seller's complete active catalog from Depop in API pages, then
      // replace the Depop Gallery snapshot in Neon. No individual product links.
      const listingRes = await base44.functions.invoke("syncDepopListings", {});
      const listingData = listingRes?.data || {};
      if (listingData.available === false || listingData.needs_setup || listingData.needs_partner_access) {
        setStatus("setup");
        setMessage(listingData.message || "Bulk Depop listings need approved Depop Partner API access.");
        toast.info("Bulk Depop listing access needs setup", { description: listingData.message });
        return;
      }
      if (listingData.error) throw new Error(listingData.error);
      if (listingData.complete === false) throw new Error("Depop has more active listings than Art Flow could safely load in one sync.");

      const settingsResponse = await fetch("/api/browser-sync", { credentials: "include", cache: "no-store" });
      const settings = await settingsResponse.json().catch(() => ({}));
      if (!settingsResponse.ok || !settings.key) throw new Error(settings.error || "Art Flow Gallery sync key is unavailable");

      const galleryResponse = await fetch("/api/browser-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "listings",
          sync_key: settings.key,
          listings: Array.isArray(listingData.listings) ? listingData.listings : [],
          snapshot_complete: true,
          snapshot_platform: "Depop",
        }),
      });
      const galleryData = await galleryResponse.json().catch(() => ({}));
      if (!galleryResponse.ok) throw new Error(galleryData.error || "Could not save Depop listings to Gallery");
      window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { saved: galleryData.saved || 0 } }));

      // Keep the existing Depop order backfill/webhook setup too.
      let res = await base44.functions.invoke("syncDepopPartner", {});
      let data = res?.data || {};
      let pass = 0;
      while (data.more_possible && pass < 12) {
        res = await base44.functions.invoke("syncDepopPartner", {});
        data = res?.data || {};
        pass += 1;
      }
      if (data.error) throw new Error(data.error);

      const hook = await base44.functions.invoke("setupDepopWebhook", {}).catch(() => null);
      const hookData = hook?.data || {};
      const count = Number(galleryData.saved || listingData.count || 0);
      const removed = Number(galleryData.deactivated || 0);
      const listingMessage = `${count} active Depop listing${count === 1 ? "" : "s"} synced to Gallery${removed ? ` · ${removed} old listing${removed === 1 ? "" : "s"} removed` : ""}.`;
      setStatus("connected");
      setMessage(`${listingMessage} ${hookData.message || data.message || "Depop sales are up to date."}`);
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
          <p className="text-sm text-muted-foreground mt-1">Sync every active Depop listing to Gallery at once, plus orders and live order/refund updates when Partner API access is available.</p>
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
