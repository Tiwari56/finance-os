// ════════════════════════════════════════════════════════════════
//  POST /api/advisor
//  Server-side Claude call — API key stays in env, never in browser.
//
//  Body modes:
//    { question: "..." }      → free-form Q&A
//    { mode: "analyze" }      → structured spending analysis (capacity,
//                                 leaks, opportunities, 7-day plan)
// ════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getState } from "../../../lib/store";
import {
  avalanche, dailyAllowance, wholeMoneyView, billsStatus, recommendations,
  getProfile, getEnvelopes, getGoals, getDailyFlexBudget,
  CATEGORIES, fmtL,
} from "../../../lib/finance";

export const dynamic = "force-dynamic";

// Build the live financial snapshot used in both modes
function buildSnapshot(state, now) {
  const flexCats = Object.entries(CATEGORIES)
    .filter(([, c]) => c.envelope === "food" || c.envelope === "freedom")
    .map(([k]) => k);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const profile = getProfile(state);
  const envelopes = getEnvelopes(state);
  const dailyFlexBudget = getDailyFlexBudget(state);

  const monthFlexSpent = state.expenses
    .filter(e => e.ts >= monthStart && flexCats.includes(e.category))
    .reduce((s, e) => s + e.amount, 0);
  const totalDebt = state.debts.reduce((s, d) => s + d.balance, 0);
  const totalEmi  = state.debts.reduce((s, d) => s + (d.emi || 0), 0);
  const envAmt = (id) => envelopes.find(e => e.id === id)?.amount || 0;
  const debtMonthly = profile.income - envAmt("survival") - dailyFlexBudget - envAmt("sip") - envAmt("emergency");
  const proj = avalanche(state.debts, Math.max(totalEmi, debtMonthly));
  const allowance = dailyAllowance(dailyFlexBudget, monthFlexSpent, now);
  const view  = wholeMoneyView(state, now);
  const bills = billsStatus(state, now);
  const recs  = recommendations(state, view, bills, now);

  const debtPaidMonth = state.debtPayments
    .filter(p => p.ts >= monthStart)
    .reduce((s, p) => s + p.amount, 0);

  return { monthFlexSpent, totalDebt, totalEmi, proj, allowance, view, bills, recs, debtPaidMonth, profile, dailyFlexBudget };
}

function envelopesContext(view) {
  return view.envelopes.map(e =>
    `${e.label} ₹${e.amount.toLocaleString("en-IN")} (spent ₹${e.spent.toLocaleString("en-IN")}, ${e.pct}% used${e.overspent > 0 ? `, OVERSPENT by ₹${e.overspent.toLocaleString("en-IN")}` : ""})`
  ).join(" | ");
}

function billsContext(bills) {
  return bills.map(b => {
    const status = b.isPaid ? "PAID" : b.isOverdue ? "OVERDUE" : b.isDueSoon ? `due in ${b.daysUntilDue}d` : `due day ${b.dueDay}`;
    return `${b.label} ₹${b.amount.toLocaleString("en-IN")} [${status}${b.paid > 0 && b.paid < b.amount ? `, ₹${b.paid} part-paid` : ""}]`;
  }).join(" | ");
}

function buildSystemPrompt(state, snap, now) {
  const goals = getGoals(state);
  const envelopes = getEnvelopes(state);
  const envSummary = envelopes.map(e => `${e.label} ₹${e.amount.toLocaleString("en-IN")}`).join(", ");
  return `You are a strict, no-nonsense personal finance coach with 20 years of experience in Indian personal finance. You are coaching ${snap.profile.name}, who earns ₹${snap.profile.income.toLocaleString("en-IN")}/month and has an impulse spending problem — he spends whatever is available and borrows when empty. Your job is to be brutally honest, specific, and practical.

CURRENT FINANCIAL SNAPSHOT (LIVE DATA — today is ${now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}):
- Monthly income: ₹${snap.profile.income.toLocaleString("en-IN")} (salary, credited on day ${snap.profile.salaryDay})
- Total outstanding debt: ${fmtL(snap.totalDebt)}
- Debts breakdown: ${state.debts.map(d => `${d.name}: ₹${Math.round(d.balance).toLocaleString("en-IN")} at ${d.rate}% p.a.${d.emi ? ` (EMI ₹${d.emi.toLocaleString("en-IN")})` : ""}`).join(" | ")}
- Mutual fund corpus: ₹5,00,000 (of which ₹2,50,000 is pledged for the MF loan)
- Envelope system: ${envSummary}
- ENVELOPE USAGE THIS MONTH: ${envelopesContext(snap.view)}
- FIXED BILLS THIS MONTH: ${billsContext(snap.bills)}
- This month flex spent so far: ₹${snap.monthFlexSpent.toLocaleString("en-IN")} of ₹${snap.dailyFlexBudget.toLocaleString("en-IN")}
- Today's daily allowance: ₹${snap.allowance.perDay.toLocaleString("en-IN")} (${snap.allowance.daysLeft} days to next salary)
- Whole-money this month: spent ${fmtL(snap.view.totalSpent)}, free ${fmtL(snap.view.totalRemaining)}
- Debt-free projection: ${snap.proj.months} months at current pace
- Debt payments this month: ₹${snap.debtPaidMonth.toLocaleString("en-IN")}
- Renovation savings: ₹${(state.goalSavings?.renovation || 0).toLocaleString("en-IN")} of ₹${goals.renovationImmediate.needed.toLocaleString("en-IN")} needed for tile work (full reno: ₹${goals.renovationFull.needed.toLocaleString("en-IN")})
- Credit score: Low (high utilization + frequent enquiries, cannot take new loans)
- No health or family insurance currently
- Discipline streak: ${state.rulesStreak} days

RULES FOR YOUR ADVICE:
1. Always factor in the full debt + renovation picture before recommending any purchase.
2. Never suggest taking any new loan or using credit cards.
3. Be strict. If he's making a bad financial decision, say it plainly. No sugarcoating.
4. Use ₹ and Indian number formatting (lakhs/thousands).`;
}

// ─── Structured analysis prompt ───────────────────────────────────
const ANALYZE_USER_PROMPT = `Run a full analysis of my current spending and financial position based on the live snapshot above.

Structure your response with EXACTLY these 5 sections, each on its own line starting with the emoji header. Keep each section punchy (2-4 sentences, no fluff).

📊 SPENDING HEALTH: Give a one-line verdict (Healthy / Watch / Bleeding) and explain the single biggest reason for that verdict using actual numbers from my snapshot.

💪 CAPACITY CHECK: Can I afford to spend ₹500-2000 more today on something non-essential? Give a clear YES/NO/CONDITIONAL with the math (e.g. "you have ₹X left in Freedom envelope and ₹Y daily allowance, so YES up to ₹Z").

🚨 TOP LEAK: Identify the single biggest money leak right now — overspent envelope, unpaid bill running late, or pace problem. State it as one specific thing to stop.

💎 TOP OPPORTUNITY: What's the single smartest move I can make THIS WEEK to accelerate debt payoff or the ₹2L renovation goal? Be specific with rupee amounts.

📅 NEXT 7 DAYS: List 3 concrete actions I should take this week, each with a rupee amount or specific bill/debt name. Format as a numbered list (1. 2. 3.).

Keep total response under 350 words. No markdown headers. Plain text with the emojis as section markers.`;

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({
      reply: "AI advisor not configured yet. Add ANTHROPIC_API_KEY to your Vercel environment variables (Settings → Environment Variables). You can get a key at console.anthropic.com.",
    });
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const mode = body.mode || "qa";

  if (mode !== "analyze" && !body.question) {
    return NextResponse.json({ error: "question required (or pass mode: 'analyze')" }, { status: 400 });
  }

  const state = await getState();
  const now = new Date();
  const snap = buildSnapshot(state, now);
  const systemPrompt = buildSystemPrompt(state, snap, now);

  const userMessage = mode === "analyze" ? ANALYZE_USER_PROMPT : body.question;
  const maxTokens   = mode === "analyze" ? 1200 : 1000;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ reply: `API error (${res.status}): ${errText.slice(0, 200)}` });
    }

    const data = await res.json();
    const reply = data.content?.map(b => b.text || "").join("\n") || "No response.";
    return NextResponse.json({ reply, mode, generatedAt: now.toISOString() });
  } catch (err) {
    return NextResponse.json({ reply: `Network error: ${err.message}` });
  }
}
