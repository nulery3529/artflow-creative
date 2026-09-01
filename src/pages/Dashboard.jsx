import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { UserCircle } from "lucide-react";
import PullToRefresh from "@/components/PullToRefresh";
import { useEntity } from "@/lib/useBusinessData";
import { useOrders } from "@/lib/useOrders";
import { formatMoney, monthLabel, currentMonthKey } from "@/lib/format";
import { StatCard, PlatformBar, EmptyRow } from "@/components/Cards";
import PageHeader from "@/components/PageHeader";
import { PLATFORM_BAR, displayPlatform, PLATFORMS } from "@/lib/platforms";
import { useMarketplacePreferences } from "@/lib/useMarketplacePreferences";

const PRINT_COSTS = [
  { size: "5x7", base: 1.5, paper: 0.09, packing: 0.4 },
  { size: "4x6", base: 1.25, paper: 0.09, packing: 0.4 },
  { size: "8x10", base: 2, paper: 0.09, packing: 0.4 },
  { size: "11x14", base: 3, paper: 0.09, packing: 2 },
  { size: "4x4", base: 1, paper: 0.09, packing: 0.4 },
  { size: "8x8", base: 2, paper: 0.09, packing: 0.4 },
  { size: "12x12", base: 4, paper: 0.09, packing: 0.4 },
].map((row) => ({ ...row, total: row.base + row.paper + row.packing }));

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const orderIdentity = (order) =>
  String(order?.order_id || order?.source_email_id || order?.id || "").trim();

const deductibleValue = (expense) => {
  if (expense?.deductible_amount != null) return num(expense.deductible_amount);
  return num(expense?.amount) * (num(expense?.deductible_percent ?? 100) / 100);
};

function MetricCard({ tone, label, value, sub, loading }) {
  return (
    <StatCard
      tone={tone}
      label={label}
      value={loading ? "Loading…" : value}
      sub={loading ? "Updating business data" : sub}
    />
  );
}

function TableRow({ children, last = false }) {
  return (
    <div className={`grid grid-cols-12 gap-2 py-2.5 text-sm ${last ? "" : "border-b border-[hsl(var(--border))]"}`}>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const { records: orders, loading: ordersLoading, reload: reloadOrders } = useOrders();
  const { records: expenses, loading: expensesLoading, reload: reloadExpenses } = useEntity("Expense", "-created_date", 10000);
  const { selected: trackedSites, configured: sitesConfigured } = useMarketplacePreferences();

  const activeOrders = useMemo(() => {
    if (!sitesConfigured || trackedSites.length === 0) return orders;
    return orders.filter((order) => trackedSites.includes(displayPlatform(order.platform)));
  }, [orders, trackedSites, sitesConfigured]);

  const refresh = async () => {
    await Promise.all([reloadOrders({ syncTracker: true }), reloadExpenses()]);
  };

  const loading = ordersLoading || expensesLoading;
  const currentMonth = currentMonthKey();

  const calc = useMemo(() => {
    const uniqueOrders = new Set(activeOrders.map(orderIdentity).filter(Boolean));
    const totalSales = activeOrders.reduce((sum, order) => sum + num(order.sale_total), 0);
    const itemsSold = activeOrders.reduce((sum, order) => sum + num(order.quantity), 0);
    const orderCosts = activeOrders.reduce((sum, order) => sum + num(order.total_cost), 0);
    const recordedPurchases = expenses.reduce((sum, expense) => sum + num(expense.amount), 0);
    const deductibleExpenses = expenses.reduce((sum, expense) => sum + deductibleValue(expense), 0);
    const estimatedNetProfit = totalSales - orderCosts - deductibleExpenses;
    const avgOrderValue = uniqueOrders.size ? totalSales / uniqueOrders.size : 0;

    const currentOrders = activeOrders.filter((order) => (order.sale_date || "").slice(0, 7) === currentMonth);
    const currentExpenses = expenses.filter((expense) => (expense.date || "").slice(0, 7) === currentMonth);
    const currentSales = currentOrders.reduce((sum, order) => sum + num(order.sale_total), 0);
    const currentOrderCosts = currentOrders.reduce((sum, order) => sum + num(order.total_cost), 0);
    const currentDeductions = currentExpenses.reduce((sum, expense) => sum + deductibleValue(expense), 0);
    const currentNet = currentSales - currentOrderCosts - currentDeductions;

    const platformNames = Array.from(new Set([
      ...(sitesConfigured && trackedSites.length ? trackedSites : PLATFORMS),
      ...activeOrders.map((order) => displayPlatform(order.platform)),
    ])).filter((platform) => platform !== "Legacy" || activeOrders.some((order) => displayPlatform(order.platform) === "Legacy"));

    const platformPerformance = platformNames.map((platform) => {
      const rows = activeOrders.filter((order) => displayPlatform(order.platform) === platform);
      return {
        platform,
        sales: rows.reduce((sum, order) => sum + num(order.sale_total), 0),
        saleLines: rows.length,
      };
    });

    const monthKeys = Array.from(new Set([
      currentMonth,
      ...activeOrders.map((order) => (order.sale_date || "").slice(0, 7)),
      ...expenses.map((expense) => (expense.date || "").slice(0, 7)),
    ].filter(/^\d{4}-\d{2}$/))).sort().reverse().slice(0, 6);

    const monthlySnapshot = monthKeys.map((key) => {
      const monthOrders = activeOrders.filter((order) => (order.sale_date || "").slice(0, 7) === key);
      const monthExpenses = expenses.filter((expense) => (expense.date || "").slice(0, 7) === key);
      const monthOrderIds = new Set(monthOrders.map(orderIdentity).filter(Boolean));
      const sales = monthOrders.reduce((sum, order) => sum + num(order.sale_total), 0);
      const costs = monthOrders.reduce((sum, order) => sum + num(order.total_cost), 0);
      const deductions = monthExpenses.reduce((sum, expense) => sum + deductibleValue(expense), 0);
      return {
        key,
        sales,
        orders: monthOrderIds.size,
        expenses: deductions,
        net: sales - costs - deductions,
      };
    });

    const expenseMap = new Map();
    for (const expense of expenses) {
      const category = String(expense.category || "Other").trim() || "Other";
      expenseMap.set(category, (expenseMap.get(category) || 0) + deductibleValue(expense));
    }
    const expenseMix = Array.from(expenseMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    return {
      totalSales,
      orders: uniqueOrders.size,
      itemsSold,
      estimatedNetProfit,
      recordedPurchases,
      orderCosts,
      deductibleExpenses,
      avgOrderValue,
      currentSales,
      currentNet,
      platformPerformance,
      monthlySnapshot,
      expenseMix,
    };
  }, [activeOrders, expenses, currentMonth, sitesConfigured, trackedSites]);

  const maxPlatform = Math.max(...calc.platformPerformance.map((row) => row.sales), 1);
  const currentLabel = monthLabel(currentMonth);

  return (
    <div className="space-y-6">
      <PullToRefresh onRefresh={refresh} />
      <PageHeader
        title="Art Flow Creative"
        subtitle="Business Dashboard"
        right={
          <Link
            to="/account"
            className="w-9 h-9 rounded-full bg-card border border-[hsl(var(--border))] flex items-center justify-center shrink-0"
            aria-label="Account"
          >
            <UserCircle className="w-5 h-5 text-muted-foreground" />
          </Link>
        }
      />

      <section>
        <p className="text-xs text-muted-foreground mb-3">Live business overview</p>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard tone="lavender" label="Total Sales" value={formatMoney(calc.totalSales)} loading={loading} />
          <MetricCard tone="mint" label="Orders" value={String(calc.orders)} loading={loading} />
          <MetricCard tone="blue" label="Items Sold" value={String(calc.itemsSold)} loading={loading} />
          <MetricCard tone="yellow" label="Est. Net Profit" value={formatMoney(calc.estimatedNetProfit)} loading={loading} />
          <div className="col-span-2">
            <MetricCard tone="peach" label="Recorded Purchases" value={formatMoney(calc.recordedPurchases)} loading={loading} />
          </div>
        </div>
      </section>

      <section>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard tone="lavender" label="Order Costs" value={formatMoney(calc.orderCosts)} loading={loading} />
          <MetricCard tone="mint" label="Deductible Expenses" value={formatMoney(calc.deductibleExpenses)} loading={loading} />
          <MetricCard tone="peach" label="Avg Order Value" value={formatMoney(calc.avgOrderValue)} loading={loading} />
          <MetricCard tone="blue" label={`${currentLabel} Sales`} value={formatMoney(calc.currentSales)} loading={loading} />
          <div className="col-span-2">
            <MetricCard tone="yellow" label={`${currentLabel} Net`} value={formatMoney(calc.currentNet)} loading={loading} />
          </div>
        </div>
      </section>

      <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <h2 className="font-heading text-lg mb-4">Platform Performance</h2>
        {calc.platformPerformance.length === 0 ? (
          <EmptyRow text="No platform sales yet" />
        ) : (
          calc.platformPerformance.map(({ platform, sales, saleLines }) => (
            <div key={platform} className="mb-4 last:mb-0">
              <PlatformBar
                label={platform}
                value={sales}
                max={maxPlatform}
                color={PLATFORM_BAR[platform] || PLATFORM_BAR.Legacy}
              />
              <p className="text-[11px] text-muted-foreground -mt-2">{saleLines} sale lines</p>
            </div>
          ))
        )}
      </section>

      <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <h2 className="font-heading text-lg mb-1">Current Art Print Costs</h2>
        <p className="text-xs text-muted-foreground mb-3">Base item + paper & ink + packing</p>
        <div className="overflow-hidden">
          <div className="grid grid-cols-12 gap-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-[hsl(var(--border))]">
            <span className="col-span-3">Size</span>
            <span className="col-span-2 text-right">Base</span>
            <span className="col-span-2 text-right">Paper</span>
            <span className="col-span-2 text-right">Pack</span>
            <span className="col-span-3 text-right">Total</span>
          </div>
          {PRINT_COSTS.map((row, index) => (
            <TableRow key={row.size} last={index === PRINT_COSTS.length - 1}>
              <span className="col-span-3 font-medium">{row.size}</span>
              <span className="col-span-2 text-right">{formatMoney(row.base)}</span>
              <span className="col-span-2 text-right">{formatMoney(row.paper)}</span>
              <span className="col-span-2 text-right">{formatMoney(row.packing)}</span>
              <span className="col-span-3 text-right font-semibold">{formatMoney(row.total)}</span>
            </TableRow>
          ))}
        </div>
      </section>

      <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <h2 className="font-heading text-lg mb-4">Monthly Snapshot</h2>
        {loading ? (
          <EmptyRow text="Loading monthly totals…" />
        ) : calc.monthlySnapshot.length === 0 ? (
          <EmptyRow text="No monthly data yet" />
        ) : (
          <div className="space-y-3">
            {calc.monthlySnapshot.map((row) => (
              <div key={row.key} className="rounded-2xl bg-muted/40 p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="font-medium">{monthLabel(row.key)}</p>
                  <p className="font-heading">{formatMoney(row.net)}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div><span className="block">Sales</span><strong className="text-foreground">{formatMoney(row.sales)}</strong></div>
                  <div><span className="block">Orders</span><strong className="text-foreground">{row.orders}</strong></div>
                  <div><span className="block">Expenses</span><strong className="text-foreground">{formatMoney(row.expenses)}</strong></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <h2 className="font-heading text-lg mb-4">Expense Mix</h2>
        {loading ? (
          <EmptyRow text="Loading expense categories…" />
        ) : calc.expenseMix.length === 0 ? (
          <EmptyRow text="No deductible expenses yet" />
        ) : (
          <div className="space-y-2">
            {calc.expenseMix.map((row, index) => (
              <div key={row.category} className={`flex items-center justify-between gap-3 py-2.5 ${index === calc.expenseMix.length - 1 ? "" : "border-b border-[hsl(var(--border))]"}`}>
                <span className="text-sm font-medium min-w-0 truncate">{row.category}</span>
                <span className="font-heading text-sm shrink-0">{formatMoney(row.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
