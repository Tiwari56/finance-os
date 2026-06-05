// ════════════════════════════════════════════════════════════════
//  Number / currency formatters used everywhere in the UI.
//  Indian rupee conventions (lakhs).
// ════════════════════════════════════════════════════════════════

/** ₹X with Indian grouping. Negative-safe (always shows absolute value). */
export const fmt = (n: number | null | undefined): string =>
  "₹" + Math.round(Math.abs(Number(n) || 0)).toLocaleString("en-IN");

/** ₹X.XXL for amounts ≥ ₹1,00,000, otherwise the rupee value. */
export const fmtL = (n: number | null | undefined): string => {
  const v = Number(n) || 0;
  return Math.abs(v) >= 100_000 ? "₹" + (v / 100_000).toFixed(2) + "L" : fmt(v);
};

/** % with 0 decimals, always non-negative. */
export const fmtPct = (n: number | null | undefined): string =>
  Math.round(Math.abs(Number(n) || 0)) + "%";

/** Day count helper: ms epoch → start of that day's ms. */
export const startOfDay = (ts: number): number => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
export const startOfMonth = (ts: number): number => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};
/** Monday-based week start. */
export const startOfWeek = (ts: number): number => {
  const d = new Date(ts);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff).getTime();
};
