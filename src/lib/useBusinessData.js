import { useState, useEffect, useCallback } from "react";
import { neonEntities } from "@/lib/neonEntityClient";

const finiteNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeExpenseRecord = (record) => {
  if (!record) return record;
  return {
    ...record,
    amount: finiteNumber(record.amount),
    deductible_percent: record.deductible_percent == null ? 100 : finiteNumber(record.deductible_percent, 100),
    deductible_amount: record.deductible_amount == null ? null : finiteNumber(record.deductible_amount),
  };
};

const normalizeInventoryRecord = (record) => {
  if (!record) return record;
  return {
    ...record,
    base_item_cost: finiteNumber(record.base_item_cost),
    paper_ink_cost: finiteNumber(record.paper_ink_cost),
    packaging_cost: finiteNumber(record.packaging_cost),
    total_unit_cost: finiteNumber(record.total_unit_cost),
    quantity_on_hand: finiteNumber(record.quantity_on_hand),
    low_stock_level: finiteNumber(record.low_stock_level),
  };
};

export function useEntity(entityName, sort = "-created_date", limit = 1000) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      let data = await neonEntities.list(entityName);
      if (!Array.isArray(data)) data = [];
      if (entityName === "Expense") data = data.map(normalizeExpenseRecord);
      if (entityName === "InventoryCost") data = data.map(normalizeInventoryRecord);
      setRecords(data.filter((record) => record?.archived !== true).slice(0, limit));
    } catch (error) {
      console.error(`Failed to load ${entityName}:`, error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [entityName, sort, limit]);

  useEffect(() => {
    reload();
    const onSynced = () => reload();
    window.addEventListener("artflow:data-synced", onSynced);
    return () => window.removeEventListener("artflow:data-synced", onSynced);
  }, [reload]);

  return { records, loading, reload };
}

const RATE_KEY = "aac_tax_reserve_rate";

export function useTaxRate() {
  const [rate, setRate] = useState(() => {
    const v = Number(localStorage.getItem(RATE_KEY));
    return v > 0 && v <= 100 ? v : 30;
  });

  const update = useCallback((newRate) => {
    const v = Math.max(0, Math.min(100, Number(newRate) || 0));
    setRate(v);
    localStorage.setItem(RATE_KEY, String(v));
  }, []);

  return [rate, update];
}
