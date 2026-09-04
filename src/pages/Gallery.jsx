import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import { formatMoney } from "@/lib/format";
import { PLATFORM_TONE } from "@/lib/platforms";
import ArtPieceForm from "@/components/ArtPieceForm";
import PullToRefresh from "@/components/PullToRefresh";
import PageHeader from "@/components/PageHeader";
import { useNavigate } from "react-router-dom";
import { useModalRoute } from "@/hooks/useModalRoute";
import { Image } from "@/components/ui/image";

const tabs = ["All", "Available", "Sold"];
const marketplaceTabs = ["All sites", "Vinted", "Depop", "Etsy", "eBay"];

// Marketplace photos always load through Art Flow so seller CDNs cannot block the gallery.
function marketplaceImageSrc(listing) {
  if (!listing?.image_url && !listing?.listing_url) return "";
  const params = new URLSearchParams();
  if (listing.image_url) params.set("image", listing.image_url);
  if (listing.listing_url) params.set("listing", listing.listing_url);
  return `/api/listing-image?${params.toString()}`;
}

export default function Gallery() {
  const { records, loading, reload } = useEntity("ArtPiece", "-created_date");
  const [marketplaceListings, setMarketplaceListings] = useState([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(true);
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
    reloadMarketplaceListings();
    const onSync = () => reloadMarketplaceListings();
    window.addEventListener("artflow:listings-synced", onSync);
    return () => window.removeEventListener("artflow:listings-synced", onSync);
  }, [reloadMarketplaceListings]);
  const navigate = useNavigate();
  // Open on Available so sold inventory is kept separate by default. The All
  // tab remains available when the user intentionally wants the combined view.
  const [filter, setFilter] = useState("Available");
  const [marketplaceFilter, setMarketplaceFilter] = useState("All sites");
  const [mediumFilter, setMediumFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { isOpen: formOpen, open: openForm, close: closeForm } = useModalRoute();
  const [editRecord, setEditRecord] = useState(null);

  const availableMarketplaceListings = useMemo(
    () => marketplaceListings.filter((listing) => (listing.status || "Active") === "Active"),
    [marketplaceListings]
  );
  const soldMarketplaceListings = useMemo(
    () => marketplaceListings.filter((listing) => listing.status === "Sold"),
    [marketplaceListings]
  );

  const stats = useMemo(() => {
    const manualAvailable = records.filter((p) => (p.status || "Available") === "Available").length;
    const manualSold = records.filter((p) => p.status === "Sold").length;
    return {
      listings: records.length + availableMarketplaceListings.length + soldMarketplaceListings.length,
      available: manualAvailable + availableMarketplaceListings.length,
      sold: manualSold + soldMarketplaceListings.length,
    };
  }, [records, availableMarketplaceListings, soldMarketplaceListings]);

  const mediums = useMemo(
    () => [...new Set(records.map((p) => p.medium).filter(Boolean))].sort(),
    [records]
  );

  const filteredMarketplaceListings = useMemo(() => {
    const q = search.trim().toLowerCase();
    const source = filter === "Sold"
      ? soldMarketplaceListings
      : filter === "Available"
        ? availableMarketplaceListings
        : [...availableMarketplaceListings, ...soldMarketplaceListings];
    return source.filter((listing) => {
      if (marketplaceFilter !== "All sites" && listing.platform !== marketplaceFilter) return false;
      if (!q) return true;
      return `${listing.title || ""} ${listing.platform || ""}`.toLowerCase().includes(q);
    });
  }, [availableMarketplaceListings, soldMarketplaceListings, filter, marketplaceFilter, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((p) => {
      if (filter !== "All" && (p.status || "Available") !== filter) return false;
      if (mediumFilter !== "All" && p.medium !== mediumFilter) return false;
      if (!q) return true;
      return `${p.title || ""} ${p.medium || ""} ${p.size || ""} ${p.platform || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [records, filter, mediumFilter, search]);

  const openCreate = () => {
    setEditRecord(null);
    openForm();
  };

  const openEdit = (record) => {
    setEditRecord(record);
    openForm();
  };

  const refreshAll = async () => {
    await Promise.all([reload(), reloadMarketplaceListings()]);
  };

  if (loading || marketplaceLoading) {
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

      <div className="flex border-b border-[hsl(var(--border))]">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 h-11 text-sm font-semibold border-b-2 transition-colors ${
              filter === tab
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

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

      <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg">
                {filter === "Sold" ? "Sold marketplace listings" : filter === "Available" ? "Available marketplace listings" : "Marketplace listings"}
              </h2>
              <p className="text-xs text-muted-foreground">Tap any item to open the marketplace listing.</p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground shrink-0">{filteredMarketplaceListings.length}</span>
          </div>

          {filteredMarketplaceListings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-5 text-center">
              <p className="font-semibold text-sm">No linked marketplace listings yet</p>
              <p className="text-xs text-muted-foreground mt-1">Open your seller listings page in Chrome and use Art Flow Browser Sync → Sync current listings to Gallery.</p>
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
                    <span className={`absolute left-2 top-2 px-2 py-1 rounded-full text-[10px] font-bold ${PLATFORM_TONE[listing.platform] || "bg-black text-white"}`}>
                      {listing.platform}
                    </span>
                    {listing.status === "Sold" && (
                      <span className="absolute left-2 bottom-2 bg-black text-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide">
                        Sold
                      </span>
                    )}
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
              const sold = piece.status === "Sold";
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
                    {sold && (
                      <span className="absolute left-2 top-2 bg-black text-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide">
                        Sold
                      </span>
                    )}
                  </div>
                  <div className="pt-2 px-0.5">
                    <p className="text-sm leading-tight truncate text-foreground">{piece.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {[piece.size, piece.medium].filter(Boolean).join(" · ") || "Art print"}
                    </p>
                    <p className="text-sm font-bold mt-1.5 text-foreground">
                      {formatMoney(sold ? piece.sale_price || piece.price : piece.price)}
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
