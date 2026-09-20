import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeDollarSign,
  LoaderCircle,
  PiggyBank,
  Save,
  Target,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import PageHeader from "@/components/PageHeader";
import { formatMoney } from "@/lib/format";
import { neonEntities } from "@/lib/neonEntityClient";
import { useEntity, useTaxRate, isApprovedExpense } from "@/lib/useBusinessData";
import { useOrders } from "@/lib/useOrders";
import { useAuth } from "@/lib/AuthContext";

const asNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const defaults = {
  monthlySalesGoal: 2000,
  monthlyProfitGoal: 1000,
  startingCash: 0,
  monthlyFixedCosts: 0,
};

function Progress({ value, max }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full bg-white/55 dark:bg-white/10 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--primary))] to-fuchsia-400 transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function GoalCard({ icon: Icon, title, value, target, detail, tone = "plum" }) {
  const toneClass = tone === "rose" ? "pastel-peach" : tone === "gold" ? "pastel-yellow" : "pastel-purple";
  return (
    <section className={`${toneClass} rounded-3xl border border-[hsl(var(--border))] p-5 space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">{title}</p>
          <p className="text-2xl font-heading mt-2">{formatMoney(value)}</p>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-white/60 dark:bg-white/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-[hsl(var(--primary))]" />
        </div>
      </div>
      <Progress value={value} max={target} />
      <div className="flex justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{detail}</span>
        <span className="font-semibold">Goal {formatMoney(target)}</span>
      </div>
    </section>
  );
}

function MoneyInput({ label, value, onChange, hint }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold">{label}</span>
      <div className="relative mt-2">
        <span className="absolute inset-y-0 left-4 flex items-center text-muted-foreground">$</span>
        <input
          type="number"
          min="0"
          step="1"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full h-12 rounded-2xl border border-[hsl(var(--border))] bg-background/65 pl-8 pr-4 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
        />
      </div>
      <span className="block text-[10px] text-muted-foreground mt-1.5">{hint}</span>
    </label>
  );
}

export default function BusinessPlan() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { records: orders = [] } = useOrders();
  const { records: allExpenses = [] } = useEntity("Expense", "-date", 10000);
  const { records: businesses = [], loading, reload } = useEntity("Business", "name", 10);
  const taxRateState = useTaxRate();
  const taxRate = asNumber(taxRateState[0]);
  const business = useMemo(() => {
    const activeId = user?.active_business_id || user?.data?.active_business_id;
    const email = String(user?.email || "").trim().toLowerCase();
    return businesses.find((item) => item.id === activeId)
      || businesses.find((item) => (item.member_emails || []).some((member) => String(member).trim().toLowerCase() === email))
      || businesses[0]
      || null;
  }, [businesses, user]);
  const [form, setForm] = useState(defaults);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const initializedBusinessId = useRef(null);

  useEffect(() => {
    if (!business || initializedBusinessId.current === business.id) return;
    setForm({ ...defaults, ...(business.business_plan || {}) });
    setDirty(false);
    initializedBusinessId.current = business.id;
  }, [business]);

  const update = (key, value) => {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: asNumber(value) }));
  };

  const metrics = useMemo(() => {
    const now = new Date();
    const monthKey = now.toISOString().slice(0, 7);
    const monthOrders = orders.filter((order) => String(order.sale_date || "").slice(0, 7) === monthKey);
    const expenses = allExpenses.filter(isApprovedExpense);
    const monthExpenses = expenses.filter((expense) => String(expense.date || expense.expense_date || "").slice(0, 7) === monthKey);
    const sales = monthOrders.reduce((sum, order) => sum + asNumber(order.sale_total), 0);
    const productCosts = monthOrders.reduce((sum, order) => sum + asNumber(order.total_cost), 0);
    const spending = monthExpenses.reduce((sum, expense) => sum + asNumber(expense.amount), 0);
    const net = sales - productCosts - spending;
    const breakEven = productCosts + spending + asNumber(form.monthlyFixedCosts);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = Math.max(1, daysInMonth - now.getDate() + 1);
    const salesRemaining = Math.max(0, asNumber(form.monthlySalesGoal) - sales);

    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 30);
    const recentSales = orders
      .filter((order) => new Date(order.sale_date || 0) >= cutoff)
      .reduce((sum, order) => sum + asNumber(order.sale_total) - asNumber(order.total_cost), 0);
    const recentExpenses = expenses
      .filter((expense) => new Date(expense.date || expense.expense_date || 0) >= cutoff)
      .reduce((sum, expense) => sum + asNumber(expense.amount), 0);
    const averageDailyNet = (recentSales - recentExpenses) / 30;
    const projected = (days) => asNumber(form.startingCash) + averageDailyNet * days;

    return {
      sales,
      net,
      breakEven,
      salesRemaining,
      daysRemaining,
      dailySalesNeeded: salesRemaining / daysRemaining,
      weeklySalesNeeded: (salesRemaining / daysRemaining) * 7,
      taxReserve: Math.max(0, net) * (taxRate / 100),
      averageDailyNet,
      projections: [7, 30, 60].map((days) => ({ days, value: projected(days) })),
    };
  }, [orders, allExpenses, form, taxRate]);

  const save = async () => {
    if (!business?.id || saving) return;
    setSaving(true);
    try {
      const saved = await neonEntities.update("Business", business.id, { business_plan: form });
      setForm({ ...defaults, ...(saved?.business_plan || form) });
      setDirty(false);
      await reload();
      toast.success("Business plan saved");
    } catch (error) {
      toast.error("Could not save the plan", { description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Business Plan"
        subtitle="Goals and cash-flow guidance from your real sales"
        onBack={() => navigate(-1)}
        right={
          <button
            type="button"
            onClick={save}
            disabled={!dirty || !business || saving}
            className="h-11 px-4 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        }
      />

      <div className="grid md:grid-cols-2 gap-3">
        <GoalCard
          icon={Target}
          title="Monthly sales"
          value={metrics.sales}
          target={asNumber(form.monthlySalesGoal)}
          detail={`${formatMoney(metrics.dailySalesNeeded)} per day needed`}
        />
        <GoalCard
          icon={TrendingUp}
          title="Monthly profit"
          value={metrics.net}
          target={asNumber(form.monthlyProfitGoal)}
          detail={`${formatMoney(metrics.weeklySalesNeeded)} weekly sales pace`}
          tone="rose"
        />
      </div>

      <div className="grid xl:grid-cols-[1.05fr_1.95fr] gap-4">
        <section className="artflow-panel rounded-3xl border p-5 space-y-4">
          <div>
            <h2 className="font-heading text-lg">Plan settings</h2>
            <p className="text-xs text-muted-foreground mt-1">Saved to this Art Flow business.</p>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-1 gap-4">
            <MoneyInput label="Monthly sales goal" value={form.monthlySalesGoal} onChange={(value) => update("monthlySalesGoal", value)} hint="Revenue you want to reach this month" />
            <MoneyInput label="Monthly profit goal" value={form.monthlyProfitGoal} onChange={(value) => update("monthlyProfitGoal", value)} hint="Net income target after recorded costs" />
            <MoneyInput label="Cash on hand" value={form.startingCash} onChange={(value) => update("startingCash", value)} hint="Starting point for the forecast" />
            <MoneyInput label="Planned fixed costs" value={form.monthlyFixedCosts} onChange={(value) => update("monthlyFixedCosts", value)} hint="Monthly overhead not yet in Expenses" />
          </div>
          {loading && <p className="text-xs text-muted-foreground">Loading your saved plan…</p>}
        </section>

        <div className="space-y-4">
          <section className="artflow-panel rounded-3xl border p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-fuchsia-500/10 flex items-center justify-center shrink-0">
                <BadgeDollarSign className="w-5 h-5 text-fuchsia-500" />
              </div>
              <div className="flex-1">
                <h2 className="font-heading text-lg">Break-even tracker</h2>
                <p className="text-xs text-muted-foreground mt-1">Sales compared with recorded product, business, and planned fixed costs.</p>
              </div>
              <span className={`text-xs font-semibold ${metrics.sales >= metrics.breakEven ? "text-emerald-500" : "text-amber-500"}`}>
                {metrics.sales >= metrics.breakEven ? "Covered" : `${formatMoney(metrics.breakEven - metrics.sales)} left`}
              </span>
            </div>
            <div className="mt-5"><Progress value={metrics.sales} max={metrics.breakEven} /></div>
            <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
              <div><p className="text-xs text-muted-foreground">Sales</p><p className="font-semibold mt-1">{formatMoney(metrics.sales)}</p></div>
              <div><p className="text-xs text-muted-foreground">Break-even</p><p className="font-semibold mt-1">{formatMoney(metrics.breakEven)}</p></div>
            </div>
          </section>

          <section className="artflow-panel rounded-3xl border p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[hsl(var(--primary))]/10 flex items-center justify-center shrink-0">
                <WalletCards className="w-5 h-5 text-[hsl(var(--primary))]" />
              </div>
              <div>
                <h2 className="font-heading text-lg">Cash-flow forecast</h2>
                <p className="text-xs text-muted-foreground mt-1">Estimate based on your net pace over the last 30 days.</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-5">
              {metrics.projections.map((projection) => (
                <div key={projection.days} className="rounded-2xl bg-background/60 border border-[hsl(var(--border))] p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{projection.days} days</p>
                  <p className={`text-sm sm:text-lg font-heading mt-2 ${projection.value < 0 ? "text-rose-500" : ""}`}>{formatMoney(projection.value)}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">Current net pace: {formatMoney(metrics.averageDailyNet)} per day. Forecasts are planning estimates, not guarantees.</p>
          </section>
        </div>
      </div>

      <Link to="/taxes" className="pastel-yellow rounded-3xl border border-[hsl(var(--border))] p-5 flex items-center gap-4 transition-transform hover:-translate-y-0.5">
        <div className="w-11 h-11 rounded-2xl bg-white/60 dark:bg-white/10 flex items-center justify-center">
          <PiggyBank className="w-5 h-5 text-[hsl(var(--primary))]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Tax reserve planner</p>
          <p className="text-xs text-muted-foreground mt-1">Set aside {formatMoney(metrics.taxReserve)} at your current {taxRate}% rate.</p>
        </div>
        <ArrowRight className="w-5 h-5 text-muted-foreground" />
      </Link>
    </div>
  );
}
