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
        // Expenses are authoritative in Neon. Do not wait on the legacy Base44
        // entity list: an unavailable legacy backend used to block the entire
        // Expenses page even after /api/neon-data had returned successfully.
        const res = await fetch("/api/neon-data?op=expenses", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Neon expenses ${res.status}`);
        const data = await res.json();
        const neonExpenses = Array.isArray(data?.expenses)
          ? data.expenses.map(normalizeExpenseRecord).filter((expense) => expense?.archived !== true)
          : [];

        // A historical importer produced duplicate rows with the same receipt id.
        // Keep one display record per receipt without deleting any database rows.
        const deduped = new Map();
        for (const expense of neonExpenses) {
          const key = expense?.receipt_id
            ? `receipt:${expense.receipt_id}`
            : `id:${expense?.id || `${expense?.date || ""}:${expense?.amount || 0}:${expense?.description || ""}`}`;
          if (!deduped.has(key)) deduped.set(key, expense);
        }
        setRecords(Array.from(deduped.values()));
      } else if (entityName === "InventoryCost") {
        const res = await fetch("/api/neon-data?op=inventory", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Neon inventory ${res.status}`);
        const data = await res.json();
        setRecords(Array.isArray(data?.inventory) ? data.inventory : []);
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