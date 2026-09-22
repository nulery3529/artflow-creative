export const PLATFORMS = ["Vinted", "Depop", "eBay", "Etsy", "Poshmark"]; 

export const PLATFORM_TONE = {
  Vinted: "pastel-lavender text-[hsl(var(--primary))]",
  Depop: "pastel-mint text-slate-600",
  eBay: "pastel-blue text-slate-600",
  Etsy: "bg-rose-100 text-rose-700",
  Poshmark: "bg-pink-100 text-pink-700",
  Legacy: "bg-muted text-muted-foreground",
};

export const PLATFORM_BAR = {
  Vinted: "bg-[hsl(var(--primary))]",
  Depop: "bg-slate-400",
  eBay: "bg-blue-400",
  Etsy: "bg-violet-400",
  Poshmark: "bg-pink-400",
  Legacy: "bg-slate-300",
};

const SUPPORTED = new Set(PLATFORMS);

// Preserve old sales records without continuing to advertise retired seller
// platforms. Historical unsupported rows appear only as Legacy in the UI.
export function displayPlatform(value) {
  const raw = String(value || "").trim();
  return SUPPORTED.has(raw) ? raw : "Legacy";
}

export function displayProductName(order) {
  const name = String(order?.product_name || "").trim();
  return name || `${displayPlatform(order?.platform)} sale`;
}

export function orderSourceUrl(order) {
  const direct = String(order?.source_url || order?.data?.source_url || "").trim();
  return /^https:\/\//i.test(direct) ? direct : "";
}
