import React, { useState } from "react";
import { Check, Inbox, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { neonEntities } from "@/lib/neonEntityClient";
import { formatMoney, formatDate } from "@/lib/format";

// Imported expense receipts wait here until the owner approves them.
// Approved expenses count toward business totals; deleted ones are removed.
export default function ExpenseReviewQueue({ pending }) {
  const [busy, setBusy] = useState("");

  if (!pending.length) return null;

  const act = async (record, action) => {
    const key = `${action}:${record.id}`;
    setBusy(key);
    try {
      if (action === "approve") {
        await neonEntities.approve("Expense", record.id);
        toast.success("Expense approved", {
          description: "It now counts toward your business expenses.",
        });
      } else {
        await neonEntities.delete("Expense", record.id);
        toast.success("Expense removed", {
          description: "It will not count toward your business expenses.",
        });
      }
    } catch (error) {
      toast.error(
        action === "approve" ? "Could not approve expense" : "Could not delete expense",
        { description: error?.message }
      );
    } finally {
      setBusy("");
    }
  };

  const pendingTotal = pending.reduce((sum, e) => {
    const amount = Number(e.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  return (
    <section className="pastel-yellow rounded-3xl p-5 border border-[hsl(var(--border))] space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-foreground" />
            <p className="font-heading text-base text-foreground">Needs your review</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Imported expense receipts wait here until you approve them. Nothing is counted
            as a business expense until you say so.
          </p>
        </div>
        <span className="shrink-0 px-2.5 h-6 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-[11px] font-semibold flex items-center">
          {pending.length}
        </span>
      </div>

      <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
        <span>Waiting to be approved</span>
        <span className="font-semibold text-foreground">{formatMoney(pendingTotal)}</span>
      </div>

      <div className="space-y-2">
        {pending.map((e) => {
          const approveKey = `approve:${e.id}`;
          const deleteKey = `delete:${e.id}`;
          return (
            <div
              key={e.id}
              className="bg-card rounded-2xl p-4 border border-[hsl(var(--border))] flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{e.description || e.category || "Expense"}</p>
                <p className="text-xs text-muted-foreground">
                  {e.category || "Uncategorized"} ·{" "}
                  <span className="text-foreground">{formatDate(e.date)}</span>
                </p>
                <p className="font-heading text-base mt-1">{formatMoney(e.amount)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => act(e, "approve")}
                  disabled={!!busy}
                  aria-label="Approve expense"
                  className="w-11 h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
                >
                  {busy === approveKey ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Check className="w-5 h-5" strokeWidth={2.5} />
                  )}
                </button>
                <button
                  onClick={() => act(e, "delete")}
                  disabled={!!busy}
                  aria-label="Delete expense"
                  className="w-11 h-11 rounded-2xl bg-muted text-foreground flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
                >
                  {busy === deleteKey ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Trash2 className="w-5 h-4 text-destructive" strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}