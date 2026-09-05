import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import { useOrders } from "@/lib/useOrders";
import { formatMoney } from "@/lib/format";
import { PLATFORM_TONE, displayPlatform } from "@/lib/platforms";
import ArtPieceForm from "@/components/ArtPieceForm";
import PullToRefresh from "@/components/PullToRefresh";
import PageHeader from "@/components/PageHeader";
import { useNavigate } from "react-router-dom";
import { useModalRoute } from "@/hooks/useModalRoute";
import { Image } from "@/components/ui/image";
import MobileMarketplaceSyncCard from "@/components/MobileMarketplaceSyncCard";

const marketplaceTabs = ["All sites", "Vinted", "Depop", "Etsy", "eBay", "Poshmark"];

// Marketplace photos always load through Art Flow so seller CDNs cannot block the gallery.
function marketplaceImageSrc(listing) {
  if (!listing?.image_url && !listing?.listing_url) return "";
  const params = new URLSearchParams();
  if (listing.image_url) params.set("image", listing.image_url);
  if (listing.listing_url) params.set("listing", listing.listing_url);
  return `/api/listing-image?${params.toString()}`;
}

const GENERIC_TITLE_WORDS = new Set([
  "art", "print", "wall", "framed", "frame", "quilled", "quilling", "style",
  "decor", "new", "brand", "condition", "with", "without", "tags", "the", "and",
]);

function titleWords(value = "") {
  return String(value || "")
    .replace(/,\s*brand:.*$/i, "")
    .replace(/\|\.\.\.$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !GENERIC_TITLE_WORDS.has(word));
}

function normalizedTitle(value = "") {
  return String(value || "")
    .replace(/,\s*brand:.*$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function listingIdFromMarketplaceUrl(platform, raw = "") {
  try {
    const path = new URL(String(raw || "")).pathname;
    if (platform === "Vinted") return path.match(/\/items\/(\d+)/i)?.[1] || "";
    if (platform === "Depop") return path.match(/\/products\/([^/?#]+)/i)?.[1] || "";
    if (platform === "Etsy") return path.match(/\/listing\/(\d+)/i)?.[1] || "";
    if (platform === "eBay") return path.match(/\/itm\/(?:[^/]+\/)?(\d{8,16})/i)?.[1] || "";
  } catch {}
  return "";
}

function orderListingUrl(order) {
  const values = [
    order?.source_url,
    order?.data?.source_url,
    order?.data?.listing_url,
    order?.data?.item_url,
    order?.data?.product_url,
    order?.data?.url,
  ];
  const platform = displayPlatform(order?.platform);
  for (const value of values) {
    const raw = String(value || "").trim();
    if (!/^https:\/\//i.test(raw)) continue;
    if (listingIdFromMarketplaceUrl(platform, raw)) return raw;
  }
  return "";
}

function photoListingForOrder(order, listings) {
  const platform = displayPlatform(order?.platform);
  const candidates = listings.filter((listing) => displayPlatform(listing?.platform) === platform);
  if (!candidates.length) return null;

  const sourceUrl = orderListingUrl(order);
  const sourceListingId = listingIdFromMarketplaceUrl(platform, sourceUrl);
  const explicitListingId = String(
    order?.data?.listing_id || order?.data?.item_id || order?.data?.product_id || ""
  ).trim();

  if (sourceUrl || sourceListingId || explicitListingId) {
    const direct = candidates.find((listing) => {
      if (sourceUrl && listing.listing_url === sourceUrl) return true;
      const candidateId = String(listing?.listing_id || listingIdFromMarketplaceUrl(platform, listing?.listing_url) || "").trim();
      return Boolean(candidateId && (candidateId === sourceListingId || candidateId === explicitListingId));
    });
    if (direct) return direct;
  }

  if (/bundle/i.test(order?.product_name || "")) return null;
  const wantedText = normalizedTitle(order?.product_name);
  if (!wantedText) return null;

  const exactOrContained = candidates.find((listing) => {
    const candidateText = normalizedTitle(listing?.title);
    if (!candidateText) return false;
    if (candidateText === wantedText) return true;
    const shorter = candidateText.length < wantedText.length ? candidateText : wantedText;
    return shorter.length >= 8 && (candidateText.includes(wantedText) || wantedText.includes(candidateText));
  });
  if (exactOrContained) return exactOrContained;

  const wanted = titleWords(order?.product_name);
  if (!wanted.length) return null;
  const wantedSet = new Set(wanted);
  const orderTotal = Number(order?.sale_total || 0);

  const scored = candidates.map((listing) => {
    const candidateWords = titleWords(listing?.title);
    const candidateSet = new Set(candidateWords);
    const overlap = [...wantedSet].filter((word) => candidateSet.has(word)).length;
    const wordScore = overlap / Math.max(1, Math.min(wantedSet.size, candidateSet.size));
    const listingPrice = Number(listing?.price || 0);
    const priceBonus = orderTotal > 0 && listingPrice > 0 && Math.abs(orderTotal - listingPrice) < 0.01 ? 0.2 : 0;
    return { listing, overlap, score: wordScore + priceBonus };
  }).sort((a, b) => b.score - a.score || b.overlap - a.overlap);

  const best = scored[0];
  const second = scored[1];
  if (!best) return null;
  if (best.overlap >= 2 && best.score >= 0.42) return best.listing;
  if (best.overlap === 1 && best.score >= 0.8 && (!second || best.score - second.score >= 0.25)) return best.listing;
  return null;
}

export default function Gallery() {
  const { records, loading, reload } = useEntity("ArtPiece", "-created_date");
  const { records: orders, loading: ordersLoading, reload: reloadOrders } = useOrders();
  const [marketplaceListings, setMarketplaceListings] = useState([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(true);
  const officialRefreshInFlight = useRef(false);
  const lastOfficialRefresh = useRef(0);

  const refreshConnectedMarketplaces = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    if (officialRefreshInFlight.current) return false;
    if (!force && now - lastOfficialRefresh.current < 60 * 1000) return false;

    officialRefreshInFlight.current = true;
    try {
      const [depopStatusResult, vintedStatusResult] = await Promise.allSettled([
        fetch("/api/depop-official", { credentials: "include", cache: "no-store" }).then(async (response) => ({ response, data: await response.json().catch(() => ({})) })),
        fetch("/api/vinted-official", { credentials: "include", cache: "no-store" }).then(async (response) => ({ response, data: await response.json().catch(() => ({})) })),
      ]);

      const jobs = [];
      if (depopStatusResult.status === "fulfilled" && depopStatusResult.value.response.ok && depopStatusResult.value.data?.connected) {
        jobs.push(fetch("/api/depop-official", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync" }),
        }));
      }
      if (vintedStatusResult.status === "fulfilled" && vintedStatusResult.value.response.ok && vintedStatusResult.value.data?.connected) {
        jobs.push(fetch("/api/vinted-official", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync_imported" }),
        }));
      }

      if (jobs.length) await Promise.allSettled(jobs);
      lastOfficialRefresh.current = Date.now();
      return jobs.length > 0;
    } catch (error) {
      console.warn("Could not refresh connected marketplace listings", error);
      return false;
    } finally {
      officialRefreshInFlight.current = false;
    }
  }, []);

  const reloadMarketplaceListings = useCallback(async () => {
    try {
      const response = await fetch("/api/neon-data?op=listings", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        // Never leave the Gallery looking empty when the independent Art Flow
        // session has expired. Re-authenticate once, then return straight here.
        window.location.replace(`/login?returnTo=${encodeURIComponent('/gallery')}`);
        return;
      }
      if (!response.ok) throw new Error(data.error || "Could not load marketplace listings");
      setMarketplaceListings(Array.isArray(data.listings) ? data.listings : []);
    } catch (error) {
      console.error("Could not load marketplace listings", error);
      setMarketplaceListings([]);
    } finally {
      setMarketplaceLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    reloadMarketplaceListings();
    refreshConnectedMarketplaces().then((didRefresh) => {
      if (!cancelled && didRefresh) reloadMarketplaceListings();
    });

    const refreshLiveListings = () => {
      refreshConnectedMarketplaces().then((didRefresh) => {
        if (didRefresh) reloadMarketplaceListings();
      });
    };
    const onSync = () => reloadMarketplaceListings();
    const onFocus = () => refreshLiveListings();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshLiveListings();
    };
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshLiveListings();
    }, 5 * 60 * 1000);

    window.addEventListener("artflow:listings-synced", onSync);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("artflow:listings-synced", onSync);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reloadMarketplaceListings, refreshConnectedMarketplaces]);
  const navigate = useNavigate();
  const [marketplaceFilter, setMarketplaceFilter] = useState("All sites");
  const [mediumFilter, setMediumFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { isOpen: formOpen, open: openForm, close: closeForm } = useModalRoute();
  const [editRecord, setEditRecord] = useState(null);

  const availableMarketplaceListings = useMemo(
    () => marketplaceListings.filter((listing) => {
      if ((listing.status || "Active") !== "Active") return false;

      // Older Vinted browser-sync installs could save Sold-page rows as Active.
      // If an Active Vinted listing already matches a real sold Order, do not
      // show it under Available. Orders remain the source of truth for sales.
      if (displayPlatform(listing.platform) === "Vinted") {
        const matchedSoldOrder = orders.some((order) =>
          displayPlatform(order.platform) === "Vinted"
          && photoListingForOrder(order, [listing]) === listing
        );
        if (matchedSoldOrder) return false;
      }

      return true;
    }),
    [marketplaceListings, orders]
  );
  const stats = useMemo(() => {
    const manualAvailable = records.filter((p) => (p.status || "Available") === "Available").length;
    const manualSold = records.filter((p) => p.status === "Sold").length;
    const available = manualAvailable + availableMarketplaceListings.length;
    return {
      listings: available,
      available,
      sold: manualSold + orders.length,
    };
  }, [records, availableMarketplaceListings, orders]);

  const mediums = useMemo(
    () => [...new Set(records.map((p) => p.medium).filter(Boolean))].sort(),
    [records]
  );

  const filteredMarketplaceListings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return availableMarketplaceListings.filter((listing) => {
      if (marketplaceFilter !== "All sites" && displayPlatform(listing.platform) !== marketplaceFilter) return false;
      if (!q) return true;
      return `${listing.title || ""} ${listing.platform || ""}`.toLowerCase().includes(q);
    });
  }, [availableMarketplaceListings, marketplaceFilter, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((p) => {
      if ((p.status || "Available") !== "Available") return false;
      if (mediumFilter !== "All" && p.medium !== mediumFilter) return false;
      if (!q) return true;
      return `${p.title || ""} ${p.medium || ""} ${p.size || ""} ${p.platform || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [records, mediumFilter, search]);

  const openCreate = () => {
    setEditRecord(null);
    openForm();
  };

  const openEdit = (record) => {
    setEditRecord(record);
    openForm();
  };

  const refreshAll = async () => {
    await Promise.all([reload(), reloadOrders(), reloadMarketplaceListings()]);
  };

  if (loading || ordersLoading || marketplaceLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Gallery" />
        <div className="grid grid-cols-2 gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-square bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PullToRefresh onRefresh={refreshAll} />
      <PageHeader title="Gallery" onBack={() => navigate(-1)} />

      <section className="bg-background border-b border-[hsl(var(--border))] pb-4">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-black text-white flex items-center justify-center font-bold text-2xl shrink-0">
            AF
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight truncate">Art Flow Creative</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your art across every marketplace</p>
            <div className="flex gap-5 mt-3">
              <div>
                <p className="font-bold text-sm">{stats.listings}</p>
                <p className="text-[11px] text-muted-foreground">Listings</p>
              </div>
              <div>
                <p className="font-bold text-sm">{stats.available}</p>
                <p className="text-[11px] text-muted-foreground">Available</p>
              </div>
              <div>
                <p className="font-bold text-sm">{stats.sold}</p>
                <p className="text-[11px] text-muted-foreground">Sold</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search gallery"
            className="w-full h-11 pl-10 pr-3 rounded-none bg-muted/60 border-0 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
          />
        </div>
        <button
          onClick={() => setFiltersOpen((open) => !open)}
          className="w-11 h-11 flex items-center justify-center border border-[hsl(var(--border))]"
          aria-label="Filter artwork"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {marketplaceTabs.map((site) => (
          <button
            key={site}
            onClick={() => setMarketplaceFilter(site)}
            className={`px-3.5 h-9 rounded-full text-xs font-semibold shrink-0 ${
              marketplaceFilter === site
                ? "bg-foreground text-background"
                : "bg-muted text-foreground"
            }`}
          >
            {site}
          </button>
        ))}
      </div>

      {filtersOpen && mediums.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {["All", ...mediums].map((medium) => (
            <button
              key={medium}
              onClick={() => setMediumFilter(medium)}
              className={`px-3.5 h-9 border text-xs font-medium shrink-0 ${
                mediumFilter === medium
                  ? "border-foreground bg-foreground text-background"
                  : "border-[hsl(var(--border))] bg-background text-foreground"
              }`}
            >
              {medium === "All" ? "All mediums" : medium}
            </button>
          ))}
        </div>
      )}

      <MobileMarketplaceSyncCard />

      <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg">Available marketplace listings</h2>
              <p className="text-xs text-muted-foreground">Tap any item to open the marketplace listing.</p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground shrink-0">{filteredMarketplaceListings.length}</span>
          </div>

          {filteredMarketplaceListings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-5 text-center">
              <p className="font-semibold text-sm">No linked marketplace listings yet</p>
              <p className="text-xs text-muted-foreground mt-1">Sync your marketplace listings to add their photos to Gallery.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-1.5 gap-y-5">
              {filteredMarketplaceListings.map((listing) => (
                <a
                  key={listing.id}
                  href={listing.listing_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-left min-w-0 block"
                >
                  <div className="relative aspect-square bg-muted overflow-hidden">
                    {listing.image_url || listing.listing_url ? (
                      <Image
                        src={marketplaceImageSrc(listing)}
                        fittingType="fill"
                        className="w-full h-full object-cover"
                        alt={listing.title || `${listing.platform || "Marketplace"} listing`}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No photo</div>
                    )}
                    <span className={`absolute left-2 top-2 px-2 py-1 rounded-full text-[10px] font-bold ${PLATFORM_TONE[displayPlatform(listing.platform)] || "bg-black text-white"}`}>
                      {displayPlatform(listing.platform)}
                    </span>
                    <span className="absolute right-2 top-2 w-7 h-7 rounded-full bg-black/65 text-white flex items-center justify-center">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="pt-2 px-0.5">
                    <p className="text-sm leading-tight line-clamp-2 text-foreground">{listing.title}</p>
                    <p className="text-sm font-bold mt-1.5 text-foreground">
                      {Number(listing.price || 0) > 0 ? formatMoney(listing.price) : "View listing"}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg">My gallery</h2>
          <p className="text-xs text-muted-foreground">Artwork you added directly in Art Flow.</p>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-[hsl(var(--border))]">
            <p className="font-semibold">No artwork here yet</p>
            <p className="text-sm text-muted-foreground mt-1">Tap + to add a listing</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-1.5 gap-y-5">
            {filtered.map((piece) => {
              return (
                <button key={piece.id} onClick={() => openEdit(piece)} className="text-left min-w-0">
                  <div className="relative aspect-square bg-muted overflow-hidden">
                    {piece.image_url ? (
                      <Image src={piece.image_url} fittingType="fill" className="w-full h-full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="pt-2 px-0.5">
                    <p className="text-sm leading-tight truncate text-foreground">{piece.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {[piece.size, piece.medium].filter(Boolean).join(" · ") || "Art print"}
                    </p>
                    <p className="text-sm font-bold mt-1.5 text-foreground">
                      {formatMoney(piece.price)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <button
        onClick={openCreate}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-black text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform z-30"
        style={{ left: "50%", transform: "translateX(calc(50vw - 2.75rem - 1.25rem))" }}
        aria-label="Add artwork"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

      <ArtPieceForm open={formOpen} onClose={closeForm} record={editRecord} />
    </div>
  );
}
