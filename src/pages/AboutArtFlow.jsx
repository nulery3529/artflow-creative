import React, { useEffect } from "react";
import { Link } from "react-router-dom";

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

function DesktopDashboard() {
  return (
    <div className="overflow-hidden rounded-[18px] bg-[#f7f4f9]">
      <div className="grid min-h-[370px] grid-cols-[92px_1fr]">
        <aside className="bg-[#4a236f] px-3 py-4 text-white">
          <div className="mb-5 flex items-center gap-2">
            <img src="/artflow-icon.svg" alt="" className="h-7 w-7 rounded-lg bg-white p-1" />
            <span className="text-[7px] font-extrabold leading-tight">Art Flow<br />Creative</span>
          </div>
          {["Dashboard", "Orders", "Inventory", "Expenses", "Reports", "Account"].map((item, i) => (
            <div key={item} className={`mb-1 rounded-lg px-2 py-2 text-[7px] font-bold ${i === 0 ? "bg-white/15 text-white" : "text-white/65"}`}>
              {item}
            </div>
          ))}
        </aside>

        <section className="p-4">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h3 className="text-[17px] font-black text-[#25142f]">Good morning!</h3>
              <p className="mt-0.5 text-[8px] text-slate-500">Here’s your business at a glance.</p>
            </div>
            <div className="rounded-full bg-white px-2 py-1 text-[7px] font-bold text-[#5b337c] shadow-sm">Syncing ✓</div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <Metric label="Sales" value="$1,284" />
            <Metric label="Orders" value="48" />
            <Metric label="Expenses" value="$316" accent="text-[#a15068]" />
            <Metric label="Profit" value="$968" accent="text-[#2f7a63]" />
          </div>

          <div className="mt-3 grid grid-cols-[1.1fr_.9fr] gap-3">
            <div className="rounded-2xl bg-[#2c1937] p-3 text-white shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[9px] font-extrabold">Marketplace Performance</p>
                <span className="text-[7px] text-white/60">This month</span>
              </div>
              {[
                ["Poshmark", "82%"],
                ["Vinted", "64%"],
                ["Depop", "49%"],
                ["eBay", "31%"],
              ].map(([name, width]) => (
                <div key={name} className="mb-2">
                  <div className="mb-1 flex justify-between text-[7px] text-white/80">
                    <span>{name}</span><span>{width}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/12">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#a884ce] to-[#d6b8e7]" style={{ width }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[9px] font-extrabold text-[#25142f]">Recent Orders</p>
                <span className="text-[7px] font-bold text-[#76499a]">View all</span>
              </div>
              <div className="space-y-2">
                <OrderRow variant={1} title="Bundle Order" platform="Depop" amount="$42" />
                <OrderRow variant={2} title="Framed Art Print" platform="Poshmark" amount="$28" />
                <OrderRow variant={3} title="Botanical Print" platform="Vinted" amount="$19" />
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-[9px] font-extrabold text-[#25142f]">Profit Overview</p>
              <div className="mt-2 flex h-12 items-end gap-1.5">
                {[42, 64, 48, 78, 56, 86, 70].map((h, i) => (
                  <span key={i} className="flex-1 rounded-t bg-[#7b4da0]/75" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-[9px] font-extrabold text-[#25142f]">Recent Expenses</p>
              <div className="mt-2 space-y-2">
                <div className="flex justify-between text-[8px]"><span className="text-slate-500">Shipping supplies</span><b>$24.80</b></div>
                <div className="flex justify-between text-[8px]"><span className="text-slate-500">Printing</span><b>$18.25</b></div>
                <div className="flex justify-between text-[8px]"><span className="text-slate-500">Packaging</span><b>$12.40</b></div>
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
    <div className="mx-auto w-full max-w-[330px] rounded-[36px] bg-[#211725] p-[9px] shadow-[0_28px_60px_rgba(16,7,21,.45)]">
      <div className="overflow-hidden rounded-[28px] bg-[#f7f4f9]">
        <div className="flex items-center justify-between bg-[#4a236f] px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <img src="/artflow-icon.svg" alt="" className="h-7 w-7 rounded-lg bg-white p-1" />
            <span className="text-[10px] font-black">Art Flow Creative</span>
          </div>
          <span className="text-[12px]">•••</span>
        </div>

        <div className="p-4">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h4 className="text-[18px] font-black text-[#25142f]">Dashboard</h4>
              <p className="mt-1 text-[9px] text-slate-500">Your business at a glance</p>
            </div>
            <span className="rounded-full bg-[#efe7f5] px-2 py-1 text-[8px] font-bold text-[#6a3b8d]">Synced ✓</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric label="Sales" value="$1,284" />
            <Metric label="Orders" value="48" />
            <Metric label="Expenses" value="$316" accent="text-[#a15068]" />
            <Metric label="Profit" value="$968" accent="text-[#2f7a63]" />
          </div>

          <div className="mt-4 rounded-2xl bg-[#2d1938] p-3 text-white">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-extrabold">Marketplace Performance</p>
              <span className="text-[8px] text-white/55">This month</span>
            </div>
            <div className="mt-3 space-y-2">
              {[
                ["Poshmark", "82%"],
                ["Vinted", "64%"],
                ["Depop", "49%"],
                ["eBay", "31%"],
              ].map(([name, width]) => (
                <div key={name}>
                  <div className="mb-1 flex justify-between text-[8px] text-white/75">
                    <span>{name}</span><span>{width}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/12">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#a884ce] to-[#d6b8e7]" style={{ width }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-extrabold text-[#25142f]">Recent Orders</p>
              <span className="text-[8px] font-bold text-[#76499a]">View all</span>
            </div>
            <div className="space-y-2">
              <OrderRow variant={1} title="Bundle Order" platform="Depop" amount="$42" />
              <OrderRow variant={2} title="Framed Art Print" platform="Poshmark" amount="$28" />
              <OrderRow variant={3} title="Botanical Print" platform="Vinted" amount="$19" />
            </div>
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

      <div className="relative mx-auto hidden w-full max-w-[720px] pb-20 pt-2 sm:block lg:pb-10">
        <div className="relative ml-auto w-[92%]">
          <div className="rounded-[24px] bg-[#2a2030] p-[10px] shadow-[0_38px_80px_rgba(19,9,26,.40)]">
            <DesktopDashboard />
          </div>
          <div className="mx-auto h-3 w-[78%] rounded-b-[90%] bg-[#3a303f]" />
          <div className="mx-auto h-2 w-[62%] rounded-b-full bg-[#281f2d]/90" />
        </div>

        <div className="absolute bottom-0 left-0 w-[33%] min-w-[138px] max-w-[205px] rounded-[32px] bg-[#211725] p-[8px] shadow-[0_28px_60px_rgba(16,7,21,.45)]">
          <div className="overflow-hidden rounded-[25px] bg-[#f7f4f9]">
            <div className="flex items-center justify-between bg-[#4a236f] px-3 py-2 text-white">
              <div className="flex items-center gap-1.5">
                <img src="/artflow-icon.svg" alt="" className="h-5 w-5 rounded-md bg-white p-0.5" />
                <span className="text-[7px] font-black">Art Flow</span>
              </div>
              <span className="text-[8px]">•••</span>
            </div>
            <div className="p-3">
              <h4 className="text-[12px] font-black text-[#25142f]">Dashboard</h4>
              <p className="text-[7px] text-slate-500">Your business at a glance</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Metric label="Sales" value="$1,284" />
                <Metric label="Orders" value="48" />
              </div>
              <div className="mt-3 rounded-2xl bg-[#2d1938] p-2.5 text-white">
                <p className="text-[8px] font-extrabold">Performance</p>
                <div className="mt-2 space-y-1.5">
                  <div className="h-1.5 rounded-full bg-[#a781c7]" />
                  <div className="h-1.5 w-4/5 rounded-full bg-[#8e66ad]" />
                  <div className="h-1.5 w-3/5 rounded-full bg-[#76518f]" />
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <OrderRow variant={4} title="Bundle" platform="Depop" amount="$42" />
                <OrderRow variant={2} title="Art Print" platform="Vinted" amount="$19" />
              </div>
            </div>
          </div>
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
          <p className="text-sm font-semibold text-white/45">Everything you need to run your creative business.</p>
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
