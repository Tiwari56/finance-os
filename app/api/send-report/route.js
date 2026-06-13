// ════════════════════════════════════════════════════════════════
//  POST /api/send-report   → send daily or weekly email digest
//  GET  /api/send-report   → trigger manually (with ?secret=)
//
//  Called by Vercel Cron (vercel.json) or n8n or manually.
//  Needs env vars: RESEND_API_KEY, REPORT_EMAIL
//  Optional: LOG_SECRET for auth
// ════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getState } from "../../../lib/store";
import {
  avalanche, dailyAllowance, coachVerdict,
  getDailyFlexBudget, getProfile, getEnvelopes,
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

function authed(req, body) {
  // Vercel Cron — if CRON_SECRET env var is set, Vercel automatically sends
  // `Authorization: Bearer <CRON_SECRET>` for scheduled invocations.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get?.("authorization") ?? "";
    if (authHeader.startsWith("Bearer ") && secretsMatch(authHeader.slice(7), cronSecret)) {
      return true;
    }
  }
  // Manual triggers (curl, n8n, browser) — match LOG_SECRET via ?secret= or body.secret
  const expected = process.env.LOG_SECRET;
  if (!expected) return true;
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") || body?.secret || "";
  return secretsMatch(provided, expected);
}

// ─── data builders (same logic as /api/summary) ───────────────────
function flexCatKeys() {
  return Object.entries(CATEGORIES)
    .filter(([, c]) => c.envelope === "food" || c.envelope === "freedom")
    .map(([k]) => k);
}
function startOfMs(now, unit) {
  if (unit === "day")  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (unit === "week") {
    const day = now.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff).getTime();
  }
  if (unit === "month") return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function buildData(state, now) {
  const flex = flexCatKeys();
  const dailyFlexBudget = getDailyFlexBudget(state);
  const profile = getProfile(state);
  const envelopes = getEnvelopes(state);
  const envAmt = (id) => envelopes.find(e => e.id === id)?.amount || 0;

  const dayStart   = startOfMs(now, "day");
  const weekStart  = startOfMs(now, "week");
  const monthStart = startOfMs(now, "month");

  const monthFlexSpent = state.expenses.filter(e => e.ts >= monthStart && flex.includes(e.category)).reduce((s,e)=>s+e.amount,0);
  const todayFlex      = state.expenses.filter(e => e.ts >= dayStart   && flex.includes(e.category)).reduce((s,e)=>s+e.amount,0);
  const weekFlex       = state.expenses.filter(e => e.ts >= weekStart  && flex.includes(e.category)).reduce((s,e)=>s+e.amount,0);
  const prevWeekFlex   = state.expenses.filter(e => e.ts >= weekStart - 7*86400000 && e.ts < weekStart && flex.includes(e.category)).reduce((s,e)=>s+e.amount,0);

  const allowance = dailyAllowance(dailyFlexBudget, monthFlexSpent, now);
  const verdicts  = coachVerdict({ allowance, todaySpent: todayFlex, monthSpent: monthFlexSpent, flexBudget: dailyFlexBudget });
  const verdict   = verdicts[0];

  const todayExpenses = state.expenses.filter(e => e.ts >= dayStart).slice().reverse();
  const weekExpenses  = state.expenses.filter(e => e.ts >= weekStart);

  // category breakdown for week
  const weekCats = {};
  for (const e of weekExpenses.filter(e => flex.includes(e.category))) {
    weekCats[e.category] = (weekCats[e.category]||0) + e.amount;
  }
  const byCat = Object.entries(weekCats).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({ icon: CATEGORIES[k]?.icon||"📦", label: CATEGORIES[k]?.label||k, total: v }));

  // daily spend last 7 days for mini chart
  const last7 = [];
  for (let i=6; i>=0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const ds = d.getTime(), de = ds + 86400000;
    const spent = state.expenses.filter(e => e.ts >= ds && e.ts < de && flex.includes(e.category)).reduce((s,e)=>s+e.amount,0);
    last7.push({ label: d.toLocaleDateString("en-IN",{weekday:"short"}), spent });
  }

  const weekBudget = Math.round((dailyFlexBudget/30)*7);
  const debtPaidWeek = state.debtPayments.filter(p=>p.ts>=weekStart).reduce((s,p)=>s+p.amount,0);
  const totalDebt = state.debts.reduce((s,d)=>s+d.balance,0);
  const totalEmi  = state.debts.reduce((s,d)=>s+(d.emi||0),0);
  const debtMonthly = profile.income - envAmt("survival") - dailyFlexBudget - envAmt("sip") - envAmt("emergency");
  const proj = avalanche(state.debts, Math.max(totalEmi, debtMonthly));

  return { allowance, verdict, todayFlex, monthFlexSpent, weekFlex, prevWeekFlex, weekBudget, todayExpenses, byCat, last7, debtPaidWeek, totalDebt, proj, dailyFlexBudget };
}

// ─── HTML email template ──────────────────────────────────────────
function buildHtml(d, type, now) {
  const verdictColor = { danger:"#E24B4A", warning:"#E8A317", good:"#3FA66A" }[d.verdict.level];
  const verdictBg    = { danger:"#2a1414", warning:"#2a2310", good:"#13241a" }[d.verdict.level];
  const vsWeek = d.weekFlex - d.prevWeekFlex;
  const vsWeekLabel = vsWeek > 0 ? `▲ ${fmt(vsWeek)} more than last week` : vsWeek < 0 ? `▼ ${fmt(Math.abs(vsWeek))} less than last week` : "Same as last week";

  const maxBar = Math.max(...d.last7.map(x=>x.spent), 1);
  const barRows = d.last7.map(x => {
    const pct = Math.round((x.spent/maxBar)*100);
    const color = x.spent > d.allowance.perDay ? "#E24B4A" : "#3FA66A";
    return `
      <td style="text-align:center;vertical-align:bottom;padding:0 3px;width:14%">
        <div style="font-size:10px;color:#888;margin-bottom:3px">${x.spent > 0 ? fmt(x.spent).replace("₹","") : ""}</div>
        <div style="background:${color};width:26px;height:${Math.max(4, pct*0.7)}px;border-radius:3px 3px 0 0;margin:0 auto"></div>
        <div style="font-size:10px;color:#777;margin-top:4px">${x.label}</div>
      </td>`;
  }).join("");

  const expRows = d.todayExpenses.slice(0,10).map(e => `
    <tr>
      <td style="padding:7px 0;border-bottom:1px solid #222;font-size:13px;color:#ddd">
        ${CATEGORIES[e.category]?.icon||"📦"} ${e.merchant || CATEGORIES[e.category]?.label || e.category}
        <span style="font-size:11px;color:#666;margin-left:8px">${e.source}</span>
      </td>
      <td style="padding:7px 0;border-bottom:1px solid #222;text-align:right;font-size:13px;font-weight:600;color:#e8e8e3">${fmt(e.amount)}</td>
    </tr>`).join("") || `<tr><td colspan="2" style="padding:10px 0;color:#666;font-size:13px">Nothing logged today yet.</td></tr>`;

  const catRows = d.byCat.map(c => {
    const pct = Math.round((c.total / Math.max(d.weekBudget,1))*100);
    return `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#ccc">${c.icon} ${c.label}</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;color:#e8e8e3;text-align:right">${fmt(c.total)}</td>
        <td style="padding:6px 0 6px 10px;width:100px">
          <div style="background:#1a1a1a;border-radius:3px;height:6px;width:100%">
            <div style="background:#4a9eff;height:6px;border-radius:3px;width:${Math.min(100,pct)}%"></div>
          </div>
        </td>
      </tr>`;
  }).join("") || `<tr><td colspan="3" style="padding:10px 0;color:#666;font-size:13px">No flex spending this week yet.</td></tr>`;

  const debtRows = `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#ccc">Total outstanding</td>
      <td style="padding:6px 0;font-size:13px;font-weight:700;color:#E24B4A;text-align:right">${fmtL(d.totalDebt)}</td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#ccc">Debt-free in</td>
      <td style="padding:6px 0;font-size:13px;font-weight:700;color:${d.proj.months<=12?"#3FA66A":"#E8A317"};text-align:right">${d.proj.months} months</td>
    </tr>
    ${d.debtPaidWeek > 0 ? `<tr><td style="padding:6px 0;font-size:13px;color:#ccc">Paid this week</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#3FA66A;text-align:right">${fmt(d.debtPaidWeek)}</td></tr>` : ""}`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Steady — ${type === "weekly" ? "Weekly" : "Daily"} Report</title></head>
<body style="margin:0;padding:0;background:#0e0e0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0e0e0e">
<tr><td align="center" style="padding:24px 16px">
<table width="100%" style="max-width:560px" cellpadding="0" cellspacing="0">

  <!-- HEADER -->
  <tr><td style="padding-bottom:20px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="font-size:22px;font-weight:700;color:#e8e8e3">Steady</div>
          <div style="font-size:12px;color:#666;margin-top:2px">${type === "weekly" ? "Weekly Digest" : "Daily Report"} · ${now.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
        </td>
        <td style="text-align:right">
          <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.08em">Debt-free in</div>
          <div style="font-size:26px;font-weight:700;color:${d.proj.months<=12?"#3FA66A":"#E8A317"}">${d.proj.months}mo</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- DAILY ALLOWANCE -->
  <tr><td style="background:#181818;border:0.5px solid #2a2a2a;border-radius:14px;padding:18px 20px;margin-bottom:12px">
    <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">You can spend today</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="font-size:40px;font-weight:700;color:${d.allowance.perDay>0?"#fff":"#E24B4A"};line-height:1">${fmt(Math.max(0, d.allowance.perDay - d.todayFlex))}</div>
          <div style="font-size:12px;color:#888;margin-top:4px">left of ${fmt(d.allowance.perDay)} daily limit</div>
        </td>
        <td style="text-align:right;vertical-align:top">
          <div style="font-size:11px;color:#666">${d.allowance.daysLeft} days to payday</div>
          <div style="font-size:11px;color:#666;margin-top:4px">Month: ${d.allowance.pctMonthGone}% gone</div>
          <div style="font-size:11px;color:${d.allowance.pctBudgetGone>d.allowance.pctMonthGone+10?"#E24B4A":"#888"};margin-top:4px">Budget: ${d.allowance.pctBudgetGone}% used</div>
        </td>
      </tr>
    </table>
    <!-- progress bar -->
    <div style="background:#262626;border-radius:4px;height:6px;margin-top:12px;overflow:hidden">
      <div style="background:${d.todayFlex>d.allowance.perDay?"#E24B4A":"#3FA66A"};height:6px;width:${Math.min(100,Math.round((d.todayFlex/Math.max(1,d.allowance.perDay))*100))}%;border-radius:4px"></div>
    </div>
    <div style="font-size:11px;color:#777;margin-top:6px">Spent today: ${fmt(d.todayFlex)} · Month flex: ${fmt(d.monthFlexSpent)} of ${fmt(d.dailyFlexBudget)}</div>
  </td></tr>

  <tr><td style="height:10px"></td></tr>

  <!-- COACH VERDICT -->
  <tr><td style="background:${verdictBg};border:0.5px solid ${verdictColor}44;border-radius:12px;padding:14px 18px">
    <div style="font-size:13px;font-weight:700;color:${verdictColor};margin-bottom:5px">
      ${{ danger:"🔴", warning:"🟡", good:"🟢" }[d.verdict.level]} ${d.verdict.title}
    </div>
    <div style="font-size:12.5px;color:#ccc;line-height:1.6">${d.verdict.body}</div>
  </td></tr>

  <tr><td style="height:14px"></td></tr>

  <!-- 7-DAY BAR CHART -->
  <tr><td style="background:#181818;border:0.5px solid #2a2a2a;border-radius:14px;padding:16px 20px">
    <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px">Last 7 days flex spend</div>
    <table width="100%" cellpadding="0" cellspacing="0"><tr>${barRows}</tr></table>
    <div style="border-top:1px solid #222;margin-top:8px;padding-top:8px;font-size:11px;color:#666">
      This week: <strong style="color:#e8e8e3">${fmt(d.weekFlex)}</strong> of ${fmt(d.weekBudget)} budget &nbsp;·&nbsp; ${vsWeekLabel}
    </div>
  </td></tr>

  <tr><td style="height:14px"></td></tr>

  <!-- WEEK CATEGORY BREAKDOWN -->
  <tr><td style="background:#181818;border:0.5px solid #2a2a2a;border-radius:14px;padding:16px 20px">
    <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px">This week by category</div>
    <table width="100%" cellpadding="0" cellspacing="0">${catRows}</table>
  </td></tr>

  <tr><td style="height:14px"></td></tr>

  <!-- TODAY'S LOG -->
  <tr><td style="background:#181818;border:0.5px solid #2a2a2a;border-radius:14px;padding:16px 20px">
    <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px">Today's expenses (${d.todayExpenses.length})</div>
    <table width="100%" cellpadding="0" cellspacing="0">${expRows}</table>
  </td></tr>

  <tr><td style="height:14px"></td></tr>

  <!-- DEBT STATUS -->
  <tr><td style="background:#1a1414;border:0.5px solid #3a2020;border-radius:14px;padding:16px 20px">
    <div style="font-size:10px;color:#a86;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px">⚔️ Debt status</div>
    <table width="100%" cellpadding="0" cellspacing="0">${debtRows}</table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding:20px 0 8px;text-align:center;font-size:11px;color:#555">
    Steady · auto-sent by Vercel Cron · <a href="#" style="color:#555">manage settings</a>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── send via Resend ──────────────────────────────────────────────
async function sendEmail(to, subject, html, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Steady <reports@your-domain.com>",  // update after Resend domain setup
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const data = await res.json();
  return res.ok ? { ok: true, id: data.id } : { ok: false, error: data.message || "Resend error" };
}

// ─── route ────────────────────────────────────────────────────────
async function handle(req) {
  let body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch {}
  }

  if (!authed(req, body)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") || body.type || "daily";  // daily | weekly
  const toEmail = process.env.REPORT_EMAIL || body.email;

  if (!toEmail) {
    return NextResponse.json({ error: "No recipient. Set REPORT_EMAIL env var or pass email in body." }, { status: 400 });
  }

  const state = await getState();
  const now   = new Date();
  const data  = buildData(state, now);
  const html  = buildHtml(data, type, now);

  const subject = type === "weekly"
    ? `📊 Weekly Finance Digest — ${now.toLocaleDateString("en-IN",{day:"numeric",month:"short"})}`
    : `💰 Daily Finance Report — ${now.toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})} · ${fmt(Math.max(0,data.allowance.perDay-data.todayFlex))} left today`;

  const plainText = `Steady ${type === "weekly" ? "Weekly" : "Daily"} Report\n\nToday's allowance remaining: ${fmt(Math.max(0, data.allowance.perDay - data.todayFlex))} of ${fmt(data.allowance.perDay)}\nMonth: ${data.allowance.pctMonthGone}% gone, ${data.allowance.pctBudgetGone}% budget used\nVerdict: ${data.verdict.title}\n\nTotal debt: ${fmtL(data.totalDebt)}\nDebt-free in: ${data.proj.months} months\n\nThis week flex: ${fmt(data.weekFlex)} of ${fmt(data.weekBudget)} budget`;

  const result = await sendEmail(toEmail, subject, html, plainText);

  return NextResponse.json({
    ok: result.ok,
    type,
    to: toEmail,
    subject,
    ...(result.id    && { emailId: result.id }),
    ...(result.error && { error: result.error }),
  });
}

export const GET  = handle;
export const POST = handle;
