// Profit Score — rates each sale against its total costs and fees.
// Margin = profit ÷ sale amount. Fees and marketplace costs are already
// included in each order's stored total_cost.
export function getProfitScore(order) {
  const sale = Number(order?.sale_total);
  const profitRaw = Number(order?.estimated_profit);
  const cost = Number(order?.total_cost);

  const profit = Number.isFinite(profitRaw)
    ? profitRaw
    : (Number.isFinite(sale) ? sale : 0) - (Number.isFinite(cost) ? cost : 0);

  if (Number.isFinite(sale) && sale > 0) {
    const margin = profit / sale;
    if (profit < 0) return { label: "Lost Money", margin };
    if (margin < 0.15) return { label: "Low Profit", margin };
    if (margin < 0.4) return { label: "Good", margin };
    return { label: "Great", margin };
  }

  // Missing or zero imported revenue is incomplete data, not proof of a loss.
  // Do not label marketplace orders as "Lost Money" until a positive sale
  // amount is present and the profit calculation can be evaluated reliably.
  return null;
}