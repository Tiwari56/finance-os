// ════════════════════════════════════════════════════════════════
//  GET /api/history?months=6
//  Aggregates expense + debt-payment logs into monthly buckets.
//  Returns month rows + cross-month trends for charts.
// ════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getState } from "../../../lib/store";
import { auth } from "../../../auth";
import { CATEGORIES, getEnvelopes, getProfile } from "../../../lib/finance";

export const dynamic = "force-dynamic";

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(d) {
  return d.toLocaleString("en-IN", { month: "short", year: "numeric" });
}

export async function GET(req) {
  const url = new URL(req.url);
  const monthsBack = Math.max(1, Math.min(36, Number(url.searchParams.get("months")) || 6));

  const session = await auth();
  const state = await getState(session?.user?.id ?? null);
  const envelopes = getEnvelopes(state);
  const profile   = getProfile(state);
  const envelopeOf = (cat) => CATEGORIES[cat]?.envelope || "freedom";

  // Build month buckets from oldest → newest
  const now = new Date();
  const buckets = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.getTime();
    const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
    buckets.push({
      key:   monthKey(d),
      label: monthLabel(d),
      start, end,
      isCurrent: i === 0,
      spent:        0,
      debtPaid:     0,
      expenseCount: 0,
      byEnvelope:   {},
      byCategory:   {},
      topMerchants: {},
    });
  }
  envelopes.forEach(env => buckets.forEach(b => { b.byEnvelope[env.id] = 0; }));

  // Distribute expenses into buckets
  for (const e of state.expenses) {
    const b = buckets.find(b => e.ts >= b.start && e.ts < b.end);
    if (!b) continue;
    b.spent += e.amount;
    b.expenseCount += 1;
    b.byEnvelope[envelopeOf(e.category)] = (b.byEnvelope[envelopeOf(e.category)] || 0) + e.amount;
    b.byCategory[e.category] = (b.byCategory[e.category] || 0) + e.amount;
    if (e.merchant) b.topMerchants[e.merchant] = (b.topMerchants[e.merchant] || 0) + e.amount;
  }

  // Distribute debt payments
  for (const p of state.debtPayments) {
    const b = buckets.find(b => p.ts >= b.start && p.ts < b.end);
    if (b) b.debtPaid += p.amount;
  }

  // Finalize each bucket — sort and shape categories/merchants
  const months = buckets.map(b => ({
    ...b,
    topCategories: Object.entries(b.byCategory)
      .sort((a, c) => c[1] - a[1])
      .slice(0, 5)
      .map(([cat, total]) => ({
        cat,
        label: CATEGORIES[cat]?.label || cat,
        icon:  CATEGORIES[cat]?.icon || "📦",
        total,
      })),
    topMerchants: Object.entries(b.topMerchants)
      .sort((a, c) => c[1] - a[1])
      .slice(0, 5)
      .map(([name, total]) => ({ name, total })),
  }));

  // Trends — arrays in chronological order, ready for charts
  const trends = {
    months:    months.map(m => m.label),
    totalSpent: months.map(m => m.spent),
    debtPaid:  months.map(m => m.debtPaid),
    byEnvelope: {},
  };
  envelopes.forEach(env => {
    trends.byEnvelope[env.id] = {
      label: env.label,
      icon:  env.icon,
      data:  months.map(m => m.byEnvelope[env.id] || 0),
    };
  });

  // Stats — averages, comparisons
  const completedMonths = months.filter(m => !m.isCurrent);
  const avgSpent    = completedMonths.length ? Math.round(completedMonths.reduce((s, m) => s + m.spent, 0) / completedMonths.length) : 0;
  const avgDebtPaid = completedMonths.length ? Math.round(completedMonths.reduce((s, m) => s + m.debtPaid, 0) / completedMonths.length) : 0;
  const totalAcross = months.reduce((s, m) => s + m.spent, 0);

  const currentMonth  = months[months.length - 1];
  const previousMonth = months[months.length - 2];

  return NextResponse.json({
    generatedAt: now.toISOString(),
    monthsBack,
    profile: { income: profile.income, name: profile.name },
    months,
    trends,
    stats: {
      avgSpent,
      avgDebtPaid,
      totalAcross,
      currentVsPrev: (currentMonth && previousMonth) ? {
        spent:    currentMonth.spent - previousMonth.spent,
        debtPaid: currentMonth.debtPaid - previousMonth.debtPaid,
      } : null,
      currentVsAvg: (currentMonth && avgSpent > 0) ? {
        spent: currentMonth.spent - avgSpent,
      } : null,
    },
  });
}
