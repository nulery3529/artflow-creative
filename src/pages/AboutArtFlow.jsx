import React, { useEffect } from "react";
import { Link } from "react-router-dom";

const StatCard = ({ label, value, sub }) => (
  <div className="rounded-2xl border border-white/70 bg-white/95 p-3 shadow-sm">
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
    <p className="mt-1 text-lg font-extrabold text-[#2e184f]">{value}</p>
    <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>
  </div>
);

const MarketplaceRow = ({ name, value, width }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between gap-2 text-[10px]">
      <span className="font-semibold text-slate-700">{name}</span>
      <span className="font-bold text-[#4f2d7f]">{value}</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-[#eee8f6]">
      <div className="h-full rounded-full bg-gradient-to-r from-[#6d45a1] to-[#a786cf]" style={{ width }} />
    </div>
  </div>
);

const OrderThumb = ({ label, tone }) => (
  <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[#eee8f6] bg-white p-2">
    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[9px] font-extrabold text-white ${tone}`}>
      {label === "Bundle" ? "BUNDLE" : "ART"}
    </div>
    <div className="min-w-0">
      <p className="truncate text-[10px] font-bold text-slate-800">{label}</p>
      <p className="text-[9px] text-slate-500">Recent order</p>
    </div>
  </div>
);

function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[690px] pb-8 pt-4">
      <div className="relative overflow-hidden rounded-[28px] border-[9px] border-[#2c183d] bg-[#f7f3fb] shadow-[0_28px_70px_rgba(46,24,79,0.28)]">
        <div className="flex h-7 items-center justify-between bg-[#2c183d] px-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white/25" />
            <span className="h-2 w-2 rounded-full bg-white/25" />
            <span className="h-2 w-2 rounded-full bg-white/25" />
          </div>
          <span className="text-[8px] font-semibold tracking-wide text-white/70">ART FLOW CREATIVE</span>
        </div>

        <div className="grid grid-cols-[86px_1fr] bg-[#faf8fc]">
          <aside className="hidden min-h-[335px] bg-[#3c205b] px-2 py-4 sm:block">
            <div className="mb-5 flex items-center gap-2 px-1">
              <img src="/artflow-icon.svg" alt="" className="h-6 w-6 rounded-lg bg-white/95 p-1" />
              <span className="text-[7px] font-bold leading-tight text-white">Art Flow<br />Creative</span>
            </div>
            {["Dashboard", "Orders", "Inventory", "Expenses", "Reports"].map((item, i) => (
              <div key={item} className={`mb-1.5 rounded-lg px-2 py-2 text-[8px] font-semibold ${i === 0 ? "bg-white/16 text-white" : "text-white/68"}`}>
                {item}
              </div>
            ))}
          </aside>

          <section className="p-3 sm:p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#76559a]">Business overview</p>
                <h3 className="text-base font-extrabold text-[#2f194f] sm:text-lg">Dashboard</h3>
              </div>
              <div className="rounded-full bg-[#eadff5] px-2.5 py-1 text-[8px] font-bold text-[#4f2d7f]">Synced</div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="Sales" value="$1,284" sub="This month" />
              <StatCard label="Orders" value="48" sub="Across marketplaces" />
              <StatCard label="Expenses" value="$316" sub="Tracked" />
              <StatCard label="Profit" value="$968" sub="Before taxes" />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[1.05fr_.95fr]">
              <div className="rounded-2xl border border-white bg-white p-3 shadow-sm">
                <p className="mb-2 text-[10px] font-bold text-[#2f194f]">Marketplace performance</p>
                <div className="space-y-2.5">
                  <MarketplaceRow name="Poshmark" value="$484" width="82%" />
                  <MarketplaceRow name="Vinted" value="$356" width="65%" />
                  <MarketplaceRow name="Depop" value="$274" width="51%" />
                  <MarketplaceRow name="eBay" value="$170" width="34%" />
                </div>
              </div>

              <div className="rounded-2xl border border-white bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-[#2f194f]">Recent orders</p>
                  <span className="text-[8px] font-semibold text-[#76559a]">View all</span>
                </div>
                <div className="grid gap-2">
                  <OrderThumb label="Bundle" tone="bg-gradient-to-br from-[#6b3c97] to-[#aa8bd1]" />
                  <OrderThumb label="Framed art print" tone="bg-gradient-to-br from-[#9c6f8f] to-[#d3a8be]" />
                  <OrderThumb label="Botanical print" tone="bg-gradient-to-br from-[#5f7d72] to-[#99b1a7]" />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="mx-auto h-3 w-[78%] rounded-b-[80%] bg-gradient-to-b from-[#4a315d] to-[#251631] shadow-[0_8px_18px_rgba(46,24,79,0.22)]" />

      <div className="absolute bottom-0 right-0 w-[132px] rounded-[24px] border-[7px] border-[#2c183d] bg-[#f8f5fb] p-2 shadow-[0_18px_42px_rgba(46,24,79,0.3)] sm:right-[-12px] sm:w-[150px]">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[#2c183d]/40" />
        <div className="rounded-2xl bg-white p-2">
          <div className="mb-2 flex items-center gap-1.5">
            <img src="/artflow-icon.svg" alt="" className="h-5 w-5" />
            <span className="text-[8px] font-extrabold text-[#2f194f]">Dashboard</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-lg bg-[#f1e9f8] p-2"><p className="text-[7px] text-slate-500">Sales</p><p className="text-[10px] font-extrabold text-[#4f2d7f]">$1,284</p></div>
            <div className="rounded-lg bg-[#f1e9f8] p-2"><p className="text-[7px] text-slate-500">Orders</p><p className="text-[10px] font-extrabold text-[#4f2d7f]">48</p></div>
          </div>
          <div className="mt-2 rounded-lg bg-[#faf8fc] p-2">
            <p className="mb-1 text-[7px] font-bold text-[#2f194f]">Recent orders</p>
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-[#d9c5ea]" />
              <div className="h-2 w-4/5 rounded-full bg-[#e7dbf1]" />
              <div className="h-2 w-3/5 rounded-full bg-[#efe7f5]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AboutArtFlow() {
  useEffect(() => {
    document.title = "Art Flow Creative | Business Tools for Artists & Online Sellers";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "Art Flow Creative helps independent artists and online sellers organize orders, expenses, inventory, mileage, reports, and business records in one place."
      );
    }
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fbf9fd] text-slate-900">
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-20 bg-[linear-gradient(135deg,#fbf8fd_0%,#f0e7f8_46%,#d7c1eb_100%)]" />
        <div className="absolute -left-24 top-24 -z-10 h-72 w-72 rounded-full bg-[#c7a6df]/35 blur-3xl" />
        <div className="absolute -right-20 top-[-70px] -z-10 h-96 w-96 rounded-full bg-[#9d7abf]/25 blur-3xl" />

        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-[#7b5b97]/10">
              <img src="/artflow-icon.svg" alt="Art Flow Creative logo" className="h-8 w-8" />
            </span>
            <div>
              <p className="text-base font-black tracking-tight text-[#2e184f]">Art Flow Creative</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#76559a]">Business made simpler</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden rounded-xl px-4 py-2.5 text-sm font-bold text-[#3c205b] hover:bg-white/60 sm:inline-flex">
              Log In
            </Link>
            <Link to="/register" className="rounded-xl bg-[#3c205b] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#3c205b]/15 transition hover:bg-[#4c2a70]">
              Create Account
            </Link>
          </div>
        </nav>

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-10 sm:px-8 sm:pb-20 lg:grid-cols-[0.88fr_1.12fr] lg:px-10 lg:pb-24 lg:pt-16">
          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center rounded-full border border-[#6f4b90]/15 bg-white/70 px-3.5 py-2 text-xs font-bold text-[#5a3977] shadow-sm backdrop-blur">
              Built for independent artists & online sellers
            </div>
            <h1 className="text-4xl font-black leading-[1.04] tracking-[-0.045em] text-[#2e184f] sm:text-5xl lg:text-[58px]">
              Business tools that keep your creative work flowing.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg">
              Track orders, expenses, inventory, mileage, reports, and marketplace performance in one clean workspace—without losing focus on the art.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#3c205b] px-6 py-3 text-sm font-extrabold text-white shadow-xl shadow-[#3c205b]/20 transition hover:-translate-y-0.5 hover:bg-[#4a286c]">
                Create Your Account
              </Link>
              <Link to="/login" className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#6d4c89]/20 bg-white/75 px-6 py-3 text-sm font-extrabold text-[#3c205b] shadow-sm backdrop-blur transition hover:bg-white">
                Log In
              </Link>
            </div>

            <div className="mt-8 grid max-w-lg grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              {[
                ["Orders", "Track marketplace sales"],
                ["Expenses", "Organize business costs"],
                ["Reports", "See your numbers clearly"],
              ].map(([title, text]) => (
                <div key={title} className="rounded-2xl border border-white/80 bg-white/55 p-3.5 shadow-sm backdrop-blur">
                  <p className="font-extrabold text-[#3c205b]">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <DashboardPreview />
          </div>
        </div>
      </section>

      <section className="border-y border-[#7b5b97]/10 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#76559a]">One workspace</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-[#2e184f]">Everything you need to run the business side</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Keep the important pieces together so you can spend less time chasing records and more time creating and selling.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Orders & Sales", "Track marketplace orders and sales activity from one place."],
              ["Expenses", "Organize business purchases, receipts, and operating costs."],
              ["Inventory", "Store product details, images, availability, and sold history."],
              ["Reports & Planning", "Review performance, mileage, taxes, and business planning tools."],
            ].map(([title, text]) => (
              <article key={title} className="rounded-3xl border border-[#76559a]/10 bg-[#fbf9fd] p-5 shadow-sm">
                <div className="mb-4 h-2 w-10 rounded-full bg-gradient-to-r from-[#65408e] to-[#b99ad2]" />
                <h3 className="text-base font-extrabold text-[#3c205b]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f5eff9]">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
          <div className="rounded-[32px] border border-[#74538f]/10 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#76559a]">Privacy & connections</p>
            <h2 className="mt-3 text-2xl font-black text-[#2e184f]">Your Art Flow account stays separate from Google</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Art Flow Creative uses its own email-and-password account system. Google connections are optional and are started only by the user.
            </p>

            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="font-extrabold text-[#3c205b]">How Google connections are used</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  When authorized, Art Flow Creative uses Gmail read-only access to identify supported marketplace sale confirmations and business receipt emails so the user can import those records into a private Art Flow Creative business workspace.
                </p>
              </div>
              <div>
                <h3 className="font-extrabold text-[#3c205b]">Your Gmail stays under your control</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  Art Flow Creative does not send, modify, or delete Gmail messages. Google user data is not used for advertising or sold. Users can revoke Google access from their Google Account or disconnect the inbox from Art Flow Creative.
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/privacy-policy" className="rounded-xl border border-[#76559a]/15 px-4 py-2.5 text-sm font-bold text-[#4b2a6a] hover:bg-[#f7f2fa]">Privacy Policy</Link>
              <Link to="/terms-of-service" className="rounded-xl border border-[#76559a]/15 px-4 py-2.5 text-sm font-bold text-[#4b2a6a] hover:bg-[#f7f2fa]">Terms of Service</Link>
              <Link to="/support" className="rounded-xl border border-[#76559a]/15 px-4 py-2.5 text-sm font-bold text-[#4b2a6a] hover:bg-[#f7f2fa]">Support</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-[#2c183d] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white">
              <img src="/artflow-icon.svg" alt="" className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-extrabold">Art Flow Creative</p>
              <p className="text-xs text-white/60">Business tools for creative sellers</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-white/75">
            <Link to="/privacy-policy" className="hover:text-white">Privacy</Link>
            <Link to="/terms-of-service" className="hover:text-white">Terms</Link>
            <Link to="/support" className="hover:text-white">Support</Link>
            <Link to="/login" className="hover:text-white">Log In</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
