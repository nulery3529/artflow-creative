import React, { useState } from "react";
import { Loader2, Link2, Smartphone } from "lucide-react";
import { toast } from "sonner";

export default function MobileMarketplaceSyncCard() {
  const [links, setLinks] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState("");

  const addListings = async () => {
    const value = links.trim();
    if (!value) {
      toast.error("Paste at least one marketplace listing link first");
      return;
    }
    setSyncing(true);
    setResult("");
    try {
      const response = await fetch("/api/mobile-listing-sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not add listings");
      setResult(data.message || "Listings added to Gallery");
      toast.success(data.message || "Listings added to Gallery");
      setLinks("");
      window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { saved: data.saved || 0 } }));
    } catch (error) {
      const message = error?.message || "Could not add listings";
      setResult(message);
      toast.error("Listing import failed", { description: message });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl pastel-mint flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-heading text-lg">Add Marketplace Listings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Works on iPhone and iPad. Copy a listing link from Vinted, Depop, Etsy, or eBay, paste it here, and Art Flow adds it to Gallery.
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
        <p><strong className="text-foreground">On the marketplace app:</strong> open a listing → Share or Copy link.</p>
        <p>You can paste several listing links here at once, even from different sites.</p>
      </div>

      <textarea
        value={links}
        onChange={(e) => setLinks(e.target.value)}
        rows={5}
        placeholder={"Paste listing link(s) here\nhttps://www.vinted.com/items/...\nhttps://www.depop.com/products/..."}
        className="w-full rounded-2xl border border-[hsl(var(--border))] bg-background px-3 py-3 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
      />

      <button
        type="button"
        onClick={addListings}
        disabled={syncing}
        className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.99] transition-transform"
      >
        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
        {syncing ? "Adding Listings…" : "Add to Gallery"}
      </button>

      {result && (
        <p className="text-xs text-muted-foreground rounded-xl bg-muted/50 p-3">{result}</p>
      )}
    </section>
  );
}
