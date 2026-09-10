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

  useEffect(() => { load(); }, []);

  const connect = async () => {
    setBusy("connect");
    try {
      const r = await post({ action: "start" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Could not start eBay connection");
      if (!data.authorization_url) throw new Error("eBay authorization link was not returned");
      window.location.assign(data.authorization_url);
    } catch (error) {
      toast.error("Could not connect eBay", { description: error?.message });
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
              ? `Connected${status.username ? ` as ${status.username}` : ""}. Paid orders sync straight into your sales.`
              : status.configured
                ? "Official eBay sign-in — no password stored, tokens encrypted."
                : "Add EBAY_CLIENT_ID, EBAY_CLIENT_SECRET and EBAY_RUNAME to the server environment, then reload this page."}
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
            {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync eBay Sales
          </button>
          <button onClick={disconnect} disabled={!!busy} className="h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            <Unlink className="w-4 h-4" /> Disconnect
          </button>
        </div>
      ) : (
        <button onClick={connect} disabled={busy === "connect" || !status.configured} className="w-full h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {busy === "connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          {status.configured ? "Connect eBay" : "eBay setup needed"}
        </button>
      )}
    </div>
  );
}