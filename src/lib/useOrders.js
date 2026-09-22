import { useCallback, useEffect, useState } from "react";

const finiteNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const poshmarkGrossFallback = (record) => {
  if (String(record?.platform || "").trim().toLowerCase() !== "poshmark") return 0;
  const earnings = finiteNumber(record?.data?.poshmark_earnings);
  if (earnings <= 0) return 0;

  // Historical Poshmark rows imported before the price parser was fixed can
  // contain earnings but a $0 gross sale total. Under the fee schedule on
  // these receipts, sales below $15 use a $2.95 fee and $15+ sales use 20%.
  const flatFeeGross = earnings + 2.95;
  const percentageGross = earnings / 0.8;
  const gross = flatFeeGross < 15 ? flatFeeGross : percentageGross;
  return Number(gross.toFixed(2));
};

const normalizeOrderRecord = (record) => {
  if (!record) return record;
  const storedSaleTotal = finiteNumber(record.sale_total);
  const saleTotal = storedSaleTotal > 0 ? storedSaleTotal : poshmarkGrossFallback(record);
  const totalCost = finiteNumber(record.total_cost);
  const storedProfit = finiteNumber(record.estimated_profit);
  return {
    ...record,
    quantity: finiteNumber(record.quantity),
    unit_price: finiteNumber(record.unit_price) || (finiteNumber(record.quantity) > 0 ? Number((saleTotal / finiteNumber(record.quantity)).toFixed(2)) : saleTotal),
    sale_total: saleTotal,
    base_item_cost: finiteNumber(record.base_item_cost),
    paper_ink_cost: finiteNumber(record.paper_ink_cost),
    packaging_cost: finiteNumber(record.packaging_cost),
    total_cost: totalCost,
    estimated_profit: storedSaleTotal > 0 ? storedProfit : Number((saleTotal - totalCost).toFixed(2)),
  };
};

export function useOrders() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async (_options = {}) => {
    try {
      // Connector syncing is owned by AuthContext so every screen reads the same
      // Neon snapshot without starting duplicate Gmail/Tracker jobs.
      const response = await fetch("/api/neon-data?op=orders", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        const returnTo = window.location.pathname + window.location.search;
        window.location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }
      if (!response.ok) throw new Error(data.error || `Neon orders ${response.status}`);
      const orders = Array.isArray(data.orders) ? data.orders.map(normalizeOrderRecord) : [];
      setRecords(orders.filter((order) => order?.archived !== true));
    } catch (error) {
      console.error("Failed to load business orders:", error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const onSynced = () => reload();
    const onFocus = () => reload();
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 60 * 1000);
    window.addEventListener("artflow:data-synced", onSynced);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("artflow:data-synced", onSynced);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  return { records, loading, reload };
}
