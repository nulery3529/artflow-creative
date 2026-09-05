import React, { useMemo, useState } from "react";
import { Minus, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import { formatMoney } from "@/lib/format";
import { calculateUnitCost as calcUnit } from "@/lib/orderCost";
import { toast } from "sonner";
import InventoryEditSheet from "@/components/InventoryEditSheet";
import PullToRefresh from "@/components/PullToRefresh";
import PageHeader from "@/components/PageHeader";
import { useModalRoute } from "@/hooks/useModalRoute";
import { Image } from "@/components/ui/image";

export default function Inventory() {
  const { records, loading, reload: reloadInventory } = useEntity("InventoryCost", "-created_date");
  const [editRecord, setEditRecord] = useState(null);
  const { isOpen: formOpen, open: openForm, close: closeForm } = useModalRoute();
  const [filter, setFilter] = useState("All");
  const [overrides, setOverrides] = useState({});
  const [deletingId, setDeletingId] = useState(null);

  const refresh = async () => { await reloadInventory(); };

  const adjustQty = async (rec, delta) => {
    const newQty = Math.max(0, (rec.quantity_on_hand || 0) + delta);
    const prev = overrides[rec.id] || rec;
    setOverrides((o) => ({ ...o, [rec.id]: { ...prev, quantity_on_hand: newQty } }));
    try {
      const response = await fetch("/api/neon-data?op=inventory", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: rec.id, quantity_on_hand: newQty }),
      });
      if (!response.ok) throw new Error("Inventory update failed");
      window.dispatchEvent(new CustomEvent("artflow:data-synced"));
    } catch (e) {
      setOverrides((o) => {
        const next = { ...o };
        delete next[rec.id];
        return next;
      });
      toast.error("Could not update quantity");
    }
  };

  const deleteItem = async (rec) => {
    const title = rec.name || rec.size || "this item";
    const confirmed = window.confirm(
      `Delete ${title} from inventory? This removes the inventory item only. Past orders and expenses will stay unchanged.`
    );
    if (!confirmed) return;

    setDeletingId(rec.id);
    try {
      const response = await fetch("/api/neon-data?op=inventory", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: rec.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Inventory delete failed");
      setOverrides((current) => {
        const next = { ...current };
        delete next[rec.id];
        return next;
      });
      await reloadInventory();
      toast.success(`${title} removed from inventory`);
    } catch (e) {
      toast.error("Could not delete inventory item", { description: e?.message });
    } finally {
      setDeletingId(null);
    }
  };

  const openCreate = () => {
    setEditRecord(null);
    openForm();
  };

  const openEdit = (rec) => {
    setEditRecord(rec);
    openForm();
  };

  const displayRecords = records.map((r) => overrides[r.id] || r);
  const counts = useMemo(() => {
    const packaging = displayRecords.filter((r) => (r.category || "") === "Packaging").length;
    return {
      All: displayRecords.length,
      Packaging: packaging,
      Supplies: displayRecords.length - packaging,
    };
  }, [displayRecords]);
  const filtered = displayRecords.filter((r) => {
    if (filter === "All") return true;
    if (filter === "Packaging") return (r.category || "") === "Packaging";
    if (filter === "Supplies") return (r.category || "") !== "Packaging";
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Inventory" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-3xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PullToRefresh onRefresh={refresh} />
      <PageHeader title="Inventory" subtitle="Stock across all categories" />

      <div className="grid grid-cols-3 gap-2">
        {[
          { key: "All", label: "ALL", count: counts.All },
          { key: "Packaging", label: "PACKAGING", count: counts.Packaging },
          { key: "Supplies", label: "SUPPLIES", count: counts.Supplies },
        ].map((q) => {
          const active = filter === q.key;
          return (
            <button
              key={q.key}
              onClick={() => setFilter(q.key)}
              className={`flex flex-col items-center justify-center h-16 rounded-2xl border transition-colors ${
                active
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
                  : "bg-card text-foreground border-[hsl(var(--border))]"
              }`}
            >
              <span className="text-xs font-bold tracking-wide">
                {q.label}
              </span>
              <span className="text-xl font-heading leading-tight">{q.count}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="bg-card rounded-2xl p-5 border border-dashed border-[hsl(var(--border))] text-center text-sm text-muted-foreground">
            No items here — tap + to add inventory
          </div>
        )}
        {filtered.map((rec) => {
          const qty = rec.quantity_on_hand || 0;
          const low = rec.low_stock_level || 0;
          const out = qty <= 0;
          const lowStock = !out && qty <= low;
          const unitCost = calcUnit(rec);
          const title = rec.name || rec.size || "Unnamed item";
          const cat = rec.category || "Frame";
          const cardTone = out
            ? "bg-[hsl(var(--destructive))]/10 border-[hsl(var(--destructive))]/30"
            : lowStock
            ? "pastel-yellow border-amber-300"
            : "bg-card border-[hsl(var(--border))]";

          return (
            <div
              key={rec.id}
              className={`${cardTone} rounded-3xl p-5 border transition-colors`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  {rec.image_url && (
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-[hsl(var(--border))] shrink-0 bg-muted">
                      <Image src={rec.image_url} fittingType="fill" className="w-full h-full" />
                    </div>
                  )}
                  <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-muted text-muted-foreground">
                      {cat}
                    </span>
                    {rec.size && cat !== "Frame" && (
                      <span className="text-[11px] text-foreground">{rec.size}</span>
                    )}
                  </div>
                  <p className="font-heading text-xl truncate text-foreground">{title}</p>
                  <p className="text-xs text-foreground">
                    Base {formatMoney(rec.base_item_cost)} · Unit cost {formatMoney(unitCost)}
                  </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => deleteItem(rec)}
                    disabled={deletingId === rec.id}
                    className="w-11 h-11 rounded-full bg-white/70 border border-rose-200 flex items-center justify-center disabled:opacity-60"
                    aria-label={`Delete ${title}`}
                    title="Delete inventory item"
                  >
                    {deletingId === rec.id ? (
                      <Loader2 className="w-4 h-4 text-rose-600 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-rose-600" />
                    )}
                  </button>
                  <button
                    onClick={() => openEdit(rec)}
                    disabled={deletingId === rec.id}
                    className="w-11 h-11 rounded-full bg-white/70 flex items-center justify-center"
                    aria-label="Edit"
                  >
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                    On Hand
                  </p>
                  <p className="font-heading text-2xl text-foreground">{qty}</p>
                  {out && (
                    <span className="text-xs font-semibold text-rose-600">Out of stock</span>
                  )}
                  {lowStock && (
                    <span className="text-xs font-semibold text-amber-600">Low stock</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => adjustQty(rec, -1)}
                    className="w-11 h-11 rounded-full bg-white border border-[hsl(var(--border))] flex items-center justify-center active:scale-90 transition-transform"
                    aria-label="Decrease"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => adjustQty(rec, 1)}
                    className="w-11 h-11 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center active:scale-90 transition-transform"
                    aria-label="Increase"
                  >
                    <Plus className="w-5 h-5" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={openCreate}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary))]/40 flex items-center justify-center active:scale-95 transition-transform z-30"
        style={{ left: "50%", transform: "translateX(calc(50vw - 2.75rem - 1.25rem))" }}
        aria-label="Add inventory"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

      <InventoryEditSheet
        open={formOpen}
        onClose={closeForm}
        record={editRecord}
      />
    </div>
  );
}