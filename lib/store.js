// ════════════════════════════════════════════════════════════════
//  lib/store.js — DB-backed read bridge (Vercel-safe)
//
//  Reads the libSQL database (Turso in production, local file in dev)
//  and assembles the legacy JSON-shaped state object that the older
//  routes (advisor, summary, history, send-report, state, health)
//  still depend on.
//
//  Uses @libsql/client — same client as the rest of the app. Works
//  identically locally (file:./data/finance.db) and on Vercel with
//  Turso (libsql://...). No native better-sqlite3, no filesystem
//  writes, no SIGSEGV on Vercel build images.
//
//  All writes are no-ops — callers should hit feature actions
//  (POST /api/<feature>/<action>) which use Drizzle.
// ════════════════════════════════════════════════════════════════

import { createClient } from "@libsql/client";

let client = null;
function getClient() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL ?? "file:./data/finance.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;
  client = createClient(authToken ? { url, authToken } : { url });
  return client;
}

async function all(sql) {
  const c = getClient();
  const res = await c.execute(sql);
  return res.rows ?? [];
}
async function one(sql) {
  const rows = await all(sql);
  return rows[0] ?? null;
}

function num(v, fallback = 0) {
  if (v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ─── Public API ───────────────────────────────────────────────────
export async function getState() {
  // Try a cheap probe — if the DB has no tables (fresh install on Vercel
  // before migration), fall back to an empty state so the dashboard
  // can render its DBNotReady banner.
  let probe;
  try {
    probe = await one("SELECT name FROM sqlite_master WHERE type='table' AND name='expenses' LIMIT 1");
  } catch (err) {
    console.warn("[lib/store] DB unreachable:", err.message);
    return emptyState();
  }
  if (!probe) return emptyState();

  // Parallel reads
  const [
    profileRow, flagsRow,
    envelopeRows, billRows, goalRows, debtRows,
    expenseRows, debtPaymentRows, iouRows, goalContribRows,
  ] = await Promise.all([
    one("SELECT * FROM profile LIMIT 1"),
    one("SELECT * FROM flags LIMIT 1"),
    all('SELECT * FROM envelopes ORDER BY "order"'),
    all('SELECT * FROM bills WHERE active = 1 ORDER BY "order"'),
    all("SELECT * FROM goals"),
    all('SELECT * FROM debts ORDER BY "order"'),
    all("SELECT * FROM expenses ORDER BY ts ASC"),
    all("SELECT * FROM debt_payments ORDER BY ts ASC"),
    all("SELECT * FROM ious ORDER BY ts ASC"),
    all("SELECT goal_id, SUM(amount) AS total FROM goal_contributions GROUP BY goal_id"),
  ]);

  const envelopes = envelopeRows.map(r => ({
    id:     r.id,
    label:  r.label,
    amount: num(r.amount),
    icon:   r.icon,
    locked: !!r.locked,
    desc:   r.desc,
  }));
  const bills = billRows.map(r => ({
    id:       r.id,
    label:    r.label,
    amount:   num(r.amount),
    dueDay:   num(r.due_day, 1),
    category: r.category,
    icon:     r.icon,
  }));
  const goalsList = goalRows.map(r => ({
    id:     r.id,
    label:  r.label,
    needed: num(r.needed),
    icon:   r.icon,
  }));
  const debts = debtRows.map(r => ({
    id:      r.id,
    name:    r.name,
    balance: num(r.balance),
    rate:    num(r.rate),
    emi:     num(r.emi),
    color:   r.color,
    type:    r.type,
  }));
  const expenses = expenseRows.map(r => ({
    id:               r.id,
    ts:               num(r.ts),
    amount:           num(r.amount),
    category:         r.category,
    merchant:         r.merchant ?? "",
    source:           r.source ?? "manual",
    currency:         r.currency ?? "INR",
    accountSuffix:    r.account_suffix ?? undefined,
    clientRequestId:  r.client_request_id ?? undefined,
    note:             r.note ?? undefined,
  }));
  const debtPayments = debtPaymentRows.map(r => ({
    id:        r.id,
    ts:        num(r.ts),
    debtId:    r.debt_id,
    amount:    num(r.amount),
    note:      r.note ?? undefined,
    expenseId: r.expense_id ?? undefined,
  }));
  const ious = iouRows.map(r => ({
    id:        r.id,
    name:      r.name,
    amount:    num(r.amount),
    ts:        num(r.ts),
    note:      r.note ?? undefined,
    settledTs: r.settled_ts ?? null,
  }));

  const goalSavings = { renovation: 0 };
  for (const r of goalContribRows) {
    const key = r.goal_id === "renovationImmediate" ? "renovation" : r.goal_id;
    goalSavings[key] = num(r.total);
  }

  const profile = profileRow ? {
    name:      profileRow.name ?? "Nishit",
    income:    num(profileRow.income, 180000),
    salaryDay: num(profileRow.salary_day, 1),
  } : { name: "Nishit", income: 180000, salaryDay: 1 };

  const flags = flagsRow ? {
    envelopesSetup:  !!flagsRow.envelopes_setup,
    salaryReceived:  !!flagsRow.salary_received,
    lastSalaryMonth: flagsRow.last_salary_month ?? null,
  } : { envelopesSetup: false, salaryReceived: false, lastSalaryMonth: null };

  return {
    debts,
    expenses,
    debtPayments,
    ious,
    goalSavings,
    config: {
      profile,
      envelopes,
      bills,
      goals: {
        renovationImmediate: goalsList.find(g => g.id === "renovationImmediate") ?? { id: "renovationImmediate", label: "Tile work (immediate)", needed: 200000, icon: "🧱" },
        renovationFull:      goalsList.find(g => g.id === "renovationFull")      ?? { id: "renovationFull", label: "Full renovation", needed: 600000, icon: "🏗️" },
      },
    },
    flags,
    rulesStreak: 0,
    history: [],
    migrations: { splitFriends: true, linkDebtExpenses: true },
    createdAt: Date.now(),
  };
}

// Legacy writes are no-ops — callers should hit feature actions instead.
export async function setState(_next) {
  console.warn("[lib/store] setState() is read-only in the DB-backed bridge — use feature actions instead.");
  return _next;
}
export async function patchState(_fn) {
  console.warn("[lib/store] patchState() is read-only in the DB-backed bridge — use feature actions instead.");
  return getState();
}

export async function getStorageInfo() {
  const url = process.env.TURSO_DATABASE_URL ?? "file:./data/finance.db";
  const isTurso = url.startsWith("libsql://") || url.startsWith("https://");
  try {
    const probe = await one("SELECT COUNT(*) AS n FROM expenses");
    const n = probe ? num(probe.n) : 0;
    return {
      backend:    isTurso ? "turso" : "sqlite",
      persistent: true,
      url:        isTurso ? new URL(url).host : url,
      records:    { expenses: n },
    };
  } catch (err) {
    return {
      backend:    "unknown",
      persistent: false,
      error:      err.message,
    };
  }
}

function emptyState() {
  return {
    debts: [], expenses: [], debtPayments: [], ious: [],
    goalSavings: { renovation: 0 },
    config: {
      profile: { name: "Nishit", income: 180000, salaryDay: 1 },
      envelopes: [],
      bills: [],
      goals: {
        renovationImmediate: { id: "renovationImmediate", label: "Tile work (immediate)", needed: 200000, icon: "🧱" },
        renovationFull:      { id: "renovationFull", label: "Full renovation", needed: 600000, icon: "🏗️" },
      },
    },
    flags: { envelopesSetup: false, salaryReceived: false, lastSalaryMonth: null },
    rulesStreak: 0, history: [], migrations: {},
    createdAt: Date.now(),
  };
}
