import { neonEntities } from "@/lib/neonEntityClient";

const monthOf = (date) => String(date || "").slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

const occurrenceDate = (sourceDate, yearMonth) => {
  const day = Number(String(sourceDate || "").slice(8, 10)) || 1;
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yearMonth}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};

const nextMonth = (yearMonth) => {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
};

/**
 * Creates any missing monthly occurrences for recurring expense series.
 * Runs client-side when the Expenses page loads; safe to call repeatedly.
 */
export async function materializeRecurringExpenses(records) {
  const now = today();
  const currentMonth = now.slice(0, 7);
  const series = new Map();

  (records || []).forEach((r) => {
    if (r?.data?.recurring !== "monthly" || !r.data.recurring_series_id) return;
    const list = series.get(r.data.recurring_series_id) || [];
    list.push(r);
    series.set(r.data.recurring_series_id, list);
  });

  const toCreate = [];
  series.forEach((occurrences, seriesId) => {
    const source = occurrences.find((r) => r.description) || occurrences[0];
    if (!source?.date) return;
    const latestMonth = occurrences.reduce(
      (max, r) => (monthOf(r.date) > max ? monthOf(r.date) : max),
      monthOf(source.date)
    );
    let ym = nextMonth(latestMonth);
    let guard = 0;
    while (ym <= currentMonth && guard < 24) {
      const date = occurrenceDate(source.date, ym);
      if (date <= now) {
        toCreate.push({
          business_id: source.business_id || null,
          date,
          description: source.description,
          category: source.category,
          amount: Number(source.amount) || 0,
          deductible_percent: source.deductible_percent ?? 100,
          deductible_amount: source.deductible_amount ?? null,
          notes: source.notes || null,
          source: "recurring",
          data: { recurring: "monthly", recurring_series_id: seriesId },
        });
      }
      ym = nextMonth(ym);
      guard += 1;
    }
  });

  for (const payload of toCreate) {
    await neonEntities.create("Expense", payload);
  }
  return toCreate.length;
}