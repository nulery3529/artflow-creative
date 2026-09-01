import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

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

// Loads an entity's records and keeps them in sync via real-time subscriptions.
export function useEntity(entityName, sort = "-created_date", limit = 1000) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const entity = base44.entities[entityName];

  const reload = useCallback(async () => {
    try {
      if (entityName === "Expense") {
        const [baseResult, neonResult] = await Promise.allSettled([
          entity.list(sort, limit),
          fetch("/api/neon-data?op=expenses", { credentials: "include", cache: "no-store" })
            .then(async (res) => {
              if (!res.ok) throw new Error(`Neon expenses ${res.status}`);
              return res.json();
            }),
        ]);
        const baseExpenses = baseResult.status === "fulfilled" && Array.isArray(baseResult.value)
          ? baseResult.value.map(normalizeExpenseRecord)
          : [];
        const neonExpenses = neonResult.status === "fulfilled" && Array.isArray(neonResult.value?.expenses)
          ? neonResult.value.expenses.map(normalizeExpenseRecord)
          : [];
        const merged = new Map();
        const identity = (record) => {
          if (record?.receipt_id) return `receipt:${record.receipt_id}`;
          if (record?.id) return `id:${record.id}`;
          return `expense:${record?.date || ""}:${Number(record?.amount || 0).toFixed(2)}:${record?.description || ""}`;
        };
        for (const expense of baseExpenses) {
          if (expense?.archived !== true) merged.set(identity(expense), expense);
        }
        for (const expense of neonExpenses) {
          if (expense?.archived !== true) merged.set(identity(expense), { ...(merged.get(identity(expense)) || {}), ...expense });
        }
        setRecords(Array.from(merged.values()));
      } else {
        const data = await entity.list(sort, limit);
        // Archived rows are retained only as a rollback/safety copy and must
        // never affect dashboards, reports, taxes, inventory, or order totals.
        setRecords(data.filter((r) => r?.archived !== true));
      }
    } catch (e) {
      console.error(`Failed to load ${entityName}:`, e);
    } finally {
      setLoading(false);
    }
  }, [entity, entityName, sort, limit]);

  useEffect(() => {
    let unsub;
    reload();
    const onSynced = () => reload();
    window.addEventListener("artflow:data-synced", onSynced);
    if (typeof entity.subscribe === "function") {
      unsub = entity.subscribe((event) => {
        setRecords((prev) => {
          if (event.type === "create") {
            const next = entityName === "Expense" ? normalizeExpenseRecord(event.data) : event.data;
            return next?.archived === true ? prev : [next, ...prev];
          }
          if (event.type === "update") {
            const next = entityName === "Expense" ? normalizeExpenseRecord(event.data) : event.data;
            if (next?.archived === true) {
              return prev.filter((r) => r.id !== next.id);
            }
            return prev.map((r) => (r.id === next.id ? next : r));
          }
          if (event.type === "delete") return prev.filter((r) => r.id !== event.data.id);
          return prev;
        });
      });
    }
    return () => {
      window.removeEventListener("artflow:data-synced", onSynced);
      if (unsub) unsub();
    };
  }, [entityName]);

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