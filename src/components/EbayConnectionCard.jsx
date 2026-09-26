import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, RefreshCw, ShoppingBag, Unlink } from "lucide-react";
import { toast } from "sonner";

async function request(method = "GET", body = null) {
  const response = await fetch("/api/ebay-official", {
    method,
    credentials: "include",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export default function EbayConnectionCard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { response, data } = await request();
      if (!response.ok) throw new Error(data.error || "Could not check eBay connection");
      setStatus(data);
    } catch (error) {
      setStatus({ connected: false, error: error?.message || "Could not check eBay connection" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    const result = params.get("ebay");
    const message = params.get("message");
    if (result === "connected") toast.success("eBay connected");
    if (result === "error") toast.error("eBay connection failed", { description: message || "Please try again." });
    if (result) {
      params.delete("ebay");
      params.delete("message");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  const connect = async () => {
    if (busy) return;
    setBusy("connect");
    try {
      const { response, data } = await request("POST", { action: "start" });
      if (!response.ok) throw new Error(data.error || "Could not start eBay connection");
      if (!data.authorization_url) throw new Error("eBay did not return a sign-in link");
      window.location.assign(data.authorization_url);
    } catch (error) {
      toast.error("Could not connect eBay", { description: error?.message });
      setBusy("");
    }
  };

  const sync = async () => {
    if (busy) return;
    setBusy("sync");
    try {
      const { response, data } = await request("POST", { action: "sync" });
      if (!response.ok) throw new Error(data.error || "eBay sync failed");
      toast.success(data.message || "eBay orders checked");
      window.dispatchEvent(new CustomEvent("artflow:data-synced", { detail: { ebay: data } }));
      await load();
    } catch (error) {
      toast.error("eBay sync needs attention", { description: error?.message });
    } finally {
      setBusy("");
    }
  };

  const disconnect = async () => {
    if (busy) return;
    setBusy("disconnect");
    try {
      const { response, data } = await request("POST", { action: "disconnect" });
      if (!response.ok) throw new Error(data.error || "Could not disconnect eBay");
      toast.success("eBay disconnected");
      await load();
    } catch (error) {
      toast.error("Could not disconnect eBay", { description: error?.message });
    } finally {
      setBusy("");
    }
  };

  const connected = status?.connected === true;

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl pastel-blue flex items-center justify-center shrink-0">
          <ShoppingBag className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading text-lg">eBay Connection</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your eBay seller account directly so Art Flow can import paid eBay orders without relying on email.
          </p>
        </div>
        {connected ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-1" /> : status?.error ? <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-1" /> : null}
      </div>

      {loading ? (
        <div className="rounded-2xl bg-muted/60 p-4 flex items-center gap-3">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <p className="text-sm font-semibold">Checking eBay connection…</p>
        </div>
      ) : connected ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-muted/60 p-3">
            <p className="text-sm font-semibold">eBay connected</p>
            {status?.username && <p className="text-xs text-foreground mt-1">@{status.username}</p>}
            <p className="text-xs text-muted-foreground mt-1">Paid eBay orders can now sync directly into Orders.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={sync} disabled={Boolean(busy)} className="h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              <RefreshCw className={`w-4 h-4 ${busy === "sync" ? "animate-spin" : ""}`} />
              {busy === "sync" ? "Checking…" : "Sync eBay Orders"}
            </button>
            <button type="button" onClick={disconnect} disabled={Boolean(busy)} className="h-12 rounded-2xl bg-muted text-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              <Unlink className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {status?.error && <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950">{status.error}</div>}
          <button type="button" onClick={connect} disabled={busy === "connect" || status?.configured === false} className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
            <ExternalLink className="w-4 h-4" />
            {busy === "connect" ? "Opening eBay…" : "Connect eBay Seller Account"}
          </button>
          {status?.configured === false && <p className="text-xs text-amber-700">The eBay connection is temporarily unavailable in Art Flow.</p>}
        </div>
      )}
    </section>
  );
}
