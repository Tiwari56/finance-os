// ════════════════════════════════════════════════════════════════
//  GET  /api/state  → full current state + computed daily picture
//  POST /api/state  → apply an update from the UI
//      { action: "...", payload: {...} }
// ════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getState, patchState } from "../../../lib/store";
import {
  avalanche, dailyAllowance, coachVerdict, nextAction,
  wholeMoneyView, billsStatus, recommendations,
  getProfile, getEnvelopes, getDailyFlexBudget, defaultConfig,
  CATEGORIES,
} from "../../../lib/finance";

// Token-based fuzzy match: returns the existing debt whose name shares any
// non-trivial token with the input. Used by addExpense(cat=debt) and the
// "relink auto-debts" cleanup action.
const STOPWORDS = new Set([
  "loan","loans","credit","card","cards","emi","payment","payments","pay",
  "the","of","for","to","and","monthly","this","that","forclose","foreclose",
  "prepayment","replayment","repayment","online","app","upi","via","amount",
]);
function tokenize(s) {
  return String(s || "").toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}
function findDebtByName(debts, name) {
  const exact = debts.find(d => d.name.toLowerCase() === String(name).toLowerCase());
  if (exact) return exact;
  const inputTokens = new Set(tokenize(name));
  if (inputTokens.size === 0) return null;
  for (const d of debts) {
    const debtTokens = tokenize(d.name);
    if (debtTokens.some(t => inputTokens.has(t))) return d;
  }
  return null;
}

export const dynamic = "force-dynamic";

function computeDaily(state) {
  const flexCats = Object.entries(CATEGORIES)
    .filter(([, c]) => c.envelope === "food" || c.envelope === "freedom")
    .map(([k]) => k);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const profile         = getProfile(state);
  const envelopes       = getEnvelopes(state);
  const dailyFlexBudget = getDailyFlexBudget(state);

  const monthFlexSpent = state.expenses
    .filter(e => e.ts >= monthStart && flexCats.includes(e.category))
    .reduce((s, e) => s + e.amount, 0);
  const todaySpent = state.expenses
    .filter(e => e.ts >= dayStart && flexCats.includes(e.category))
    .reduce((s, e) => s + e.amount, 0);

  const allowance = dailyAllowance(dailyFlexBudget, monthFlexSpent);
  const verdicts = coachVerdict({ allowance, todaySpent, monthSpent: monthFlexSpent, flexBudget: dailyFlexBudget });
  const action = nextAction({
    debts: state.debts,
    salaryReceived: state.flags.salaryReceived,
    envelopesSetup: state.flags.envelopesSetup,
    monthSpent: monthFlexSpent,
    flexBudget: dailyFlexBudget,
  });

  const totalDebtEmi = state.debts.reduce((s, d) => s + (d.emi || 0), 0);
  // debtMonthly = income minus locked/flex envelopes (survival + sip + emergency + flex)
  const envAmt = (id) => envelopes.find(e => e.id === id)?.amount || 0;
  const debtMonthly = profile.income - envAmt("survival") - dailyFlexBudget - envAmt("sip") - envAmt("emergency");
  const proj = avalanche(state.debts, Math.max(totalDebtEmi, debtMonthly));

  const view  = wholeMoneyView(state, now);
  const bills = billsStatus(state, now);
  const recs  = recommendations(state, view, bills, now);

  // ─── Debt summary (split by type + this month payments) ──────
  const byType = { cc: 0, formal: 0, friend: 0 };
  for (const d of state.debts) {
    if (d.balance <= 0) continue;
    byType[d.type] = (byType[d.type] || 0) + d.balance;
  }
  const monthPaymentsByDebt = {};
  for (const p of state.debtPayments) {
    if (p.ts < monthStart) continue;
    monthPaymentsByDebt[p.debtId] = (monthPaymentsByDebt[p.debtId] || 0) + p.amount;
  }
  const monthPaidByType = { cc: 0, formal: 0, friend: 0 };
  for (const p of state.debtPayments) {
    if (p.ts < monthStart) continue;
    const debt = state.debts.find(d => d.id === p.debtId);
    if (debt) monthPaidByType[debt.type] = (monthPaidByType[debt.type] || 0) + p.amount;
  }
  // Friend tags: include outstanding AND any settled friend who received a
  // payment this month (so they show up as ✓ paid-off chips, not just vanish).
  const friendDetails = state.debts
    .filter(d => d.type === "friend")
    .map(d => ({
      id: d.id,
      name: d.name,
      balance: d.balance,
      color: d.color,
      paidThisMonth: monthPaymentsByDebt[d.id] || 0,
      settled: d.balance <= 0 && (monthPaymentsByDebt[d.id] || 0) > 0,
    }))
    .filter(f => f.balance > 0 || f.paidThisMonth > 0)
    .sort((a, b) => {
      // outstanding first (by balance desc), then settled (by paid desc)
      if (a.settled && !b.settled) return 1;
      if (!a.settled && b.settled) return -1;
      return (b.balance - a.balance) || (b.paidThisMonth - a.paidThisMonth);
    });
  const debtSummary = {
    totalOutstanding: state.debts.reduce((s, d) => s + Math.max(0, d.balance), 0),
    byType,
    friendDetails,
    monthPaidTotal: state.debtPayments.filter(p => p.ts >= monthStart).reduce((s, p) => s + p.amount, 0),
    monthPaidByType,
    monthPaymentsByDebt,
  };

  // ─── IOU summary (money owed TO you) ─────────────────────────
  const ious = state.ious || [];
  const open = ious.filter(i => !i.settledTs);
  const settled = ious.filter(i => i.settledTs);
  const settledThisMonth = settled.filter(i => i.settledTs >= monthStart);
  const iouSummary = {
    totalOpen:        open.reduce((s, i) => s + i.amount, 0),
    openCount:        open.length,
    totalSettledMonth: settledThisMonth.reduce((s, i) => s + i.amount, 0),
    open:             open.sort((a, b) => a.ts - b.ts),
    settled:          settled.sort((a, b) => b.settledTs - a.settledTs).slice(0, 20),
  };

  return { allowance, todaySpent, monthFlexSpent, verdicts, action, proj, totalDebtEmi, view, bills, recs, debtSummary, iouSummary };
}

// Helper: ensure state.config exists (backfills for old persisted states)
function ensureConfig(s) {
  if (!s.config) s.config = defaultConfig();
  if (!s.config.profile)   s.config.profile   = defaultConfig().profile;
  if (!s.config.envelopes) s.config.envelopes = defaultConfig().envelopes;
  if (!s.config.bills)     s.config.bills     = defaultConfig().bills;
  if (!s.config.goals)     s.config.goals     = defaultConfig().goals;
}

export async function GET() {
  const state = await getState();
  return NextResponse.json({ state, computed: computeDaily(state) });
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { action, payload } = body;

  const next = await patchState(s => {
    switch (action) {
      case "addExpense": {
        const expenseEntry = {
          id: "exp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          ts: payload.ts || Date.now(),
          amount: Number(payload.amount) || 0,
          category: payload.category || "other",
          merchant: payload.merchant || "",
          source: "manual",
        };
        s.expenses.push(expenseEntry);

        // If this is a debt payment, auto-create a paired debtPayment so it
        // shows up in the Debt Summary card. Uses fuzzy matching — "axis emi"
        // links to "Axis Personal Loan". Only creates a new friend debt when
        // nothing meaningful matches.
        if (expenseEntry.category === "debt" && expenseEntry.merchant) {
          const merchant = expenseEntry.merchant.trim();
          let debt = findDebtByName(s.debts, merchant);
          if (!debt) {
            debt = {
              id: "f_" + merchant.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) + "_" + Math.random().toString(36).slice(2, 5),
              name: merchant,
              balance: 0,
              rate: 0, emi: 0,
              color: "#9F77DD",
              type: "friend",
            };
            s.debts.push(debt);
          } else {
            // Reduce outstanding balance (clamp at 0)
            s.debts = s.debts.map(d => d.id === debt.id ? { ...d, balance: Math.max(0, d.balance - expenseEntry.amount) } : d);
          }
          s.debtPayments.push({
            id:        "pay_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5),
            ts:        expenseEntry.ts,
            debtId:    debt.id,
            amount:    expenseEntry.amount,
            expenseId: expenseEntry.id,
          });
        }
        break;
      }
      // Single-action payment helper. Creates the debt if name is new (friend),
      // then logs the payment + reduces balance. Used by the inline form on
      // the Today tab debt card.
      case "payDebtSmart": {
        const name   = String(payload.name || "").trim();
        const amount = Number(payload.amount) || 0;
        if (!name || amount <= 0) break;
        const ts     = Number(payload.ts) || Date.now();
        let debt = payload.debtId
          ? s.debts.find(d => d.id === payload.debtId)
          : findDebtByName(s.debts, name);
        if (!debt) {
          // New friend — initial balance was the amount being paid (assume settled)
          // OR if user specified initialBalance, use that.
          const initialBalance = payload.initialBalance !== undefined ? Number(payload.initialBalance) : amount;
          debt = {
            id: "f_" + name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) + "_" + Math.random().toString(36).slice(2, 5),
            name,
            balance: Math.max(0, initialBalance - amount),
            rate: 0, emi: 0,
            color: payload.color || "#9F77DD",
            type: payload.type || "friend",
          };
          s.debts.push(debt);
        } else {
          s.debts = s.debts.map(d => d.id === debt.id ? { ...d, balance: Math.max(0, d.balance - amount) } : d);
        }
        s.debtPayments.push({
          id:      "pay_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5),
          ts,
          debtId:  debt.id,
          amount,
          ...(payload.note && { note: String(payload.note).slice(0, 200) }),
        });
        break;
      }
      case "deleteExpense":
        s.expenses = s.expenses.filter(e => e.id !== payload.id);
        break;
      case "updateDebt":
        s.debts = s.debts.map(d => d.id === payload.id ? { ...d, balance: Number(payload.balance) } : d);
        break;
      case "payDebt":
        s.debts = s.debts.map(d => d.id === payload.id ? { ...d, balance: Math.max(0, d.balance - Number(payload.amount)) } : d);
        s.debtPayments.push({ id: "pay_" + Date.now(), ts: Date.now(), debtId: payload.id, amount: Number(payload.amount) });
        break;
      case "setFlag":
        s.flags[payload.key] = payload.value;
        if (payload.key === "salaryReceived" && payload.value) {
          s.flags.lastSalaryMonth = new Date().getMonth();
        }
        break;
      case "logStreak":
        s.rulesStreak = (s.rulesStreak || 0) + 1;
        break;
      case "logGoalSaving":
        if (!s.goalSavings) s.goalSavings = { renovation: 0 };
        s.goalSavings[payload.goal] = (s.goalSavings[payload.goal] || 0) + Number(payload.amount);
        break;
      // ─── DEBT MANAGEMENT ───────────────────────────────────────
      case "addDebt": {
        const id = payload.id || "d_" + Date.now().toString(36);
        s.debts.push({
          id,
          name:    payload.name || "New debt",
          balance: Number(payload.balance) || 0,
          rate:    Number(payload.rate) || 0,
          emi:     Number(payload.emi)  || 0,
          color:   payload.color || "#888",
          type:    payload.type  || "friend",  // cc | formal | friend
        });
        break;
      }
      case "removeDebt":
        s.debts = s.debts.filter(d => d.id !== payload.id);
        break;
      case "renameDebt":
        s.debts = s.debts.map(d => d.id === payload.id ? { ...d, name: payload.name } : d);
        break;
      case "mergeDebts": {
        // Move all debtPayments from `fromId` to `toId`, optionally subtract
        // their sum from the target's balance, then delete the source debt.
        const from = s.debts.find(d => d.id === payload.fromId);
        const to   = s.debts.find(d => d.id === payload.toId);
        if (!from || !to) break;
        const moved = s.debtPayments.filter(p => p.debtId === from.id).reduce((sum, p) => sum + p.amount, 0);
        s.debtPayments = s.debtPayments.map(p => p.debtId === from.id ? { ...p, debtId: to.id } : p);
        if (payload.applyToBalance) {
          s.debts = s.debts.map(d => d.id === to.id ? { ...d, balance: Math.max(0, d.balance - moved) } : d);
        }
        s.debts = s.debts.filter(d => d.id !== from.id);
        break;
      }
      case "relinkAutoDebts": {
        // Find auto-created friend debts (id starts "f_" with random suffix,
        // balance=0, NOT in the canonical friend list) and try to merge them
        // into the best-matching real debt using the fuzzy matcher.
        const canonicalFriends = new Set(["f_priyank","f_lakhan","f_tomar","f_asad","f_rana","f_other"]);
        const autoDebts = s.debts.filter(d =>
          d.type === "friend" &&
          d.id.startsWith("f_") &&
          !canonicalFriends.has(d.id) &&
          d.balance === 0
        );
        for (const auto of autoDebts) {
          // Look for a non-friend match (CC or formal) using fuzzy matcher
          const candidates = s.debts.filter(d => d.id !== auto.id && d.type !== "friend");
          const match = findDebtByName(candidates, auto.name);
          if (!match) continue;
          // Redirect payments to the real debt — but DO NOT subtract from
          // balance (the user is the source of truth on outstanding balance;
          // payments are informational here).
          s.debtPayments = s.debtPayments.map(p => p.debtId === auto.id ? { ...p, debtId: match.id } : p);
          s.debts = s.debts.filter(d => d.id !== auto.id);
        }
        break;
      }
      // ─── IOUs (money YOU lent out) ─────────────────────────────
      case "addIou": {
        if (!s.ious) s.ious = [];
        s.ious.push({
          id:        "iou_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,5),
          name:      String(payload.name || "").slice(0, 80),
          amount:    Number(payload.amount) || 0,
          ts:        Number(payload.ts) || Date.now(),
          note:      payload.note ? String(payload.note).slice(0, 200) : "",
          settledTs: null,
        });
        break;
      }
      case "updateIou": {
        if (!s.ious) s.ious = [];
        s.ious = s.ious.map(i => i.id === payload.id ? {
          ...i,
          ...(payload.name   !== undefined ? { name:   String(payload.name).slice(0, 80) } : {}),
          ...(payload.amount !== undefined ? { amount: Number(payload.amount) } : {}),
          ...(payload.note   !== undefined ? { note:   String(payload.note).slice(0, 200) } : {}),
        } : i);
        break;
      }
      case "settleIou": {
        if (!s.ious) s.ious = [];
        s.ious = s.ious.map(i => i.id === payload.id ? { ...i, settledTs: i.settledTs ? null : Date.now() } : i);
        break;
      }
      case "deleteIou":
        if (!s.ious) s.ious = [];
        s.ious = s.ious.filter(i => i.id !== payload.id);
        break;
      case "payBill":
        // Quick-pay a fixed bill — logs an expense with the bill's category
        s.expenses.push({
          id: "exp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          ts: Date.now(),
          amount: Number(payload.amount),
          category: payload.category,
          merchant: payload.label,
          source: "bill-quickpay",
        });
        break;
      case "undoBill": {
        // Remove the most recent bill-quickpay expense for this category
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const candidates = s.expenses
          .map((e, i) => ({ e, i }))
          .filter(({ e }) => e.ts >= monthStart && e.category === payload.category && e.source === "bill-quickpay");
        if (candidates.length > 0) {
          const last = candidates[candidates.length - 1];
          s.expenses.splice(last.i, 1);
        }
        break;
      }
      case "closeMonth": {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const monthExpenses = s.expenses.filter(e => e.ts >= monthStart);
        const spent = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
        const debtPaid = s.debtPayments.filter(p => p.ts >= monthStart).reduce((sum, p) => sum + p.amount, 0);
        s.history.unshift({
          label: now.toLocaleString("en-IN", { month: "short", year: "numeric" }),
          spent, debtPaid,
          totalDebt: s.debts.reduce((sum, d) => sum + d.balance, 0),
          ts: Date.now(),
        });
        s.history = s.history.slice(0, 24);
        // reset monthly flags
        s.flags.salaryReceived = false;
        break;
      }
      // ─── CONFIG EDITORS ────────────────────────────────────────
      case "updateProfile": {
        ensureConfig(s);
        const { key, value } = payload;
        const v = (key === "income" || key === "salaryDay") ? Number(value) : value;
        s.config.profile = { ...s.config.profile, [key]: v };
        break;
      }
      case "updateEnvelope": {
        ensureConfig(s);
        s.config.envelopes = s.config.envelopes.map(e =>
          e.id === payload.id ? { ...e, ...payload.patch, amount: payload.patch.amount !== undefined ? Number(payload.patch.amount) : e.amount } : e
        );
        break;
      }
      case "updateBill": {
        ensureConfig(s);
        s.config.bills = s.config.bills.map(b =>
          b.id === payload.id ? {
            ...b,
            ...payload.patch,
            amount:  payload.patch.amount  !== undefined ? Number(payload.patch.amount)  : b.amount,
            dueDay:  payload.patch.dueDay  !== undefined ? Number(payload.patch.dueDay)  : b.dueDay,
          } : b
        );
        break;
      }
      case "addBill": {
        ensureConfig(s);
        const id = "bill_" + Date.now().toString(36);
        s.config.bills.push({
          id,
          label:    payload.label || "New bill",
          amount:   Number(payload.amount) || 0,
          dueDay:   Number(payload.dueDay) || 1,
          category: payload.category || "bills",
          icon:     payload.icon || "🧾",
        });
        break;
      }
      case "removeBill": {
        ensureConfig(s);
        s.config.bills = s.config.bills.filter(b => b.id !== payload.id);
        break;
      }
      case "updateGoal": {
        ensureConfig(s);
        const { id, needed, label } = payload;
        if (s.config.goals[id]) {
          s.config.goals[id] = {
            ...s.config.goals[id],
            ...(needed !== undefined ? { needed: Number(needed) } : {}),
            ...(label  !== undefined ? { label } : {}),
          };
        }
        break;
      }
      case "resetConfig": {
        s.config = defaultConfig();
        break;
      }
      case "reset":
        return null; // handled below
      default:
        break;
    }
    return s;
  });

  return NextResponse.json({ ok: true, state: next, computed: computeDaily(next) });
}
