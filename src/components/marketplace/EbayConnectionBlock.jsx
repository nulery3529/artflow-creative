import React, { useEffect, useState } from "react";
import { CheckCircle2, Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";

const post = (body) =>
  fetch("/api/ebay-official", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export default function EbayConnectionBlock() {
  const [status, setStatus] = useState({ configured: false, connected: false, username: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [sellerProfile, setSellerProfile] = useState("");

  const load = async () => {
    try {
      const r = await fetch("/api/ebay-official", { credentials: "include", cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        setStatus({
          configured: data.configured === true,
          connected: data.connected === true,
          username: data.username || "",
        });
      }
    } catch {
      // Never block the rest of the Account page if the status check fails.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    fetch("/api/mobile-listing-sync", { credentials: "include", cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (!response.ok) return;
        setSellerProfile(data?.urls?.eBay || data?.urls?.ebay || "");
      })
      .catch(() => {});
  }, []);

  const sellerUsername = () => {
    const raw = String(sellerProfile || "").trim();
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      const fromQuery = parsed.searchParams.get("_ssn");
      if (fromQuery) return fromQuery.replace(/^@+/, "");
      const parts = parsed.pathname.split("/").filter(Boolean);
      const userIndex = parts.findIndex((part) => ["usr", "str"].includes(part.toLowerCase()));
      if (userIndex >= 0 && parts[userIndex + 1]) return parts[userIndex + 1].replace(/^@+/, "");
    } catch {}
    return raw.replace(/^@+/, "");
  };

  const importListings = async () => {
    const username = sellerUsername();
    if (!username) {
      toast.error("Link your eBay seller profile first");
      return;
    }
    setBusy("import");
    try {
      const r = await fetch("/api/mobile-listing-sync", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "eBay", username }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.ok === false) throw new Error(data.error || "Could not import eBay listings");
      toast.success("eBay listings imported", { description: data.message || "Gallery has been refreshed." });
      window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { platform: "eBay", saved: data.saved || 0 } }));
    } catch (error) {
      toast.error("eBay listing import is temporarily unavailable", { description: error?.message || "Art Flow is repairing the server connection. No API key is needed from you." });
    } finally {
      setBusy("");
    }
  };

  const connect = async () => {
    setBusy("connect");
    try {
      const r = await post({ action: "start" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Could not start eBay connection");
      if (!data.authorization_url) throw new Error("eBay authorization link was not returned");
      window.location.assign(data.authorization_url);
    } catch (error) {
      toast.error("Could not connect eBay", { description: error?.message || "Art Flow is repairing the eBay server connection. No API key is needed from you." });
      setBusy("");
    }
  };

  const sync = async () => {
    setBusy("sync");
    try {
      let r = await post({ action: "sync" });
      let data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "eBay sync failed");
      let saved = data.saved || 0;
      let pass = 0;
      while (data.more_possible && pass < 6) {
        r = await post({ action: "sync" });
        data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "eBay sync failed");
        saved += data.saved || 0;
        pass += 1;
      }
      toast.success("eBay synced", { description: data.message || `${saved} sales imported.` });
      window.dispatchEvent(new CustomEvent("artflow:data-synced"));
      window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { platform: "eBay", saved: data.listings_saved || 0 } }));
      await load();
    } catch (error) {
      toast.error("eBay sync failed", { description: error?.message });
    } finally {
      setBusy("");
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      const r = await post({ action: "disconnect" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Could not disconnect eBay");
      toast.success("eBay disconnected");
      await load();
    } catch (error) {
      toast.error("Could not disconnect eBay", { description: error?.message });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold">eBay</p>
            {status.connected && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {status.connected
              ? `Connected${status.username ? ` as ${status.username}` : ""}. Active listings, photos, prices and paid orders sync into Art Flow.`
              : status.configured
                ? "Connect your own eBay account securely — no API key or eBay password is entered into Art Flow."
                : "eBay connection is temporarily unavailable. Please try again later or contact support."}
          </p>
        </div>
      </div>

      {loading ? (
        <button disabled className="w-full h-11 rounded-2xl bg-muted flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
        </button>
      ) : status.connected ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={sync} disabled={!!busy} className="h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync eBay
          </button>
          <button onClick={disconnect} disabled={!!busy} className="h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            <Unlink className="w-4 h-4" /> Disconnect
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sellerProfile ? (
            <button onClick={importListings} disabled={!!busy} className="w-full h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              {busy === "import" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Import eBay listings
            </button>
          ) : null}
          <button onClick={connect} disabled={busy === "connect" || !status.configured} className="w-full h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy === "connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {status.configured ? "Connect eBay for sales & orders" : "eBay connection unavailable"}
          </button>
        </div>
      )}
    </div>
  );
}
