import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Send, Sparkles } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/components/ui/use-toast";
import { askAdvisorAI, getAdvisorAIStatus } from "@/lib/advisorAi";

const SUGGESTIONS = [
  "What should I focus on right now?",
  "How much did I sell this month?",
  "What's my profit so far this year?",
  "Which sizes sell the best?",
  "Which marketplace is performing best?",
  "Which inventory is running low?",
  "What are my biggest expenses?",
];

const money = (value) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
}).format(Number(value) || 0);

const number = (value) => new Intl.NumberFormat("en-US").format(Number(value) || 0);
const percent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;

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

function topRows(rows = [], valueKey = "sales", limit = 5) {
  return [...rows]
    .filter((row) => row?.name && row.name !== "Unknown" && row.name !== "Unknown item")
    .sort((a, b) => (Number(b?.[valueKey]) || 0) - (Number(a?.[valueKey]) || 0))
    .slice(0, limit);
}

const asNumber = (value) => Number(value) || 0;

function monthKey(value) {
  if (!value) return "";
  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildSnapshot(summary = {}, orders = [], expenses = [], inventory = []) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, "0")}`;
  const currentYear = String(now.getFullYear());
  const approvedExpenses = expenses.filter((expense) => String(expense?.status || "approved").toLowerCase() !== "pending");
  const pendingExpenses = expenses.filter((expense) => String(expense?.status || "approved").toLowerCase() === "pending");

  const sum = (rows, field) => rows.reduce((total, row) => total + asNumber(row?.[field]), 0);
  const orderKey = (row) => row?.order_id || row?.source_email_id || row?.id || row?.base44_id;
  const distinctOrders = (rows) => new Set(rows.map(orderKey).filter(Boolean)).size;
  const monthOrders = orders.filter((order) => monthKey(order?.sale_date) === currentMonth);
  const previousMonthOrders = orders.filter((order) => monthKey(order?.sale_date) === previousMonth);
  const yearOrders = orders.filter((order) => monthKey(order?.sale_date).startsWith(currentYear));
  const monthExpenses = approvedExpenses.filter((expense) => monthKey(expense?.date) === currentMonth);
  const yearExpenses = approvedExpenses.filter((expense) => monthKey(expense?.date).startsWith(currentYear));

  const aggregateOrders = (field) => {
    const map = new Map();
    orders.forEach((order) => {
      const name = String(order?.[field] || (field === "product_name" ? "Unknown item" : "Unknown")).trim() || "Unknown";
      const current = map.get(name) || { name, sales: 0, orders: new Set(), items: 0, gross_profit: 0 };
      current.sales += asNumber(order?.sale_total);
      current.items += Math.max(1, asNumber(order?.quantity));
      current.gross_profit += asNumber(order?.sale_total) - asNumber(order?.total_cost);
      const key = orderKey(order);
      if (key) current.orders.add(key);
      map.set(name, current);
    });
    return [...map.values()].map((row) => ({ ...row, orders: row.orders.size }));
  };

  const expenseMap = new Map();
  approvedExpenses.forEach((expense) => {
    const name = String(expense?.category || "Uncategorized").trim() || "Uncategorized";
    const current = expenseMap.get(name) || { name, amount: 0, count: 0 };
    current.amount += asNumber(expense?.amount);
    current.count += 1;
    expenseMap.set(name, current);
  });

  const lowStock = inventory
    .filter((item) => asNumber(item?.quantity_on_hand) <= asNumber(item?.low_stock_level))
    .map((item) => ({
      name: item?.name,
      size: item?.size,
      quantity: asNumber(item?.quantity_on_hand),
      lowStockLevel: asNumber(item?.low_stock_level),
      unitCost: asNumber(item?.total_unit_cost),
    }))
    .sort((a, b) => a.quantity - b.quantity);

  const totalSales = sum(orders, "sale_total");
  const orderCosts = sum(orders, "total_cost");
  const totalExpenses = sum(approvedExpenses, "amount");
  const monthSales = sum(monthOrders, "sale_total");
  const monthCosts = sum(monthOrders, "total_cost");
  const monthExpenseTotal = sum(monthExpenses, "amount");
  const yearSales = sum(yearOrders, "sale_total");
  const yearCosts = sum(yearOrders, "total_cost");
  const yearExpenseTotal = sum(yearExpenses, "amount");
  const totalOrders = distinctOrders(orders);

  return {
    generatedAt: new Date().toISOString(),
    business: summary?.businesses?.[0] || null,
    metrics: {
      totalSales,
      totalOrders,
      totalItems: sum(orders, "quantity"),
      orderCosts,
      totalExpenses,
      netProfit: totalSales - orderCosts - totalExpenses,
      averageOrder: totalOrders ? totalSales / totalOrders : 0,
      monthSales,
      monthOrders: distinctOrders(monthOrders),
      monthCosts,
      monthExpenses: monthExpenseTotal,
      monthNet: monthSales - monthCosts - monthExpenseTotal,
      yearSales,
      yearCosts,
      yearExpenses: yearExpenseTotal,
      yearNet: yearSales - yearCosts - yearExpenseTotal,
    },
    trend: {
      currentSales: monthSales,
      previousSales: sum(previousMonthOrders, "sale_total"),
      currentOrders: distinctOrders(monthOrders),
      previousOrders: distinctOrders(previousMonthOrders),
    },
    platforms: aggregateOrders("platform"),
    sizes: aggregateOrders("size"),
    products: aggregateOrders("product_name"),
    expenseCategories: [...expenseMap.values()],
    inventory: {
      itemTypes: inventory.length,
      unitsOnHand: sum(inventory, "quantity_on_hand"),
      inventoryValue: inventory.reduce((total, item) => total + asNumber(item?.quantity_on_hand) * asNumber(item?.total_unit_cost), 0),
      lowStock,
    },
    dataQuality: {
      ordersMissingCost: orders.filter((order) => asNumber(order?.total_cost) === 0).length,
      ordersMissingPlatform: orders.filter((order) => !String(order?.platform || "").trim()).length,
      ordersMissingSize: orders.filter((order) => !String(order?.size || "").trim()).length,
      pendingExpenses: pendingExpenses.length,
    },
  };
}

function businessRecommendations(snapshot) {
  const m = snapshot.metrics || {};
  const quality = snapshot.dataQuality || {};
  const lowStock = snapshot.inventory?.lowStock || [];
  const bestSize = topRows(snapshot.sizes, "items", 1)[0];
  const bestPlatform = topRows(snapshot.platforms, "sales", 1)[0];
  const bestProduct = topRows(snapshot.products, "items", 1)[0];
  const biggestExpense = topRows(snapshot.expenseCategories, "amount", 1)[0];
  const actions = [];

  if (quality.ordersMissingCost > 0) {
    actions.push(`Review **${number(quality.ordersMissingCost)} orders with $0 recorded cost**. Profit can look too high until those costs are filled in.`);
  }
  if (quality.pendingExpenses > 0) {
    actions.push(`Review **${number(quality.pendingExpenses)} pending expenses** so your expense and profit totals are complete.`);
  }
  if (bestSize) {
    actions.push(`Prioritize **${bestSize.name}** when planning new stock; it leads your recorded size sales with ${number(bestSize.items)} items sold.`);
  }
  if (bestProduct) {
    actions.push(`Consider making more of **${bestProduct.name}**; it is one of your highest-volume recorded products (${number(bestProduct.items)} items).`);
  }
  if (bestPlatform) {
    actions.push(`Protect your momentum on **${bestPlatform.name}**; it currently leads recorded marketplace revenue at ${money(bestPlatform.sales)}.`);
  }
  if (lowStock.length > 0) {
    const first = lowStock[0];
    actions.push(`Restock **${first.name || "a low-stock item"}${first.size ? ` (${first.size})` : ""}** first; only ${number(first.quantity)} remain.`);
  }
  if (biggestExpense && Number(biggestExpense.amount) > 0) {
    actions.push(`Watch **${biggestExpense.name}** spending; it is your largest recorded expense category at ${money(biggestExpense.amount)}.`);
  }
  if (!actions.length && Number(m.totalOrders) > 0) {
    actions.push("Your core data looks usable. Focus new inventory on the products and sizes already proving demand rather than spreading spending evenly across everything.");
  }
  return actions.slice(0, 5);
}

function answerQuestion(question, snapshot) {
  const q = question.toLowerCase();
  const m = snapshot.metrics || {};
  const quality = snapshot.dataQuality || {};
  const lowStock = snapshot.inventory?.lowStock || [];
  const platforms = topRows(snapshot.platforms, "sales", 6);
  const sizes = topRows(snapshot.sizes, "items", 6);
  const products = topRows(snapshot.products, "items", 6);
  const expenses = topRows(snapshot.expenseCategories, "amount", 6);
  const recommendations = businessRecommendations(snapshot);
  const costWarning = quality.ordersMissingCost > 0
    ? `\n\n**Data note:** ${number(quality.ordersMissingCost)} orders currently have $0 recorded cost, so profit should be treated as provisional until those are reviewed.`
    : "";

  if (/month|this month|monthly/.test(q) && /sell|sale|revenue|order|profit|net/.test(q)) {
    const margin = Number(m.monthSales) > 0 ? Number(m.monthNet) / Number(m.monthSales) : 0;
    return `### This month\n- Sales: **${money(m.monthSales)}**\n- Orders: **${number(m.monthOrders)}**\n- Product/order costs: **${money(m.monthCosts)}**\n- Approved expenses: **${money(m.monthExpenses)}**\n- Net after recorded costs and expenses: **${money(m.monthNet)}**\n- Net margin: **${percent(margin)}**${costWarning}`;
  }

  if (/year|ytd|this year/.test(q) && /profit|net|sale|revenue|expense/.test(q)) {
    const margin = Number(m.yearSales) > 0 ? Number(m.yearNet) / Number(m.yearSales) : 0;
    return `### This year\n- Sales: **${money(m.yearSales)}**\n- Product/order costs: **${money(m.yearCosts)}**\n- Approved expenses: **${money(m.yearExpenses)}**\n- Net after recorded costs and expenses: **${money(m.yearNet)}**\n- Net margin: **${percent(margin)}**${costWarning}`;
  }

  if (/expense|spend|cost category|biggest cost/.test(q)) {
    if (!expenses.length) return "I don't have any approved expense categories to rank yet. Once expenses are synced or entered, I'll rank them here.";
    const lines = expenses.map((row, index) => `${index + 1}. **${row.name}** — ${money(row.amount)} (${number(row.count)} entries)`);
    return `### Biggest recorded expenses\n${lines.join("\n")}\n\nTotal approved expenses recorded: **${money(m.totalExpenses)}**.${quality.pendingExpenses ? ` There are also **${number(quality.pendingExpenses)} pending expenses** to review.` : ""}`;
  }

  if (/inventory|stock|restock|running low|low stock/.test(q)) {
    if (!lowStock.length) {
      return `No inventory items are currently at or below their low-stock level. You have **${number(snapshot.inventory?.unitsOnHand)} units** on hand across **${number(snapshot.inventory?.itemTypes)} inventory types**.`;
    }
    const lines = lowStock.slice(0, 8).map((item) => `- **${item.name || "Item"}${item.size ? ` — ${item.size}` : ""}**: ${number(item.quantity)} left (low-stock level ${number(item.lowStockLevel)})`);
    return `### Restock list\n${lines.join("\n")}\n\nI would restock the lowest quantities first, then favor sizes/products that also appear near the top of your sales rankings.`;
  }

  if (/platform|marketplace|vinted|etsy|ebay|depop|poshmark|channel/.test(q)) {
    if (!platforms.length) return "I don't have enough marketplace information on the recorded orders to rank your platforms yet.";
    const lines = platforms.map((row, index) => `${index + 1}. **${row.name}** — ${money(row.sales)} sales, ${number(row.orders)} orders, ${number(row.items)} items`);
    return `### Marketplace performance\n${lines.join("\n")}\n\nBased on recorded revenue, **${platforms[0].name}** is currently your strongest marketplace.${quality.ordersMissingPlatform ? ` ${number(quality.ordersMissingPlatform)} orders are missing a marketplace, so this ranking can improve as those are filled in.` : ""}`;
  }

  if (/size|sizes|5x7|8x10|4x6|8x8|11x14|12x12/.test(q)) {
    if (!sizes.length) return "I don't have enough size information on your recorded orders to rank sizes yet.";
    const lines = sizes.map((row, index) => `${index + 1}. **${row.name}** — ${number(row.items)} items, ${money(row.sales)} sales`);
    return `### Best-selling sizes\n${lines.join("\n")}\n\nFor new inventory, I would start with **${sizes[0].name}**, then use the next two sizes as secondary stock instead of spreading production evenly.${quality.ordersMissingSize ? ` ${number(quality.ordersMissingSize)} orders are missing a size.` : ""}`;
  }

  if (/product|item|design|best seller|bestseller|what.*sell|make more|what.*make/.test(q)) {
    if (!products.length) return "I don't have enough product names on your recorded orders to rank products yet.";
    const lines = products.map((row, index) => `${index + 1}. **${row.name}** — ${number(row.items)} items, ${money(row.sales)} sales`);
    return `### Top recorded products\n${lines.join("\n")}\n\nMy first production priority would be **${products[0].name}** because it has the strongest recorded unit demand. Before making a large batch, compare it with your current inventory so you don't overstock.`;
  }

  if (/profit|margin|net|making money|money/.test(q)) {
    const margin = Number(m.totalSales) > 0 ? Number(m.netProfit) / Number(m.totalSales) : 0;
    return `### Profit snapshot\n- Total sales: **${money(m.totalSales)}**\n- Product/order costs: **${money(m.orderCosts)}**\n- Approved expenses: **${money(m.totalExpenses)}**\n- Net after recorded costs and expenses: **${money(m.netProfit)}**\n- Net margin: **${percent(margin)}**\n- Average order: **${money(m.averageOrder)}**${costWarning}`;
  }

  if (/focus|should i|recommend|advice|next|improve|grow|do now/.test(q)) {
    return `### What I'd focus on now\n${recommendations.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\nThese recommendations are based on the sales, expenses, and inventory currently stored in Art Flow—not generic business advice.`;
  }

  return `### Business snapshot\n- Total sales: **${money(m.totalSales)}** from **${number(m.totalOrders)} orders**\n- This month's sales: **${money(m.monthSales)}**\n- This month's net after recorded costs/expenses: **${money(m.monthNet)}**\n- Average order: **${money(m.averageOrder)}**\n- Inventory on hand: **${number(snapshot.inventory?.unitsOnHand)} units**\n\n### Best next moves\n${recommendations.slice(0, 3).map((item, index) => `${index + 1}. ${item}`).join("\n")}${costWarning}\n\nYou can ask me about **profit, expenses, marketplaces, sizes, products, or low stock** and I'll answer from your current Art Flow data.`;
}

export default function Assistant() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [aiConfigured, setAiConfigured] = useState(null);
  const [aiModel, setAiModel] = useState("");
  const scrollRef = useRef(null);

  const loadSnapshot = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const urls = [
        "/api/neon-data?op=summary",
        "/api/neon-data?op=orders",
        "/api/neon-data?op=expenses",
        "/api/neon-data?op=inventory",
      ];
      const responses = await Promise.all(urls.map((url) => fetch(url, {
        credentials: "include",
        cache: "no-store",
      })));
      const bodies = await Promise.all(responses.map((response) => response.json().catch(() => ({}))));
      const failedIndex = responses.findIndex((response) => !response.ok);
      if (failedIndex >= 0) {
        throw new Error(bodies[failedIndex]?.error || `Could not load business data (${responses[failedIndex].status})`);
      }

      const data = buildSnapshot(
        bodies[0] || {},
        Array.isArray(bodies[1]?.orders) ? bodies[1].orders : [],
        Array.isArray(bodies[2]?.expenses) ? bodies[2].expenses : [],
        Array.isArray(bodies[3]?.inventory) ? bodies[3].inventory : [],
      );
      setSnapshot(data);
      setLoadError("");
      return data;
    } catch (error) {
      const message = error?.message || "Could not load business data";
      setLoadError(message);
      if (!quiet) toast({ title: "Advisor data unavailable", description: message, variant: "destructive" });
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    loadSnapshot();
    getAdvisorAIStatus()
      .then((data) => {
        setAiConfigured(Boolean(data?.configured));
        setAiModel(data?.model || "");
      })
      .catch(() => setAiConfigured(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const freshness = useMemo(() => {
    if (!snapshot?.generatedAt) return "";
    const date = new Date(snapshot.generatedAt);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }, [snapshot?.generatedAt]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput("");
    setSending(true);
    setMessages((current) => [...current, { role: "user", content }]);
    try {
      const fresh = await loadSnapshot({ quiet: true });
      const source = fresh || snapshot;
      if (!source) throw new Error("Your Art Flow data could not be loaded.");
      const history = messages.map(({ role, content: messageContent }) => ({ role, content: messageContent }));
      if (aiConfigured) {
        const result = await askAdvisorAI(content, source, history);
        setAiModel(result?.model || aiModel);
        setMessages((current) => [...current, { role: "assistant", content: result.answer }]);
      } else {
        const answer = answerQuestion(content, source);
        setMessages((current) => [...current, { role: "assistant", content: answer }]);
      }
    } catch (error) {
      const isOpenAISetup = error?.code === "OPENAI_NOT_CONFIGURED";
      if (isOpenAISetup) setAiConfigured(false);
      setMessages((current) => [...current, {
        role: "assistant",
        content: isOpenAISetup
          ? "ChatGPT is not connected to Art Flow yet. The built-in data advisor is still available until the OpenAI connection is added."
          : `I couldn't answer that right now: ${error.message}`,
      }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)]">
      <PageHeader
        className="mb-2"
        title="Business Advisor"
        subtitle="Live advice from your Art Flow sales, expenses & inventory"
        onBack={() => navigate("/")}
      />

      <div className="flex items-center justify-between px-1 pb-3 text-xs text-muted-foreground">
        <span>{loading ? "Loading business data…" : snapshot ? `Live business data loaded${freshness ? ` · ${freshness}` : ""}` : loadError ? "Business data needs a retry" : "Business data unavailable"}</span>
        <button
          type="button"
          onClick={() => loadSnapshot()}
          disabled={loading}
          className="inline-flex items-center gap-1 font-medium text-[hsl(var(--primary))] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 no-scrollbar pb-2">
        {messages.length === 0 && (
          <div className="space-y-2 pt-2">
            {loadError && !snapshot && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 mb-3">
                <p className="font-medium text-sm">Advisor couldn't load your business data.</p>
                <p className="text-xs text-muted-foreground mt-1">{loadError}</p>
                <button
                  type="button"
                  onClick={() => loadSnapshot()}
                  className="mt-3 text-sm font-medium text-[hsl(var(--primary))]"
                >
                  Try again
                </button>
              </div>
            )}
            {snapshot && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="rounded-2xl bg-card border border-[hsl(var(--border))] p-3">
                  <p className="text-xs text-muted-foreground">This month</p>
                  <p className="font-semibold text-lg">{money(snapshot.metrics?.monthSales)}</p>
                  <p className="text-xs text-muted-foreground">{number(snapshot.metrics?.monthOrders)} orders</p>
                </div>
                <div className="rounded-2xl bg-card border border-[hsl(var(--border))] p-3">
                  <p className="text-xs text-muted-foreground">Month net</p>
                  <p className="font-semibold text-lg">{money(snapshot.metrics?.monthNet)}</p>
                  <p className="text-xs text-muted-foreground">after recorded costs</p>
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground px-1 flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Ask your real business data:</p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => send(suggestion)}
                disabled={loading || sending}
                className="w-full text-left px-4 py-3 rounded-2xl bg-card border border-[hsl(var(--border))] text-sm active:scale-[0.99] transition-transform disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {messages.map((message, index) => <MessageBubble key={index} message={message} />)}
        {sending && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-3xl rounded-bl-lg bg-card border border-[hsl(var(--border))] text-sm text-muted-foreground">
              Reading your latest Art Flow data…
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && send()}
          placeholder="Ask about your business…"
          className="flex-1 h-12 px-4 rounded-full bg-card border border-[hsl(var(--border))] text-base focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => send()}
          disabled={sending || !input.trim() || loading}
          className="w-12 h-12 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
