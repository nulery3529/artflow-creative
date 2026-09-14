import React, { useEffect, useState } from "react";
import { ExternalLink, Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";

function etsyUrl(urls) {
  return String(urls?.Etsy || urls?.etsy || "").trim();
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

export default function EtsyShopLinkCard({ onChanged, onListingsSynced }) {
  const [shopLink, setShopLink] = useState("");
  const [savedLink, setSavedLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const response = await fetch("/api/mobile-listing-sync", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not load Etsy shop link");
      const value = etsyUrl(data.urls);
      setShopLink(value);
      setSavedLink(value);
      onChanged?.(data.urls || {});
    } catch (error) {
      setMessage(error?.message || "Could not load Etsy shop link");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importListings = async (value) => {
    const response = await fetch("/api/mobile-listing-sync", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "Etsy", username: value }),
    });
    const data = await readJson(response);
    if (!response.ok || data.ok === false) throw new Error(data.error || "Could not load Etsy listings");
    window.dispatchEvent(new CustomEvent("artflow:listings-synced", {
      detail: { platform: "Etsy", saved: data.saved || data.imported || 0 },
    }));
    await onListingsSynced?.();
    return data;
  };

  const save = async (event) => {
    event.preventDefault();
    const value = shopLink.trim();
    if (!value || busy) return;
    setBusy("save");
    setMessage("");
    try {
      const response = await fetch("/api/mobile-listing-sync", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link_site", platform: "Etsy", username: value }),
      });
      const data = await readJson(response);
      if (!response.ok || data.ok === false) throw new Error(data.error || "Could not save Etsy shop link");
      const valueSaved = etsyUrl(data.urls) || value;
      setSavedLink(valueSaved);
      setShopLink(valueSaved);
      onChanged?.(data.urls || {});

      try {
        const imported = await importListings(valueSaved);
        const importedCount = Number(imported.saved || imported.imported || 0);
        const successMessage = imported.message || `Etsy shop linked${importedCount ? ` and ${importedCount} listings loaded` : " and listings refreshed"}.`;
        setMessage(successMessage);
        toast.success("Etsy shop linked", { description: successMessage });
      } catch (importError) {
        const detail = importError?.message || "The shop link was saved, but listings could not be loaded yet.";
        setMessage(`Shop link saved. ${detail}`);
        toast.warning("Etsy shop link saved", { description: detail });
      }
    } catch (error) {
      const detail = error?.message || "Could not save Etsy shop link";
      setMessage(detail);
      toast.error("Could not save Etsy shop", { description: detail });
    } finally {
      setBusy("");
    }
  };

  const refresh = async () => {
    const value = savedLink || shopLink.trim();
    if (!value || busy) return;
    setBusy("refresh");
    setMessage("");
    try {
      const data = await importListings(value);
      const text = data.message || "Etsy listings refreshed.";
      setMessage(text);
      toast.success("Etsy listings refreshed", { description: text });
    } catch (error) {
      const detail = error?.message || "Could not refresh Etsy listings";
      setMessage(detail);
      toast.error("Could not refresh Etsy listings", { description: detail });
    } finally {
      setBusy("");
    }
  };

  const unlink = async () => {
    if (busy) return;
    setBusy("unlink");
    setMessage("");
    try {
      const response = await fetch("/api/mobile-listing-sync", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink_site", platform: "Etsy" }),
      });
      const data = await readJson(response);
      if (!response.ok || data.ok === false) throw new Error(data.error || "Could not unlink Etsy shop");
      setShopLink("");
      setSavedLink("");
      onChanged?.(data.urls || {});
      setMessage("Etsy shop unlinked from this Art Flow business.");
      toast.success("Etsy shop unlinked");
    } catch (error) {
      const detail = error?.message || "Could not unlink Etsy shop";
      setMessage(detail);
      toast.error("Could not unlink Etsy shop", { description: detail });
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl pastel-lavender flex items-center justify-center shrink-0">
          <Link2 className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-heading text-lg">Etsy Shop Link</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Paste this business&apos;s Etsy shop link. Art Flow saves it only to this account and loads that shop&apos;s public listings into Gallery. No Etsy sign-in is required.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-12 rounded-2xl bg-muted animate-pulse" />
      ) : (
        <form onSubmit={save} className="space-y-3">
          <input
            type="url"
            value={shopLink}
            onChange={(event) => setShopLink(event.target.value)}
            placeholder="https://www.etsy.com/shop/YourShopName"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            className="form-input"
          />
          <button
            type="submit"
            disabled={!!busy || !shopLink.trim()}
            className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {busy === "save" ? "Linking Etsy shop…" : savedLink ? "Save & Reload Etsy Listings" : "Link Etsy Shop & Load Listings"}
          </button>
        </form>
      )}

      {savedLink && !loading && (
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={!!busy}
            className="h-11 rounded-2xl bg-muted text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {busy === "refresh" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
          <a
            href={savedLink}
            target="_blank"
            rel="noreferrer noopener"
            className="h-11 rounded-2xl bg-muted text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-4 h-4" /> Open
          </a>
          <button
            type="button"
            onClick={unlink}
            disabled={!!busy}
            className="h-11 rounded-2xl bg-muted text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Unlink className="w-4 h-4" /> Unlink
          </button>
        </div>
      )}

      {message && <p className="text-xs text-muted-foreground rounded-xl bg-muted/50 p-3">{message}</p>}
    </section>
  );
}
