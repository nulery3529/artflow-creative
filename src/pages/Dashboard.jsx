import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  DollarSign,
  ShoppingBag,
  Package,
  TrendingUp,
  Receipt,
  ArrowUpRight,
  RefreshCw,
  Plus,
  Images,
  BarChart3,
  Activity,
  CalendarDays,
} from "lucide-react";

import PullToRefresh from "@/components/PullToRefresh";
import { useEntity } from "@/lib/useBusinessData";
import { useOrders } from "@/lib/useOrders";
import {
  formatMoney,
  currentMonthKey,
  monthLabel,
} from "@/lib/format";
import { displayPlatform } from "@/lib/platforms";
import { useMarketplacePreferences } from "@/lib/useMarketplacePreferences";
import { useAuth } from "@/lib/AuthContext";

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const orderIdentity = (order) =>
  String(
    order?.order_id ||
      order?.source_email_id ||
      order?.id ||
      ""
  ).trim();

const expenseDeduction = (expense) => {
  if (expense?.deductible_amount != null) {
    return numberValue(expense.deductible_amount);
  }

  const amount = numberValue(expense?.amount);
  const percent = numberValue(
    expense?.deductible_percent ?? 100
  );

  return amount * (percent / 100);
};

const orderTitle = (order) =>
  String(
    order?.product_name ||
      order?.item_name ||
      order?.listing_title ||
      order?.title ||
      order?.name ||
      "Art Order"
  ).trim();

const orderDate = (order) =>
  order?.sale_date ||
  order?.created_date ||
  order?.created_at ||
  "";

const expenseDate = (expense) =>
  expense?.date ||
  expense?.created_date ||
  expense?.created_at ||
  "";

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-[22px] border border-white/70 bg-white/72 dark:bg-slate-950/65 backdrop-blur-xl shadow-[0_12px_40px_rgba(102,73,156,0.10)] ${className}`}
    >
      {children}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  subtitle,
  accent,
  loading,
}) {
  return (
    <Card className="p-4 lg:p-5 min-h-[128px]">
      <div className="flex items-start justify-between gap-3">
        <div
          className={`w-10 h-10 rounded-2xl flex items-center justify-center ${accent}`}
        >
          <Icon className="w-5 h-5" />
        </div>

        <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
      </div>

      <p className="text-[11px] text-muted-foreground mt-4">
        {title}
      </p>

      <p className="text-xl lg:text-2xl font-semibold tracking-tight mt-1">
        {loading ? "—" : value}
      </p>

      <p className="text-[10px] text-muted-foreground mt-1">
        {loading ? "Updating..." : subtitle}
      </p>
    </Card>
  );
}

function EmptyState({ text }) {
  return (
    <div className="py-8 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function ProgressBar({ value, max, className }) {
  const width =
    max > 0 ? Math.max(4, (value / max) * 100) : 0;

  return (
    <div className="h-2 rounded-full bg-purple-100/60 dark:bg-white/5 overflow-hidden">
      <div
        className={`h-full rounded-full ${className}`}
        style={{
          width: `${Math.min(width, 100)}%`,
        }}
      />
    </div>
  );
}

function DonutChart({ rows, total }) {
  const colors = [
    "#a78bfa",
    "#f472b6",
    "#67e8f9",
    "#fbbf24",
    "#34d399",
    "#818cf8",
  ];

  let running = 0;

  const segments = rows.map((row, index) => {
    const start = total ? (running / total) * 100 : 0;
    running += row.value;
    const end = total ? (running / total) * 100 : 0;

    return `${colors[index % colors.length]} ${start}% ${end}%`;
  });

  return (
    <div
      className="relative w-36 h-36 rounded-full shrink-0"
      style={{
        background:
          rows.length && total
            ? `conic-gradient(${segments.join(", ")})`
            : "conic-gradient(#eadff7 0 100%)",
      }}
    >
      <div className="absolute inset-[18px] rounded-full bg-white/95 dark:bg-slate-950 flex flex-col items-center justify-center">
        <span className="text-[10px] text-muted-foreground">
          Total
        </span>

        <span className="text-sm font-semibold mt-1">
          {formatMoney(total)}
        </span>
      </div>
    </div>
  );
}

function SalesLineChart({ rows }) {
  const width = 620;
  const height = 190;
  const paddingX = 22;
  const paddingY = 22;

  if (!rows.length) {
    return <EmptyState text="No sales history yet" />;
  }

  const values = rows.map((row) => row.sales);
  const maxValue = Math.max(...values, 1);

  const points = rows.map((row, index) => {
    const x =
      rows.length === 1
        ? width / 2
        : paddingX +
          (index / (rows.length - 1)) *
            (width - paddingX * 2);

    const y =
      height -
      paddingY -
      (row.sales / maxValue) *
        (height - paddingY * 2);

    return {
      x,
      y,
      row,
    };
  });

  const polyline = points
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  const areaPath = [
    `M ${points[0].x} ${height - paddingY}`,
    ...points.map(
      (point) => `L ${point.x} ${point.y}`
    ),
    `L ${points[points.length - 1].x} ${
      height - paddingY
    }`,
    "Z",
  ].join(" ");

  return (
    <div>
      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[190px]"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient
              id="salesFill"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="#a78bfa"
                stopOpacity="0.32"
              />
              <stop
                offset="100%"
                stopColor="#a78bfa"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((fraction) => (
            <line
              key={fraction}
              x1="0"
              y1={height * fraction}
              x2={width}
              y2={height * fraction}
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeDasharray="5 7"
            />
          ))}

          <path d={areaPath} fill="url(#salesFill)" />

          <polyline
            points={polyline}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((point) => (
            <circle
              key={point.row.key}
              cx={point.x}
              cy={point.y}
              r="4"
              fill="#8b5cf6"
              stroke="white"
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>

      <div
        className="grid gap-1 mt-1"
        style={{
          gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`,
        }}
      >
        {rows.map((row) => (
          <div
            key={row.key}
            className="text-center text-[9px] text-muted-foreground"
          >
            {monthLabel(row.key).split(" ")[0]}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const {
    records: orders = [],
    loading: ordersLoading,
    reload: reloadOrders,
  } = useOrders();

  const {
    records: expenses = [],
    loading: expensesLoading,
    reload: reloadExpenses,
  } = useEntity("Expense", "-created_date", 10000);

  const {
    selected: trackedSites = [],
    configured: sitesConfigured,
  } = useMarketplacePreferences();

  const { user } = useAuth();

  const loading = ordersLoading || expensesLoading;
  const currentMonth = currentMonthKey();

  const activeOrders = useMemo(() => {
    if (!sitesConfigured || !trackedSites.length) {
      return orders;
    }

    return orders.filter((order) =>
      trackedSites.includes(
        displayPlatform(order?.platform)
      )
    );
  }, [
    orders,
    trackedSites,
    sitesConfigured,
  ]);

  const dashboard = useMemo(() => {
    const uniqueOrderIds = new Set(
      activeOrders
        .map(orderIdentity)
        .filter(Boolean)
    );

    const totalSales = activeOrders.reduce(
      (sum, order) =>
        sum + numberValue(order?.sale_total),
      0
    );

    const totalItems = activeOrders.reduce(
      (sum, order) =>
        sum + numberValue(order?.quantity || 1),
      0
    );

    const orderCosts = activeOrders.reduce(
      (sum, order) =>
        sum + numberValue(order?.total_cost),
      0
    );

    const deductibleExpenses = expenses.reduce(
      (sum, expense) =>
        sum + expenseDeduction(expense),
      0
    );

    const netProfit =
      totalSales -
      orderCosts -
      deductibleExpenses;

    const monthOrders = activeOrders.filter(
      (order) =>
        String(orderDate(order)).slice(0, 7) ===
        currentMonth
    );

    const monthExpenses = expenses.filter(
      (expense) =>
        String(expenseDate(expense)).slice(0, 7) ===
        currentMonth
    );

    const monthSales = monthOrders.reduce(
      (sum, order) =>
        sum + numberValue(order?.sale_total),
      0
    );

    const monthCosts = monthOrders.reduce(
      (sum, order) =>
        sum + numberValue(order?.total_cost),
      0
    );

    const monthDeductions =
      monthExpenses.reduce(
        (sum, expense) =>
          sum + expenseDeduction(expense),
        0
      );

    const monthNet =
      monthSales -
      monthCosts -
      monthDeductions;

    const averageOrder = uniqueOrderIds.size
      ? totalSales / uniqueOrderIds.size
      : 0;

    const platformMap = new Map();

    for (const order of activeOrders) {
      const platform = displayPlatform(
        order?.platform
      );

      platformMap.set(
        platform,
        (platformMap.get(platform) || 0) +
          numberValue(order?.sale_total)
      );
    }

    const platforms = Array.from(
      platformMap.entries()
    )
      .map(([name, value]) => ({
        name,
        value,
      }))
      .sort((a, b) => b.value - a.value);

    const expenseMap = new Map();

    for (const expense of expenses) {
      const category =
        String(
          expense?.category || "Other"
        ).trim() || "Other";

      expenseMap.set(
        category,
        (expenseMap.get(category) || 0) +
          expenseDeduction(expense)
      );
    }

    const expenseCategories = Array.from(
      expenseMap.entries()
    )
      .map(([name, value]) => ({
        name,
        value,
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const monthKeys = Array.from(
      new Set(
        [
          currentMonth,
          ...activeOrders.map((order) =>
            String(orderDate(order)).slice(0, 7)
          ),
        ].filter((key) =>
          /^\d{4}-\d{2}$/.test(key)
        )
      )
    )
      .sort()
      .slice(-6);

    const salesHistory = monthKeys.map(
      (key) => ({
        key,
        sales: activeOrders
          .filter(
            (order) =>
              String(orderDate(order)).slice(
                0,
                7
              ) === key
          )
          .reduce(
            (sum, order) =>
              sum +
              numberValue(order?.sale_total),
            0
          ),
      })
    );

    const listingMap = new Map();

    for (const order of activeOrders) {
      const name = orderTitle(order);

      const existing = listingMap.get(name) || {
        name,
        sales: 0,
        quantity: 0,
      };

      existing.sales += numberValue(
        order?.sale_total
      );

      existing.quantity += numberValue(
        order?.quantity || 1
      );

      listingMap.set(name, existing);
    }

    const topListings = Array.from(
      listingMap.values()
    )
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);

    const recentOrders = [...activeOrders]
      .sort(
        (a, b) =>
          new Date(orderDate(b) || 0) -
          new Date(orderDate(a) || 0)
      )
      .slice(0, 5);

    const recentExpenses = [...expenses]
      .sort(
        (a, b) =>
          new Date(expenseDate(b) || 0) -
          new Date(expenseDate(a) || 0)
      )
      .slice(0, 3);

    const activities = [
      ...recentOrders.slice(0, 3).map((order) => ({
        type: "order",
        title: "New order",
        detail: `${displayPlatform(
          order?.platform
        )} · ${orderTitle(order)}`,
        amount: numberValue(order?.sale_total),
        date: orderDate(order),
      })),

      ...recentExpenses.slice(0, 3).map(
        (expense) => ({
          type: "expense",
          title: "Expense added",
          detail:
            expense?.category ||
            expense?.merchant ||
            "Business expense",
          amount: numberValue(expense?.amount),
          date: expenseDate(expense),
        })
      ),
    ]
      .sort(
        (a, b) =>
          new Date(b.date || 0) -
          new Date(a.date || 0)
      )
      .slice(0, 5);

    return {
      totalSales,
      totalOrders: uniqueOrderIds.size,
      totalItems,
      netProfit,
      monthSales,
      monthNet,
      averageOrder,
      deductibleExpenses,
      orderCosts,
      platforms,
      expenseCategories,
      salesHistory,
      topListings,
      recentOrders,
      activities,
    };
  }, [
    activeOrders,
    expenses,
    currentMonth,
  ]);

  const refresh = async () => {
    await Promise.all([
      reloadOrders?.({
        syncTracker: true,
      }),
      reloadExpenses?.(),
    ]);
  };

  const firstName =
    String(
      user?.full_name ||
        user?.name ||
        "Artist"
    )
      .trim()
      .split(/\s+/)[0] || "Artist";

  const hour = new Date().getHours();

  const greeting =
    hour < 12
      ? "Good morning"
      : hour < 17
      ? "Good afternoon"
      : "Good evening";

  const maxPlatform = Math.max(
    ...dashboard.platforms.map(
      (row) => row.value
    ),
    1
  );

  const expenseTotal =
    dashboard.expenseCategories.reduce(
      (sum, row) => sum + row.value,
      0
    );

  return (
    <div className="space-y-5 lg:space-y-6 pt-4 lg:pt-0">
      <PullToRefresh onRefresh={refresh} />

      {/* HEADER */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-[28px] font-semibold tracking-tight text-[#392b4d] dark:text-white">
            {greeting}, {firstName}!
          </h1>

          <p className="text-xs lg:text-sm text-muted-foreground mt-1">
            Here’s what’s happening with your
            art business today.
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="hidden sm:flex items-center gap-2 rounded-2xl border border-white/70 bg-white/70 dark:bg-white/5 px-4 py-2.5 text-xs font-medium shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Sync now
        </button>
      </div>

      {/* KPI ROW */}
      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <MetricCard
          icon={DollarSign}
          title="Total Sales"
          value={formatMoney(
            dashboard.totalSales
          )}
          subtitle={`${formatMoney(
            dashboard.monthSales
          )} this month`}
          loading={loading}
          accent="bg-purple-100 text-purple-600 dark:bg-purple-500/15"
        />

        <MetricCard
          icon={ShoppingBag}
          title="Orders"
          value={String(
            dashboard.totalOrders
          )}
          subtitle={`${dashboard.totalItems} items sold`}
          loading={loading}
          accent="bg-pink-100 text-pink-600 dark:bg-pink-500/15"
        />

        <MetricCard
          icon={Package}
          title="Items Sold"
          value={String(
            dashboard.totalItems
          )}
          subtitle="Across all marketplaces"
          loading={loading}
          accent="bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15"
        />

        <MetricCard
          icon={TrendingUp}
          title="Net Profit"
          value={formatMoney(
            dashboard.netProfit
          )}
          subtitle={`${formatMoney(
            dashboard.monthNet
          )} this month`}
          loading={loading}
          accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15"
        />

        <div className="col-span-2 md:col-span-1">
          <MetricCard
            icon={Receipt}
            title="Avg. Order"
            value={formatMoney(
              dashboard.averageOrder
            )}
            subtitle="Average order value"
            loading={loading}
            accent="bg-amber-100 text-amber-600 dark:bg-amber-500/15"
          />
        </div>
      </section>

      {/* SALES + PLATFORM */}
      <section className="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-4">
        <Card className="p-5 lg:p-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-sm font-semibold">
                Sales Overview
              </h2>

              <p className="text-[10px] text-muted-foreground mt-1">
                Revenue over the last several months
              </p>
            </div>

            <div className="flex items-center gap-2 text-[10px] text-purple-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              Sales
            </div>
          </div>

          <SalesLineChart
            rows={dashboard.salesHistory}
          />
        </Card>

        <Card className="p-5 lg:p-6">
          <div className="mb-5">
            <h2 className="text-sm font-semibold">
              Sales by Platform
            </h2>

            <p className="text-[10px] text-muted-foreground mt-1">
              Marketplace performance
            </p>
          </div>

          {!dashboard.platforms.length ? (
            <EmptyState text="No marketplace sales yet" />
          ) : (
            <div className="space-y-4">
              {dashboard.platforms
                .slice(0, 6)
                .map((row, index) => {
                  const barColors = [
                    "bg-purple-500",
                    "bg-pink-400",
                    "bg-cyan-400",
                    "bg-amber-400",
                    "bg-emerald-400",
                    "bg-indigo-400",
                  ];

                  return (
                    <div key={row.name}>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="text-xs font-medium">
                          {row.name}
                        </span>

                        <span className="text-xs font-semibold">
                          {formatMoney(
                            row.value
                          )}
                        </span>
                      </div>

                      <ProgressBar
                        value={row.value}
                        max={maxPlatform}
                        className={
                          barColors[
                            index %
                              barColors.length
                          ]
                        }
                      />
                    </div>
                  );
                })}
            </div>
          )}
        </Card>
      </section>

      {/* RECENT ORDERS + EXPENSES */}
      <section className="grid grid-cols-1 xl:grid-cols-[1.65fr_1fr] gap-4">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 lg:px-6 py-5 border-b border-purple-100/60 dark:border-white/5">
            <div>
              <h2 className="text-sm font-semibold">
                Recent Orders
              </h2>

              <p className="text-[10px] text-muted-foreground mt-1">
                Latest sales across your connected shops
              </p>
            </div>

            <Link
              to="/orders"
              className="text-[10px] font-semibold text-purple-600 flex items-center gap-1"
            >
              View all
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {!dashboard.recentOrders.length ? (
            <EmptyState text="No recent orders yet" />
          ) : (
            <div>
              {dashboard.recentOrders.map(
                (order, index) => (
                  <div
                    key={
                      orderIdentity(order) ||
                      `${index}`
                    }
                    className="grid grid-cols-[1fr_auto] sm:grid-cols-[1.5fr_.7fr_.7fr_auto] gap-3 items-center px-5 lg:px-6 py-4 border-b last:border-b-0 border-purple-100/50 dark:border-white/5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">
                        {orderTitle(order)}
                      </p>

                      <p className="text-[10px] text-muted-foreground mt-1">
                        {displayPlatform(
                          order?.platform
                        )}
                      </p>
                    </div>

                    <div className="hidden sm:block">
                      <p className="text-[10px] text-muted-foreground">
                        Qty
                      </p>

                      <p className="text-xs font-medium mt-1">
                        {numberValue(
                          order?.quantity || 1
                        )}
                      </p>
                    </div>

                    <div className="hidden sm:block">
                      <p className="text-[10px] text-muted-foreground">
                        Date
                      </p>

                      <p className="text-xs font-medium mt-1">
                        {orderDate(order)
                          ? new Date(
                              orderDate(order)
                            ).toLocaleDateString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                              }
                            )
                          : "—"}
                      </p>
                    </div>

                    <p className="text-sm font-semibold text-right">
                      {formatMoney(
                        numberValue(
                          order?.sale_total
                        )
                      )}
                    </p>
                  </div>
                )
              )}
            </div>
          )}
        </Card>

        <Card className="p-5 lg:p-6">
          <div className="mb-5">
            <h2 className="text-sm font-semibold">
              Expenses Overview
            </h2>

            <p className="text-[10px] text-muted-foreground mt-1">
              Deductible business spending
            </p>
          </div>

          {!dashboard.expenseCategories.length ? (
            <EmptyState text="No expenses recorded yet" />
          ) : (
            <div className="flex flex-col sm:flex-row xl:flex-col 2xl:flex-row items-center gap-6">
              <DonutChart
                rows={
                  dashboard.expenseCategories
                }
                total={expenseTotal}
              />

              <div className="w-full space-y-3">
                {dashboard.expenseCategories.map(
                  (row, index) => {
                    const colors = [
                      "bg-purple-400",
                      "bg-pink-400",
                      "bg-cyan-400",
                      "bg-amber-400",
                      "bg-emerald-400",
                      "bg-indigo-400",
                    ];

                    return (
                      <div
                        key={row.name}
                        className="flex items-center gap-2"
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            colors[
                              index %
                                colors.length
                            ]
                          }`}
                        />

                        <span className="text-[10px] text-muted-foreground flex-1 truncate">
                          {row.name}
                        </span>

                        <span className="text-[10px] font-semibold">
                          {formatMoney(
                            row.value
                          )}
                        </span>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* TOP LISTINGS + ACTIVITY + QUICK ACTIONS */}
      <section className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
        <Card className="p-5 lg:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold">
                Top Listings
              </h2>

              <p className="text-[10px] text-muted-foreground mt-1">
                Best-performing artwork
              </p>
            </div>

            <Images className="w-4 h-4 text-purple-500" />
          </div>

          {!dashboard.topListings.length ? (
            <EmptyState text="No listing data yet" />
          ) : (
            <div className="space-y-3">
              {dashboard.topListings.map(
                (listing, index) => (
                  <div
                    key={listing.name}
                    className="flex items-center gap-3 rounded-2xl bg-purple-50/55 dark:bg-white/5 p-3"
                  >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-200 via-pink-100 to-cyan-100 flex items-center justify-center text-xs font-semibold text-purple-700">
                      {index + 1}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">
                        {listing.name}
                      </p>

                      <p className="text-[10px] text-muted-foreground mt-1">
                        {listing.quantity} sold
                      </p>
                    </div>

                    <p className="text-xs font-semibold">
                      {formatMoney(
                        listing.sales
                      )}
                    </p>
                  </div>
                )
              )}
            </div>
          )}
        </Card>

        <Card className="p-5 lg:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold">
                Recent Activity
              </h2>

              <p className="text-[10px] text-muted-foreground mt-1">
                Latest changes in Art Flow
              </p>
            </div>

            <Activity className="w-4 h-4 text-pink-500" />
          </div>

          {!dashboard.activities.length ? (
            <EmptyState text="No recent activity yet" />
          ) : (
            <div className="space-y-4">
              {dashboard.activities.map(
                (activity, index) => (
                  <div
                    key={`${activity.type}-${index}`}
                    className="flex items-start gap-3"
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        activity.type ===
                        "order"
                          ? "bg-purple-100 text-purple-600"
                          : "bg-pink-100 text-pink-600"
                      }`}
                    >
                      {activity.type ===
                      "order" ? (
                        <ShoppingBag className="w-4 h-4" />
                      ) : (
                        <Receipt className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">
                        {activity.title}
                      </p>

                      <p className="text-[10px] text-muted-foreground truncate mt-1">
                        {activity.detail}
                      </p>
                    </div>

                    <span
                      className={`text-[10px] font-semibold ${
                        activity.type ===
                        "order"
                          ? "text-emerald-600"
                          : "text-pink-500"
                      }`}
                    >
                      {activity.type ===
                      "order"
                        ? "+"
                        : "-"}
                      {formatMoney(
                        activity.amount
                      )}
                    </span>
                  </div>
                )
              )}
            </div>
          )}
        </Card>

        <Card className="p-5 lg:p-6 lg:col-span-2 2xl:col-span-1">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">
              Quick Actions
            </h2>

            <p className="text-[10px] text-muted-foreground mt-1">
              Jump right to common tasks
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/orders"
              className="rounded-2xl bg-purple-100/80 dark:bg-purple-500/10 p-4 hover:-translate-y-0.5 transition"
            >
              <ShoppingBag className="w-5 h-5 text-purple-600" />

              <p className="text-xs font-semibold mt-3">
                Orders
              </p>

              <p className="text-[9px] text-muted-foreground mt-1">
                View sales
              </p>
            </Link>

            <Link
              to="/expenses"
              className="rounded-2xl bg-pink-100/80 dark:bg-pink-500/10 p-4 hover:-translate-y-0.5 transition"
            >
              <Plus className="w-5 h-5 text-pink-600" />

              <p className="text-xs font-semibold mt-3">
                Expense
              </p>

              <p className="text-[9px] text-muted-foreground mt-1">
                Add spending
              </p>
            </Link>

            <Link
              to="/gallery"
              className="rounded-2xl bg-cyan-100/80 dark:bg-cyan-500/10 p-4 hover:-translate-y-0.5 transition"
            >
              <Images className="w-5 h-5 text-cyan-600" />

              <p className="text-xs font-semibold mt-3">
                Gallery
              </p>

              <p className="text-[9px] text-muted-foreground mt-1">
                Manage listings
              </p>
            </Link>

            <Link
              to="/reports"
              className="rounded-2xl bg-amber-100/80 dark:bg-amber-500/10 p-4 hover:-translate-y-0.5 transition"
            >
              <BarChart3 className="w-5 h-5 text-amber-600" />

              <p className="text-xs font-semibold mt-3">
                Reports
              </p>

              <p className="text-[9px] text-muted-foreground mt-1">
                See analytics
              </p>
            </Link>
          </div>

          <div className="mt-4 rounded-2xl border border-purple-100/70 dark:border-white/5 bg-white/45 dark:bg-white/5 p-4 flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-purple-500" />

            <div>
              <p className="text-[11px] font-semibold">
                {monthLabel(
                  currentMonth
                )}
              </p>

              <p className="text-[9px] text-muted-foreground mt-1">
                {formatMoney(
                  dashboard.monthSales
                )}{" "}
                sales ·{" "}
                {formatMoney(
                  dashboard.monthNet
                )}{" "}
                net
              </p>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}