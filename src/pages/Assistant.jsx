import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Send, Sparkles } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/components/ui/use-toast";

const SUGGESTIONS = [
  "How much did I sell this month?",
  "What's my profit so far this year?",
  "Which inventory is running low?",
  "What are my biggest expenses?",
];

const money = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);

const number = (value) => new Intl.NumberFormat("en-US").format(Number(value) || 0);

const textDate = (value) => String(value || "").slice(0, 10);
const yearOf = (value) => Number(textDate(value).slice(0, 4)) || 0;
const monthOf = (value) => textDate(value).slice(0, 7);

function approvedExpenseAmount(expense) {
  if (String(expense?.status || "approved").toLowerCase() === "pending") return 0;
  if (expense?.deductible_amount != null && expense.deductible_amount !== "") {
    return Number(expense.deductible_amount) || 0;
  }
  const amount = Number(expense?.amount) || 0;
  const pct = expense?.deductible_percent == null || expense.deductible_percent === ""
    ? 100
    : Number(expense.deductible_percent) || 0;
  return amount * pct / 100;
}

function buildAnalytics(snapshot) {
  const orders = snapshot.orders || [];
  const expenses = snapshot.expenses || [];
  const inventory = snapshot.inventory || [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const yearOrders = orders.filter((o) => yearOf(o.sale_date) === currentYear);
  const monthOrders = orders.filter((o) => monthOf(o.sale_date) === currentMonth);
  const yearExpenses = expenses.filter((e) => yearOf(e.date) === currentYear);
  const monthExpenses = expenses.filter((e) => monthOf(e.date) === currentMonth);

  const orderSales = (rows) => rows.reduce((sum, row) => sum + (Number(row.sale_total) || 0), 0);
  const orderCosts = (rows) => rows.reduce((sum, row) => sum + (Number(row.total_cost) || 0), 0);
  const expenseTotal = (rows) => rows.reduce((sum, row) => sum + approvedExpenseAmount(row), 0);

  const yearSales = orderSales(yearOrders);
  const yearCosts = orderCosts(yearOrders);
  const yearExpenseTotal = expenseTotal(yearExpenses);
  const monthSales = orderSales(monthOrders);
  const monthCosts = orderCosts(monthOrders);
  const monthExpenseTotal = expenseTotal(monthExpenses);

  const byPlatform = {};
  const byProduct = {};
  for (const order of orders) {
    const platform = String(order.platform || "Other").trim() || "Other";
    const product = String(order.product_name || "Unknown item").trim() || "Unknown item";
    const sale = Number(order.sale_total) || 0;
    const qty = Number(order.quantity) || 1;
    byPlatform[platform] = byPlatform[platform] || { sales: 0, orders: 0, items: 0 };
    byPlatform[platform].sales += sale;
    byPlatform[platform].orders += 1;
    byPlatform[platform].items += qty;
    byProduct[product] = byProduct[product] || { sales: 0, orders: 0, items: 0 };
    byProduct[product].sales += sale;
    byProduct[product].orders += 1;
    byProduct[product].items += qty;
  }

  const expenseCategories = {};
  for (const expense of expenses) {
    const category = String(expense.category || "Uncategorized").trim() || "Uncategorized";
    expenseCategories[category] = (expenseCategories[category] || 0) + approvedExpenseAmount(expense);
  }

  const lowStock = inventory
    .filter((item) => (Number(item.quantity_on_hand) || 0) <= (Number(item.low_stock_level) || 0))
    .sort((a, b) => (Number(a.quantity_on_hand) || 0) - (Number(b.quantity_on_hand) || 0));

  const topPlatforms = Object.entries(byPlatform)
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.sales - a.sales);
  const topProducts = Object.entries(byProduct)
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.sales - a.sales);
  const topExpenseCategories = Object.entries(expenseCategories)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
  const biggestExpenseRows = [...expenses]
    .filter((e) => String(e.status || "approved").toLowerCase() !== "pending")
    .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));

  return {
    currentYear,
    currentMonth,
    yearSales,
    yearCosts,
    yearExpenseTotal,
    yearNet: yearSales - yearCosts - yearExpenseTotal,
    monthSales,
    monthCosts,
    monthExpenseTotal,
    monthNet: monthSales - monthCosts - monthExpenseTotal,
    topPlatforms,
    topProducts,
    topExpenseCategories,
    biggestExpenseRows,
    lowStock,
    orders,
    expenses,
    inventory,
  };
}

function advisorAnswer(question, snapshot) {
  const q = question.toLowerCase();
  const a = buildAnalytics(snapshot);
  const metrics = snapshot.summary?.metrics || {};
  const totalOrders = Number(metrics.totalOrders) || a.orders.length;
  const totalSales = Number(metrics.totalSales) || a.orders.reduce((s, o) => s + (Number(o.sale_total) || 0), 0);
  const netProfit = Number(metrics.netProfit);
  const avgOrder = Number(metrics.averageOrder) || (totalOrders ? totalSales / totalOrders : 0);

  if ((q.includes("sell") || q.includes("sales") || q.includes("revenue")) && q.includes("month")) {
    const ordersThisMonth = a.orders.filter((o) => monthOf(o.sale_date) === a.currentMonth);
    return `You sold **${money(a.monthSales)} this month** across **${number(ordersThisMonth.length)} orders**.\n\nAfter recorded order costs and approved deductible expenses, your estimated month net is **${money(a.monthNet)}**.`;
  }

  if ((q.includes("profit") || q.includes("net")) && (q.includes("year") || q.includes("ytd") || q.includes("so far"))) {
    return `Your estimated **${a.currentYear} profit so far is ${money(a.yearNet)}**.\n\nThat is based on **${money(a.yearSales)} in sales**, minus **${money(a.yearCosts)} in recorded order costs** and **${money(a.yearExpenseTotal)} in approved deductible expenses**.`;
  }

  if ((q.includes("profit") || q.includes("net")) && q.includes("month")) {
    return `Your estimated **profit this month is ${money(a.monthNet)}**: ${money(a.monthSales)} sales − ${money(a.monthCosts)} order costs − ${money(a.monthExpenseTotal)} approved deductible expenses.`;
  }

  if (q.includes("inventory") && (q.includes("low") || q.includes("running") || q.includes("restock"))) {
    if (!a.lowStock.length) return "Nothing in your tracked inventory is currently at or below its low-stock level.";
    const rows = a.lowStock.slice(0, 12).map((item) => {
      const label = [item.name, item.size].filter(Boolean).join(" — ");
      return `- **${label || "Unnamed item"}:** ${number(item.quantity_on_hand)} left (low-stock level ${number(item.low_stock_level)})`;
    });
    return `You have **${number(a.lowStock.length)} low-stock item${a.lowStock.length === 1 ? "" : "s"}**:\n\n${rows.join("\n")}${a.lowStock.length > 12 ? `\n\n…and ${a.lowStock.length - 12} more.` : ""}`;
  }

  if (q.includes("expense") && (q.includes("big") || q.includes("largest") || q.includes("top"))) {
    if (!a.biggestExpenseRows.length) return "I don’t see any approved expenses in Neon yet.";
    const categories = a.topExpenseCategories.slice(0, 5).map((x) => `- **${x.name}:** ${money(x.total)}`);
    const rows = a.biggestExpenseRows.slice(0, 5).map((e) => `- ${money(e.amount)} — ${e.category || "Uncategorized"}${e.description ? ` — ${e.description}` : ""}`);
    return `Your biggest expense categories are:\n\n${categories.join("\n")}\n\nLargest individual expenses:\n\n${rows.join("\n")}`;
  }

  if (q.includes("platform") || q.includes("marketplace")) {
    if (!a.topPlatforms.length) return "I don’t see marketplace sales in Neon yet.";
    const rows = a.topPlatforms.slice(0, 6).map((p, i) => `${i + 1}. **${p.name}** — ${money(p.sales)} from ${number(p.orders)} orders`);
    return `Your marketplaces ranked by recorded sales are:\n\n${rows.join("\n")}\n\nYour strongest recorded marketplace right now is **${a.topPlatforms[0].name}**.`;
  }

  if (q.includes("product") || q.includes("item") || q.includes("best seller") || q.includes("bestseller")) {
    if (!a.topProducts.length) return "I don’t see enough product-level sales data in Neon yet.";
    const rows = a.topProducts.slice(0, 6).map((p, i) => `${i + 1}. **${p.name}** — ${money(p.sales)} (${number(p.items)} item${p.items === 1 ? "" : "s"})`);
    return `Your top recorded products by sales are:\n\n${rows.join("\n")}`;
  }

  if (q.includes("average") && q.includes("order")) {
    return `Your average recorded order value is **${money(avgOrder)}** across **${number(totalOrders)} orders**.`;
  }

  if (q.includes("total") && (q.includes("sales") || q.includes("sold"))) {
    return `Your recorded all-time sales total is **${money(totalSales)}** across **${number(totalOrders)} orders**.`;
  }

  if (q.includes("total") && q.includes("profit")) {
    const allTimeNet = Number.isFinite(netProfit) ? netProfit : 0;
    return `Your recorded all-time estimated net profit is **${money(allTimeNet)}**.`;
  }

  if (q.includes("what should") || q.includes("advice") || q.includes("recommend") || q.includes("improve") || q.includes("focus")) {
    const ideas = [];
    if (a.topPlatforms[0]) ideas.push(`Put more listing effort into **${a.topPlatforms[0].name}**, your highest-sales marketplace in the recorded data.`);
    if (a.topProducts[0]) ideas.push(`Make or relist more variations of **${a.topProducts[0].name}**, currently your top product by recorded sales.`);
    if (a.lowStock.length) ideas.push(`Restock the **${a.lowStock.length} inventory item${a.lowStock.length === 1 ? "" : "s"}** already at or below your low-stock levels so sales are not interrupted.`);
    if (a.topExpenseCategories[0]) ideas.push(`Review **${a.topExpenseCategories[0].name}** first when looking for savings; it is your largest recorded expense category.`);
    if (!ideas.length) ideas.push("Keep recording sales, expenses, and inventory so I can give you stronger recommendations from your actual numbers.");
    return `Based on the live Neon data, I’d focus on these next:\n\n${ideas.map((x, i) => `${i + 1}. ${x}`).join("\n")}`;
  }

  const topPlatform = a.topPlatforms[0];
  const lowText = a.lowStock.length ? `${number(a.lowStock.length)} low-stock items` : "no low-stock alerts";
  return `Here’s the current business snapshot from Neon:\n\n- **This month sales:** ${money(a.monthSales)}\n- **This month estimated net:** ${money(a.monthNet)}\n- **${a.currentYear} sales:** ${money(a.yearSales)}\n- **${a.currentYear} estimated net:** ${money(a.yearNet)}\n- **All-time recorded sales:** ${money(totalSales)}\n- **Orders:** ${number(totalOrders)}\n- **Average order:** ${money(avgOrder)}\n- **Inventory:** ${lowText}${topPlatform ? `\n- **Top marketplace by recorded sales:** ${topPlatform.name}` : ""}\n\nYou can ask me about sales, profit, expenses, inventory, marketplaces, products, or what to focus on next.`;
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className={`max-w-[88%] ${isUser ? "" : "w-full"}`}>
        {isUser ? (
          <div className="px-4 py-2.5 rounded-3xl rounded-br-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-[15px]">
            {message.content}
          </div>
        ) : (
          <div className="px-4 py-3 rounded-3xl rounded-bl-lg bg-card border border-[hsl(var(--border))]">
            <ReactMarkdown className="text-[15px] prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Assistant() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [snapshot, setSnapshot] = useState({ summary: null, orders: [], expenses: [], inventory: [] });
  const scrollRef = useRef(null);

  const dataReady = useMemo(() => Boolean(snapshot.summary), [snapshot.summary]);

  const loadBusinessData = async ({ silent = false } = {}) => {
    if (!silent) setLoadingData(true);
    try {
      const [summaryRes, ordersRes, expensesRes, inventoryRes] = await Promise.all([
        fetch("/api/neon-data?op=summary", { credentials: "include", cache: "no-store" }),
        fetch("/api/neon-data?op=orders", { credentials: "include", cache: "no-store" }),
        fetch("/api/neon-data?op=expenses", { credentials: "include", cache: "no-store" }),
        fetch("/api/neon-data?op=inventory", { credentials: "include", cache: "no-store" }),
      ]);
      const responses = [summaryRes, ordersRes, expensesRes, inventoryRes];
      const failed = responses.find((r) => !r.ok);
      if (failed) throw new Error(failed.status === 401 ? "Please sign in again." : "Could not load your business data.");
      const [summary, orderData, expenseData, inventoryData] = await Promise.all(responses.map((r) => r.json()));
      const next = {
        summary,
        orders: orderData.orders || [],
        expenses: expenseData.expenses || [],
        inventory: inventoryData.inventory || [],
      };
      setSnapshot(next);
      setLastUpdated(new Date());
      return next;
    } catch (e) {
      if (!silent) toast({ title: "Advisor data couldn't load", description: e.message, variant: "destructive" });
      throw e;
    } finally {
      if (!silent) setLoadingData(false);
    }
  };

  useEffect(() => {
    loadBusinessData().catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content }]);
    setSending(true);
    try {
      let fresh = snapshot;
      try { fresh = await loadBusinessData({ silent: true }); } catch {}
      if (!fresh.summary) throw new Error("Your Neon business data is not available yet.");
      const answer = advisorAnswer(content, fresh);
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: `I couldn't read your live business data for that question. **${e.message}**` }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)]">
      <PageHeader
        className="mb-2"
        title="Business Advisor"
        subtitle="Live answers from your sales, expenses & inventory"
        onBack={() => navigate("/")}
      />

      <div className="flex items-center justify-between px-1 pb-2 text-xs text-muted-foreground">
        <span>
          {loadingData ? "Loading Neon data…" : dataReady ? `Live data${lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}` : "Data unavailable"}
        </span>
        <button
          type="button"
          onClick={() => loadBusinessData().catch(() => {})}
          disabled={loadingData}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border border-[hsl(var(--border))] bg-card disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 no-scrollbar pb-2">
        {messages.length === 0 && (
          <div className="space-y-2 pt-4">
            <div className="px-4 py-3 rounded-2xl bg-card border border-[hsl(var(--border))] text-sm">
              <div className="flex items-center gap-2 font-medium mb-1"><Sparkles className="w-4 h-4" /> Live business advisor</div>
              <p className="text-muted-foreground">I use the numbers currently stored in Neon, not placeholder data.</p>
            </div>
            <p className="text-sm text-muted-foreground px-1 pt-2">Try asking:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={sending || loadingData}
                className="w-full text-left px-4 py-3 rounded-2xl bg-card border border-[hsl(var(--border))] text-sm active:scale-[0.99] transition-transform disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => <MessageBubble key={`${m.role}-${i}`} message={m} />)}
        {sending && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-3xl rounded-bl-lg bg-card border border-[hsl(var(--border))] text-sm text-muted-foreground">
              Reading your latest Neon data…
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about your business…"
          disabled={loadingData}
          className="flex-1 h-12 px-4 rounded-full bg-card border border-[hsl(var(--border))] text-base focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        <button
          onClick={() => send()}
          disabled={sending || loadingData || !input.trim()}
          className="w-12 h-12 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
