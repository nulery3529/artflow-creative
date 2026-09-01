import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function DepopConnectionCard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [username, setUsername] = useState("");
  const [needsUsername, setNeedsUsername] = useState(false);
  const [message, setMessage] = useState("Refresh your full active Depop shop into Gallery with one tap.");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/depop-parse-refresh", { credentials: "include", cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (cancelled) return;
        if (response.ok) {
          setConfigured(data.configured === true);
          setUsername(data.username || "");
          setNeedsUsername(data.needs_username === true);
          if (data.needs_api_key) setMessage("Parse is ready in Art Flow. Add the Parse API key to Vercel once, then Refresh will work.");
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const refreshListings = async () => {
    if (!username.trim()) {
      setNeedsUsername(true);
      toast.info("Enter your Depop username once first");
      return;
    }
    setRefreshing(true);
    try {
      const response = await fetch("/api/depop-parse-refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.needs_api_key) {
        setConfigured(false);
        throw new Error(data.error || "Parse API key still needs to be added to Vercel");
      }
      if (data.needs_username) {
        setNeedsUsername(true);
        throw new Error(data.error || "Enter your Depop username");
      }
      if (!response.ok || data.error) throw new Error(data.error || "Could not refresh Depop listings");

      setConfigured(true);
      setNeedsUsername(false);
      const count = Number(data.saved || 0);
      const text = data.message || `${count} active Depop listing${count === 1 ? "" : "s"} refreshed.`;
      setMessage(text);
      window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { saved: count } }));
      toast.success("Depop listings refreshed", { description: text });
    } catch (error) {
      const text = error?.message || "Depop refresh failed";
      setMessage(text);
      toast.error("Could not refresh Depop listings", { description: text });
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return null;

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <div className="mb-4">
        <h2 className="font-heading text-lg">Depop</h2>
        <p className="text-sm text-muted-foreground mt-1">Refresh all current active Depop listings into Gallery at once.</p>
      </div>

      {(needsUsername || !username) && (
        <div className="mb-3">
          <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Depop username</label>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value.replace(/^@/, ""))}
            placeholder="your Depop username"
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full h-11 px-4 rounded-2xl bg-background border border-[hsl(var(--border))] text-sm outline-none"
          />
          <p className="text-xs text-muted-foreground mt-1.5">You only enter this once. Art Flow remembers it for future refreshes.</p>
        </div>
      )}

      <button
        onClick={refreshListings}
        disabled={refreshing}
        className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        {refreshing ? "Refreshing active listings…" : "Refresh Active Depop Listings"}
      </button>

      <div className="rounded-2xl bg-muted/60 p-3 mt-3">
        <p className="text-sm text-foreground">{message}</p>
        {!configured && <p className="text-xs text-muted-foreground mt-1">The Parse API key stays on Vercel and is never shown in the app.</p>}
      </div>
    </section>
  );
}
