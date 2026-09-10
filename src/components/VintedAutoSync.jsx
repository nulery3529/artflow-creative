import { useEffect } from "react";

// Keeps imported Vinted Pro listings fresh without pressing "Sync imported":
// runs once when the app opens, then at most once an hour while it stays open.
// The daily background job (Vercel cron) also refreshes Vinted Pro listings.
const THROTTLE_MS = 60 * 60 * 1000;

export default function VintedAutoSync() {
  useEffect(() => {
    const run = async () => {
      try {
        const last = Number(localStorage.getItem("artflow_vinted_sync_at") || 0);
        if (Date.now() - last < THROTTLE_MS) return;
        localStorage.setItem("artflow_vinted_sync_at", String(Date.now()));

        const response = await fetch("/api/vinted-official", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync_imported" }),
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        if (data?.connected && Number(data.saved) > 0) {
          window.dispatchEvent(
            new CustomEvent("artflow:listings-synced", {
              detail: { platform: "Vinted", saved: Number(data.saved) },
            })
          );
        }
      } catch {
        // Autosync is best-effort; the manual button still works.
      }
    };
    run();
  }, []);

  return null;
}