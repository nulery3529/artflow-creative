import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import PageHeader from "@/components/PageHeader";
import PullToRefresh from "@/components/PullToRefresh";
import MonthlySummary from "@/components/MonthlySummary";
import TaxLiabilityTracker from "@/components/TaxLiabilityTracker";
import ExportButton from "@/components/ExportButton";
import { EmptyRow, PlatformBar } from "@/components/Cards";
import { useEntity, useTaxRate, isApprovedExpense } from "@/lib/useBusinessData";
import { useOrders } from "@/lib/useOrders";
import { formatMoney } from "@/lib/format";
import { PLATFORM_BAR, displayPlatform } from "@/lib/platforms";
import { useMarketplacePreferences } from "@/lib/useMarketplacePreferences";

const periods = [
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "last3", label: "Last 3 Months" },
  { key: "thisYear", label: "This Year" },
  { key: "allTime", label: "All Time" },
];

function inPeriod(dateStr, key) {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (key === "thisMonth") return d.getFullYear() === y && d.getMonth() === m;
  if (key === "lastMonth") {
    const lm = new Date(y, m - 1, 1);
    return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth();
  }
  if (key === "last3") {
    const start = new Date(y, m - 2, 1);
    return d >= start && d <= new Date(y, m + 1, 0);
  }
  if (key === "thisYear") return d.getFullYear() === y;
  if (key === "allTime") return true;
  return false;
}

function ReportCard({ label, value, tone = "purple", to, sub }) {
  const tones = {
    purple: "bg-purple-50/90 dark:bg-purple-500/10",
    blue: "bg-blue-50/90 dark:bg-blue-500/10",
    mint: "bg-emerald-50/90 dark:bg-emerald-500/10",
    orange: "bg-orange-50/90 dark:bg-orange-500/10",
    yellow: "bg-yellow-50/90 dark:bg-yellow-500/10",
  };

  const card = (
    <div
      className={`${tones[tone] || tones.purple} rounded-3xl border border-[hsl(var(--border))] p-5 shadow-sm transition-transform active:scale-[0.98]`}
    >
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 font-heading text-2xl text-foreground">{value}</p>
      {sub && <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );

  return to ? <Link to={to}>{card}</Link> : card;
}

export default function Reports() {
  const navigate = useNavigate();
  const { records: orders, reload: reloadOrders } = useOrders();
  const { selected: trackedSites } = useMarketplacePreferences();
  const { records: allExpenses, reload: reloadExpenses } = useEntity(
    "Expense",
    "-created_date"
  );
  const expenses = allExpenses.filter(isApprovedExpense);
  const [taxRate] = useTaxRate();
  const [period, setPeriod] = useState("thisMonth");

  const refresh = async () => {
    await Promise.all([reloadOrders(), reloadExpenses()]);
  };

  const calc = useMemo(() => {
    const periodOrders = orders.filter((order) => inPeriod(order.sale_date, period));
    const periodExpenses = expenses.filter((expense) =>
      inPeriod(expense.date || expense.expense_date, period)
    );

    const grossSales = periodOrders.reduce(
      (sum, order) => sum + Number(order.sale_total || 0),
      0
    );
    const numOrders = periodOrders.length;
    const itemsSold = periodOrders.reduce(
      (sum, order) => sum + Number(order.quantity || 0),
      0
    );
    const productCosts = periodOrders.reduce(
      (sum, order) => sum + Number(order.total_cost || 0),
      0
    );
    const bizExpenses = periodExpenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0
    );
    const netProfit = grossSales - productCosts - bizExpenses;
    const estimatedProfit = periodOrders.reduce(
      (sum, order) => sum + Number(order.estimated_profit || 0),
      0
    );
    const deductions = periodExpenses.reduce(
      (sum, expense) =>
        sum +
        Number(
          expense.deductible_amount ??
            Number(expense.amount || 0) *
              (Number(expense.deductible_percent ?? 100) / 100)
        ),
      0
    );
    const taxableProfit = estimatedProfit - deductions;
    const taxReserve = Math.max(0, taxableProfit) * (Number(taxRate || 0) / 100);
    const expenseCount = periodExpenses.length;
    const expenseCategories = Object.entries(
      periodExpenses.reduce((acc, expense) => {
        const category = expense.category || "Other";
        acc[category] = (acc[category] || 0) + Number(expense.amount || 0);
        return acc;
      }, {})
    )
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const platformNames = Array.from(
      new Set(
        [
          ...trackedSites,
          ...periodOrders.map((order) => displayPlatform(order.platform)),
        ].filter(Boolean)
      )
    );

    const platformSales = platformNames
      .map((platform) => ({
        platform,
        sales: periodOrders
          .filter((order) => displayPlatform(order.platform) === platform)
          .reduce((sum, order) => sum + Number(order.sale_total || 0), 0),
      }))
      .sort((a, b) => b.sales - a.sales);

    return {
      grossSales,
      numOrders,
      itemsSold,
      productCosts,
      bizExpenses,
      netProfit,
      taxableProfit,
      taxReserve,
      expenseCount,
      expenseCategories,
      platformSales,
    };
  }, [orders, expenses, period, trackedSites, taxRate]);

  const maxPlatform = Math.max(...calc.platformSales.map((item) => item.sales), 1);

  return (
    <div className="space-y-5">
      <PullToRefresh onRefresh={refresh} />

      <PageHeader
        title="Reports"
        subtitle="Performance over time"
        onBack={() => navigate(-1)}
        right={<ExportButton orders={orders} expenses={expenses} />}
      />

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {periods.map((item) => {
          const active = period === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setPeriod(item.key)}
              className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
                active
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                  : "border border-[hsl(var(--border))] bg-card text-muted-foreground"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ReportCard
          label="Gross Sales"
          value={formatMoney(calc.grossSales)}
          tone="purple"
          to="/orders"
        />
        <ReportCard
          label="Number of Orders"
          value={String(calc.numOrders)}
          tone="blue"
          to="/orders"
        />
        <ReportCard
          label="Items Sold"
          value={String(calc.itemsSold)}
          tone="mint"
          to="/orders"
        />
        <ReportCard
          label="Product Costs"
          value={formatMoney(calc.productCosts)}
          tone="orange"
          to="/inventory"
        />
        <ReportCard
          label="Business Expenses"
          value={formatMoney(calc.bizExpenses)}
          tone="yellow"
          to="/expenses"
        />
        <ReportCard
          label="Net Profit"
          value={formatMoney(calc.netProfit)}
          tone="mint"
          to="/expenses"
          sub="Sales minus product costs & expenses"
        />
      </div>

      <section className="rounded-3xl border border-[hsl(var(--border))] bg-card p-5 shadow-sm">
        <h2 className="font-heading text-lg text-foreground">Sales Split</h2>

        <div className="mt-4">
          {calc.platformSales.length === 0 ? (
            <EmptyRow text="Choose your selling sites in Account" />
          ) : (
            calc.platformSales.map(({ platform, sales }) => (
              <PlatformBar
                key={platform}
                label={platform}
                value={sales}
                max={maxPlatform}
                color={PLATFORM_BAR[platform]}
              />
            ))
          )}
        </div>
      </section>

      <div className="pt-1">
        <MonthlySummary orders={orders} expenses={expenses} />
      </div>

      <TaxLiabilityTracker orders={orders} expenses={expenses} taxRate={taxRate} />

      <div className="grid grid-cols-2 gap-3">
        <ReportCard
          label="Taxable Profit"
          value={formatMoney(calc.taxableProfit)}
          tone="purple"
          to="/taxes"
          sub="Tap to view taxes"
        />
        <ReportCard
          label="Tax Reserve"
          value={formatMoney(calc.taxReserve)}
          tone="orange"
          to="/taxes"
          sub="Based on your current tax rate"
        />
      </div>

      <section className="rounded-3xl border border-[hsl(var(--border))] bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg text-foreground">Expense Breakdown</h2>
          <Link
            to="/expenses"
            className="text-sm font-medium text-[hsl(var(--primary))]"
          >
            View expenses
          </Link>
        </div>

        {calc.expenseCategories.length > 0 ? (
          <div className="space-y-3">
            {calc.expenseCategories.map(({ category, amount }) => (
              <div
                key={category}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-sm text-muted-foreground">{category}</span>
                <span className="text-sm font-semibold text-foreground">
                  {formatMoney(amount)}
                </span>
              </div>
            ))}

            <div className="mt-3 flex items-center justify-between border-t border-[hsl(var(--border))] pt-3">
              <span className="text-sm font-semibold text-foreground">
                Total expenses
              </span>
              <span className="font-heading text-lg text-foreground">
                {formatMoney(calc.bizExpenses)}
              </span>
            </div>
          </div>
        ) : (
          <EmptyRow text="No expenses in this period" />
        )}
      </section>

      {calc.numOrders === 0 && calc.bizExpenses === 0 && (
        <EmptyRow text="No sales or expenses in this period" />
      )}
    </div>
  );
}
