import React from "react";
import { getProfitScore } from "@/lib/profitScore";

const TONES = {
  "Great": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "Good": "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  "Low Profit": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "Lost Money": "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

export default function ProfitScoreBadge({ order }) {
  const score = getProfitScore(order);
  if (!score) return null;

  const pct = Number.isFinite(score.margin) ? Math.round(score.margin * 100) : null;

  return (
    <span
      title={pct === null ? score.label : `${score.label} — ${pct}% profit margin`}
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${TONES[score.label]}`}
    >
      {score.label}
    </span>
  );
}