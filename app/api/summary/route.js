// ════════════════════════════════════════════════════════════════
//  GET  /api/summary          → daily + weekly + monthly digest
//  GET  /api/summary?period=daily   → daily only
//  GET  /api/summary?period=weekly  → weekly only
//  GET  /api/summary?format=text    → plain-text message (WhatsApp/Telegram ready)
//  Auth: pass ?secret=LOG_SECRET if LOG_SECRET env var is set
// ════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getState } from "../../../lib/store";
import {
  avalanche, dailyAllowance, coachVerdict,
  getDailyFlexBudget,
  CATEGORIES, fmt, fmtL,
} from "../../../lib/finance";

export const dynamic = "force-dynamic";

import { timingSafeEqual } from "node:crypto";

function secretsMatch(provided, expected) {
  const a = Buffer.from(String(provided || ""), "utf8");
  const b = Buffer.from(String(expected),       "utf8");
  const maxLen = Math.max(a.length, b.length, 1);
  const aPad = Buffer.alloc(maxLen);
  const bPad = Buffer.alloc(maxLen);
  a.copy(aPad); b.copy(bPad);
  return timingSafeEqual(aPad, bPad) && a.length === b.length;
}

// Same-origin browser requests (Reports tab) → allowed without secret.
// Anything else (curl, external bot, cross-origin) → must pass ?secret= when set.
function authed(req) {
  const expected = process.env.LOG_SECRET;
  if (!expected) return true;

  const url = new URL(req.url);
  const origin  = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const isBrowserSameOrigin =
       (origin  && origin === url.origin)
    || (referer && (() => { try { return new URL(referer).origin === url.origin; } catch { return false; } })());
  if (isBrowserSameOrigin) return true;

  return secretsMatch(url.searchParams.get("secret") || "", expected);
}

// ─── helpers ──────────────────────────────────────────────────────

function flexCatKeys() {
  return Object.entries(CATEGORIES)
    .filter(([, c]) => c.envelope === "food" || c.envelope === "freedom")
    .map(([k]) => k);
}

function startOf(date, unit) {
  const d = new Date(date);
  if (unit === "day")  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (unit === "week") {
    // Monday as week start
    const day = d.getDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1 - day);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff).getTime();
  }
  if (unit === "month") return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function groupByCategory(expenses) {
  const map = {};
  for (const e of expenses) {
    map[e.category] = (map[e.category] || 0) + e.amount;
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, total]) => ({ cat, label: CATEGORIES[cat]?.label || cat, icon: CATEGORIES[cat]?.icon || "📦", total }));
}

function groupByDay(expenses, fromTs) {
  const map = {};
  for (const e of expenses) {
    if (e.ts < fromTs) continue;
    const d = new Date(e.ts);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    map[key] = (map[key] || 0) + e.amount;
  }
  return Object.entries(map).sort().map(([date, total]) => ({ date, total }));
}

// ─── daily snapshot ───────────────────────────────────────────────
function buildDaily(state, now) {
  const flex = flexCatKeys();
  const dailyFlexBudget = getDailyFlexBudget(state);
  const dayStart = startOf(now, "day");
  const monthStart = startOf(now, "month");

  const monthFlexSpent = state.expenses
    .filter(e => e.ts >= monthStart && flex.includes(e.category))
    .reduce((s, e) => s + e.amount, 0);
  const todayAll = state.expenses.filter(e => e.ts >= dayStart);
  const todayFlex = todayAll.filter(e => flex.includes(e.category));
  const todaySpent = todayFlex.reduce((s, e) => s + e.amount, 0);

  const allowance = dailyAllowance(dailyFlexBudget, monthFlexSpent, now);
  const verdicts = coachVerdict({ allowance, todaySpent, monthSpent: monthFlexSpent, flexBudget: dailyFlexBudget });
  const topVerdict = verdicts[0];

  return {
    date: now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }),
    allowance: {
      perDay: allowance.perDay,
      remaining: Math.max(0, allowance.perDay - todaySpent),
      daysLeft: allowance.daysLeft,
    },
    todaySpent,
    todayExpenses: todayAll.slice().reverse().map(e => ({
      merchant: e.merchant || CATEGORIES[e.category]?.label || e.category,
      amount: e.amount,
      category: e.category,
      icon: CATEGORIES[e.category]?.icon || "📦",
    })),
    byCategory: groupByCategory(todayFlex),
    monthProgress: {
      pctMonthGone: allowance.pctMonthGone,
      pctBudgetGone: allowance.pctBudgetGone,
      monthFlexSpent,
      flexBudget: dailyFlexBudget,
      remaining: allowance.remaining,
    },
    verdict: {
      level: topVerdict.level,
      title: topVerdict.title,
      body: topVerdict.body,
    },
    totalDebt: state.debts.reduce((s, d) => s + d.balance, 0),
  };
}

// ─── weekly snapshot ──────────────────────────────────────────────
function buildWeekly(state, now) {
  const flex = flexCatKeys();
  const dailyFlexBudget = getDailyFlexBudget(state);
  const weekStart = startOf(now, "week");
  const prevWeekStart = weekStart - 7 * 86400000;

  const thisWeekExp = state.expenses.filter(e => e.ts >= weekStart);
  const prevWeekExp = state.expenses.filter(e => e.ts >= prevWeekStart && e.ts < weekStart);

  const thisTotal = thisWeekExp.reduce((s, e) => s + e.amount, 0);
  const prevTotal = prevWeekExp.reduce((s, e) => s + e.amount, 0);
  const thisFlex  = thisWeekExp.filter(e => flex.includes(e.category)).reduce((s, e) => s + e.amount, 0);
  const prevFlex  = prevWeekExp.filter(e => flex.includes(e.category)).reduce((s, e) => s + e.amount, 0);

  const weekBudget = Math.round((dailyFlexBudget / 30) * 7);
  const daysIntoWeek = Math.min(7, Math.max(1, Math.floor((now - weekStart) / 86400000) + 1));
  const expectedByNow = Math.round((weekBudget / 7) * daysIntoWeek);

  const debtPaidThisWeek = state.debtPayments
    .filter(p => p.ts >= weekStart)
    .reduce((s, p) => s + p.amount, 0);

  return {
    weekOf: new Date(weekStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) +
            " – " + new Date(weekStart + 6 * 86400000).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    thisFlex,
    prevFlex,
    weekBudget,
    expectedByNow,
    vsExpected: thisFlex - expectedByNow,
    vsPrevWeek: thisFlex - prevFlex,
    totalSpent: thisTotal,
    daysIntoWeek,
    byCategory: groupByCategory(thisWeekExp.filter(e => flex.includes(e.category))),
    dailyBreakdown: groupByDay(thisWeekExp.filter(e => flex.includes(e.category)), weekStart),
    topMerchants: Object.entries(
      thisWeekExp.reduce((m, e) => { if (e.merchant) m[e.merchant] = (m[e.merchant] || 0) + e.amount; return m; }, {})
    ).sort((a,b) => b[1]-a[1]).slice(0,5).map(([name, total]) => ({ name, total })),
    debtPaidThisWeek,
  };
}

// ─── plain-text formatter ─────────────────────────────────────────
function toText(daily, weekly, now) {
  const emoji = { danger: "🔴", warning: "🟡", good: "🟢" };
  const arrow = weekly.vsPrevWeek > 0 ? "▲" : weekly.vsPrevWeek < 0 ? "▼" : "—";
  const vsSign = weekly.vsExpected >= 0 ? "+" : "";

  const lines = [
    `📊 *Steady — ${now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}*`,
    ``,
    `━━━ TODAY ━━━`,
    `💰 Allowance left: *${fmt(daily.allowance.remaining)}* of ${fmt(daily.allowance.perDay)}`,
    `📅 ${daily.allowance.daysLeft} days to payday · ${daily.monthProgress.pctMonthGone}% month gone`,
    `🔥 Budget used: ${daily.monthProgress.pctBudgetGone}% (${fmt(daily.monthProgress.monthFlexSpent)} of ${fmt(daily.monthProgress.flexBudget)})`,
    ``,
    `${emoji[daily.verdict.level]} *${daily.verdict.title}*`,
    `${daily.verdict.body}`,
    ``,
  ];

  if (daily.todayExpenses.length > 0) {
    lines.push(`Today's log (${daily.todayExpenses.length} entries):`);
    daily.todayExpenses.slice(0, 8).forEach(e => {
      lines.push(`  ${e.icon} ${e.merchant} — ${fmt(e.amount)}`);
    });
    if (daily.todayExpenses.length > 8) lines.push(`  … +${daily.todayExpenses.length - 8} more`);
    lines.push(``);
  } else {
    lines.push(`No expenses logged today yet.`, ``);
  }

  lines.push(
    `━━━ THIS WEEK ━━━`,
    `📆 ${weekly.weekOf} (day ${weekly.daysIntoWeek}/7)`,
    `💸 Flex spent: *${fmt(weekly.thisFlex)}* / ${fmt(weekly.weekBudget)} budget`,
    `   vs expected by now: ${vsSign}${fmt(weekly.vsExpected)} ${weekly.vsExpected > 0 ? "over" : "under"}`,
    `   vs last week: ${arrow} ${fmt(Math.abs(weekly.vsPrevWeek))}`,
    ``,
  );

  if (weekly.byCategory.length > 0) {
    lines.push(`By category:`);
    weekly.byCategory.forEach(c => {
      lines.push(`  ${c.icon} ${c.label}: ${fmt(c.total)}`);
    });
    lines.push(``);
  }

  if (weekly.dailyBreakdown.length > 0) {
    lines.push(`Daily breakdown:`);
    weekly.dailyBreakdown.forEach(d => {
      const bar = "█".repeat(Math.min(12, Math.round((d.total / (weekly.weekBudget / 7)) * 6)));
      lines.push(`  ${new Date(d.date).toLocaleDateString("en-IN", { weekday: "short" })} ${bar} ${fmt(d.total)}`);
    });
    lines.push(``);
  }

  if (weekly.topMerchants.length > 0) {
    lines.push(`Top merchants: ` + weekly.topMerchants.map(m => `${m.name} (${fmt(m.total)})`).join(", "));
    lines.push(``);
  }

  if (weekly.debtPaidThisWeek > 0) {
    lines.push(`⚔️  Debt paid this week: ${fmt(weekly.debtPaidThisWeek)}`);
    lines.push(``);
  }

  lines.push(
    `💀 Total debt: *${fmtL(daily.totalDebt)}*`,
    ``,
    `_Steady · ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}_`,
  );

  return lines.join("\n");
}

// ─── route ────────────────────────────────────────────────────────
export async function GET(req) {
  if (!authed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const period = url.searchParams.get("period") || "both";   // daily | weekly | both
  const format = url.searchParams.get("format") || "json";   // json | text

  const state = await getState();
  const now = new Date();

  const daily  = (period === "weekly") ? null : buildDaily(state, now);
  const weekly = (period === "daily")  ? null : buildWeekly(state, now);

  if (format === "text") {
    const text = toText(
      daily  || buildDaily(state, now),
      weekly || buildWeekly(state, now),
      now,
    );
    return new NextResponse(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  return NextResponse.json({
    generatedAt: now.toISOString(),
    period,
    ...(daily  && { daily }),
    ...(weekly && { weekly }),
  });
}
