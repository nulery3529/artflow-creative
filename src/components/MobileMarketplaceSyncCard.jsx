import React, { useEffect, useState } from "react";
import { Link2, Smartphone } from "lucide-react";
import { toast } from "sonner";

export default function MobileMarketplaceSyncCard() {
  const [links, setLinks] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data || {};
      if (data.type !== "artflow-listing-sync-result") return;

      const message = data.message || data.error || "Listing import finished";
      setResult(message);

      if (data.status >= 200 && data.status < 300 && data.ok !== false) {
        toast.success(message);
        setLinks("");
        window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { saved: data.saved || 0 } }));
      } else {
        toast.error("Listing import failed", { description: message });
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl pastel-mint flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-heading text-lg">Add Individual Marketplace Listings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Paste one or several new Vinted or Depop product links to add them to Available Gallery immediately.
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
        <p><strong className="text-foreground">On the marketplace app:</strong> open a listing → Share or Copy link.</p>
        <p>You can paste several listing links here at once, even from different sites.</p>
        <p><strong className="text-foreground">Use individual product links.</strong> Profile, shop, and private seller-dashboard pages may be blocked by the marketplace.</p>
      </div>

      <form
        action="/api/mobile-listing-sync"
        method="POST"
        target="artflow-listing-sync-frame"
        className="space-y-3"
      >
        <textarea
          name="urls"
          value={links}
          onChange={(e) => setLinks(e.target.value)}
          rows={5}
          required
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={"Paste listing link(s) here\nhttps://www.vinted.com/items/...\nhttps://www.depop.com/products/..."}
          className="w-full rounded-2xl border border-[hsl(var(--border))] bg-background px-3 py-3 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
        />
        <input type="hidden" name="form_submit" value="1" />

        <button
          type="submit"
          style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
        >
          <Link2 className="w-4 h-4" />
          Add to Gallery
        </button>
      </form>

      <iframe
        title="Marketplace listing sync"
        name="artflow-listing-sync-frame"
        className="hidden"
      />

      {result && (
        <p className="text-xs text-muted-foreground rounded-xl bg-muted/50 p-3">{result}</p>
      )}
    </section>
  );
}
