import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, Receipt, Package, MoreHorizontal, RefreshCw, Home } from "lucide-react";

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

function PreviewHero({ compact = false }) {
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
            ["Orders", ShoppingBag, false],
            ["Expenses", Receipt, false],
            ["Inventory", Package, false],
            ["More", MoreHorizontal, true],
          ].map(([label, Icon, accent]) => (
            <div key={label} className="flex min-w-0 flex-col items-center gap-1.5">
              <span className={`grid rounded-full shadow-md ${compact ? "h-10 w-10" : "h-11 w-11"} place-items-center ${accent ? "bg-gradient-to-br from-[#c53bff] to-[#e948c5] text-white" : "bg-white text-[#111]"}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-[8px] font-semibold text-white/72">{label}</span>
            </div>
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
    ["Poshmark", "$1,420", "100%", "bg-purple-500"],
    ["Vinted", "$1,080", "76%", "bg-pink-400"],
    ["Depop", "$822", "58%", "bg-cyan-400"],
    ["Etsy", "$640", "45%", "bg-fuchsia-400"],
    ["eBay", "$520", "37%", "bg-amber-400"],
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
            <div className={`h-full rounded-full ${color}`} style={{ width }} />
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

function DesktopDashboard() {
  const sideItems = ["Dashboard", "Orders", "Expenses", "Inventory", "Reports", "Business Plan", "Taxes", "Mileage"];
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
            {sideItems.map((item, i) => (
              <div key={item} className={`rounded-xl px-2.5 py-2 text-[7px] font-semibold ${i === 0 ? "bg-[#6e3769] text-white shadow-sm" : "text-slate-500"}`}>
                {item}
              </div>
            ))}
          </div>
        </aside>

        <section className="p-3">
          <div className="mb-3 flex justify-end gap-2">
            <div className="h-8 w-[180px] rounded-full border border-slate-200 bg-white px-3 text-[7px] leading-8 text-slate-400">Search orders by product or order ID...</div>
            <div className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-white text-[#6e3769]">•</div>
          </div>

          <PreviewHero />

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

          <div className="mt-3 grid grid-cols-[1.45fr_.8fr] gap-3">
            <div className="rounded-[20px] border border-[#eeeaf1] bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-bold">Recent Orders</p>
                  <p className="mt-0.5 text-[7px] text-slate-400">Latest sales across your connected shops</p>
                </div>
                <span className="text-[7px] font-bold text-purple-600">View all ↗</span>
              </div>
              <div className="mt-2">
                <PreviewOrder image="bundle" title="Bundle Order" platform="Depop" amount="$42.00" />
                <PreviewOrder image={2} title="Framed Art Print" platform="Poshmark" amount="$28.00" />
              </div>
            </div>

            <div className="rounded-[20px] border border-[#eeeaf1] bg-white p-3 shadow-sm">
              <p className="text-[9px] font-bold">Expenses Overview</p>
              <p className="mt-0.5 text-[7px] text-slate-400">Deductible business spending</p>
              <div className="mt-3 grid place-items-center">
                <div className="grid h-20 w-20 place-items-center rounded-full bg-[conic-gradient(#a78bfa_0_35%,#f472b6_35%_60%,#67e8f9_60%_82%,#fbbf24_82%_100%)]">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-white text-center">
                    <span className="text-[6px] text-slate-400">Total</span>
                    <strong className="text-[8px]">$316</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MobileDashboard() {
  return (
    <div className="mx-auto w-full max-w-[330px] rounded-[34px] bg-[#201821] p-[8px] shadow-[0_30px_70px_rgba(15,7,20,.48)]">
      <div className="relative min-h-[600px] overflow-hidden rounded-[27px] bg-[#f5f3f7] px-3 pb-20 pt-3 text-slate-900">
        <PreviewHero compact />

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
            <div>
              <p className="text-[10px] font-bold">Recent Orders</p>
              <p className="mt-0.5 text-[7px] text-slate-400">Latest sales across your connected shops</p>
            </div>
            <span className="text-[7px] font-bold text-purple-600">View all ↗</span>
          </div>
          <div className="mt-2">
            <PreviewOrder image="bundle" title="Bundle Order" platform="Depop" amount="$42.00" />
            <PreviewOrder image={2} title="Framed Art Print" platform="Poshmark" amount="$28.00" />
          </div>
        </div>

        <div className="absolute inset-x-3 bottom-3">
          <div className="flex items-center justify-between rounded-[22px] border border-[#19191b] bg-[#050506] px-2 py-2 text-white shadow-[0_16px_38px_rgba(8,7,10,.25)]">
            {[
              ["Home", Home, true],
              ["Orders", ShoppingBag, false],
              ["Inventory", Package, false],
              ["Expenses", Receipt, false],
              ["More", MoreHorizontal, false],
            ].map(([label, Icon, active]) => (
              <div key={label} className="flex flex-1 flex-col items-center gap-0.5">
                <span className={`grid h-8 w-9 place-items-center rounded-full ${active ? "bg-white text-black" : "text-[#8d8990]"}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className={`text-[7px] font-semibold ${active ? "text-white" : "text-[#9b97a0]"}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DevicePreview() {
  return (
    <>
      <div className="sm:hidden">
        <MobileDashboard />
      </div>

      <div className="relative mx-auto hidden w-full max-w-[760px] pb-20 pt-2 sm:block lg:pb-10">
        <div className="relative ml-auto w-[93%]">
          <div className="rounded-[24px] bg-[#2a2030] p-[10px] shadow-[0_38px_80px_rgba(19,9,26,.40)]">
            <DesktopDashboard />
          </div>
          <div className="mx-auto h-3 w-[78%] rounded-b-[90%] bg-[#3a303f]" />
          <div className="mx-auto h-2 w-[62%] rounded-b-full bg-[#281f2d]/90" />
        </div>

        <div className="absolute bottom-0 left-0 w-[31%] min-w-[145px] max-w-[205px]">
          <MobileDashboard />
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
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-lg shadow-black/10 sm:h-12 sm:w-12 sm:rounded-2xl">
                <img src="/artflow-icon.svg" alt="Art Flow Creative" className="h-7 w-7 sm:h-9 sm:w-9" />
              </span>
              <div>
                <p className="text-[15px] font-black tracking-tight sm:text-[18px]">Art Flow Creative</p>
                <p className="hidden text-[9px] font-bold uppercase tracking-[0.16em] text-white/60 sm:block">Business Management for Artists</p>
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
              <DevicePreview />
            </div>
          </div>
        </div>
      </section>

      <section className="relative -mt-2 border-t border-white/5 bg-[#1b1122] px-5 pb-14 pt-10 sm:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b995d0]">Supported marketplaces</p>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/55">Track orders and sales from the marketplaces Art Flow Creative supports.</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {["Poshmark", "Vinted", "Depop", "Etsy", "eBay"].map((name) => (
              <span key={name} className="rounded-full bg-white/8 px-4 py-2 text-[11px] font-extrabold tracking-wide text-white/65 ring-1 ring-white/5">
                {name}
              </span>
            ))}
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
