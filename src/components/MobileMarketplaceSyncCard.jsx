import React, { useEffect, useState } from "react";
import { Link2, Smartphone } from "lucide-react";
import { toast } from "sonner";

function cleanUsername(value = "") {
  const raw = String(value || "").trim().replace(/^@+/, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const segments = url.pathname.split("/").filter(Boolean);
      if (/vinted/i.test(url.hostname)) {
        const member = segments.find((segment) => /^\d+-/.test(segment));
        if (member) return member.replace(/^\d+-/, "").replace(/^@+/, "");
      }
      if (/depop/i.test(url.hostname) && segments.length) return segments[0].replace(/^@+/, "");
      if (/etsy/i.test(url.hostname)) {
        const shopIndex = segments.findIndex((segment) => segment.toLowerCase() === "shop");
        if (shopIndex >= 0 && segments[shopIndex + 1]) return segments[shopIndex + 1].replace(/^@+/, "");
      }
      if (/ebay/i.test(url.hostname)) {
        const userIndex = segments.findIndex((segment) => ["usr", "str"].includes(segment.toLowerCase()));
        if (userIndex >= 0 && segments[userIndex + 1]) return segments[userIndex + 1].replace(/^@+/, "");
      }
      if (/poshmark/i.test(url.hostname)) {
        const closetIndex = segments.findIndex((segment) => segment.toLowerCase() === "closet");
        if (closetIndex >= 0 && segments[closetIndex + 1]) return segments[closetIndex + 1].replace(/^@+/, "");
      }
    } catch {}
  }
  return raw;
}

function depopProfileUrl(value = "") {
  const raw = String(value || "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const username = cleanUsername(raw);
  return username ? `https://www.depop.com/${username}/` : "";
}

export default function MobileMarketplaceSyncCard() {
  const [platform, setPlatform] = useState("Vinted");
  const [username, setUsername] = useState("");
  const [result, setResult] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mobile-listing-sync", { credentials: "include", cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (cancelled || !response.ok) return;
        const saved = data?.urls?.[platform] || data?.urls?.[platform.toLowerCase()] || "";
        const resolved = cleanUsername(saved);
        if (resolved) setUsername((current) => current || resolved);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [platform]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const submittedUsername = cleanUsername(username);
    if (!submittedUsername || submitting) return;
    setSubmitting(true);
    setResult("");

    try {
      if (platform !== "Depop") {
        const response = await fetch("/api/mobile-listing-sync", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform, username: submittedUsername }),
        });
        const data = await response.json().catch(() => ({}));
        const message = data.message || data.error || (response.ok ? `${platform} profile synced` : `${platform} profile sync failed`);
        setResult(message);
        if (!response.ok || data.ok === false) throw new Error(message);
        toast.success(message);
        window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { saved: data.saved || 0, fullProfile: true } }));
        return;
      }

      const profileUrl = depopProfileUrl(username);
      const statusResponse = await fetch("/api/depop-official", {
        credentials: "include",
        cache: "no-store",
      });
      const statusData = await statusResponse.json().catch(() => ({}));
      if (!statusResponse.ok) throw new Error(statusData.error || "Could not check Depop connection");

      if (!statusData.configured) {
        throw new Error("Full-profile Depop sync is ready in Art Flow, but Depop has not issued the API credentials yet. Once approved, your username will pull the whole shop automatically.");
      }

      if (!statusData.connected) {
        const connectResponse = await fetch("/api/depop-official", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        });
        const connectData = await connectResponse.json().catch(() => ({}));
        if (!connectResponse.ok || !connectData.authorization_url) {
          throw new Error(connectData.error || "Could not start Depop connection");
        }
        window.location.assign(connectData.authorization_url);
        return;
      }

      const syncResponse = await fetch("/api/depop-official", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", profile_url: profileUrl }),
      });
      const syncData = await syncResponse.json().catch(() => ({}));
      const message = syncData.message || syncData.error || (syncResponse.ok ? "Depop profile synced" : "Depop profile sync failed");
      setResult(message);
      if (!syncResponse.ok || syncData.ok === false) throw new Error(message);
      toast.success(message);
      window.dispatchEvent(new CustomEvent("artflow:listings-synced", { detail: { saved: syncData.saved || 0, fullProfile: true } }));
    } catch (error) {
      const message = error?.message || "Profile import failed";
      setResult(message);
      toast.error("Profile import failed", { description: message });
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
          <h2 className="font-heading text-lg">Pull Your Full Profile</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a marketplace and enter only your username. Art Flow will pull the currently available listings into Gallery.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {["Vinted", "Depop", "Etsy", "eBay", "Poshmark"].map((site) => (
          <button
            key={site}
            type="button"
            onClick={() => { setPlatform(site); setUsername(""); setResult(""); }}
            className={`h-10 rounded-xl border text-sm font-semibold transition-colors ${
              platform === site
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]"
                : "bg-background border-[hsl(var(--border))] text-foreground"
            }`}
          >
            {site}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
        <p><strong className="text-foreground">No website link needed.</strong> Enter your {platform} username, with or without the @.</p>
        <p>Example: <strong className="text-foreground">natashaulery</strong></p>
        <p>Running the sync again refreshes the Available Gallery to match the marketplace profile.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          name="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={`${platform} username`}
          className="w-full h-12 rounded-2xl border border-[hsl(var(--border))] bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
        />
        <button
          type="submit"
          disabled={submitting || !username.trim()}
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
