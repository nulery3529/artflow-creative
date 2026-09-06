import { useCallback, useEffect, useState } from "react";

const finiteNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeOrderRecord = (record) => {
  if (!record) return record;
  return {
    ...record,
    quantity: finiteNumber(record.quantity),
    unit_price: finiteNumber(record.unit_price),
    sale_total: finiteNumber(record.sale_total),
    base_item_cost: finiteNumber(record.base_item_cost),
    paper_ink_cost: finiteNumber(record.paper_ink_cost),
    packaging_cost: finiteNumber(record.packaging_cost),
    total_cost: finiteNumber(record.total_cost),
    estimated_profit: finiteNumber(record.estimated_profit),
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
