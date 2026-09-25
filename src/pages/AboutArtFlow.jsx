import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, Receipt, Package, MoreHorizontal, RefreshCw, Home, Car, Palette, UserRound, BarChart3, Calculator, CalendarDays, Target, Store, ShoppingCart } from "lucide-react";

const MiniArt = ({ variant = 1 }) => {
  const classes = {
    1: "from-[#23162f] via-[#6c3d7c] to-[#d59ac0]",
    2: "from-[#e6bfd0] via-[#c77a9a] to-[#6e355a]",
    3: "from-[#4d3839] via-[#8d6b56] to-[#d3ad8d]",
    4: "from-[#4b3159] via-[#87608f] to-[#c8a8cf]",
  };
  return (
    <div className={`relative h-11 w-11 overflow-hidden rounded-xl bg-gradient-to-br ${classes[variant] || classes[1]}`}>
      <div className="absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full border border-white/70" />
      <div className="absolute bottom-1.5 right-1.5 h-5 w-5 rotate-12 rounded-sm border border-white/50 bg-white/10" />
      <div className="absolute bottom-2 left-2 h-0.5 w-7 rotate-[-20deg] bg-white/65" />
    </div>
  );
};

const Metric = ({ label, value, accent }) => (
  <div className="rounded-2xl border border-white/70 bg-white/95 px-3 py-3 shadow-sm">
    <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-slate-500">{label}</p>
    <p className={`mt-1 text-[15px] font-black ${accent || "text-[#3c205b]"}`}>{value}</p>
  </div>
);

const OrderRow = ({ variant, title, platform, amount }) => (
  <div className="flex items-center gap-2 rounded-2xl border border-[#eee8f5] bg-white p-2">
    <MiniArt variant={variant} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-[9px] font-extrabold text-[#261631]">{title}</p>
      <p className="mt-0.5 text-[8px] text-slate-500">{platform}</p>
    </div>
    <span className="text-[9px] font-black text-[#6d3f92]">{amount}</span>
  </div>
);

const MARKETPLACE_STYLES = {
  Poshmark: {
    color: "#610721",
    soft: "rgba(97,7,33,.20)",
    logo: "https://upload.wikimedia.org/wikipedia/commons/4/44/Poshmark_logo.png",
    logoClass: "w-[86px] h-auto",
  },
  Vinted: {
    color: "#027783",
    soft: "rgba(2,119,131,.20)",
    logo: "https://upload.wikimedia.org/wikipedia/commons/b/b8/Vinted_Logo_2022.svg",
    logoClass: "w-[76px] h-auto",
  },
  Depop: {
    color: "#E4001D",
    soft: "rgba(228,0,29,.18)",
    logo: "https://upload.wikimedia.org/wikipedia/commons/f/fb/Depop_logo.svg",
    logoClass: "w-[76px] h-auto",
  },
  Etsy: {
    color: "#F16521",
    soft: "rgba(241,101,33,.18)",
    logo: "https://upload.wikimedia.org/wikipedia/commons/8/89/Etsy_logo.svg",
    logoClass: "w-[66px] h-auto",
  },
  eBay: {
    color: "#0064D2",
    soft: "rgba(0,100,210,.16)",
    logo: "https://upload.wikimedia.org/wikipedia/commons/1/1b/EBay_logo.svg",
    logoClass: "w-[76px] h-auto",
  },
};

function MarketplaceMark({ name }) {
  const style = MARKETPLACE_STYLES[name] || MARKETPLACE_STYLES.eBay;

  return (
    <div className="grid h-14 w-[104px] place-items-center rounded-xl bg-white px-2 shadow-sm ring-1 ring-black/5">
      <img
        src={style.logo}
        alt={`${name} logo`}
        className={`max-h-9 object-contain ${style.logoClass}`}
        loading="eager"
      />
    </div>
  );
}

function PreviewHero({ compact = false, onTabChange }) {
  return (
    <div className={`relative overflow-hidden bg-[radial-gradient(circle_at_88%_12%,rgba(206,67,255,.30),transparent_8rem),radial-gradient(circle_at_-2%_0%,rgba(255,255,255,.14),transparent_7rem),linear-gradient(145deg,#171719_0%,#070708_76%)] text-white shadow-[0_18px_44px_rgba(17,12,21,.20)] ${compact ? "rounded-[24px] p-4" : "rounded-[26px] p-4"}`}>
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,.04),transparent_38%,transparent_72%,rgba(216,72,255,.08))]" />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold text-white/65">Good morning, Artist</p>
            <p className="mt-2 text-[9px] text-white/60">Total business sales</p>
            <p className={`mt-0.5 font-black tracking-[-0.05em] ${compact ? "text-[28px]" : "text-[30px]"}`}>$3,842.60</p>
          </div>
          <div className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/10">
            <RefreshCw className="h-4 w-4" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2">
          {[
            ["Orders", "Orders", ShoppingBag, false],
            ["Expenses", "Expenses", Receipt, false],
            ["Inventory", "Inventory", Package, false],
            ["More", "More", MoreHorizontal, true],
          ].map(([label, target, Icon, accent]) => (
            <button
              type="button"
              key={label}
              onClick={() => onTabChange?.(target)}
              className="flex min-w-0 flex-col items-center gap-1.5 transition active:scale-95"
              aria-label={`Open ${label}`}
            >
              <span className={`grid rounded-full shadow-md transition hover:-translate-y-0.5 ${compact ? "h-10 w-10" : "h-11 w-11"} place-items-center ${accent ? "bg-gradient-to-br from-[#c53bff] to-[#e948c5] text-white" : "bg-white text-[#111]"}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-[8px] font-semibold text-white/72">{label}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl bg-white/10">
          <div className="bg-gradient-to-br from-[#c93cff] to-[#e247c5] px-3 py-2.5">
            <span className="block text-[7px] font-bold uppercase tracking-[0.08em] text-white/70">Items sold</span>
            <strong className="mt-1 block text-[12px] font-black">214</strong>
          </div>
          <div className="bg-gradient-to-br from-[#c93cff] to-[#e247c5] px-3 py-2.5">
            <span className="block text-[7px] font-bold uppercase tracking-[0.08em] text-white/70">Orders</span>
            <strong className="mt-1 block text-[12px] font-black">187</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewLineChart() {
  return (
    <div className="mt-3">
      <svg viewBox="0 0 220 70" className="h-[70px] w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="coverSalesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity=".30" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M 0 62 L 0 48 L 38 41 L 75 50 L 112 31 L 150 35 L 185 18 L 220 24 L 220 62 Z" fill="url(#coverSalesFill)" />
        <polyline points="0,48 38,41 75,50 112,31 150,35 185,18 220,24" fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="grid grid-cols-6 text-center text-[6px] text-slate-400">
        <span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span>
      </div>
    </div>
  );
}

function PreviewMarketPerformance({ compact = false }) {
  const rows = [
    ["Poshmark", "$1,420", "100%", "#D6249F"],
    ["Vinted", "$1,080", "76%", "#007782"],
    ["Depop", "$822", "58%", "#111111"],
    ["Etsy", "$640", "45%", "#F1641E"],
    ["eBay", "$520", "37%", "#3665F3"],
  ];
  return (
    <div className="space-y-2.5">
      {rows.map(([name, amount, width, color]) => (
        <div key={name}>
          <div className="mb-1 flex items-center justify-between gap-2 text-[7px]">
            <span className="font-semibold text-slate-700">{name}</span>
            <span className="font-bold text-slate-800">{amount}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-purple-100/70">
            <div className="h-full rounded-full" style={{ width, backgroundColor: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PreviewOrder({ image = "bundle", title, platform, amount }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-purple-100/60 py-2 last:border-b-0">
      <div className="h-10 w-10 overflow-hidden rounded-xl border border-purple-100 bg-gradient-to-br from-purple-100 via-pink-50 to-cyan-50">
        {image === "bundle" ? (
          <img src="/bundle-placeholder.svg" alt="" className="h-full w-full object-cover" />
        ) : (
          <MiniArt variant={image} />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[8px] font-bold text-slate-800">{title}</p>
        <p className="mt-1 text-[7px] text-slate-400">{platform}</p>
      </div>
      <p className="text-[8px] font-black text-slate-800">{amount}</p>
    </div>
  );
}

function PreviewSectionHeader({ title, subtitle, action }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-[13px] font-black text-slate-900">{title}</h3>
        {subtitle && <p className="mt-1 text-[8px] text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function PreviewOrders() {
  return (
    <div>
      <PreviewSectionHeader title="Orders" subtitle="Sold items across platforms" />
      <div className="mb-3 flex gap-1.5 overflow-hidden">
        {["All", "Poshmark", "Vinted", "Depop", "Etsy", "eBay", "Bundles"].map((item, i) => (
          <span key={item} className={`shrink-0 rounded-full px-2.5 py-1.5 text-[7px] font-bold ${i === 0 ? "bg-[#6e3769] text-white" : "bg-white text-slate-500 border border-slate-200"}`}>
            {item}
          </span>
        ))}
      </div>
      <div className="rounded-[20px] border border-[#eeeaf1] bg-white px-3 shadow-sm">
        <PreviewOrder image="bundle" title="Bundle Order" platform="Depop · Qty 3" amount="$42.00" />
        <PreviewOrder image={2} title="Framed Art Print" platform="Poshmark · Qty 1" amount="$28.00" />
        <PreviewOrder image={3} title="Botanical Print" platform="Vinted · Qty 1" amount="$19.00" />
        <PreviewOrder image={4} title="Digital Art Download" platform="Etsy · Qty 1" amount="$8.00" />
        <PreviewOrder image={1} title="Skeleton Art Print" platform="eBay · Qty 1" amount="$24.00" />
      </div>
    </div>
  );
}

function PreviewInventory() {
  const cards = [
    ["5x7 Art Prints", "Print", "32 in stock", 2],
    ["8x10 Frames", "Frame", "18 in stock", 3],
    ["Rigid Mailers", "Packaging", "46 in stock", 4],
    ["11x14 Art Prints", "Print", "12 in stock", 1],
  ];
  return (
    <div>
      <PreviewSectionHeader title="Inventory" subtitle="Stock across all categories" action={<span className="rounded-xl bg-[#6e3769] px-3 py-2 text-[8px] font-bold text-white">+ Add</span>} />
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[["All", "108"], ["Supplies", "62"], ["Packaging", "46"]].map(([label, count], i) => (
          <div key={label} className={`rounded-2xl border p-2.5 ${i === 0 ? "border-transparent bg-[#6e3769] text-white" : "border-slate-200 bg-white text-slate-700"}`}>
            <p className="text-[7px] font-bold">{label}</p>
            <p className="mt-1 text-[14px] font-black">{count}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cards.map(([title, category, stock, image]) => (
          <div key={title} className="overflow-hidden rounded-[18px] border border-[#eeeaf1] bg-white shadow-sm">
            <div className="grid h-20 place-items-center bg-gradient-to-br from-purple-100 via-pink-50 to-cyan-50">
              <MiniArt variant={image} />
            </div>
            <div className="p-2.5">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[6px] font-bold uppercase text-slate-500">{category}</span>
              <p className="mt-2 truncate text-[8px] font-black text-slate-800">{title}</p>
              <p className="mt-1 text-[7px] text-slate-400">{stock}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewExpenses() {
  const rows = [
    ["Shipping supplies", "Supplies", "$24.80"],
    ["Printer ink", "Printing", "$18.25"],
    ["11x14 mailing boxes", "Packaging", "$16.00"],
    ["Marketplace fees", "Fees", "$12.40"],
  ];
  return (
    <div>
      <PreviewSectionHeader title="Expenses" subtitle="Track business deductions" action={<span className="rounded-xl bg-[#6e3769] px-3 py-2 text-[8px] font-bold text-white">+ Add</span>} />
      <div className="mb-3 rounded-[18px] border border-[#eeeaf1] bg-white p-3 shadow-sm">
        <p className="text-[9px] font-bold text-slate-800">Expense records</p>
        <p className="mt-1 text-[7px] leading-4 text-slate-400">Saved business expenses from connected inboxes and manual entries.</p>
      </div>
      <div className="mb-3 flex gap-1.5 overflow-hidden">
        {["All", "Supplies", "Packaging", "Fees", "Software"].map((item, i) => (
          <span key={item} className={`shrink-0 rounded-full px-2.5 py-1.5 text-[7px] font-bold ${i === 0 ? "bg-[#6e3769] text-white" : "bg-white text-slate-500 border border-slate-200"}`}>
            {item}
          </span>
        ))}
      </div>
      <div className="rounded-[20px] border border-[#eeeaf1] bg-white px-3 shadow-sm">
        {rows.map(([name, cat, amount]) => (
          <div key={name} className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-b-0">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-pink-100 text-pink-600">
              <Receipt className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[8px] font-bold text-slate-800">{name}</p>
              <p className="mt-1 text-[7px] text-slate-400">{cat}</p>
            </div>
            <p className="text-[8px] font-black text-slate-800">{amount}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewReports() {
  const stats = [
    ["Gross Sales", "$3,842.60", "bg-purple-50"],
    ["Number of Orders", "187", "bg-blue-50"],
    ["Items Sold", "214", "bg-emerald-50"],
    ["Product Costs", "$746.20", "bg-orange-50"],
    ["Business Expenses", "$316.00", "bg-yellow-50"],
    ["Net Profit", "$2,780.40", "bg-emerald-50"],
  ];
  return (
    <div>
      <PreviewSectionHeader title="Reports" subtitle="Performance over time" />
      <div className="mb-3 flex gap-1.5 overflow-hidden">
        {["This Month", "Last Month", "Last 3 Months", "This Year", "All Time"].map((item, i) => (
          <span key={item} className={`shrink-0 rounded-full px-2.5 py-1.5 text-[7px] font-bold ${i === 0 ? "bg-[#6e3769] text-white" : "bg-white text-slate-500 border border-slate-200"}`}>
            {item}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {stats.map(([label, value, tone]) => (
          <div key={label} className={`rounded-[18px] border border-[#eeeaf1] p-3 shadow-sm ${tone}`}>
            <p className="text-[7px] font-bold text-slate-500">{label}</p>
            <p className="mt-2 text-[14px] font-black text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-[20px] border border-[#eeeaf1] bg-white p-3 shadow-sm">
        <p className="mb-3 text-[9px] font-black text-slate-800">Sales Split</p>
        <PreviewMarketPerformance />
      </div>
    </div>
  );
}

function PreviewMileage() {
  return (
    <div>
      <PreviewSectionHeader title="Mileage" subtitle="Log business drives" action={<span className="rounded-xl bg-[#6e3769] px-3 py-2 text-[8px] font-bold text-white">+ Log trip</span>} />
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[18px] border border-[#eeeaf1] bg-white p-3 shadow-sm">
          <p className="text-[7px] font-bold uppercase text-slate-400">Total Miles</p>
          <p className="mt-2 text-[18px] font-black text-slate-900">186.4</p>
        </div>
        <div className="rounded-[18px] border border-[#eeeaf1] bg-purple-50 p-3 shadow-sm">
          <p className="text-[7px] font-bold uppercase text-slate-400">Deduction</p>
          <p className="mt-2 text-[18px] font-black text-slate-900">$125.92</p>
        </div>
      </div>
      <div className="mt-3 rounded-[20px] border border-[#eeeaf1] bg-white px-3 shadow-sm">
        {[
          ["Sep 24", "Post office drop-off", "8.4 mi"],
          ["Sep 22", "Art supply pickup", "14.2 mi"],
          ["Sep 19", "Shipping run", "6.8 mi"],
        ].map(([date, trip, miles]) => (
          <div key={date + trip} className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-b-0">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-purple-100 text-purple-600"><Car className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[8px] font-bold text-slate-800">{trip}</p>
              <p className="mt-1 text-[7px] text-slate-400">{date}</p>
            </div>
            <p className="text-[8px] font-black text-slate-800">{miles}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewProducts() {
  const cards = [
    ["Framed Floral Print", "$18", "Available", 2],
    ["Skeleton Butterfly Print", "$24", "Available", 1],
    ["Botanical Art Print", "$16", "Sold", 3],
    ["Digital Art Download", "$8", "Available", 4],
  ];
  return (
    <div>
      <PreviewSectionHeader title="Products" subtitle="Available and sold product history" action={<span className="rounded-xl bg-[#6e3769] px-3 py-2 text-[8px] font-bold text-white">+ New product</span>} />
      <div className="mb-3 flex gap-1.5 overflow-hidden">
        {["Available", "Sold Today", "Sold History"].map((item, i) => (
          <span key={item} className={`shrink-0 rounded-full px-2.5 py-1.5 text-[7px] font-bold ${i === 0 ? "bg-[#6e3769] text-white" : "bg-white text-slate-500 border border-slate-200"}`}>
            {item}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cards.map(([title, price, status, image]) => (
          <div key={title} className="overflow-hidden rounded-[18px] border border-[#eeeaf1] bg-white shadow-sm">
            <div className="grid h-20 place-items-center bg-gradient-to-br from-purple-100 via-pink-50 to-cyan-50"><MiniArt variant={image} /></div>
            <div className="p-2.5">
              <p className="truncate text-[8px] font-black text-slate-800">{title}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-1 text-[6px] font-bold ${status === "Sold" ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"}`}>{status}</span>
                <span className="text-[8px] font-black text-slate-800">{price}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewAccount() {
  return (
    <div>
      <PreviewSectionHeader title="Account" subtitle="Profile & settings" />
      <div className="rounded-[20px] border border-[#eeeaf1] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-purple-100 text-purple-700"><UserRound className="h-5 w-5" /></div>
          <div>
            <p className="text-[10px] font-black text-slate-900">Artist Account</p>
            <p className="mt-1 text-[7px] text-slate-400">Email & password account</p>
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {[
          ["Selling sites", "Choose which marketplaces you track"],
          ["Connections", "Manage email and marketplace connections"],
          ["Support", "Get help with sales, expenses, inventory, or reports"],
          ["Appearance", "Light and dark display settings"],
        ].map(([title, sub]) => (
          <div key={title} className="rounded-[18px] border border-[#eeeaf1] bg-white p-3 shadow-sm">
            <p className="text-[9px] font-bold text-slate-800">{title}</p>
            <p className="mt-1 text-[7px] text-slate-400">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewTaxes() {
  return (
    <div>
      <PreviewSectionHeader title="Taxes" subtitle="2026 tax overview" />
      <div className="grid grid-cols-2 gap-2">
        {[
          ["Business Profit", "$3,126.40", "bg-purple-50"],
          ["Deductions", "$316.00", "bg-yellow-50"],
          ["Taxable Profit", "$2,810.40", "bg-blue-50"],
          ["Suggested Reserve", "$702.60", "bg-pink-50"],
        ].map(([label, value, tone]) => (
          <div key={label} className={`rounded-[18px] border border-[#eeeaf1] p-3 shadow-sm ${tone}`}>
            <p className="text-[7px] font-bold text-slate-500">{label}</p>
            <p className="mt-2 text-[14px] font-black text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-[20px] border border-[#eeeaf1] bg-white p-4 shadow-sm">
        <p className="text-[9px] font-black text-slate-800">Tax Reserve Rate</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-purple-100">
          <div className="h-full w-1/4 rounded-full bg-purple-500" />
        </div>
        <div className="mt-2 flex justify-between text-[7px] text-slate-400"><span>0%</span><span className="font-bold text-purple-600">25%</span><span>40%</span></div>
      </div>
    </div>
  );
}

function PreviewBusinessPlan() {
  return (
    <div>
      <PreviewSectionHeader title="Business Plan" subtitle="Goals and cash-flow guidance from your real sales" />
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[18px] border border-[#eeeaf1] bg-purple-50 p-3 shadow-sm">
          <p className="text-[7px] font-bold text-slate-500">Monthly sales</p>
          <p className="mt-2 text-[14px] font-black text-slate-900">$1,284 / $2,000</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full w-[64%] rounded-full bg-purple-500" /></div>
        </div>
        <div className="rounded-[18px] border border-[#eeeaf1] bg-emerald-50 p-3 shadow-sm">
          <p className="text-[7px] font-bold text-slate-500">Monthly profit</p>
          <p className="mt-2 text-[14px] font-black text-slate-900">$968 / $1,000</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full w-[97%] rounded-full bg-emerald-500" /></div>
        </div>
      </div>
      <div className="mt-3 rounded-[20px] border border-[#eeeaf1] bg-white p-3 shadow-sm">
        <p className="text-[9px] font-black text-slate-800">Plan settings</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            ["Sales goal", "$2,000"],
            ["Profit goal", "$1,000"],
            ["Fixed costs", "$220"],
            ["Tax reserve", "25%"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-2.5">
              <p className="text-[7px] text-slate-400">{label}</p>
              <p className="mt-1 text-[9px] font-black text-slate-800">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewCalendar() {
  return (
    <div>
      <PreviewSectionHeader title="Calendar" subtitle="Dates & schedule" action={<span className="rounded-xl bg-[#6e3769] px-3 py-2 text-[8px] font-bold text-white">+ Event</span>} />
      <div className="rounded-[20px] border border-[#eeeaf1] bg-white p-3 shadow-sm">
        <div className="grid grid-cols-7 gap-1 text-center text-[7px] font-bold text-slate-400">
          {["S","M","T","W","T","F","S"].map((d,i)=><span key={d+i}>{d}</span>)}
          {Array.from({length:35},(_,i)=>i<2 ? "" : i-1).map((day,i)=>(
            <span key={i} className={`grid h-7 place-items-center rounded-lg ${day===24 ? "bg-[#6e3769] text-white" : "text-slate-600"}`}>{day}</span>
          ))}
        </div>
      </div>
      <div className="mt-3 rounded-[20px] border border-[#eeeaf1] bg-white px-3 shadow-sm">
        {[
          ["10:00 AM", "Ship marketplace orders"],
          ["1:30 PM", "Pick up art supplies"],
          ["4:00 PM", "Update inventory"],
        ].map(([time,event])=>(
          <div key={event} className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-b-0">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-purple-100 text-purple-600"><CalendarDays className="h-4 w-4" /></div>
            <div><p className="text-[8px] font-bold text-slate-800">{event}</p><p className="mt-1 text-[7px] text-slate-400">{time}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewStoreOrders() {
  return (
    <div>
      <PreviewSectionHeader title="Store Orders" subtitle="Orders placed through your storefront" />
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[
          ["Pending","3","bg-amber-50"],
          ["Processing","5","bg-purple-50"],
          ["Completed","28","bg-emerald-50"],
        ].map(([label,value,tone])=>(
          <div key={label} className={`rounded-[18px] border border-[#eeeaf1] p-3 shadow-sm ${tone}`}>
            <p className="text-[7px] font-bold text-slate-500">{label}</p>
            <p className="mt-1 text-[14px] font-black text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-[20px] border border-[#eeeaf1] bg-white px-3 shadow-sm">
        {[
          ["#1048", "Framed Floral Print", "$24.00", "Pending"],
          ["#1047", "2 Art Prints", "$36.00", "Processing"],
          ["#1046", "Digital Download", "$8.00", "Completed"],
        ].map(([id,item,amount,status])=>(
          <div key={id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-slate-100 py-3 last:border-b-0">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-pink-100 text-pink-600"><ShoppingCart className="h-4 w-4" /></div>
            <div className="min-w-0"><p className="truncate text-[8px] font-bold text-slate-800">{item}</p><p className="mt-1 text-[7px] text-slate-400">{id} · {status}</p></div>
            <p className="text-[8px] font-black text-slate-800">{amount}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewMoreHub({ onSelect }) {
  const options = [
    ["Reports", "Performance & profit", BarChart3],
    ["Mileage", "Business drives", Car],
    ["Products", "Available & sold products", Palette],
    ["Taxes", "Tax reserve overview", Calculator],
    ["Business Plan", "Goals & cash flow", Target],
    ["Calendar", "Dates & schedule", CalendarDays],
    ["Store Orders", "Storefront purchases", Store],
    ["Account", "Profile & settings", UserRound],
  ];
  return (
    <div>
      <PreviewSectionHeader title="More" subtitle="Explore the rest of Art Flow Creative" />
      <div className="grid grid-cols-2 gap-2">
        {options.map(([label, sub, Icon]) => (
          <button key={label} type="button" onClick={() => onSelect(label)} className="rounded-[18px] border border-[#eeeaf1] bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 active:scale-[.98]">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-purple-100 text-purple-600"><Icon className="h-4 w-4" /></div>
            <p className="mt-2 text-[9px] font-black text-slate-800">{label}</p>
            <p className="mt-1 text-[7px] leading-4 text-slate-400">{sub}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewMoreMenu({ onSelect, onClose, compact = false }) {
  const options = [
    ["Reports", BarChart3],
    ["Mileage", Car],
    ["Products", Palette],
    ["Taxes", Calculator],
    ["Business Plan", Target],
    ["Calendar", CalendarDays],
    ["Store Orders", Store],
    ["Account", UserRound],
  ];
  return (
    <div className={`absolute z-30 rounded-[20px] border border-[#2a2230] bg-[#171219]/95 p-2.5 text-white shadow-2xl backdrop-blur ${compact ? "bottom-16 right-0 max-h-[250px] w-[185px] overflow-y-auto" : "bottom-16 right-0 max-h-[290px] w-[220px] overflow-y-auto"}`}>
      <div className="grid grid-cols-2 gap-2">
        {options.map(([label, Icon]) => (
          <button
            type="button"
            key={label}
            onClick={() => { onSelect(label); onClose(); }}
            className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/7 px-2 py-3 text-[8px] font-bold text-white/85 transition hover:bg-white/12 active:scale-95"
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewDashboardHome({ onTabChange }) {
  return (
    <>
      <PreviewHero onTabChange={onTabChange} />
      <div className="mt-3 grid grid-cols-[1.45fr_.8fr] gap-3">
        <div className="rounded-[20px] border border-[#eeeaf1] bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-bold">Sales Overview</p>
              <p className="mt-0.5 text-[7px] text-slate-400">Revenue over the last several months</p>
            </div>
            <span className="text-[7px] font-semibold text-purple-600">● Sales</span>
          </div>
          <PreviewLineChart />
        </div>
        <div className="rounded-[20px] border border-[#eeeaf1] bg-white p-3 shadow-sm">
          <p className="text-[9px] font-bold">Market Performance</p>
          <p className="mb-3 mt-0.5 text-[7px] text-slate-400">Sales across all marketplaces</p>
          <PreviewMarketPerformance />
        </div>
      </div>
      <div className="mt-3 rounded-[20px] border border-[#eeeaf1] bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-bold">Recent Orders</p>
            <p className="mt-0.5 text-[7px] text-slate-400">Latest sales across your connected shops</p>
          </div>
          <button type="button" onClick={() => onTabChange("Orders")} className="text-[7px] font-bold text-purple-600">View all ↗</button>
        </div>
        <div className="mt-2">
          <PreviewOrder image="bundle" title="Bundle Order" platform="Depop" amount="$42.00" />
          <PreviewOrder image={2} title="Framed Art Print" platform="Poshmark" amount="$28.00" />
        </div>
      </div>
    </>
  );
}

function PreviewTabContent({ activeTab, onTabChange, compact = false }) {
  if (activeTab === "Orders") return <PreviewOrders />;
  if (activeTab === "Inventory") return <PreviewInventory />;
  if (activeTab === "Expenses") return <PreviewExpenses />;
  if (activeTab === "Reports") return <PreviewReports />;
  if (activeTab === "Mileage") return <PreviewMileage />;
  if (activeTab === "Products") return <PreviewProducts />;
  if (activeTab === "Account") return <PreviewAccount />;
  if (activeTab === "Taxes") return <PreviewTaxes />;
  if (activeTab === "Business Plan") return <PreviewBusinessPlan />;
  if (activeTab === "Calendar") return <PreviewCalendar />;
  if (activeTab === "Store Orders") return <PreviewStoreOrders />;
  if (activeTab === "More") return <PreviewMoreHub onSelect={onTabChange} />;
  if (compact) {
    return (
      <>
        <PreviewHero compact onTabChange={onTabChange} />
        <div className="mt-3 rounded-[20px] border border-[#eeeaf1] bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold">Sales Overview</p>
              <p className="mt-0.5 text-[7px] text-slate-400">Revenue over the last several months</p>
            </div>
            <span className="text-[7px] font-semibold text-purple-600">● Sales</span>
          </div>
          <PreviewLineChart />
        </div>
        <div className="mt-3 rounded-[20px] border border-[#eeeaf1] bg-white p-3 shadow-sm">
          <p className="text-[10px] font-bold">Market Performance</p>
          <p className="mb-3 mt-0.5 text-[7px] text-slate-400">Sales across all marketplaces</p>
          <PreviewMarketPerformance compact />
        </div>
        <div className="mt-3 rounded-[20px] border border-[#eeeaf1] bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold">Recent Orders</p>
            <button type="button" onClick={() => onTabChange("Orders")} className="text-[7px] font-bold text-purple-600">View all ↗</button>
          </div>
          <div className="mt-2">
            <PreviewOrder image="bundle" title="Bundle Order" platform="Depop" amount="$42.00" />
            <PreviewOrder image={2} title="Framed Art Print" platform="Poshmark" amount="$28.00" />
          </div>
        </div>
      </>
    );
  }
  return <PreviewDashboardHome onTabChange={onTabChange} />;
}

function PreviewBottomTabs({ activeTab, onTabChange, compact = false }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = [
    ["Dashboard", Home],
    ["Orders", ShoppingBag],
    ["Inventory", Package],
    ["Expenses", Receipt],
  ];
  const moreActive = ["Reports", "Mileage", "Products", "Taxes", "Business Plan", "Calendar", "Store Orders", "Account", "More"].includes(activeTab);

  return (
    <div className={`relative mt-3 rounded-[20px] border border-[#19191b] bg-[#050506] px-2 py-2 text-white shadow-[0_12px_28px_rgba(8,7,10,.18)] ${compact ? "" : "mx-auto max-w-[430px]"}`}>
      {moreOpen && <PreviewMoreMenu onSelect={onTabChange} onClose={() => setMoreOpen(false)} compact={compact} />}
      <div className="flex items-center justify-between">
        {tabs.map(([key, Icon]) => {
          const active = activeTab === key;
          return (
            <button
              type="button"
              key={key}
              onClick={() => { setMoreOpen(false); onTabChange(key); }}
              aria-pressed={active}
              className="flex flex-1 flex-col items-center gap-0.5"
            >
              <span className={`grid h-8 w-9 place-items-center rounded-full transition ${active ? "bg-white text-black" : "text-[#8d8990]"}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className={`text-[7px] font-semibold transition ${active ? "text-white" : "text-[#9b97a0]"}`}>
                {key === "Dashboard" ? "Home" : key}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          className="flex flex-1 flex-col items-center gap-0.5"
        >
          <span className={`grid h-8 w-9 place-items-center rounded-full transition ${moreActive || moreOpen ? "bg-white text-black" : "text-[#8d8990]"}`}>
            <MoreHorizontal className="h-4 w-4" />
          </span>
          <span className={`text-[7px] font-semibold transition ${moreActive || moreOpen ? "text-white" : "text-[#9b97a0]"}`}>More</span>
        </button>
      </div>
    </div>
  );
}

function DesktopDashboard({ activeTab, onTabChange }) {
  const sideItems = [
    ["Dashboard", "Dashboard"],
    ["Orders", "Orders"],
    ["Expenses", "Expenses"],
    ["Inventory", "Inventory"],
    ["Reports", "Reports"],
    ["Mileage", "Mileage"],
    ["Products", "Products"],
    ["Business Plan", "Business Plan"],
    ["Taxes", "Taxes"],
    ["Calendar", "Calendar"],
    ["Store Orders", "Store Orders"],
    ["Account", "Account"],
  ];

  return (
    <div className="overflow-hidden rounded-[18px] bg-[#f5f3f7] text-slate-900">
      <div className="grid min-h-[430px] grid-cols-[120px_1fr]">
        <aside className="m-2 flex flex-col rounded-[20px] border border-white/70 bg-white/70 p-3 shadow-sm backdrop-blur">
          <div className="mb-4 flex items-center gap-2 px-1">
            <img src="/artflow-icon.svg" alt="" className="h-7 w-7" />
            <div>
              <p className="text-[9px] font-black text-[#5c2b76]">ART FLOW</p>
              <p className="text-[6px] font-bold tracking-[0.22em] text-slate-400">CREATIVE</p>
            </div>
          </div>
          <div className="space-y-1">
            {sideItems.map(([label, key]) => {
              const active = key === activeTab;
              return key ? (
                <button
                  type="button"
                  key={label}
                  onClick={() => onTabChange(key)}
                  aria-pressed={active}
                  className={`w-full rounded-xl px-2.5 py-1.5 text-left text-[6.5px] font-semibold transition ${active ? "bg-[#6e3769] text-white shadow-sm" : "text-slate-500 hover:bg-purple-50"}`}
                >
                  {label}
                </button>
              ) : (
                <div key={label} className="rounded-xl px-2.5 py-2 text-[7px] font-semibold text-slate-300">{label}</div>
              );
            })}
          </div>
        </aside>

        <section className="p-3">
          <div className="mb-3 flex items-center justify-end gap-2">
            <div className="flex gap-2">
              <div className="h-8 w-[180px] rounded-full border border-slate-200 bg-white px-3 text-[7px] leading-8 text-slate-400">Search orders by product or order ID...</div>
              <div className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-white text-[#6e3769]">•</div>
            </div>
          </div>
          <PreviewTabContent activeTab={activeTab} onTabChange={onTabChange} />
          <PreviewBottomTabs activeTab={activeTab} onTabChange={onTabChange} />
        </section>
      </div>
    </div>
  );
}

function MobileDashboard({ activeTab, onTabChange }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = [
    ["Home", "Dashboard", Home],
    ["Orders", "Orders", ShoppingBag],
    ["Inventory", "Inventory", Package],
    ["Expenses", "Expenses", Receipt],
  ];
  const moreActive = ["Reports", "Mileage", "Products", "Taxes", "Business Plan", "Calendar", "Store Orders", "Account", "More"].includes(activeTab);

  return (
    <div className="mx-auto w-full max-w-[330px] rounded-[34px] bg-[#201821] p-[8px] shadow-[0_30px_70px_rgba(15,7,20,.48)]">
      <div className="relative min-h-[600px] overflow-hidden rounded-[27px] bg-[#f5f3f7] px-3 pb-20 pt-3 text-slate-900">
        <PreviewTabContent activeTab={activeTab} onTabChange={onTabChange} compact />

        <div className="absolute inset-x-3 bottom-3">
          <div className="relative flex items-center justify-between rounded-[22px] border border-[#19191b] bg-[#050506] px-2 py-2 text-white shadow-[0_16px_38px_rgba(8,7,10,.25)]">
            {moreOpen && <PreviewMoreMenu onSelect={onTabChange} onClose={() => setMoreOpen(false)} compact />}
            {tabs.map(([label, key, Icon]) => {
              const active = activeTab === key;
              return (
                <button
                  type="button"
                  key={label}
                  onClick={() => { setMoreOpen(false); onTabChange(key); }}
                  aria-pressed={active}
                  className="flex flex-1 flex-col items-center gap-0.5"
                >
                  <span className={`grid h-8 w-9 place-items-center rounded-full ${active ? "bg-white text-black" : "text-[#8d8990]"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className={`text-[7px] font-semibold ${active ? "text-white" : "text-[#9b97a0]"}`}>{label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              aria-expanded={moreOpen}
              className="flex flex-1 flex-col items-center gap-0.5"
            >
              <span className={`grid h-8 w-9 place-items-center rounded-full ${moreActive || moreOpen ? "bg-white text-black" : "text-[#8d8990]"}`}>
                <MoreHorizontal className="h-4 w-4" />
              </span>
              <span className={`text-[7px] font-semibold ${moreActive || moreOpen ? "text-white" : "text-[#9b97a0]"}`}>More</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DevicePreview() {
  const [activeTab, setActiveTab] = useState("Dashboard");

  return (
    <>
      <div className="mb-3 flex justify-center gap-1.5 sm:hidden">
        {["Dashboard", "Orders", "Inventory", "Expenses", "Reports"].map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-2.5 py-1.5 text-[9px] font-bold transition ${activeTab === tab ? "bg-white text-[#4a236f]" : "bg-white/10 text-white/65"}`}
          >
            {tab === "Dashboard" ? "Home" : tab}
          </button>
        ))}
      </div>

      <div className="sm:hidden">
        <MobileDashboard activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      <div className="relative mx-auto hidden w-full max-w-[760px] pb-20 pt-2 sm:block lg:pb-10">
        <div className="relative ml-auto w-[93%]">
          <div className="rounded-[24px] bg-[#2a2030] p-[10px] shadow-[0_38px_80px_rgba(19,9,26,.40)]">
            <DesktopDashboard activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
          <div className="mx-auto h-3 w-[78%] rounded-b-[90%] bg-[#3a303f]" />
          <div className="mx-auto h-2 w-[62%] rounded-b-full bg-[#281f2d]/90" />
        </div>

        <div className="absolute bottom-0 left-0 w-[31%] min-w-[145px] max-w-[205px]">
          <MobileDashboard activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      </div>
    </>
  );
}

export default function AboutArtFlow() {
  useEffect(() => {
    document.title = "Art Flow Creative | Business Management for Artists";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "Art Flow Creative brings your orders, inventory, expenses, mileage, taxes, and reports together in one simple workspace built for independent artists and online sellers."
      );
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#1b1122] text-white">
      <section className="relative overflow-hidden bg-[#4b2470]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_45%,rgba(160,99,202,.24),transparent_36%),linear-gradient(180deg,#4b2470_0%,#4a236f_72%,#1b1122_100%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-8 lg:px-10">
          <nav className="flex items-center justify-between py-5 sm:py-7">
            <Link to="/" className="flex items-center gap-3">
              <img src="/artflow-icon.svg" alt="Art Flow Creative" className="h-10 w-10 rounded-xl shadow-lg shadow-black/10 sm:h-12 sm:w-12 sm:rounded-2xl" />
              <div className="leading-none">
                <p className="[font-family:'Fraunces',serif] text-[18px] font-medium tracking-[0.12em] text-white sm:text-[24px]">ART FLOW</p>
                <p className="mt-1 text-[8px] font-medium tracking-[0.38em] text-white/80 sm:text-[10px]">CREATIVE</p>
              </div>
            </Link>

            <div className="hidden items-center gap-8 text-sm font-bold text-white/85 md:flex">
              <a href="#features" className="transition hover:text-white">Features</a>
              <a href="#how-it-works" className="transition hover:text-white">How It Works</a>
              <a href="#pricing" className="transition hover:text-white">Pricing</a>
            </div>

            <Link to="/login" className="rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-[#3e1f5b] shadow-lg shadow-black/10 transition hover:-translate-y-0.5 sm:px-5 sm:py-3 sm:text-sm">
              Sign In
            </Link>
          </nav>

          <div className="grid items-center gap-8 pb-12 pt-7 sm:gap-10 sm:pb-14 sm:pt-10 lg:grid-cols-[0.78fr_1.22fr] lg:pb-24 lg:pt-20">
            <div className="mx-auto max-w-xl pb-0 text-center sm:text-left lg:pb-16">
              <h1 className="[font-family:'Fraunces',serif] text-[40px] font-semibold leading-[0.98] tracking-[-0.035em] text-white sm:text-[58px] lg:text-[72px]">
                The business side of art, simplified.
              </h1>

              <p className="mx-auto mt-5 max-w-lg text-[15px] leading-7 text-white/72 sm:mx-0 sm:mt-7 sm:text-lg sm:leading-8">
                Art Flow Creative brings your orders, inventory, expenses, mileage, taxes, and reports together in one simple workspace — so you can spend less time on admin and more time creating.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:mt-9 sm:flex-row">
                <Link to="/register" className="inline-flex min-h-14 items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-black text-[#4a236f] shadow-xl shadow-black/15 transition hover:-translate-y-0.5">
                  Start your 7-day free trial
                </Link>
                <Link to="/login" className="inline-flex min-h-14 items-center justify-center rounded-xl border border-white/26 bg-white/8 px-7 py-3 text-sm font-black text-white backdrop-blur transition hover:bg-white/14">
                  Sign in
                </Link>
              </div>

              <p className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-white/50 sm:mt-5 sm:justify-start">
                <span className="grid h-4 w-4 place-items-center rounded-full border border-white/25 text-[9px] text-white/70">✓</span>
                No credit card required
              </p>
            </div>

            <div className="relative">
              <div className="mb-3 flex justify-center lg:justify-end">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/70 backdrop-blur">
                  Interactive demo — sample data
                </span>
              </div>
              <DevicePreview />
            </div>
          </div>
        </div>
      </section>

      <section className="relative -mt-2 border-t border-white/5 bg-[#1b1122] px-5 pb-14 pt-10 sm:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b995d0]">Supported marketplaces</p>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/55">Track orders and sales from the marketplaces Art Flow Creative supports.</p>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {["Poshmark", "Vinted", "Depop", "Etsy", "eBay"].map((name) => {
              const brand = MARKETPLACE_STYLES[name];
              return (
                <div
                  key={name}
                  className="group relative flex min-h-[112px] flex-col items-center justify-center overflow-hidden rounded-2xl border px-4 py-4 backdrop-blur transition hover:-translate-y-0.5"
                  style={{
                    borderColor: `${brand.color}80`,
                    background: `linear-gradient(145deg, ${brand.soft} 0%, rgba(255,255,255,.055) 82%)`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,.08), 0 12px 30px rgba(0,0,0,.10)`,
                  }}
                >
                  <div
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ backgroundColor: brand.color }}
                    aria-hidden="true"
                  />
                  <MarketplaceMark name={name} />
                  <span className="mt-3 text-[12px] font-extrabold tracking-wide text-white">
                    {name}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mx-auto mt-8 h-px max-w-4xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
      </section>

      <section id="features" className="bg-[#21152a] px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b995d0]">Features</p>
            <h2 className="mt-4 [font-family:'Fraunces',serif] text-4xl font-semibold text-white">Your creative business, in one place.</h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Orders & Sales", "Track marketplace orders and sales without mixing them with your listings."],
              ["Inventory", "Store product photos, availability, sold history, and the details you need to relist quickly."],
              ["Expenses", "Keep business purchases and receipts organized alongside your sales."],
              ["Mileage & Taxes", "Keep mileage and tax-ready records together throughout the year."],
              ["Reports", "See your numbers clearly with simple performance and profit reporting."],
              ["Business Planning", "Keep goals, planning, and the practical side of your art business organized."],
            ].map(([title, text]) => (
              <article key={title} className="rounded-3xl border border-white/7 bg-white/[0.045] p-6">
                <div className="mb-5 h-1.5 w-10 rounded-full bg-[#9b6fba]" />
                <h3 className="text-base font-black text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-[#1b1122] px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b995d0]">How it works</p>
          <h2 className="mt-4 [font-family:'Fraunces',serif] text-4xl font-semibold">Start simple. Add what you need.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-white/55">
            Create your account, connect the services you choose, and keep your orders, products, expenses, and reports together in your private Art Flow workspace.
          </p>
        </div>
      </section>

      <section id="pricing" className="bg-[#4a236f] px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-white/12 bg-white/[0.07] p-8 text-center shadow-2xl shadow-black/10 backdrop-blur sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-white/60">Pricing</p>
          <h2 className="mt-4 [font-family:'Fraunces',serif] text-4xl font-semibold">Try Art Flow Creative free for 7 days.</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/65">No credit card required to start. Create your account and explore the workspace before choosing a plan.</p>
          <Link to="/register" className="mt-8 inline-flex min-h-14 items-center justify-center rounded-xl bg-white px-7 py-3 text-sm font-black text-[#4a236f]">
            Start your 7-day free trial
          </Link>
        </div>
      </section>

      <section className="bg-[#17101c] px-5 py-14 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl border border-white/6 bg-white/[0.035] p-7">
          <h2 className="text-lg font-black">Google connections are optional</h2>
          <p className="mt-3 text-sm leading-7 text-white/50">
            Art Flow Creative uses its own account system. When a user chooses to connect Google, Gmail read-only access can be used to identify supported marketplace sale confirmations and business receipt emails for import into that user’s private workspace. Art Flow Creative does not send, modify, or delete Gmail messages, and Google user data is not sold or used for advertising.
          </p>
          <div className="mt-6 flex flex-wrap gap-4 text-xs font-bold text-[#c7a4dc]">
            <Link to="/privacy-policy">Privacy Policy</Link>
            <Link to="/terms-of-service">Terms of Service</Link>
            <Link to="/support">Support</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 bg-[#17101c] px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <span>© Art Flow Creative</span>
          <span>Business management for independent artists and online sellers.</span>
        </div>
      </footer>
    </main>
  );
}
