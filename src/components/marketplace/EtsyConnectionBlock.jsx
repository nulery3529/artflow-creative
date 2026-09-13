import React, { useEffect, useState } from "react";
import { CheckCircle2, Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";

const post = (body) =>
  fetch("/api/etsy-official", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export default function EtsyConnectionBlock() {
  const [status, setStatus] = useState({ configured: false, connected: false, shop_name: "", credential_source: "", can_manage_credentials: false, has_business: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [keystring, setKeystring] = useState("");
  const [sharedSecret, setSharedSecret] = useState("");
  const [showCredentials, setShowCredentials] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/api/etsy-official", { credentials: "include", cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        setStatus({
          configured: data.configured === true,
          connected: data.connected === true,
          shop_name: data.shop_name || "",
          credential_source: data.credential_source || "",
          can_manage_credentials: data.can_manage_credentials === true,
          has_business: data.has_business === true,
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
    try {
      const url = new URL(window.location.href);
      const result = url.searchParams.get("etsy");
      const message = url.searchParams.get("message");
      if (result === "error") toast.error("Etsy connection failed", { description: message || "Etsy returned an error." });
      if (result === "connected") toast.success("Etsy connected");
      if (result) {
        url.searchParams.delete("etsy");
        url.searchParams.delete("message");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {}
  }, []);

  const saveCredentials = async () => {
    if (!keystring.trim() || !sharedSecret.trim()) return;
    setBusy("credentials");
    try {
      const r = await post({ action: "save_credentials", keystring: keystring.trim(), shared_secret: sharedSecret.trim() });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Could not save Etsy credentials");
      setSharedSecret("");
      setShowCredentials(false);
      toast.success("Etsy credentials saved securely");
      await load();
    } catch (error) {
      toast.error("Could not save Etsy credentials", { description: error?.message });
    } finally {
      setBusy("");
    }
  };

  const connect = async () => {
    setBusy("connect");
    try {
      const r = await post({ action: "start" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Could not start Etsy connection");
      if (!data.authorization_url) throw new Error("Etsy authorization link was not returned");
      window.location.assign(data.authorization_url);
    } catch (error) {
      toast.error("Could not connect Etsy", { description: error?.message });
      setBusy("");
    }
  };

  const sync = async () => {
    setBusy("sync");
    try {
      let r = await post({ action: "sync" });
      let data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Etsy sync failed");
      let saved = data.saved || 0;
      let pass = 0;
      while (data.more_possible && pass < 6) {
        r = await post({ action: "sync" });
        data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "Etsy sync failed");
        saved += data.saved || 0;
        pass += 1;
      }
      toast.success("Etsy synced", { description: data.message || `${saved} sales imported.` });
      window.dispatchEvent(new CustomEvent("artflow:data-synced"));
      await load();
    } catch (error) {
      toast.error("Etsy sync failed", { description: error?.message });
    } finally {
      setBusy("");
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      const r = await post({ action: "disconnect" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Could not disconnect Etsy");
      toast.success("Etsy disconnected");
      await load();
    } catch (error) {
      toast.error("Could not disconnect Etsy", { description: error?.message });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold">Etsy</p>
            {status.connected && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {status.connected
              ? `Connected${status.shop_name ? ` to ${status.shop_name}` : ""}. Your listings and photos sync into Gallery${status.has_business ? ", and paid orders can sync to your business" : ""}.`
              : status.configured
                ? "Official Etsy sign-in — no password stored, tokens encrypted."
                : "Etsy is being configured by Art Flow. You will only need to tap Connect Etsy."}
          </p>
        </div>
      </div>

      {loading ? (
        <button disabled className="w-full h-11 rounded-2xl bg-muted flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
        </button>
      ) : !status.configured ? (
        <div className="rounded-2xl bg-muted/60 p-3 text-xs text-muted-foreground">
          Etsy connection is being configured by Art Flow. You will only need to tap Connect Etsy when it is ready.
        </div>
      ) : status.connected ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={sync} disabled={!!busy} className="h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync Etsy
          </button>
          <button onClick={disconnect} disabled={!!busy} className="h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            <Unlink className="w-4 h-4" /> Disconnect
          </button>
        </div>
      ) : (
        <button onClick={connect} disabled={busy === "connect" || !status.configured} className="w-full h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {busy === "connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          {status.configured ? "Connect Etsy" : "Etsy setup needed"}
        </button>
      )}
    </div>
  );
}