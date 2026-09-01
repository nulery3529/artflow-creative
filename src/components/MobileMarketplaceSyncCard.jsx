import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Smartphone, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useMarketplacePreferences } from "@/lib/useMarketplacePreferences";

const HELP = {
  Vinted: "Paste your public Vinted profile/shop link, or several listing links.",
  Depop: "Paste your Depop shop/profile link, or several listing links.",
  Etsy: "Paste your Etsy shop link, or several listing links.",
  eBay: "Paste your eBay seller page, store link, or several listing links.",
};

export default function MobileMarketplaceSyncCard() {
  const { selected, supported } = useMarketplacePreferences();
  const [urls, setUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState("");
  const [result, setResult] = useState({});

  const visible = useMemo(() => {
    const chosen = supported.filter((site) => selected.includes(site));
    return chosen.length ? chosen : supported;
  }, [selected, supported]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/mobile-listing-sync", { credentials: "include", cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load mobile marketplace sync");
        if (!cancelled) setUrls(data.urls || {});
      } catch (error) {
        console.error("mobile marketplace sync setup error", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sync = async (platform) => {
    const value = String(urls[platform] || "").trim();
    if (!value) {
      toast.error(`Paste your ${platform} shop/profile or listing link first`);
      return;
    }
    setSyncing(platform);
    setResult((current) => ({ ...current, [platform]: "" }));
    try {
      const response = await fetch("/api/mobile-listing-sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, urls: value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Could not sync ${platform}`);
      setResult((current) => ({ ...current, [platform]: data.message || `${platform} synced` }));
      toast.success(data.message || `${platform} listings synced`);
      window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { platform, saved: data.saved || 0 } }));
    } catch (error) {
      setResult((current) => ({ ...current, [platform]: error?.message || `Could not sync ${platform}` }));
      toast.error(`${platform} sync failed`, { description: error?.message });
    } finally {
      setSyncing("");
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl pastel-mint flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-heading text-lg">Mobile Marketplace Listings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            For phone or tablet: paste your public shop/profile link and Art Flow will link current listings to Gallery with photos and live marketplace links.
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-muted/60 p-3 text-xs text-muted-foreground">
        If a marketplace blocks reading its shop page, paste several individual listing links in the same box, one per line. The desktop Chrome extension is optional.
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => <div key={n} className="h-24 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((platform) => {
            const busy = syncing === platform;
            return (
              <div key={platform} className="rounded-2xl border border-[hsl(var(--border))] p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm">{platform}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{HELP[platform]}</p>
                  </div>
                </div>
                <textarea
                  value={urls[platform] || ""}
                  onChange={(e) => setUrls((current) => ({ ...current, [platform]: e.target.value }))}
                  rows={2}
                  placeholder={`Paste ${platform} shop/profile or listing links`}
                  className="w-full rounded-xl border border-[hsl(var(--border))] bg-background px-3 py-2 text-xs resize-y focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
                />
                <button
                  type="button"
                  onClick={() => sync(platform)}
                  disabled={Boolean(syncing)}
                  className="w-full h-10 rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {busy ? `Syncing ${platform}…` : `Sync ${platform} Listings`}
                </button>
                {result[platform] && (
                  <p className="text-xs text-muted-foreground rounded-xl bg-muted/50 p-2">{result[platform]}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
