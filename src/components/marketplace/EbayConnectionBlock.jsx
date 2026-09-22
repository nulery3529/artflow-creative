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
      // Keep Account usable if eBay status temporarily fails.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const connect = async () => {
    setBusy("connect");
    try {
      const r = await post({ action: "start" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Could not start eBay connection");
      if (!data.authorization_url) throw new Error("eBay authorization link was not returned");
      window.location.assign(data.authorization_url);
      return;
    } catch (error) {
      toast.error("Could not connect eBay", {
        description: error?.message || "Please try the eBay connection again.",
      });
      setBusy("");
    }
  };

  const sync = async () => {
    setBusy("sync");
    try {
      let r = await post({ action: "sync" });
      let data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "eBay sync failed");

      let saved = Number(data.saved || 0);
      let checked = Number(data.checked || 0);
      let pass = 0;
      while (data.more_possible && pass < 6) {
        r = await post({ action: "sync" });
        data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "eBay sync failed");
        saved += Number(data.saved || 0);
        checked += Number(data.checked || 0);
        pass += 1;
      }

      toast.success("eBay orders synced", {
        description: saved > 0
          ? `${saved} new paid eBay order${saved === 1 ? "" : "s"} imported.`
          : `Checked ${checked} paid eBay order${checked === 1 ? "" : "s"}; everything is up to date.`,
      });
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
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg">eBay Orders</h2>
            {status.connected && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {status.connected
              ? `Connected directly to eBay${status.username ? ` as ${status.username}` : ""}. Paid eBay orders sync into Art Flow automatically every 15 minutes.`
              : status.configured
                ? "Connect the eBay seller account that uses moe_moe_0069@yahoo.com. Art Flow will read paid orders directly from eBay — Gmail is not required."
                : "The direct eBay connection is temporarily unavailable on the server."}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-12 rounded-2xl bg-muted animate-pulse" />
      ) : status.connected ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={sync}
            disabled={!!busy}
            className="h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync eBay Now
          </button>
          <button
            type="button"
            onClick={disconnect}
            disabled={!!busy}
            className="h-12 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Unlink className="w-4 h-4" />
            Disconnect
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={connect}
          disabled={busy === "connect" || !status.configured}
          className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy === "connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          {status.configured ? "Connect eBay" : "eBay Connection Unavailable"}
        </button>
      )}
    </section>
  );
}
