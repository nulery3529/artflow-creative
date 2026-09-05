import React, { useEffect, useState } from "react";
import { Link2, Smartphone } from "lucide-react";
import { toast } from "sonner";

export default function MobileMarketplaceSyncCard() {
  const [link, setLink] = useState("");
  const [result, setResult] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mobile-listing-sync", { credentials: "include", cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (cancelled || !response.ok) return;
        const saved = data?.urls?.Depop || data?.urls?.depop || "";
        if (saved) setLink((current) => current || saved);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!link.trim() || submitting) return;
    setSubmitting(true);
    setResult("");
    try {
      const response = await fetch("/api/mobile-listing-sync", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      const message = data.message || data.error || (response.ok ? "Listing added to Gallery" : "Listing import failed");
      setResult(message);
      if (!response.ok || data.ok === false) throw new Error(message);
      toast.success(message);
      window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { saved: data.saved || 0, fullProfile: data.full_profile === true } }));
    } catch (error) {
      const message = error?.message || "Listing import failed";
      setResult(message);
      toast.error("Listing import failed", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl pastel-mint flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-heading text-lg">Pull Your Full Depop Profile</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Paste your Depop profile link once. Art Flow will pull the available listings from that profile into Gallery.
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
        <p><strong className="text-foreground">Use your public Depop profile link:</strong> for example, https://www.depop.com/your_username/</p>
        <p>Art Flow scans the profile for current product cards, so you do not need to paste every listing.</p>
        <p>When you run it again, listings no longer on the profile are removed from Available.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          name="url"
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          required
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://www.depop.com/your_username/"
          className="w-full h-12 rounded-2xl border border-[hsl(var(--border))] bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
        />
        <button
          type="submit"
          disabled={submitting || !link.trim()}
          style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-60"
        >
          <Link2 className="w-4 h-4" />
          {submitting ? "Pulling profile…" : "Pull Full Profile"}
        </button>
      </form>

      {result && (
        <p className="text-xs text-muted-foreground rounded-xl bg-muted/50 p-3">{result}</p>
      )}
    </section>
  );
}
