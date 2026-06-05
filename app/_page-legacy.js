"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ENVELOPES, CATEGORIES, FIXED_BILLS, GOALS, DAILY_FLEX_BUDGET, fmt, fmtL,
} from "../lib/finance";

const RULES = [
  { id: "r1", icon: "⏱️", title: "10-minute rule", body: "Unplanned spend >₹500 — wait 10 min. Walk away. Most urges die." },
  { id: "r2", icon: "💰", title: "Freedom Money only", body: "Not food or a bill? Comes only from Freedom envelope. No exceptions." },
  { id: "r3", icon: "🌙", title: "No UPI after 10 PM", body: "Lock the app 10pm–7am. Night buys are 100% impulse." },
  { id: "r4", icon: "🚫", title: "Never borrow for lifestyle", body: "Loan for a party/gadget = funding today's fun with tomorrow's stress." },
  { id: "r5", icon: "⚡", title: "Automate on salary day", body: "Salary hits → transfer debt + emergency before you see it." },
  { id: "r6", icon: "📅", title: "Cost in work-days", body: "Before buying: how many work-days is this? ₹7,200 = 1 day." },
];

async function api(action, payload) {
  const res = await fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  return res.json();
}

export default function Home() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("today");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  // manual expense form
  const [mAmount, setMAmount] = useState("");
  const [mMerchant, setMMerchant] = useState("");
  const [mCat, setMCat] = useState("food");
  const [mWhen, setMWhen] = useState("");  // datetime-local; blank = now

  // pay debt form
  const [payAmounts, setPayAmounts] = useState({});

  // impulse
  const [impText, setImpText] = useState("");
  const [impAmt, setImpAmt] = useState("");
  const [impulses, setImpulses] = useState([]);

  // AI advisor
  const [aiInput, setAiInput] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const [rulesDone, setRulesDone] = useState({});
  const chartRef = useRef(null);
  const reportChartRef = useRef(null);

  // reports tab
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  // history tab
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMonths, setHistoryMonths] = useState(6);
  const [historyExpanded, setHistoryExpanded] = useState(null); // month key being drilled into
  const historyBarRef = useRef(null);
  const historyDebtRef = useRef(null);

  // bills partial pay
  const [billAmounts, setBillAmounts] = useState({});

  // quick due-day edit (Today tab inline)
  const [billDueEdit, setBillDueEdit] = useState({});  // {billId: newDay} — undefined means not editing

  // renovation fund add
  const [renoFund, setRenoFund] = useState("");

  // IOU form (money you've lent)
  const [iouName, setIouName] = useState("");
  const [iouAmount, setIouAmount] = useState("");
  const [iouNote, setIouNote] = useState("");
  const [showAddIou, setShowAddIou] = useState(false);

  // Quick "Log debt payment" form on Today tab
  const [showPayDebt, setShowPayDebt] = useState(false);
  const [payTarget, setPayTarget] = useState("");      // debt id, or "__new__"
  const [payNewName, setPayNewName] = useState("");
  const [payAmount, setPayAmount] = useState("");

  // show details toggles
  const [showAllRecs, setShowAllRecs] = useState(false);
  const [showEnvDetails, setShowEnvDetails] = useState(false);

  // AI analysis (today tab)
  const [analysis, setAnalysis] = useState(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisTs, setAnalysisTs] = useState(null);

  async function runAnalysis() {
    setAnalysisBusy(true);
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "analyze" }),
      });
      const j = await res.json();
      setAnalysis(j.reply || "No response.");
      setAnalysisTs(new Date());
    } catch { setAnalysis("Couldn't reach the advisor. Check your deployment."); }
    setAnalysisBusy(false);
  }

  // Parse structured analysis into sections (by emoji prefix)
  function parseAnalysis(text) {
    if (!text) return null;
    const sectionRegex = /(📊|💪|🚨|💎|📅)\s+([^:]+):\s*/g;
    const parts = [];
    let lastIdx = 0;
    let lastMatch = null;
    let m;
    while ((m = sectionRegex.exec(text)) !== null) {
      if (lastMatch) {
        parts.push({ icon: lastMatch[1], title: lastMatch[2].trim(), body: text.slice(lastIdx, m.index).trim() });
      }
      lastMatch = m;
      lastIdx = m.index + m[0].length;
    }
    if (lastMatch) {
      parts.push({ icon: lastMatch[1], title: lastMatch[2].trim(), body: text.slice(lastIdx).trim() });
    }
    return parts.length > 0 ? parts : null;
  }

  // config tab
  const [editDebt, setEditDebt] = useState({});
  const [reportEmail, setReportEmail] = useState("");
  const [sendingReport, setSendingReport] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // config editors (income, envelopes, bills, goals)
  const [editProfile, setEditProfile]     = useState({});  // {key: value}
  const [editEnvAmt, setEditEnvAmt]       = useState({});  // {envId: amount}
  const [editBill, setEditBill]           = useState({});  // {billId: {amount, dueDay, label}}
  const [editGoal, setEditGoal]           = useState({});  // {goalId: needed}
  const [newBill, setNewBill]             = useState({ label: "", amount: "", dueDay: "", category: "bills", icon: "🧾" });
  const [showNewBill, setShowNewBill]     = useState(false);

  // health + integration tests
  const [health, setHealth] = useState(null);
  const [testing, setTesting] = useState({});
  const [testResults, setTestResults] = useState({});
  const [copied, setCopied] = useState("");

  const loadHealth = useCallback(async () => {
    const res = await fetch("/api/health");
    const j = await res.json();
    setHealth(j);
  }, []);

  async function testIntegration(name) {
    setTesting(p => ({ ...p, [name]: true }));
    setTestResults(p => ({ ...p, [name]: null }));
    try {
      const res = await fetch(`/api/health?test=${name}`);
      const j = await res.json();
      setTestResults(p => ({ ...p, [name]: j }));
    } catch (e) {
      setTestResults(p => ({ ...p, [name]: { ok: false, error: e.message } }));
    }
    setTesting(p => ({ ...p, [name]: false }));
  }

  function copyToClipboard(text, key) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  }

  const load = useCallback(async () => {
    const res = await fetch("/api/state");
    const j = await res.json();
    setData(j);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // load reports when tab is opened
  useEffect(() => {
    if (tab !== "reports") return;
    setReportLoading(true);
    fetch("/api/summary").then(r => r.json()).then(d => { setReportData(d); setReportLoading(false); });
  }, [tab]);

  // load history when tab is opened or month range changes
  useEffect(() => {
    if (tab !== "history") return;
    setHistoryLoading(true);
    fetch(`/api/history?months=${historyMonths}`).then(r => r.json()).then(d => { setHistoryData(d); setHistoryLoading(false); });
  }, [tab, historyMonths]);

  // Draw history bar chart (total spent + debt paid stacked per month)
  useEffect(() => {
    if (tab !== "history" || !historyData) return;
    const canvas = historyBarRef.current; if (!canvas) return;
    const months = historyData.months;
    if (!months.length) return;

    const dpr = window.devicePixelRatio || 1, W = canvas.offsetWidth || 600, H = 180;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const pad = { l: 50, r: 14, t: 16, b: 30 };
    const gw = W - pad.l - pad.r, gh = H - pad.t - pad.b;
    const maxVal = Math.max(...months.map(m => m.spent + m.debtPaid), historyData.profile.income, 1);

    // grid lines
    [0, 0.5, 1].forEach(f => {
      const y = pad.t + gh * (1 - f);
      ctx.strokeStyle = "#222"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.fillStyle = "#666"; ctx.font = "9px ui-sans-serif"; ctx.textAlign = "right";
      const v = Math.round(maxVal * f);
      const label = v >= 100000 ? "₹" + (v/100000).toFixed(1) + "L" : v >= 1000 ? "₹" + Math.round(v/1000) + "k" : "₹" + v;
      ctx.fillText(label, pad.l - 6, y + 3);
    });

    const slot = gw / months.length;
    const barW = Math.min(40, slot * 0.7);
    months.forEach((m, i) => {
      const xC = pad.l + slot * (i + 0.5);
      const spentH = (m.spent / maxVal) * gh;
      const debtH = (m.debtPaid / maxVal) * gh;
      // spend bar
      ctx.fillStyle = m.isCurrent ? "#E8A317" : "#4a9eff";
      ctx.fillRect(xC - barW/2, pad.t + gh - spentH, barW, spentH);
      // debt paid stacked on top
      if (debtH > 0) {
        ctx.fillStyle = m.isCurrent ? "#5a7a5a" : "#3FA66A";
        ctx.fillRect(xC - barW/2, pad.t + gh - spentH - debtH, barW, debtH);
      }
      // month label
      ctx.fillStyle = m.isCurrent ? "#E8A317" : "#888"; ctx.font = "10px ui-sans-serif"; ctx.textAlign = "center";
      ctx.fillText(m.label.replace(" 20", " '"), xC, H - 12);
      // total label above bar
      if (m.spent + m.debtPaid > 0) {
        ctx.fillStyle = "#aaa"; ctx.font = "9px ui-sans-serif";
        const t = (m.spent + m.debtPaid);
        const lbl = t >= 100000 ? (t/100000).toFixed(1) + "L" : t >= 1000 ? Math.round(t/1000) + "k" : Math.round(t);
        ctx.fillText(lbl, xC, pad.t + gh - spentH - debtH - 4);
      }
    });

    // income reference line
    if (historyData.profile.income) {
      const y = pad.t + gh * (1 - historyData.profile.income / maxVal);
      ctx.strokeStyle = "#E24B4A55"; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#E24B4A99"; ctx.font = "9px ui-sans-serif"; ctx.textAlign = "left";
      ctx.fillText("income", pad.l + 4, y - 3);
    }
  }, [tab, historyData]);

  // load health snapshot when config tab is opened
  useEffect(() => {
    if (tab === "config") loadHealth();
  }, [tab, loadHealth]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // draw 7-day spend bars in reports tab
  useEffect(() => {
    if (tab !== "reports" || !reportData?.daily) return;
    const canvas = reportChartRef.current; if (!canvas) return;
    // build last7 from weekly data
    const weekly = reportData.weekly;
    if (!weekly?.dailyBreakdown) return;
    const dpr = window.devicePixelRatio || 1, W = canvas.offsetWidth || 560, H = 100;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const perDay = reportData.daily.allowance.perDay || 1;
    const days = weekly.dailyBreakdown;
    if (!days.length) return;
    const maxVal = Math.max(...days.map(d => d.total), perDay);
    const barW = Math.floor((W - 20) / 7) - 4;
    days.forEach((d, i) => {
      const x = 10 + i * ((W - 20) / 7);
      const bh = Math.max(4, Math.round((d.total / maxVal) * (H - 30)));
      const over = d.total > perDay;
      ctx.fillStyle = over ? "#E24B4A" : "#3FA66A";
      ctx.beginPath();
      ctx.roundRect(x, H - 24 - bh, barW, bh, [3, 3, 0, 0]);
      ctx.fill();
      ctx.fillStyle = "#777"; ctx.font = "9px ui-sans-serif"; ctx.textAlign = "center";
      const label = new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" });
      ctx.fillText(label, x + barW / 2, H - 8);
      if (d.total > 0) {
        ctx.fillStyle = over ? "#E24B4A" : "#aaa"; ctx.font = "9px ui-sans-serif";
        const t = d.total >= 1000 ? Math.round(d.total/1000)+"k" : String(Math.round(d.total));
        ctx.fillText(t, x + barW / 2, H - 26 - bh);
      }
    });
    // daily budget line
    const lineY = H - 24 - Math.round((perDay / maxVal) * (H - 30));
    ctx.strokeStyle = "#E8A31744"; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(10, lineY); ctx.lineTo(W - 10, lineY); ctx.stroke();
    ctx.setLineDash([]);
  }, [tab, reportData]);

  // draw debt curve
  useEffect(() => {
    if (tab !== "debts" || !data) return;
    const canvas = chartRef.current; if (!canvas) return;
    const proj = data.computed.proj;
    const dpr = window.devicePixelRatio || 1, W = canvas.offsetWidth || 600, H = 170;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const d = proj.hist, max = d[0]?.total || 1;
    const pad = { l: 58, r: 14, t: 10, b: 24 }, gw = W - pad.l - pad.r, gh = H - pad.t - pad.b;
    [0, .25, .5, .75, 1].forEach(f => {
      const y = pad.t + gh * f;
      ctx.strokeStyle = "#222"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + gw, y); ctx.stroke();
      ctx.fillStyle = "#777"; ctx.font = "10px ui-sans-serif"; ctx.textAlign = "right";
      ctx.fillText(fmtL(max * (1 - f)), pad.l - 6, y + 3);
    });
    const pts = d.map((p, i) => ({ x: pad.l + (i / (d.length - 1)) * gw, y: pad.t + gh * (1 - p.total / max) }));
    ctx.beginPath(); ctx.moveTo(pts[0].x, pad.t + gh);
    pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.lineTo(pts.at(-1).x, pad.t + gh); ctx.closePath();
    ctx.fillStyle = "rgba(226,75,74,0.12)"; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.strokeStyle = "#E24B4A"; ctx.lineWidth = 2; ctx.stroke();
  }, [tab, data]);

  async function refresh(p) { setData(p); }

  async function addManual() {
    if (!mAmount) return;
    const payload = { amount: Number(mAmount), merchant: mMerchant, category: mCat };
    if (mWhen) payload.ts = new Date(mWhen).getTime();
    const r = await api("addExpense", payload);
    setMAmount(""); setMMerchant(""); setMWhen("");
    refresh(r);
  }

  // datetime-local helpers
  function nowLocalStr(offsetDays = 0, hour = null) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    if (hour !== null) { d.setHours(hour, 0, 0, 0); }
    // shift to local time for datetime-local input
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 16);
  }
  async function payDebt(id) {
    const amt = Number(payAmounts[id]); if (!amt) return;
    const r = await api("payDebt", { id, amount: amt });
    setPayAmounts(p => ({ ...p, [id]: "" }));
    refresh(r);
  }
  async function setFlag(key, value) {
    const r = await api("setFlag", { key, value });
    refresh(r);
  }

  async function askAI(q) {
    if (!q.trim() || !data) return;
    setAiBusy(true); setAiReply("");
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const j = await res.json();
      setAiReply(j.reply || "No response.");
    } catch { setAiReply("Couldn't reach the advisor. Check your deployment."); }
    setAiBusy(false);
  }

  if (loading || !data) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0e0e0e", color: "#888", fontFamily: "ui-sans-serif" }}>Loading your finances…</div>;
  }

  const { state, computed } = data;
  const { allowance, verdicts, action, proj, todaySpent, monthFlexSpent, view, bills, recs, debtSummary, iouSummary } = computed;

  // Detect auto-created friend debts that probably belong to a real loan (e.g.
  // "axis credit replayment" should link to "Axis Personal Loan"). Surfaced
  // as a one-click cleanup button on the Debt Status card.
  const canonicalFriends = new Set(["f_priyank","f_lakhan","f_tomar","f_asad","f_rana","f_other"]);
  const autoCreatedDebts = state.debts.filter(d =>
    d.type === "friend" && d.id.startsWith("f_") && !canonicalFriends.has(d.id) && d.balance === 0
  );
  // Hide names that are likely actual friends (short single token like "Akshit")
  const stopwordsClient = new Set(["loan","credit","card","emi","payment","forclose","foreclose","replayment","repayment","prepayment"]);
  const dirtyAutoDebts = autoCreatedDebts.filter(d => {
    const toks = d.name.toLowerCase().split(/\s+/);
    return toks.some(t => stopwordsClient.has(t));
  });

  // Live config from state (with import fallbacks for safety on stale state)
  const cfgProfile   = state.config?.profile   || { name: "Nishit", income: 180000, salaryDay: 1 };
  const cfgEnvelopes = state.config?.envelopes || ENVELOPES;
  const cfgBills     = state.config?.bills     || FIXED_BILLS;
  const cfgGoals     = state.config?.goals     || GOALS;
  const cfgDailyFlex = cfgEnvelopes
    .filter(e => e.id === "food" || e.id === "freedom")
    .reduce((s, e) => s + e.amount, 0) || DAILY_FLEX_BUDGET;
  const totalDebt = state.debts.reduce((s, d) => s + d.balance, 0);
  const today = new Date();
  const todayExpenses = state.expenses.filter(e => {
    const ds = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return e.ts >= ds;
  });
  const savedByImpulse = impulses.filter(i => i.skipped).reduce((s, i) => s + i.amount, 0);

  const levelColor = { danger: "#E24B4A", warning: "#E8A317", good: "#3FA66A" };
  const levelBg    = { danger: "#2a1414", warning: "#2a2310", good: "#13241a" };

  const TABS = [["today","Today"],["reports","Reports"],["history","History"],["spend","Spending"],["debts","Debts"],["system","System"],["impulse","Impulse"],["advisor","Advisor"],["config","Config"]];

  return (
    <div style={{ minHeight: "100vh", background: "#0e0e0e", color: "#e8e8e3", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{height:6px;width:6px;}::-webkit-scrollbar-thumb{background:#333;border-radius:3px;}
        .serif{font-family:'DM Serif Display',serif;}
        .wrap{max-width:760px;margin:0 auto;padding:18px 14px 60px;}
        .tb{border:none;background:none;cursor:pointer;padding:9px 13px;font-size:13px;color:#777;border-bottom:2px solid transparent;white-space:nowrap;font-family:inherit;}
        .tb.on{color:#fff;border-bottom:2px solid #fff;font-weight:500;}
        .card{background:#181818;border:0.5px solid #2a2a2a;border-radius:16px;padding:18px 20px;margin-bottom:13px;}
        .mc{background:#161616;border:0.5px solid #262626;border-radius:12px;padding:13px 15px;}
        .row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:0.5px solid #222;font-size:13px;}
        .row:last-child{border-bottom:none;}
        .badge{display:inline-block;font-size:10.5px;padding:2px 8px;border-radius:20px;font-weight:500;}
        .pt{height:7px;background:#262626;border-radius:4px;overflow:hidden;flex:1;}
        .pf{height:100%;border-radius:4px;transition:width .6s;}
        input,select,textarea{background:#0e0e0e;border:0.5px solid #333;border-radius:9px;padding:8px 11px;font-size:13px;color:#eee;font-family:inherit;}
        input:focus,select:focus,textarea:focus{outline:none;border-color:#666;}
        input[type=range]{padding:0;accent-color:#E24B4A;}
        .btn{background:#fff;color:#0e0e0e;border:none;border-radius:9px;padding:9px 18px;font-size:13px;cursor:pointer;font-weight:500;font-family:inherit;}
        .btn:hover{background:#ddd;}
        .btn-o{background:transparent;border:0.5px solid #444;border-radius:9px;padding:8px 14px;font-size:12.5px;cursor:pointer;color:#bbb;font-family:inherit;}
        .btn-o:hover{border-color:#777;color:#fff;}
        .rule{background:#161616;border:0.5px solid #262626;border-radius:12px;padding:12px 14px;margin-bottom:7px;cursor:pointer;display:flex;gap:11px;align-items:flex-start;}
        .rule:hover{border-color:#3a3a3a;}
      `}</style>

      <div className="wrap">
        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div className="serif" style={{ fontSize: 25 }}>Finance OS</div>
            <div style={{ fontSize: 12, color: "#777", marginTop: 1 }}>
              {today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: ".08em" }}>Debt-free in</div>
            <div className="serif" style={{ fontSize: 25, color: proj.months <= 12 ? "#3FA66A" : "#E8A317" }}>{proj.months}mo</div>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", borderBottom: "0.5px solid #262626", marginBottom: 18, overflowX: "auto" }}>
          {TABS.map(([id, label]) => <button key={id} className={`tb${tab === id ? " on" : ""}`} onClick={() => setTab(id)}>{label}</button>)}
        </div>

        {/* ═══════════════ TODAY ═══════════════ */}
        {tab === "today" && (() => {
          // Pre-compute helpers used in this tab
          const billsTotal    = bills.reduce((s, b) => s + b.amount, 0);
          const billsPaidSum  = bills.reduce((s, b) => s + Math.min(b.paid, b.amount), 0);
          const billsRemain   = Math.max(0, billsTotal - billsPaidSum);
          const overdueCount  = bills.filter(b => b.isOverdue).length;
          const dueSoonCount  = bills.filter(b => b.isDueSoon).length;
          const todayLeft     = Math.max(0, allowance.perDay - todaySpent);
          const flexUsedPct   = allowance.pctBudgetGone;
          const monthPct      = allowance.pctMonthGone;
          const burnAhead     = flexUsedPct - monthPct;
          const urgentRecs    = recs.filter(r => r.urgency === "danger");
          const warningRecs   = recs.filter(r => r.urgency === "warning");
          const infoRecs      = recs.filter(r => r.urgency === "info" || r.urgency === "good");
          const visibleRecs   = showAllRecs ? recs : [...urgentRecs, ...warningRecs].slice(0, 3);

          // Envelope colors used across visualizations
          const envColors = { survival:"#6b8aff", food:"#FFB347", freedom:"#E24B4A", sip:"#3FA66A", debt:"#9F77DD", emergency:"#888" };

          return (
          <div>
            {/* ═══ HERO: TODAY'S ALLOWANCE — the one most important number ═══ */}
            <div className="card" style={{ background: "linear-gradient(160deg,#1c1c1c,#121212)", border: "0.5px solid #2a2a2a", padding: "20px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 10.5, color: "#888", textTransform: "uppercase", letterSpacing: ".12em" }}>You can spend today</div>
                <div title="Daily flex = Food + Freedom envelopes split evenly across the remaining days." style={{ fontSize: 10.5, color: "#666", cursor: "help" }}>ⓘ what's this?</div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 6 }}>
                <div className="serif" style={{ fontSize: 56, lineHeight: 1, color: todayLeft > 0 ? "#fff" : "#E24B4A" }}>
                  {fmt(todayLeft)}
                </div>
                <div style={{ fontSize: 13, color: "#888" }}>of {fmt(allowance.perDay)} daily</div>
              </div>
              <div className="pt" style={{ height: 8, marginTop: 14 }}>
                <div className="pf" style={{ width: Math.min(100, (todaySpent / Math.max(1, allowance.perDay)) * 100) + "%", background: todaySpent > allowance.perDay ? "#E24B4A" : "#3FA66A", height: 8 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11.5, color: "#777" }}>
                <span>Spent today: <strong style={{ color: "#aaa" }}>{fmt(todaySpent)}</strong></span>
                <span>{allowance.daysLeft} days to payday</span>
              </div>
            </div>

            {/* ═══ URGENT ACTIONS (only when present) ═══ */}
            {urgentRecs.length > 0 && (
              <div className="card" style={{ background: "#1f1212", border: "0.5px solid #5a2020", padding: 14 }}>
                <div style={{ fontSize: 10.5, color: "#E24B4A", textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 10, fontWeight: 600 }}>
                  🔴 Urgent · {urgentRecs.length} thing{urgentRecs.length > 1 ? "s" : ""} need attention
                </div>
                {urgentRecs.slice(0, 3).map((r, i) => (
                  <div key={i} style={{ paddingBottom: i === Math.min(2, urgentRecs.length - 1) ? 0 : 11, marginBottom: i === Math.min(2, urgentRecs.length - 1) ? 0 : 11, borderBottom: i === Math.min(2, urgentRecs.length - 1) ? "none" : "0.5px solid #2a1a1a" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#fff", marginBottom: 3 }}>{r.icon} {r.title}</div>
                    <div style={{ fontSize: 12, color: "#bbb", lineHeight: 1.5 }}>{r.body}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ═══ WHOLE MONEY OVERVIEW ═══ */}
            <div className="card" style={{ background: "linear-gradient(160deg,#181818,#131313)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 10.5, color: "#888", textTransform: "uppercase", letterSpacing: ".12em" }}>Whole money this month</div>
                <div style={{ fontSize: 11, color: "#666" }}>Income {fmtL(view.income)}</div>
              </div>

              {/* 3 big numbers: spent / committed bills / free */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>Spent</div>
                  <div className="serif" style={{ fontSize: 21, color: "#fff" }}>{fmtL(view.totalSpent)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>Bills due</div>
                  <div className="serif" style={{ fontSize: 21, color: billsRemain > 0 ? "#E8A317" : "#3FA66A" }}>{fmtL(billsRemain)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>Free</div>
                  <div className="serif" style={{ fontSize: 21, color: "#3FA66A" }}>{fmtL(view.totalRemaining)}</div>
                </div>
              </div>

              {/* segmented spending bar */}
              <div style={{ position: "relative", marginBottom: 10 }}>
                <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "#0a0a0a" }}>
                  {view.envelopes.map(env => {
                    const w = (env.spent / view.income) * 100;
                    if (w < 0.3) return null;
                    return <div key={env.id} title={`${env.label}: ${fmt(env.spent)} of ${fmt(env.amount)}`} style={{ width: w + "%", background: envColors[env.id] || "#666" }} />;
                  })}
                </div>
                {/* time marker */}
                <div title={`${monthPct}% of month gone`} style={{ position: "absolute", top: -2, left: `${monthPct}%`, width: 2, height: 16, background: "#fff", opacity: 0.6 }} />
              </div>
              <div style={{ fontSize: 10.5, color: "#666", display: "flex", justifyContent: "space-between" }}>
                <span>↑ white line = {monthPct}% of month gone</span>
                <span style={{ color: burnAhead > 10 ? "#E24B4A" : burnAhead > 0 ? "#E8A317" : "#3FA66A" }}>
                  Flex burn: {flexUsedPct}% {burnAhead > 0 ? `(+${burnAhead}% ahead)` : burnAhead < 0 ? `(${burnAhead}% under)` : "(on pace)"}
                </span>
              </div>

              {/* envelopes mini bars */}
              <div style={{ borderTop: "0.5px solid #222", marginTop: 14, paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 10.5, color: "#777", textTransform: "uppercase", letterSpacing: ".06em" }}>Per envelope</div>
                  <button onClick={() => setShowEnvDetails(v => !v)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 11 }}>
                    {showEnvDetails ? "Hide details" : "Show details"}
                  </button>
                </div>
                {view.envelopes.map(env => (
                  <div key={env.id} style={{ padding: "6px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "#ccc" }}>{env.icon} {env.label}{env.locked ? <span style={{ fontSize: 10, color: "#555", marginLeft: 5 }}>🔒</span> : null}</span>
                      <span style={{ fontSize: 11.5, color: env.overspent > 0 ? "#E24B4A" : env.pct > 90 ? "#E8A317" : "#aaa" }}>
                        {fmt(env.spent)} <span style={{ color: "#555" }}>/ {fmt(env.amount)}</span>
                      </span>
                    </div>
                    <div className="pt" style={{ height: 5 }}>
                      <div className="pf" style={{ width: Math.min(100, env.pct) + "%", background: env.overspent > 0 ? "#E24B4A" : env.pct > 90 ? "#E8A317" : envColors[env.id], height: 5 }} />
                    </div>
                    {showEnvDetails && <div style={{ fontSize: 10.5, color: "#666", marginTop: 4 }}>{env.desc}</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ DEBT SUMMARY ═══ */}
            {debtSummary && (
              <div className="card" style={{ background: "linear-gradient(160deg,#1a1414,#141010)", border: "0.5px solid #3a2020" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: "#E24B4A", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 600 }}>⚔️ Debt status</div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>Outstanding + paid this month</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="serif" style={{ fontSize: 24, color: "#E24B4A" }}>{fmtL(debtSummary.totalOutstanding)}</div>
                    <div style={{ fontSize: 10.5, color: "#888" }}>total outstanding</div>
                  </div>
                </div>

                {/* Cleanup warning when migration created junk debts */}
                {dirtyAutoDebts.length > 0 && (
                  <div style={{ marginBottom: 12, padding: "10px 12px", background: "#2a2310", border: "0.5px solid #5a4a20", borderRadius: 8 }}>
                    <div style={{ fontSize: 11.5, color: "#E8A317", marginBottom: 4 }}>
                      ⚠️ {dirtyAutoDebts.length} auto-created debt{dirtyAutoDebts.length > 1 ? "s" : ""} look like duplicates of your real loans
                    </div>
                    <div style={{ fontSize: 10.5, color: "#888", marginBottom: 8 }}>
                      {dirtyAutoDebts.slice(0,3).map(d => d.name).join(", ")}{dirtyAutoDebts.length > 3 ? "…" : ""}
                    </div>
                    <button className="btn-o" style={{ fontSize: 11, padding: "5px 11px", color: "#E8A317", borderColor: "#5a4a20" }} onClick={async () => {
                      if (!confirm("Move payments from auto-created debts into your real loans (matched by name)?")) return;
                      const r = await api("relinkAutoDebts", {});
                      refresh(r);
                    }}>🧹 Clean up auto-links</button>
                  </div>
                )}

                {/* Log payment quick form */}
                <div style={{ marginBottom: 14 }}>
                  {!showPayDebt ? (
                    <button className="btn-o" style={{ width: "100%", padding: "8px 12px", fontSize: 12, borderColor: "#3a2020", color: "#E8A317" }} onClick={() => setShowPayDebt(true)}>
                      + Log debt payment
                    </button>
                  ) : (
                    <div style={{ padding: "12px 13px", background: "#0e0e0e", border: "0.5px solid #3a2020", borderRadius: 9 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: "#a86", textTransform: "uppercase", letterSpacing: ".06em" }}>Who did you pay?</span>
                        <button onClick={() => { setShowPayDebt(false); setPayTarget(""); setPayNewName(""); setPayAmount(""); }} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14 }}>×</button>
                      </div>
                      <select value={payTarget} onChange={e => setPayTarget(e.target.value)} style={{ width: "100%", marginBottom: 7, fontSize: 12 }}>
                        <option value="">— pick existing or add new —</option>
                        <optgroup label="Credit cards">
                          {state.debts.filter(d => d.type === "cc" && d.balance > 0).map(d => <option key={d.id} value={d.id}>{d.name} (₹{Math.round(d.balance).toLocaleString("en-IN")} left)</option>)}
                        </optgroup>
                        <optgroup label="Formal loans">
                          {state.debts.filter(d => d.type === "formal" && d.balance > 0).map(d => <option key={d.id} value={d.id}>{d.name} (₹{Math.round(d.balance).toLocaleString("en-IN")} left)</option>)}
                        </optgroup>
                        <optgroup label="Friends">
                          {state.debts.filter(d => d.type === "friend").map(d => <option key={d.id} value={d.id}>{d.name} (₹{Math.round(d.balance).toLocaleString("en-IN")} left)</option>)}
                        </optgroup>
                        <option value="__new__">+ New friend (not in list)</option>
                      </select>
                      {payTarget === "__new__" && (
                        <input type="text" placeholder="Friend name (e.g. Akshit)" value={payNewName} onChange={e => setPayNewName(e.target.value)} style={{ width: "100%", marginBottom: 7, fontSize: 12 }} />
                      )}
                      <div style={{ display: "flex", gap: 7 }}>
                        <input type="number" placeholder="₹ amount paid" value={payAmount} onChange={e => setPayAmount(e.target.value)} style={{ flex: 1, fontSize: 12 }} />
                        <button className="btn" style={{ fontSize: 12 }} onClick={async () => {
                          const amount = Number(payAmount);
                          if (!amount || amount <= 0) return;
                          let r;
                          if (payTarget === "__new__") {
                            if (!payNewName.trim()) return;
                            r = await api("payDebtSmart", { name: payNewName.trim(), amount });
                          } else if (payTarget) {
                            const d = state.debts.find(x => x.id === payTarget);
                            if (!d) return;
                            r = await api("payDebtSmart", { debtId: payTarget, name: d.name, amount });
                          } else {
                            return;
                          }
                          setShowPayDebt(false); setPayTarget(""); setPayNewName(""); setPayAmount("");
                          refresh(r);
                        }}>Log</button>
                      </div>
                      <div style={{ fontSize: 10.5, color: "#666", marginTop: 7, lineHeight: 1.5 }}>
                        ℹ For a new friend: assumes you&apos;ve settled the full amount. If you still owe more, adjust their balance in the Debts tab after.
                      </div>
                    </div>
                  )}
                </div>

                {/* this-month paid + debt-free in */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div className="mc" style={{ background: "#13241a", borderColor: "#2a4a35" }}>
                    <div style={{ fontSize: 10.5, color: "#5a8a6f" }}>Paid this month</div>
                    <div className="serif" style={{ fontSize: 20, color: "#3FA66A" }}>{fmt(debtSummary.monthPaidTotal)}</div>
                    <div style={{ fontSize: 10.5, color: "#666", marginTop: 1 }}>{state.debtPayments.filter(p => p.ts >= new Date(now.getFullYear(), now.getMonth(), 1).getTime()).length} payments</div>
                  </div>
                  <div className="mc">
                    <div style={{ fontSize: 10.5, color: "#777" }}>Debt-free in</div>
                    <div className="serif" style={{ fontSize: 20, color: proj.months <= 12 ? "#3FA66A" : "#E8A317" }}>{proj.months}mo</div>
                    <div style={{ fontSize: 10.5, color: "#666", marginTop: 1 }}>at current pace</div>
                  </div>
                </div>

                {/* split by type */}
                <div style={{ fontSize: 10.5, color: "#888", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Split by type</div>
                {[
                  { id: "cc",     label: "Credit cards",   icon: "💳", color: "#E24B4A" },
                  { id: "formal", label: "Formal loans",   icon: "🏦", color: "#C2410C" },
                  { id: "friend", label: "Friends",        icon: "🤝", color: "#9F77DD" },
                ].map(g => {
                  const out  = debtSummary.byType[g.id] || 0;
                  const paid = debtSummary.monthPaidByType[g.id] || 0;
                  if (out === 0 && paid === 0) return null;
                  return (
                    <div key={g.id} style={{ padding: "8px 0", borderBottom: "0.5px solid #221818" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12.5, color: "#ddd" }}>{g.icon} {g.label}</span>
                        <span style={{ fontSize: 12, color: g.color, fontWeight: 500 }}>{fmt(out)} left</span>
                      </div>
                      <div className="pt" style={{ height: 4, background: "#1a0e0e" }}>
                        <div className="pf" style={{ width: Math.min(100, debtSummary.totalOutstanding > 0 ? (out / debtSummary.totalOutstanding) * 100 : 0) + "%", background: g.color, height: 4 }} />
                      </div>
                      {paid > 0 && <div style={{ fontSize: 10.5, color: "#3FA66A", marginTop: 4 }}>+ {fmt(paid)} paid this month</div>}
                    </div>
                  );
                })}

                {/* friends roster */}
                {debtSummary.friendDetails.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10.5, color: "#888", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Friend tags · {fmt(debtSummary.byType.friend || 0)} owed, {fmt(debtSummary.monthPaidByType.friend || 0)} paid this month</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {debtSummary.friendDetails.map(f => {
                        const settled = f.settled;
                        return (
                          <span key={f.id} style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "4px 9px",
                            background: settled ? "#13241a" : "#1f1828",
                            border: `0.5px solid ${settled ? "#2a4a35" : f.color + "55"}`,
                            borderRadius: 14, fontSize: 11
                          }}>
                            {settled ? (
                              <span style={{ color: "#3FA66A", fontWeight: 600 }}>✓</span>
                            ) : (
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: f.color }} />
                            )}
                            <span style={{ color: settled ? "#888" : "#ddd", textDecoration: settled ? "line-through" : "none" }}>{f.name}</span>
                            {settled
                              ? <span style={{ color: "#3FA66A", fontWeight: 500 }}>paid {fmt(f.paidThisMonth)}</span>
                              : (
                                <>
                                  <span style={{ color: "#888", fontWeight: 500 }}>{fmt(f.balance)}</span>
                                  {f.paidThisMonth > 0 && <span style={{ color: "#3FA66A", fontSize: 10 }}>· {fmt(f.paidThisMonth)} paid</span>}
                                </>
                              )
                            }
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* IOU summary inline */}
                {iouSummary && iouSummary.totalOpen > 0 && (
                  <div style={{ marginTop: 14, padding: "10px 12px", background: "#13201a", border: "0.5px solid #2a4a35", borderRadius: 9 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11.5, color: "#5a8a6f" }}>📥 Money owed to you</span>
                      <span style={{ fontSize: 13, color: "#3FA66A", fontWeight: 600 }}>{fmt(iouSummary.totalOpen)}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "#777", marginTop: 4 }}>
                      Net position: <strong style={{ color: "#E24B4A" }}>{fmtL(debtSummary.totalOutstanding - iouSummary.totalOpen)}</strong> after collecting IOUs
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ MONEY I'VE LENT (IOUs) ═══ */}
            {iouSummary && (
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: "#888", textTransform: "uppercase", letterSpacing: ".12em" }}>📥 Money I lent out</div>
                    <div style={{ fontSize: 11.5, color: "#666", marginTop: 3 }}>
                      {iouSummary.openCount} open {iouSummary.openCount === 1 ? "IOU" : "IOUs"} · <strong style={{ color: "#3FA66A" }}>{fmt(iouSummary.totalOpen)}</strong> owed to you
                      {iouSummary.totalSettledMonth > 0 && <span style={{ color: "#888" }}> · {fmt(iouSummary.totalSettledMonth)} collected this month</span>}
                    </div>
                  </div>
                  <button className="btn-o" style={{ fontSize: 11, padding: "5px 11px" }} onClick={() => setShowAddIou(v => !v)}>
                    {showAddIou ? "Cancel" : "+ Add"}
                  </button>
                </div>

                {showAddIou && (
                  <div style={{ marginTop: 12, padding: "11px 13px", background: "#0e0e0e", border: "0.5px solid #2a2a2a", borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>Who did you lend money to?</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 7, marginBottom: 7 }}>
                      <input type="text" placeholder="Name (e.g. Ravi, Priya)" value={iouName} onChange={e => setIouName(e.target.value)} />
                      <input type="number" placeholder="₹ amount" value={iouAmount} onChange={e => setIouAmount(e.target.value)} />
                    </div>
                    <input type="text" placeholder="Note (optional — e.g. lunch, rent split)" value={iouNote} onChange={e => setIouNote(e.target.value)} style={{ width: "100%", marginBottom: 9 }} />
                    <button className="btn" onClick={async () => {
                      if (!iouName.trim() || !Number(iouAmount)) return;
                      const r = await api("addIou", { name: iouName, amount: iouAmount, note: iouNote });
                      setIouName(""); setIouAmount(""); setIouNote(""); setShowAddIou(false);
                      refresh(r);
                    }}>Log IOU</button>
                  </div>
                )}

                {iouSummary.open.length > 0 ? (
                  <div style={{ marginTop: showAddIou ? 12 : 10 }}>
                    {iouSummary.open.map(i => (
                      <div key={i.id} style={{ padding: "10px 0", borderBottom: "0.5px solid #222", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: "#e8e8e3", fontWeight: 500 }}>{i.name}</div>
                          <div style={{ fontSize: 10.5, color: "#666", marginTop: 2 }}>
                            {new Date(i.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            {i.note && <span> · {i.note}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13.5, color: "#3FA66A", fontWeight: 600 }}>{fmt(i.amount)}</div>
                        </div>
                        <div style={{ display: "flex", gap: 5 }}>
                          <button className="btn-o" style={{ padding: "5px 10px", fontSize: 11, color: "#3FA66A", borderColor: "#2a4a35" }} onClick={async () => {
                            const r = await api("settleIou", { id: i.id });
                            refresh(r);
                          }}>✓ Got it back</button>
                          <button onClick={async () => {
                            if (!confirm(`Delete IOU from ${i.name} (${fmt(i.amount)})?`)) return;
                            const r = await api("deleteIou", { id: i.id });
                            refresh(r);
                          }} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !showAddIou && (
                  <div style={{ fontSize: 12, color: "#666", padding: "10px 0", lineHeight: 1.6 }}>
                    No open IOUs. When you lend money, tap <strong style={{ color: "#888" }}>+ Add</strong> to track it so you don&apos;t forget.
                  </div>
                )}

                {iouSummary.settled.length > 0 && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ fontSize: 11, color: "#777", cursor: "pointer", padding: "4px 0" }}>
                      Settled history ({iouSummary.settled.length})
                    </summary>
                    <div style={{ marginTop: 6 }}>
                      {iouSummary.settled.map(i => (
                        <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 11.5, color: "#666" }}>
                          <span style={{ textDecoration: "line-through" }}>{i.name} {i.note && `· ${i.note}`}</span>
                          <span>{fmt(i.amount)} · {new Date(i.settledTs).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* ═══ AI ANALYSIS ═══ */}
            <div className="card" style={{ background: "linear-gradient(160deg,#141a1f,#0f1318)", border: "0.5px solid #203a4a" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: "#5a9aff", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 600 }}>🧠 AI Analysis</div>
                  <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>
                    {analysisTs ? `Last run: ${analysisTs.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "Get a structured read on your current spending & capacity"}
                  </div>
                </div>
                <button className="btn" style={{ background: analysis ? "transparent" : "#5a9aff", color: analysis ? "#5a9aff" : "#fff", border: analysis ? "0.5px solid #5a9aff" : "none", padding: "7px 14px", fontSize: 12 }} onClick={runAnalysis} disabled={analysisBusy}>
                  {analysisBusy ? "Analyzing…" : analysis ? "Re-run" : "Analyze now"}
                </button>
              </div>

              {analysisBusy && (
                <div style={{ fontSize: 12.5, color: "#888", padding: "10px 0", lineHeight: 1.6 }}>
                  Reading your envelopes, bills, debts, and goals… Claude is doing the math.
                </div>
              )}

              {!analysisBusy && analysis && (() => {
                const parsed = parseAnalysis(analysis);
                if (!parsed) {
                  return <div style={{ fontSize: 12.5, color: "#bbb", lineHeight: 1.7, whiteSpace: "pre-wrap", paddingTop: 4 }}>{analysis}</div>;
                }
                const colorByIcon = {
                  "📊": "#5a9aff", "💪": "#3FA66A", "🚨": "#E24B4A", "💎": "#E8A317", "📅": "#9F77DD",
                };
                return (
                  <div style={{ marginTop: 4 }}>
                    {parsed.map((p, i) => {
                      const c = colorByIcon[p.icon] || "#888";
                      return (
                        <div key={i} style={{ borderLeft: `2.5px solid ${c}`, paddingLeft: 11, marginBottom: i === parsed.length - 1 ? 0 : 13 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: c, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05em" }}>
                            {p.icon} {p.title}
                          </div>
                          <div style={{ fontSize: 12.5, color: "#ccc", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{p.body}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {!analysisBusy && !analysis && (
                <div style={{ fontSize: 12, color: "#666", marginTop: 4, lineHeight: 1.6 }}>
                  Tap "Analyze now" and Claude will give you:
                  <div style={{ marginTop: 6, paddingLeft: 4, color: "#888" }}>
                    📊 Spending health · 💪 Whether you can spend more today · 🚨 Top leak · 💎 Top opportunity · 📅 Next 7 days plan
                  </div>
                </div>
              )}
            </div>

            {/* ═══ BILLS THIS MONTH ═══ */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: "#888", textTransform: "uppercase", letterSpacing: ".12em" }}>📋 Fixed bills</div>
                  <div style={{ fontSize: 11.5, color: "#666", marginTop: 3 }}>
                    {bills.filter(b => b.isPaid).length} / {bills.length} paid · <strong style={{ color: billsRemain > 0 ? "#E8A317" : "#3FA66A" }}>{fmt(billsRemain)} still due</strong>
                  </div>
                </div>
                {(overdueCount > 0 || dueSoonCount > 0) && (
                  <div style={{ textAlign: "right" }}>
                    {overdueCount > 0 && <div className="badge" style={{ background: "#3a1a1a", color: "#E24B4A", marginLeft: 4 }}>{overdueCount} overdue</div>}
                    {dueSoonCount > 0 && <div className="badge" style={{ background: "#3a2a10", color: "#E8A317", marginLeft: 4, marginTop: overdueCount > 0 ? 4 : 0 }}>{dueSoonCount} due soon</div>}
                  </div>
                )}
              </div>
              {/* aggregate bills progress */}
              <div className="pt" style={{ height: 6, marginTop: 10, marginBottom: 14 }}>
                <div className="pf" style={{ width: Math.min(100, (billsPaidSum / Math.max(1, billsTotal)) * 100) + "%", background: "#3FA66A", height: 6 }} />
              </div>

              {bills.map(b => {
                const color = b.isPaid ? "#3FA66A" : b.isOverdue ? "#E24B4A" : b.isDueSoon ? "#E8A317" : "#666";
                const status = b.isPaid ? "✓ paid" : b.isOverdue ? `${Math.abs(b.daysUntilDue)}d overdue` : b.isDueSoon ? `due in ${b.daysUntilDue}d` : `due day ${b.dueDay}`;
                const remaining = Math.max(0, b.amount - b.paid);
                const inputVal = billAmounts[b.id] !== undefined ? billAmounts[b.id] : "";
                const editingDue = billDueEdit[b.id] !== undefined;
                return (
                  <div key={b.id} style={{ padding: "10px 0", borderBottom: "0.5px solid #222" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 17 }}>{b.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: b.isPaid ? "#777" : "#e8e8e3", textDecoration: b.isPaid ? "line-through" : "none" }}>{b.label}</div>
                          <div style={{ fontSize: 10.5, color, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: color }} />
                            {editingDue ? (
                              <>
                                <span>due day</span>
                                <input
                                  type="number"
                                  min="1" max="31"
                                  autoFocus
                                  value={billDueEdit[b.id]}
                                  onChange={e => setBillDueEdit(p => ({ ...p, [b.id]: e.target.value }))}
                                  onKeyDown={async (e) => {
                                    if (e.key === "Enter") {
                                      const v = Number(billDueEdit[b.id]);
                                      if (v >= 1 && v <= 31 && v !== b.dueDay) {
                                        const r = await api("updateBill", { id: b.id, patch: { dueDay: v } });
                                        setData(r);
                                      }
                                      setBillDueEdit(p => { const n = { ...p }; delete n[b.id]; return n; });
                                    }
                                    if (e.key === "Escape") {
                                      setBillDueEdit(p => { const n = { ...p }; delete n[b.id]; return n; });
                                    }
                                  }}
                                  style={{ width: 44, fontSize: 10.5, padding: "1px 5px", height: 18 }}
                                />
                                <button onClick={async () => {
                                  const v = Number(billDueEdit[b.id]);
                                  if (v >= 1 && v <= 31 && v !== b.dueDay) {
                                    const r = await api("updateBill", { id: b.id, patch: { dueDay: v } });
                                    setData(r);
                                  }
                                  setBillDueEdit(p => { const n = { ...p }; delete n[b.id]; return n; });
                                }} style={{ background: "none", border: "none", color: "#3FA66A", cursor: "pointer", fontSize: 11, padding: 0 }}>✓</button>
                                <button onClick={() => setBillDueEdit(p => { const n = { ...p }; delete n[b.id]; return n; })} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 11, padding: 0 }}>×</button>
                              </>
                            ) : (
                              <>
                                <span>{status}</span>
                                {!b.isPaid && (
                                  <button
                                    onClick={() => setBillDueEdit(p => ({ ...p, [b.id]: b.dueDay }))}
                                    title="Edit due day"
                                    style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 10, padding: "0 2px", marginLeft: 1 }}
                                  >✎</button>
                                )}
                              </>
                            )}
                            {b.paid > 0 && b.paid < b.amount && !editingDue && <span style={{ color: "#888" }}> · paid {fmt(b.paid)}</span>}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: b.isPaid ? "#777" : "#e8e8e3" }}>{fmt(b.amount)}</div>
                        {!b.isPaid && remaining < b.amount && <div style={{ fontSize: 10.5, color: "#E8A317" }}>{fmt(remaining)} left</div>}
                      </div>
                    </div>
                    {!b.isPaid && (
                      <div style={{ display: "flex", gap: 6, marginLeft: 27, marginTop: 8 }}>
                        <input
                          type="number"
                          placeholder={`Type partial or leave blank for full (${fmt(remaining).replace("₹","₹")})`}
                          value={inputVal}
                          onChange={e => setBillAmounts(p => ({ ...p, [b.id]: e.target.value }))}
                          style={{ flex: 1, fontSize: 12, padding: "6px 9px" }}
                        />
                        <button
                          className="btn-o"
                          style={{ padding: "6px 12px", fontSize: 11.5, whiteSpace: "nowrap" }}
                          onClick={async () => {
                            const amt = Number(inputVal) || remaining;
                            if (amt <= 0) return;
                            const r = await api("payBill", { amount: amt, category: b.category, label: b.label });
                            setBillAmounts(p => { const n = { ...p }; delete n[b.id]; return n; });
                            refresh(r);
                          }}
                        >
                          Log {Number(inputVal) > 0 && Number(inputVal) < remaining ? fmt(Number(inputVal)) : fmt(remaining)}
                        </button>
                      </div>
                    )}
                    {b.isPaid && (
                      <div style={{ marginLeft: 27, marginTop: 4 }}>
                        <button onClick={async () => { const r = await api("undoBill", { category: b.category }); refresh(r); }} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 10.5, padding: 0, textDecoration: "underline" }}>
                          undo last payment
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ═══ HEADS UP (warnings + info, collapsible) ═══ */}
            {(warningRecs.length > 0 || infoRecs.length > 0) && (
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 10.5, color: "#888", textTransform: "uppercase", letterSpacing: ".12em" }}>💡 Heads up</div>
                  <div style={{ fontSize: 10.5, color: "#666" }}>{warningRecs.length + infoRecs.length} note{warningRecs.length + infoRecs.length > 1 ? "s" : ""}</div>
                </div>
                {[...warningRecs, ...infoRecs].slice(0, showAllRecs ? 99 : 3).map((r, i, arr) => {
                  const c = { warning: "#E8A317", info: "#5a9aff", good: "#3FA66A" }[r.urgency] || "#888";
                  return (
                    <div key={i} style={{ borderLeft: `2.5px solid ${c}`, paddingLeft: 11, marginBottom: i === arr.length - 1 ? 0 : 11 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: c, marginBottom: 2 }}>{r.icon} {r.title}</div>
                      <div style={{ fontSize: 11.5, color: "#aaa", lineHeight: 1.5 }}>{r.body}</div>
                    </div>
                  );
                })}
                {(warningRecs.length + infoRecs.length) > 3 && (
                  <button onClick={() => setShowAllRecs(v => !v)} style={{ marginTop: 10, background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: 11.5, padding: 0 }}>
                    {showAllRecs ? "Show less" : `Show ${(warningRecs.length + infoRecs.length) - 3} more`} →
                  </button>
                )}
              </div>
            )}

            {/* ═══ RENOVATION GOAL ═══ */}
            <div className="card" style={{ background: "#1a1614", border: "0.5px solid #3a2a20" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: "#a86", textTransform: "uppercase", letterSpacing: ".12em" }}>🧱 Renovation fund</div>
                  <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>Tile work · ₹2L needed immediately</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="serif" style={{ fontSize: 22 }}>{fmt(state.goalSavings?.renovation || 0)}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>of {fmt(cfgGoals.renovationImmediate.needed)}</div>
                </div>
              </div>
              <div className="pt" style={{ marginTop: 10 }}>
                <div className="pf" style={{ width: Math.min(100, ((state.goalSavings?.renovation || 0) / cfgGoals.renovationImmediate.needed) * 100) + "%", background: "#E8A317" }} />
              </div>
              <div style={{ fontSize: 11, color: "#777", marginTop: 6 }}>
                {Math.max(0, cfgGoals.renovationImmediate.needed - (state.goalSavings?.renovation || 0)).toLocaleString("en-IN", { maximumFractionDigits: 0 }) === "0" ? "✅ Goal reached!" : `₹${Math.max(0, cfgGoals.renovationImmediate.needed - (state.goalSavings?.renovation || 0)).toLocaleString("en-IN")} more to go`}
              </div>
              <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
                <input type="number" placeholder="Add ₹ to fund" value={renoFund} onChange={e => setRenoFund(e.target.value)} style={{ flex: 1, minWidth: 110 }} />
                <button className="btn-o" onClick={async () => {
                  const v = Number(renoFund);
                  if (!v) return;
                  const r = await api("logGoalSaving", { goal: "renovation", amount: v });
                  setRenoFund("");
                  refresh(r);
                }}>Add</button>
              </div>
            </div>

            {/* ═══ TODAY'S EXPENSE LOG ═══ */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, color: "#888", textTransform: "uppercase", letterSpacing: ".12em" }}>Today's log</div>
                <div style={{ fontSize: 11, color: "#666" }}>{todayExpenses.length} {todayExpenses.length === 1 ? "entry" : "entries"}</div>
              </div>
              {todayExpenses.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "#666", padding: "8px 0", lineHeight: 1.6 }}>
                  Nothing logged yet. Bank email auto-logs land here, or use the <button onClick={() => setTab("spend")} style={{ background: "none", border: "none", color: "#7aa", cursor: "pointer", padding: 0, fontSize: 12.5, textDecoration: "underline" }}>Spending tab</button> to add manually.
                </div>
              ) : (
                todayExpenses.slice().reverse().map(e => (
                  <div key={e.id} className="row">
                    <span>{CATEGORIES[e.category]?.icon || "📦"} {e.merchant || CATEGORIES[e.category]?.label || e.category}<span style={{ fontSize: 10.5, color: "#555", marginLeft: 6 }}>{e.source}</span></span>
                    <span style={{ fontWeight: 500 }}>{fmt(e.amount)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          );
        })()}

        {/* ═══════════════ SPENDING ═══════════════ */}
        {tab === "spend" && (
          <div>
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Add expense manually</div>
              <div style={{ fontSize: 11.5, color: "#777", marginBottom: 12 }}>Forgot to log something from yesterday? Pick the date below or use quick shortcuts.</div>

              {/* row 1: amount + merchant + category */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <input type="number" placeholder="₹ amount" value={mAmount} onChange={e => setMAmount(e.target.value)} style={{ width: 110 }} />
                <input type="text" placeholder="merchant (optional)" value={mMerchant} onChange={e => setMMerchant(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
                <select value={mCat} onChange={e => setMCat(e.target.value)}>
                  {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.icon} {c.label}</option>)}
                </select>
              </div>

              {/* row 2: when + add */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11.5, color: "#888" }}>When:</span>
                <input
                  type="datetime-local"
                  value={mWhen}
                  onChange={e => setMWhen(e.target.value)}
                  style={{ flex: "1 1 200px", minWidth: 180, fontSize: 12 }}
                  title="Leave blank for now"
                />
                <button className="btn-o" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => setMWhen("")}>Now</button>
                <button className="btn-o" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => setMWhen(nowLocalStr(-1, 12))}>Yesterday</button>
                <button className="btn-o" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => setMWhen(nowLocalStr(-2, 12))}>2 days ago</button>
                <button className="btn" onClick={addManual}>Add</button>
              </div>

              {mWhen && (
                <div style={{ fontSize: 11, color: "#E8A317", marginTop: 8 }}>
                  ⏱ Will be logged with timestamp: {new Date(mWhen).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>

            <div className="card">
              <div style={{ fontSize: 11, color: "#777", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>This month — flex spending</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
                <div className="serif" style={{ fontSize: 30, color: monthFlexSpent > cfgDailyFlex ? "#E24B4A" : "#e8e8e3" }}>{fmt(monthFlexSpent)}</div>
                <div style={{ fontSize: 13, color: "#777" }}>of {fmt(cfgDailyFlex)} budget</div>
              </div>
              <div className="pt"><div className="pf" style={{ width: Math.min(100, (monthFlexSpent / cfgDailyFlex) * 100) + "%", background: monthFlexSpent > cfgDailyFlex ? "#E24B4A" : "#3FA66A" }} /></div>
            </div>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: "#777", textTransform: "uppercase", letterSpacing: ".06em" }}>All expenses this month</span>
                <button className="btn-o" onClick={async () => { const r = await api("closeMonth", {}); refresh(r); }}>Close month</button>
              </div>
              {state.expenses.slice().reverse().slice(0, 40).map(e => (
                <div key={e.id} className="row">
                  <div>
                    <span>{CATEGORIES[e.category]?.icon || "📦"} {e.merchant || CATEGORIES[e.category]?.label}</span>
                    <span style={{ fontSize: 11, color: "#666", marginLeft: 8 }}>{new Date(e.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {e.source}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontWeight: 500 }}>{fmt(e.amount)}</span>
                    <button onClick={async () => { const r = await api("deleteExpense", { id: e.id }); refresh(r); }} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16 }}>×</button>
                  </div>
                </div>
              ))}
              {state.expenses.length === 0 && <div style={{ fontSize: 13, color: "#666" }}>No expenses yet.</div>}
            </div>
          </div>
        )}

        {/* ═══════════════ DEBTS ═══════════════ */}
        {tab === "debts" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, marginBottom: 13 }}>
              <div className="mc"><div style={{ fontSize: 10.5, color: "#777" }}>Total debt</div><div className="serif" style={{ fontSize: 21, color: "#E24B4A" }}>{fmtL(totalDebt)}</div></div>
              <div className="mc"><div style={{ fontSize: 10.5, color: "#777" }}>Debt-free in</div><div className="serif" style={{ fontSize: 21, color: proj.months <= 12 ? "#3FA66A" : "#E8A317" }}>{proj.months}mo</div></div>
              <div className="mc"><div style={{ fontSize: 10.5, color: "#777" }}>MF corpus</div><div className="serif" style={{ fontSize: 21, color: "#3FA66A" }}>₹5L</div></div>
            </div>

            <div className="card">
              <div style={{ fontSize: 11, color: "#777", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Paydown curve (avalanche)</div>
              <canvas ref={chartRef} style={{ width: "100%", height: 170, display: "block" }} />
            </div>

            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Attack order — highest interest first</div>
              <div style={{ fontSize: 12, color: "#777", marginBottom: 12 }}>Log a payment and watch the balance drop.</div>
              {state.debts.slice().sort((a, b) => b.rate - a.rate).map(d => (
                <div key={d.id} style={{ padding: "11px 0", borderBottom: "0.5px solid #222" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.balance <= 1 ? "#3FA66A" : d.color }} />
                      <span style={{ fontSize: 13.5, color: d.balance <= 1 ? "#666" : "#e8e8e3", textDecoration: d.balance <= 1 ? "line-through" : "none" }}>{d.name}</span>
                      <span className="badge" style={{ background: d.rate > 20 ? "#2a1414" : d.rate > 5 ? "#2a2310" : "#1a1a1a", color: d.rate > 20 ? "#E24B4A" : d.rate > 5 ? "#E8A317" : "#888" }}>{d.rate}%</span>
                    </div>
                    <span className="serif" style={{ fontSize: 16 }}>{fmtL(d.balance)}</span>
                  </div>
                  {d.balance > 1 && (
                    <div style={{ display: "flex", gap: 7 }}>
                      <input type="number" placeholder="paid ₹" value={payAmounts[d.id] || ""} onChange={e => setPayAmounts(p => ({ ...p, [d.id]: e.target.value }))} style={{ width: 110 }} />
                      <button className="btn-o" onClick={() => payDebt(d.id)}>Log payment</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════ SYSTEM ═══════════════ */}
        {tab === "system" && (
          <div>
            <div className="card" style={{ background: "#1a1414", border: "0.5px solid #3a2020" }}>
              <div style={{ fontSize: 10.5, color: "#a86", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>The root problem</div>
              <div style={{ fontSize: 15, lineHeight: 1.6, color: "#ddd" }}>"If I have money → I spend it. When empty → I borrow." The fix isn't willpower. It's making money <strong style={{ color: "#fff" }}>invisible before you can spend it.</strong></div>
            </div>
            {cfgEnvelopes.map(env => (
              <div key={env.id} className="mc" style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 20 }}>{env.icon}</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{env.label}</div>
                      <div style={{ fontSize: 11.5, color: "#888", marginTop: 1 }}>{env.desc}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="serif" style={{ fontSize: 19 }}>{fmt(env.amount)}</div>
                    {env.locked && <span className="badge" style={{ background: "#222", color: "#888" }}>locked</span>}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: "#777", textTransform: "uppercase", letterSpacing: ".07em", margin: "16px 0 10px" }}>6 personal laws</div>
            {RULES.map(r => {
              const done = rulesDone[r.id];
              return (
                <div key={r.id} className="rule" onClick={() => setRulesDone(p => ({ ...p, [r.id]: !done }))} style={{ background: done ? "#13241a" : "#161616", borderColor: done ? "#2a4a35" : "#262626" }}>
                  <span style={{ fontSize: 21 }}>{r.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 2 }}>{r.title}</div>
                    <div style={{ fontSize: 12.5, color: "#999", lineHeight: 1.5 }}>{r.body}</div>
                  </div>
                  <div style={{ width: 21, height: 21, borderRadius: "50%", border: `1.5px solid ${done ? "#3FA66A" : "#444"}`, display: "flex", alignItems: "center", justifyContent: "center", background: done ? "#3FA66A" : "transparent", color: "#0e0e0e", fontSize: 12 }}>{done ? "✓" : ""}</div>
                </div>
              );
            })}
            <div className="card" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 26 }}>🔥</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: "#666", textTransform: "uppercase", letterSpacing: ".08em" }}>Discipline streak</div>
                <div className="serif" style={{ fontSize: 24 }}>{state.rulesStreak} days</div>
              </div>
              <button className="btn" onClick={async () => { if (Object.keys(rulesDone).filter(k => rulesDone[k]).length >= 6) { const r = await api("logStreak", {}); refresh(r); setRulesDone({}); } }}>Log today</button>
            </div>
          </div>
        )}

        {/* ═══════════════ IMPULSE ═══════════════ */}
        {tab === "impulse" && (
          <div>
            <div className="card" style={{ background: "#1a1414", border: "0.5px solid #3a2020" }}>
              <div style={{ fontSize: 14, color: "#ddd", lineHeight: 1.6 }}>Want to buy something unplanned? Log it. Wait 10 minutes. Seeing it written kills most of the urge.</div>
            </div>
            <div className="card">
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" placeholder="What do you want?" value={impText} onChange={e => setImpText(e.target.value)} style={{ flex: 1 }} />
                <input type="number" placeholder="₹" value={impAmt} onChange={e => setImpAmt(e.target.value)} style={{ width: 90 }} />
                <button className="btn" onClick={() => { if (!impText.trim()) return; setImpulses(p => [{ id: Date.now(), text: impText, amount: Number(impAmt) || 0, decided: null }, ...p]); setImpText(""); setImpAmt(""); }}>Log</button>
              </div>
            </div>
            {impulses.map(item => (
              <div key={item.id} className="card" style={{ borderLeft: `3px solid ${item.decided === "skip" ? "#3FA66A" : item.decided === "buy" ? "#E24B4A" : "#333"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{item.text}</span>
                  {item.amount > 0 && <span style={{ textAlign: "right" }}><span className="serif" style={{ fontSize: 18 }}>{fmt(item.amount)}</span><div style={{ fontSize: 11, color: "#666" }}>{Math.floor(item.amount / 7200)} work-days</div></span>}
                </div>
                {!item.decided && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-o" style={{ borderColor: "#2a4a35", color: "#3FA66A" }} onClick={() => setImpulses(p => p.map(i => i.id === item.id ? { ...i, decided: "skip", skipped: true } : i))}>✓ Skip it</button>
                    <button className="btn-o" style={{ borderColor: "#3a2020", color: "#E24B4A" }} onClick={() => setImpulses(p => p.map(i => i.id === item.id ? { ...i, decided: "buy" } : i))}>Buy it</button>
                  </div>
                )}
                {item.decided === "skip" && <div style={{ fontSize: 13, color: "#3FA66A" }}>✅ Skipped — money stays in the fight.</div>}
                {item.decided === "buy" && <div style={{ fontSize: 13, color: "#888" }}>Bought. Was it from Freedom Money? Log it.</div>}
              </div>
            ))}
            {savedByImpulse > 0 && <div className="card" style={{ background: "#13241a", border: "0.5px solid #2a4a35", color: "#3FA66A", fontWeight: 500 }}>🎯 Saved by saying no: {fmt(savedByImpulse)}</div>}
          </div>
        )}

        {/* ═══════════════ ADVISOR ═══════════════ */}
        {tab === "advisor" && (
          <div>
            <div className="card" style={{ background: "#141a1a", border: "0.5px solid #203a3a" }}>
              <div style={{ fontSize: 13.5, color: "#ddd", lineHeight: 1.6 }}>Ask anything. The advisor knows your full picture and will tell you the hard truth — including whether you can afford something or not.</div>
            </div>

            {/* Structured analysis button */}
            <div className="card" style={{ background: "linear-gradient(160deg,#141a1f,#0f1318)", border: "0.5px solid #203a4a" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a9aff" }}>🧠 Run full analysis</div>
                  <div style={{ fontSize: 11.5, color: "#888", marginTop: 3 }}>Structured 5-section read — same as Today tab</div>
                </div>
                <button className="btn" style={{ background: "#5a9aff", color: "#fff", border: "none" }} onClick={runAnalysis} disabled={analysisBusy}>
                  {analysisBusy ? "Analyzing…" : "Analyze"}
                </button>
              </div>
              {analysis && !analysisBusy && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid #1a2a3a", fontSize: 12.5, color: "#bbb", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{analysis}</div>
              )}
            </div>

            <div style={{ fontSize: 10.5, color: "#666", textTransform: "uppercase", letterSpacing: ".08em", margin: "6px 0 8px" }}>Quick questions</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
              {["Can I spend ₹2,000 today on something extra?","What should I do this week?","Can I buy a bike for ₹80k next month?","Should I sell mutual funds to clear debt?","I got a ₹20k bonus — what now?","Should I pause SIP for renovation?"].map(q => (
                <button key={q} className="btn-o" style={{ fontSize: 12 }} onClick={() => { setAiInput(q); askAI(q); }}>{q}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <textarea placeholder="e.g. I want to buy a bike for ₹80,000 next month — how do I plan it without wrecking my debt timeline?" value={aiInput} onChange={e => setAiInput(e.target.value)} style={{ flex: 1, minHeight: 70 }} />
              <button className="btn" style={{ alignSelf: "flex-end" }} onClick={() => askAI(aiInput)}>Ask</button>
            </div>
            {aiBusy && <div className="card" style={{ color: "#888" }}>Thinking through your numbers…</div>}
            {aiReply && !aiBusy && (
              <div className="card" style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.7, color: "#ddd" }}>{aiReply}</div>
            )}
          </div>
        )}

        {/* ═══════════════ HISTORY ═══════════════ */}
        {tab === "history" && (
          <div>
            {historyLoading && <div style={{ color: "#666", fontSize: 13, padding: "20px 0" }}>Loading history…</div>}
            {historyData && (() => {
              const { months, trends, stats, profile: histProfile } = historyData;
              const envColors = { survival:"#6b8aff", food:"#FFB347", freedom:"#E24B4A", sip:"#3FA66A", debt:"#9F77DD", emergency:"#888" };
              const totalSpentRange = months.reduce((s, m) => s + m.spent, 0);
              const totalDebtRange  = months.reduce((s, m) => s + m.debtPaid, 0);
              const hasData = totalSpentRange > 0 || totalDebtRange > 0;

              return (
                <>
                  {/* range picker */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div className="serif" style={{ fontSize: 22 }}>History</div>
                      <div style={{ fontSize: 11.5, color: "#777" }}>Last {historyMonths} months · {hasData ? `${months.reduce((s,m)=>s+m.expenseCount,0)} expenses logged` : "no data yet"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {[3, 6, 12, 24].map(m => (
                        <button key={m} className="btn-o" style={{ fontSize: 11, padding: "5px 10px", background: historyMonths === m ? "#1a2a3a" : "transparent", borderColor: historyMonths === m ? "#5a9aff" : "#333", color: historyMonths === m ? "#5a9aff" : "#888" }} onClick={() => setHistoryMonths(m)}>
                          {m}mo
                        </button>
                      ))}
                    </div>
                  </div>

                  {!hasData && (
                    <div className="card" style={{ background: "#1a1814", border: "0.5px solid #3a3220", color: "#a89060", fontSize: 12.5, lineHeight: 1.7 }}>
                      ⚠️ No historical data yet. Log expenses (Spending tab or via OpenCLAW) for a few weeks, then this view will show meaningful trends. {!data?.state?.config && "Also: data persists only if Vercel KV is configured — check Config → Storage."}
                    </div>
                  )}

                  {hasData && (
                    <>
                      {/* summary stats */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, marginBottom: 13 }}>
                        <div className="mc">
                          <div style={{ fontSize: 10.5, color: "#777" }}>Avg monthly spend</div>
                          <div className="serif" style={{ fontSize: 20 }}>{fmtL(stats.avgSpent || 0)}</div>
                          {stats.currentVsAvg && (
                            <div style={{ fontSize: 10.5, color: stats.currentVsAvg.spent > 0 ? "#E24B4A" : "#3FA66A", marginTop: 2 }}>
                              this month {stats.currentVsAvg.spent > 0 ? "+" : ""}{fmt(stats.currentVsAvg.spent)}
                            </div>
                          )}
                        </div>
                        <div className="mc">
                          <div style={{ fontSize: 10.5, color: "#777" }}>Avg debt paid</div>
                          <div className="serif" style={{ fontSize: 20, color: "#3FA66A" }}>{fmtL(stats.avgDebtPaid || 0)}</div>
                          <div style={{ fontSize: 10.5, color: "#666", marginTop: 2 }}>per month</div>
                        </div>
                        <div className="mc">
                          <div style={{ fontSize: 10.5, color: "#777" }}>Total {historyMonths}mo</div>
                          <div className="serif" style={{ fontSize: 20 }}>{fmtL(stats.totalAcross)}</div>
                          <div style={{ fontSize: 10.5, color: "#666", marginTop: 2 }}>across all</div>
                        </div>
                      </div>

                      {/* bar chart: month-by-month spend + debt paid */}
                      <div className="card">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <div style={{ fontSize: 10.5, color: "#777", textTransform: "uppercase", letterSpacing: ".08em" }}>Month-by-month</div>
                          <div style={{ fontSize: 10.5, color: "#666", display: "flex", gap: 12 }}>
                            <span><span style={{ display: "inline-block", width: 10, height: 6, background: "#4a9eff", borderRadius: 2, marginRight: 4 }} />spend</span>
                            <span><span style={{ display: "inline-block", width: 10, height: 6, background: "#3FA66A", borderRadius: 2, marginRight: 4 }} />debt paid</span>
                            <span><span style={{ display: "inline-block", width: 10, height: 0, borderTop: "1px dashed #E24B4A99", marginRight: 4, verticalAlign: "middle" }} />income</span>
                          </div>
                        </div>
                        <canvas ref={historyBarRef} style={{ width: "100%", height: 180, display: "block" }} />
                      </div>

                      {/* envelope trend table */}
                      <div className="card">
                        <div style={{ fontSize: 10.5, color: "#777", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Envelope trend</div>
                        {Object.entries(trends.byEnvelope).map(([id, env]) => {
                          const max = Math.max(...env.data, 1);
                          const total = env.data.reduce((s, v) => s + v, 0);
                          return (
                            <div key={id} style={{ padding: "9px 0", borderBottom: "0.5px solid #222" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                <span style={{ fontSize: 12.5, color: "#ccc" }}>{env.icon} {env.label}</span>
                                <span style={{ fontSize: 11, color: "#888" }}>{fmtL(total)} total · avg {fmt(Math.round(total / env.data.length))}/mo</span>
                              </div>
                              {/* mini sparkline bars */}
                              <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 28 }}>
                                {env.data.map((v, i) => {
                                  const h = Math.max(2, Math.round((v / max) * 26));
                                  return (
                                    <div key={i} style={{ flex: 1, height: h, background: envColors[id] || "#666", opacity: i === env.data.length - 1 ? 1 : 0.7, borderRadius: "2px 2px 0 0" }}
                                      title={`${trends.months[i]}: ${fmt(v)}`} />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* monthly drill-down list */}
                      <div className="card">
                        <div style={{ fontSize: 10.5, color: "#777", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Each month — tap to expand</div>
                        {months.slice().reverse().map(m => {
                          const expanded = historyExpanded === m.key;
                          const vsIncome = histProfile.income ? Math.round((m.spent / histProfile.income) * 100) : 0;
                          return (
                            <div key={m.key} style={{ borderBottom: "0.5px solid #222", padding: "10px 0", cursor: "pointer" }} onClick={() => setHistoryExpanded(expanded ? null : m.key)}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                  <div style={{ fontSize: 13.5, color: m.isCurrent ? "#E8A317" : "#e8e8e3", fontWeight: 500 }}>
                                    {m.label}{m.isCurrent && <span style={{ fontSize: 10, color: "#E8A317", marginLeft: 6 }}>(current)</span>}
                                  </div>
                                  <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{m.expenseCount} expenses · {vsIncome}% of income</div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <div style={{ fontSize: 14, fontWeight: 600, color: "#e8e8e3" }}>{fmt(m.spent)}</div>
                                  {m.debtPaid > 0 && <div style={{ fontSize: 10.5, color: "#3FA66A" }}>+ {fmt(m.debtPaid)} debt paid</div>}
                                </div>
                                <span style={{ color: "#555", marginLeft: 10, fontSize: 11 }}>{expanded ? "▾" : "▸"}</span>
                              </div>

                              {expanded && (
                                <div style={{ marginTop: 10, paddingLeft: 4 }} onClick={e => e.stopPropagation()}>
                                  {m.topCategories.length > 0 && (
                                    <>
                                      <div style={{ fontSize: 10.5, color: "#666", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Top categories</div>
                                      {m.topCategories.map(c => (
                                        <div key={c.cat} className="row" style={{ fontSize: 12 }}>
                                          <span>{c.icon} {c.label}</span>
                                          <span style={{ fontWeight: 500 }}>{fmt(c.total)}</span>
                                        </div>
                                      ))}
                                    </>
                                  )}
                                  {m.topMerchants.length > 0 && (
                                    <>
                                      <div style={{ fontSize: 10.5, color: "#666", textTransform: "uppercase", letterSpacing: ".06em", margin: "12px 0 6px" }}>Top merchants</div>
                                      {m.topMerchants.map(mr => (
                                        <div key={mr.name} className="row" style={{ fontSize: 12 }}>
                                          <span>{mr.name}</span>
                                          <span style={{ fontWeight: 500 }}>{fmt(mr.total)}</span>
                                        </div>
                                      ))}
                                    </>
                                  )}
                                  {m.expenseCount === 0 && <div style={{ fontSize: 11.5, color: "#666", padding: "4px 0" }}>No expenses logged this month.</div>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ═══════════════ REPORTS ═══════════════ */}
        {tab === "reports" && (
          <div>
            {reportLoading && <div style={{ color: "#666", fontSize: 13, padding: "20px 0" }}>Loading report data…</div>}
            {reportData && (() => {
              const { daily, weekly } = reportData;
              const levelColor = { danger: "#E24B4A", warning: "#E8A317", good: "#3FA66A" };
              const levelBg    = { danger: "#2a1414", warning: "#2a2310", good: "#13241a" };
              const weekBudget = weekly.weekBudget;
              const vsExpSign  = weekly.vsExpected >= 0 ? "+" : "";
              return (
                <>
                  {/* daily snapshot */}
                  <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Daily snapshot — {daily.date}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, marginBottom: 13 }}>
                    <div className="mc">
                      <div style={{ fontSize: 10.5, color: "#777" }}>Left today</div>
                      <div className="serif" style={{ fontSize: 20, color: daily.allowance.remaining > 0 ? "#e8e8e3" : "#E24B4A" }}>{fmt(daily.allowance.remaining)}</div>
                      <div style={{ fontSize: 10.5, color: "#666" }}>of {fmt(daily.allowance.perDay)}</div>
                    </div>
                    <div className="mc">
                      <div style={{ fontSize: 10.5, color: "#777" }}>Month used</div>
                      <div className="serif" style={{ fontSize: 20, color: daily.monthProgress.pctBudgetGone > daily.monthProgress.pctMonthGone + 10 ? "#E24B4A" : "#e8e8e3" }}>{daily.monthProgress.pctBudgetGone}%</div>
                      <div style={{ fontSize: 10.5, color: "#666" }}>{daily.monthProgress.pctMonthGone}% month gone</div>
                    </div>
                    <div className="mc">
                      <div style={{ fontSize: 10.5, color: "#777" }}>Days left</div>
                      <div className="serif" style={{ fontSize: 20 }}>{daily.allowance.daysLeft}</div>
                      <div style={{ fontSize: 10.5, color: "#666" }}>to payday</div>
                    </div>
                  </div>

                  {/* coach verdict */}
                  <div className="card" style={{ background: levelBg[daily.verdict.level], border: `0.5px solid ${levelColor[daily.verdict.level]}44`, marginBottom: 13 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: levelColor[daily.verdict.level], marginBottom: 5 }}>
                      {{ danger:"🔴 ", warning:"🟡 ", good:"🟢 " }[daily.verdict.level]}{daily.verdict.title}
                    </div>
                    <div style={{ fontSize: 12.5, color: "#ccc", lineHeight: 1.6 }}>{daily.verdict.body}</div>
                  </div>

                  {/* 7-day bar chart */}
                  <div className="card">
                    <div style={{ fontSize: 11, color: "#777", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Last 7 days flex spend</div>
                    <canvas ref={reportChartRef} style={{ width: "100%", height: 100, display: "block" }} />
                    <div style={{ fontSize: 11, color: "#666", marginTop: 8 }}>
                      Yellow dashed line = daily allowance ({fmt(daily.allowance.perDay)}). Red bars = over budget.
                    </div>
                  </div>

                  {/* weekly summary */}
                  <div className="card" style={{ marginTop: 0 }}>
                    <div style={{ fontSize: 11, color: "#777", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>This week · {weekly.weekOf}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 12 }}>
                      <div className="mc">
                        <div style={{ fontSize: 10.5, color: "#777" }}>Flex spent</div>
                        <div className="serif" style={{ fontSize: 19, color: weekly.thisFlex > weekBudget ? "#E24B4A" : "#e8e8e3" }}>{fmt(weekly.thisFlex)}</div>
                        <div style={{ fontSize: 10.5, color: "#666" }}>of {fmt(weekBudget)} budget</div>
                      </div>
                      <div className="mc">
                        <div style={{ fontSize: 10.5, color: "#777" }}>vs expected</div>
                        <div className="serif" style={{ fontSize: 19, color: weekly.vsExpected > 0 ? "#E24B4A" : "#3FA66A" }}>{vsExpSign}{fmt(weekly.vsExpected)}</div>
                        <div style={{ fontSize: 10.5, color: "#666" }}>day {weekly.daysIntoWeek} of 7</div>
                      </div>
                    </div>

                    {/* category bars */}
                    {weekly.byCategory.length > 0 && (
                      <>
                        <div style={{ fontSize: 10.5, color: "#666", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>By category</div>
                        {weekly.byCategory.map(c => (
                          <div key={c.cat} style={{ marginBottom: 9 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12.5 }}>
                              <span>{c.icon} {c.label}</span>
                              <span style={{ fontWeight: 500 }}>{fmt(c.total)}</span>
                            </div>
                            <div className="pt">
                              <div className="pf" style={{ width: Math.min(100, Math.round((c.total / weekBudget) * 100)) + "%", background: "#4a9eff" }} />
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {weekly.topMerchants.length > 0 && (
                      <>
                        <div style={{ fontSize: 10.5, color: "#666", textTransform: "uppercase", letterSpacing: ".06em", margin: "12px 0 8px" }}>Top merchants this week</div>
                        {weekly.topMerchants.map(m => (
                          <div key={m.name} className="row">
                            <span>{m.name}</span>
                            <span style={{ fontWeight: 500 }}>{fmt(m.total)}</span>
                          </div>
                        ))}
                      </>
                    )}

                    {weekly.debtPaidThisWeek > 0 && (
                      <div style={{ marginTop: 12, padding: "10px 0", borderTop: "0.5px solid #222", fontSize: 13, color: "#3FA66A" }}>
                        ⚔️ Debt paid this week: <strong>{fmt(weekly.debtPaidThisWeek)}</strong>
                      </div>
                    )}
                  </div>

                  {/* month flex progress */}
                  <div className="card">
                    <div style={{ fontSize: 11, color: "#777", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Month overview</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                      <span>Flex spent</span>
                      <span><strong>{fmt(daily.monthProgress.monthFlexSpent)}</strong> of {fmt(daily.monthProgress.flexBudget)}</span>
                    </div>
                    <div className="pt" style={{ height: 10, marginBottom: 6 }}>
                      <div className="pf" style={{ width: Math.min(100, daily.monthProgress.pctBudgetGone) + "%", background: daily.monthProgress.pctBudgetGone > daily.monthProgress.pctMonthGone + 10 ? "#E24B4A" : "#3FA66A", height: 10 }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666" }}>
                      <span>Budget used: {daily.monthProgress.pctBudgetGone}%</span>
                      <span>Month gone: {daily.monthProgress.pctMonthGone}%</span>
                      <span>Remaining: {fmt(daily.monthProgress.remaining)}</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ═══════════════ CONFIG ═══════════════ */}
        {tab === "config" && (() => {
          const origin = typeof window !== "undefined" ? window.location.origin : "https://your-app.vercel.app";
          const logExpenseUrl  = `${origin}/api/log-expense`;
          const sendReportUrl  = `${origin}/api/send-report?type=daily`;
          const summaryUrl     = `${origin}/api/summary?format=text`;
          const isLocal        = origin.includes("localhost");

          // Status pill component (inline)
          const StatusPill = ({ ok, label }) => (
            <span className="badge" style={{
              background: ok ? "#13241a" : "#2a1414",
              color: ok ? "#3FA66A" : "#E24B4A",
              border: `0.5px solid ${ok ? "#2a4a35" : "#5a2020"}`,
            }}>{ok ? "✓ " : "✗ "}{label}</span>
          );

          // Copy field
          const CopyField = ({ value, k, multiline }) => (
            <div style={{ position: "relative", marginTop: 6 }}>
              {multiline ? (
                <pre style={{ background: "#0a0a0a", border: "0.5px solid #2a2a2a", borderRadius: 8, padding: "10px 12px", fontSize: 11.5, fontFamily: "ui-monospace, monospace", color: "#9c9", overflowX: "auto", whiteSpace: "pre", margin: 0 }}>{value}</pre>
              ) : (
                <div style={{ background: "#0a0a0a", border: "0.5px solid #2a2a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#9c9", overflowX: "auto", whiteSpace: "nowrap" }}>{value}</div>
              )}
              <button onClick={() => copyToClipboard(value, k)} style={{ position: "absolute", top: 6, right: 6, background: "#1a1a1a", border: "0.5px solid #333", color: copied === k ? "#3FA66A" : "#888", borderRadius: 6, padding: "3px 9px", fontSize: 10.5, cursor: "pointer" }}>
                {copied === k ? "✓ copied" : "copy"}
              </button>
            </div>
          );

          return (
          <div>
            {/* Runtime banner */}
            {health && (
              <div className="card" style={{ background: "#1a1814", border: "0.5px solid #3a3220", padding: "10px 14px", marginBottom: 13 }}>
                <div style={{ fontSize: 12, color: "#a89060" }}>
                  Running in <strong>{health.runtime.vercel ? "Vercel (production)" : isLocal ? "local development" : "self-hosted"}</strong> · {origin}
                </div>
              </div>
            )}

            {/* ── STORAGE ── */}
            {health?.storage && (
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>💾 Storage</div>
                    <div style={{ fontSize: 12, color: "#777" }}>
                      {health.storage.backend === "kv"
                        ? "Connected to Vercel KV (Upstash Redis) — data persists across restarts and deploys."
                        : health.storage.backend === "file"
                        ? "Using local file store — data persists across npm restarts."
                        : "Using in-memory store — ⚠️ data resets on every restart."}
                    </div>
                  </div>
                  <StatusPill
                    ok={health.storage.persistent}
                    label={
                      health.storage.backend === "kv"     ? "KV" :
                      health.storage.backend === "file"   ? "File · persistent" :
                      "In-memory · ephemeral"
                    }
                  />
                </div>

                {health.storage.records && (
                  <div style={{ marginTop: 12, padding: "11px 13px", background: "#0e0e0e", border: "0.5px solid #222", borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".08em" }}>Data in store</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 10.5, color: "#666" }}>Expenses</div>
                        <div className="serif" style={{ fontSize: 18 }}>{health.storage.records.expenses}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10.5, color: "#666" }}>Debt payments</div>
                        <div className="serif" style={{ fontSize: 18 }}>{health.storage.records.debtPayments}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10.5, color: "#666" }}>Closed months</div>
                        <div className="serif" style={{ fontSize: 18 }}>{health.storage.records.closedMonths}</div>
                      </div>
                    </div>
                    {health.storage.earliestExpense && (
                      <div style={{ fontSize: 11, color: "#666", marginTop: 10 }}>
                        Earliest expense: {new Date(health.storage.earliestExpense).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        {" · "}Latest: {new Date(health.storage.latestExpense).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    )}
                  </div>
                )}

                {!health.storage.persistent && (
                  <div style={{ marginTop: 14, padding: "11px 13px", background: "#0e0e0e", border: "0.5px solid #222", borderRadius: 8, fontSize: 11.5, color: "#aaa", lineHeight: 1.7 }}>
                    <strong style={{ color: "#E8A317" }}>Set up Upstash KV (free) for persistent storage</strong><br /><br />
                    1. Sign up at <a href="https://upstash.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#7af" }}>upstash.com</a> (or via Vercel → Storage tab)<br />
                    2. Create a Redis database → copy <code>UPSTASH_REDIS_REST_URL</code> and <code>UPSTASH_REDIS_REST_TOKEN</code><br />
                    3. Add to {isLocal ? <code>.env.local</code> : "Vercel env vars"}:
                    <CopyField value={`KV_REST_API_URL=https://your-db.upstash.io\nKV_REST_API_TOKEN=AYour_token_here`} k="kv-env" multiline />
                    4. {isLocal ? "Restart dev server" : "Redeploy"} — store flips to persistent. Your current in-memory data will be lost when you restart unless you back it up first.
                  </div>
                )}

                {health.storage.persistent && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "#666" }}>
                    KV URL: <code style={{ background: "#111", padding: "1px 5px", borderRadius: 4 }}>{health.storage.urlHint}</code>
                  </div>
                )}
              </div>
            )}

            {/* ── INTEGRATION 1: CLAUDE AI ── */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>🧠 Claude AI Advisor</div>
                  <div style={{ fontSize: 12, color: "#777" }}>Powers the Analysis card on Today tab and the Advisor chat.</div>
                </div>
                <StatusPill ok={health?.anthropic?.configured} label={health?.anthropic?.configured ? "Configured" : "Not set"} />
              </div>

              {health?.anthropic?.configured && (
                <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Key: <code style={{ background: "#111", padding: "1px 5px", borderRadius: 4 }}>{health.anthropic.hint}</code></div>
              )}

              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn-o" disabled={testing.anthropic} onClick={() => testIntegration("anthropic")}>
                  {testing.anthropic ? "Testing…" : "Test connection"}
                </button>
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="btn-o" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                  Get API key →
                </a>
              </div>
              {testResults.anthropic && (
                <div style={{ marginTop: 10, fontSize: 12, padding: "8px 12px", borderRadius: 8, background: testResults.anthropic.ok ? "#13241a" : "#2a1414", color: testResults.anthropic.ok ? "#3FA66A" : "#E24B4A" }}>
                  {testResults.anthropic.ok ? `✓ ${testResults.anthropic.message}` : `✗ ${testResults.anthropic.error}`}
                </div>
              )}

              <div style={{ marginTop: 14, padding: "11px 13px", background: "#0e0e0e", border: "0.5px solid #222", borderRadius: 8, fontSize: 11.5, color: "#888", lineHeight: 1.7 }}>
                <strong style={{ color: "#aaa" }}>How to set:</strong><br />
                {isLocal ? (
                  <>
                    Create <code>.env.local</code> in project root with:
                    <CopyField value="ANTHROPIC_API_KEY=sk-ant-..." k="anth-local" />
                    Then restart <code>npm run dev</code>.
                  </>
                ) : (
                  <>
                    Vercel → Settings → Environment Variables → add <code>ANTHROPIC_API_KEY</code>, then redeploy.
                  </>
                )}
              </div>
            </div>

            {/* ── INTEGRATION 2: EMAIL REPORTS ── */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>📧 Email Reports</div>
                  <div style={{ fontSize: 12, color: "#777" }}>Daily 8:30am + weekly Monday digests, auto-sent via Vercel Cron.</div>
                </div>
                <StatusPill ok={health?.resend?.configured && health?.resend?.reportEmail} label={(health?.resend?.configured && health?.resend?.reportEmail) ? "Ready" : "Not set"} />
              </div>

              {health?.resend && (
                <div style={{ fontSize: 11, color: "#666", marginTop: 4, lineHeight: 1.8 }}>
                  Resend key: <code style={{ background: "#111", padding: "1px 5px", borderRadius: 4 }}>{health.resend.hint || "—"}</code><br />
                  Sends to: <code style={{ background: "#111", padding: "1px 5px", borderRadius: 4 }}>{health.resend.reportEmail || "REPORT_EMAIL not set"}</code>
                </div>
              )}

              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn-o" disabled={testing.resend} onClick={() => testIntegration("resend")}>
                  {testing.resend ? "Testing…" : "Test connection"}
                </button>
                <button className="btn" onClick={async () => {
                  setSendingReport(true); setSendResult(null);
                  const res = await fetch(`/api/send-report?type=daily${reportEmail ? "&email=" + encodeURIComponent(reportEmail) : ""}`);
                  setSendResult(await res.json()); setSendingReport(false);
                }} disabled={sendingReport}>
                  {sendingReport ? "Sending…" : "Send daily test"}
                </button>
                <button className="btn-o" onClick={async () => {
                  setSendingReport(true); setSendResult(null);
                  const res = await fetch(`/api/send-report?type=weekly${reportEmail ? "&email=" + encodeURIComponent(reportEmail) : ""}`);
                  setSendResult(await res.json()); setSendingReport(false);
                }} disabled={sendingReport}>
                  Send weekly test
                </button>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <input type="email" placeholder="override email (optional)" value={reportEmail} onChange={e => setReportEmail(e.target.value)} style={{ flex: 1 }} />
              </div>

              {testResults.resend && (
                <div style={{ marginTop: 10, fontSize: 12, padding: "8px 12px", borderRadius: 8, background: testResults.resend.ok ? "#13241a" : "#2a1414", color: testResults.resend.ok ? "#3FA66A" : "#E24B4A" }}>
                  {testResults.resend.ok ? `✓ ${testResults.resend.message}` : `✗ ${testResults.resend.error}`}
                </div>
              )}
              {sendResult && (
                <div style={{ marginTop: 8, fontSize: 12, padding: "8px 12px", borderRadius: 8, background: sendResult.ok ? "#13241a" : "#2a1414", color: sendResult.ok ? "#3FA66A" : "#E24B4A" }}>
                  {sendResult.ok ? `✓ Sent ${sendResult.type} report to ${sendResult.to}` : `✗ ${sendResult.error}`}
                </div>
              )}

              <div style={{ marginTop: 14, padding: "11px 13px", background: "#0e0e0e", border: "0.5px solid #222", borderRadius: 8, fontSize: 11.5, color: "#888", lineHeight: 1.7 }}>
                <strong style={{ color: "#aaa" }}>How to set:</strong><br />
                1. Get free Resend key at <a href="https://resend.com" target="_blank" rel="noopener noreferrer" style={{ color: "#7af" }}>resend.com</a> (3000 emails/mo free)<br />
                2. Add to {isLocal ? <code>.env.local</code> : "Vercel env vars"}:
                <CopyField value={`RESEND_API_KEY=re_...\nREPORT_EMAIL=you@example.com`} k="resend-env" multiline />
                3. Schedule already in <code>vercel.json</code> — daily 8:30 AM IST + weekly Mon 7:30 AM IST.
              </div>
            </div>

            {/* ── INTEGRATION 3: OPENCLAW / N8N EMAIL AUTOMATION ── */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>🔌 OpenCLAW / n8n Auto-logging</div>
                  <div style={{ fontSize: 12, color: "#777" }}>Bank debit emails/SMS → POST here → instantly logged with auto-categorization.</div>
                </div>
                <StatusPill ok={true} label="Endpoint ready" />
              </div>

              <div style={{ marginTop: 10, fontSize: 11, color: "#666", lineHeight: 1.8 }}>
                Secret protection: {health?.openclaw?.secretConfigured
                  ? <><code style={{ background: "#111", padding: "1px 5px", borderRadius: 4 }}>{health.openclaw.secretHint}</code> <span style={{ color: "#3FA66A" }}>· authenticated</span></>
                  : <span style={{ color: "#E8A317" }}>none set (open to anyone — fine for personal use, risky if URL leaks)</span>}
                <br />
                Auto-logged so far: <strong style={{ color: "#aaa" }}>{data.state.expenses.filter(e => e.source === "email" || e.source === "automation").length}</strong> expenses
              </div>

              <div style={{ marginTop: 14, padding: "11px 13px", background: "#0e0e0e", border: "0.5px solid #222", borderRadius: 8 }}>
                <div style={{ fontSize: 11.5, color: "#aaa", fontWeight: 600, marginBottom: 6 }}>OpenCLAW / n8n config</div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Webhook URL:</div>
                <CopyField value={logExpenseUrl} k="ocl-url" />
                <div style={{ fontSize: 11, color: "#888", marginTop: 10, marginBottom: 4 }}>HTTP method: <code>POST</code> · Content-Type: <code>application/json</code></div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 8, marginBottom: 4 }}>Body template (replace placeholders with parsed values from your email):</div>
                <CopyField value={`{
  "amount": {{ parsed_amount }},
  "merchant": "{{ parsed_merchant }}",
  "category": "",        // optional, leave blank to auto-detect from merchant
  "source": "email",     // shows up in expense log
  "secret": "${health?.openclaw?.secretConfigured ? "YOUR_LOG_SECRET" : ""}"
}`} k="ocl-body" multiline />
              </div>

              <div style={{ marginTop: 12, padding: "11px 13px", background: "#0e0e0e", border: "0.5px solid #222", borderRadius: 8 }}>
                <div style={{ fontSize: 11.5, color: "#aaa", fontWeight: 600, marginBottom: 6 }}>Sample OpenCLAW step (Gmail trigger → HTTP request)</div>
                <CopyField value={`1. Trigger: Gmail "New email from bank-alerts@*"
2. Parse: extract { amount, merchant } using regex
   - Amount regex: /(?:debited|spent|paid)\\s*(?:Rs\\.?|INR|₹)\\s*([\\d,]+)/i
   - Merchant regex: /at\\s+([A-Z][A-Za-z0-9\\s]+)(?:\\s+on|\\.)/
3. HTTP Request:
   - URL: ${logExpenseUrl}
   - Method: POST
   - Body: (see template above)
4. (optional) Send response.message back via SMS/Telegram
   so you get a "₹450 logged, ₹4,200 left today" reply.`} k="ocl-flow" multiline />
              </div>

              <div style={{ marginTop: 12, padding: "11px 13px", background: "#0e0e0e", border: "0.5px solid #222", borderRadius: 8, fontSize: 11.5, color: "#888", lineHeight: 1.7 }}>
                <strong style={{ color: "#aaa" }}>Optional: enable secret auth</strong><br />
                Add to {isLocal ? <code>.env.local</code> : "Vercel env vars"}:
                <CopyField value="LOG_SECRET=any-long-random-string" k="secret-env" />
                Then add <code>"secret": "..."</code> to your OpenCLAW body. Without LOG_SECRET, any request is accepted (fine for private use).
              </div>

              <div style={{ marginTop: 12, padding: "11px 13px", background: "#0e0e0e", border: "0.5px solid #222", borderRadius: 8 }}>
                <div style={{ fontSize: 11.5, color: "#aaa", fontWeight: 600, marginBottom: 6 }}>Auto-categorization (built-in)</div>
                <div style={{ fontSize: 11, color: "#888", lineHeight: 1.8 }}>
                  Swiggy/Zomato/Blinkit/Zepto → 🍱 Food<br />
                  Amazon/Flipkart/Myntra/PVR/bars/liquor → 🎯 Lifestyle (Freedom)<br />
                  Uber/Ola/petrol/metro/Rapido → 🚇 Commute<br />
                  Jio/Airtel/Vi (mobile) → 📱 Family<br />
                  Netflix/Prime/Hotstar/Spotify → 📺 Subscriptions<br />
                  Furlenco/Rentomojo → 🛋️ Furniture<br />
                  Maintenance/electricity/water → ⚡ Maintenance<br />
                  Edit keywords in <code>lib/finance.js → CATEGORIES</code>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn-o" onClick={async () => {
                  const res = await fetch(logExpenseUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: 1, merchant: "TEST · OpenCLAW health check", source: "config-test" }),
                  });
                  const j = await res.json();
                  setSendResult({ ok: j.ok, error: j.error, to: "log-expense endpoint", type: "test" });
                  load();
                }}>Send test expense (₹1)</button>
              </div>
            </div>

            {/* ── DASHBOARD APIs (reference) ── */}
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📡 Dashboard APIs</div>
              <div style={{ fontSize: 12, color: "#777", marginBottom: 12 }}>For external dashboards, mobile apps, or Telegram bots.</div>
              <div style={{ fontSize: 11.5, color: "#888", marginBottom: 4 }}>JSON summary (daily + weekly):</div>
              <CopyField value={`${origin}/api/summary`} k="sum-json" />
              <div style={{ fontSize: 11.5, color: "#888", marginBottom: 4, marginTop: 10 }}>Plain text summary (WhatsApp/Telegram ready):</div>
              <CopyField value={summaryUrl} k="sum-text" />
              <div style={{ fontSize: 11.5, color: "#888", marginBottom: 4, marginTop: 10 }}>Manual report trigger:</div>
              <CopyField value={sendReportUrl} k="send-trigger" />
            </div>

            {/* ── EDIT PROFILE (income) ── */}
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>💰 Profile</div>
              <div style={{ fontSize: 12, color: "#777", marginBottom: 12 }}>Your name, monthly salary, and salary credit day. Every other number rolls up from these.</div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, flex: 1, color: "#ccc" }}>Name</span>
                <input
                  type="text"
                  value={editProfile.name !== undefined ? editProfile.name : cfgProfile.name}
                  onChange={e => setEditProfile(p => ({ ...p, name: e.target.value }))}
                  style={{ width: 180 }}
                />
                <button className="btn-o" disabled={editProfile.name === undefined} onClick={async () => {
                  const r = await api("updateProfile", { key: "name", value: editProfile.name });
                  setData(r);
                  setEditProfile(p => { const n = { ...p }; delete n.name; return n; });
                }}>Save</button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, flex: 1, color: "#ccc" }}>Monthly income (₹)</span>
                <input
                  type="number"
                  value={editProfile.income !== undefined ? editProfile.income : cfgProfile.income}
                  onChange={e => setEditProfile(p => ({ ...p, income: e.target.value }))}
                  style={{ width: 130 }}
                />
                <button className="btn-o" disabled={editProfile.income === undefined} onClick={async () => {
                  const r = await api("updateProfile", { key: "income", value: editProfile.income });
                  setData(r);
                  setEditProfile(p => { const n = { ...p }; delete n.income; return n; });
                }}>Save</button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12.5, flex: 1, color: "#ccc" }}>Salary day (1-31)</span>
                <input
                  type="number"
                  min="1" max="31"
                  value={editProfile.salaryDay !== undefined ? editProfile.salaryDay : (cfgProfile.salaryDay || 1)}
                  onChange={e => setEditProfile(p => ({ ...p, salaryDay: e.target.value }))}
                  style={{ width: 70 }}
                />
                <button className="btn-o" disabled={editProfile.salaryDay === undefined} onClick={async () => {
                  const r = await api("updateProfile", { key: "salaryDay", value: editProfile.salaryDay });
                  setData(r);
                  setEditProfile(p => { const n = { ...p }; delete n.salaryDay; return n; });
                }}>Save</button>
              </div>
            </div>

            {/* ── EDIT ENVELOPES ── */}
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📦 Edit envelopes</div>
              <div style={{ fontSize: 12, color: "#777", marginBottom: 12 }}>
                Adjust how your ₹{cfgProfile.income?.toLocaleString("en-IN") || "1,80,000"} splits across envelopes. Daily flex = Food + Freedom = <strong style={{ color: "#aaa" }}>{fmt(cfgDailyFlex)}</strong>.
              </div>
              {(() => {
                const sum = cfgEnvelopes.reduce((s, e) => s + e.amount, 0);
                const diff = cfgProfile.income - sum;
                return (
                  <div style={{ fontSize: 11, color: diff === 0 ? "#3FA66A" : diff > 0 ? "#E8A317" : "#E24B4A", marginBottom: 10, padding: "6px 10px", background: "#0e0e0e", borderRadius: 6, border: "0.5px solid #222" }}>
                    Sum of envelopes: <strong>{fmt(sum)}</strong> {diff === 0 ? "· ✓ matches income" : diff > 0 ? `· ${fmt(diff)} unallocated` : `· over-allocated by ${fmt(-diff)}`}
                  </div>
                );
              })()}
              {cfgEnvelopes.map(env => (
                <div key={env.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 16, width: 22 }}>{env.icon}</span>
                  <span style={{ fontSize: 12.5, flex: 1, color: "#ccc" }}>{env.label}{env.locked ? <span style={{ color: "#555", marginLeft: 5, fontSize: 10 }}>🔒 locked</span> : null}</span>
                  <input
                    type="number"
                    value={editEnvAmt[env.id] !== undefined ? editEnvAmt[env.id] : env.amount}
                    onChange={e => setEditEnvAmt(p => ({ ...p, [env.id]: e.target.value }))}
                    style={{ width: 120 }}
                  />
                  <button className="btn-o" disabled={editEnvAmt[env.id] === undefined || Number(editEnvAmt[env.id]) === env.amount} onClick={async () => {
                    const r = await api("updateEnvelope", { id: env.id, patch: { amount: editEnvAmt[env.id] } });
                    setData(r);
                    setEditEnvAmt(p => { const n = { ...p }; delete n[env.id]; return n; });
                  }}>Save</button>
                </div>
              ))}
            </div>

            {/* ── EDIT FIXED BILLS ── */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>📋 Edit fixed bills</div>
                  <div style={{ fontSize: 12, color: "#777", marginTop: 3 }}>Recurring monthly bills tracked on Today tab.</div>
                </div>
                <button className="btn-o" style={{ fontSize: 11, padding: "5px 11px" }} onClick={() => setShowNewBill(v => !v)}>
                  {showNewBill ? "Cancel" : "+ Add bill"}
                </button>
              </div>

              {showNewBill && (
                <div style={{ marginTop: 12, padding: "12px 13px", background: "#0e0e0e", border: "0.5px solid #2a2a2a", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>New bill</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 7 }}>
                    <input type="text" placeholder="Label (e.g. Gym membership)" value={newBill.label} onChange={e => setNewBill(p => ({ ...p, label: e.target.value }))} />
                    <input type="text" placeholder="Icon (emoji)" value={newBill.icon} onChange={e => setNewBill(p => ({ ...p, icon: e.target.value }))} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7, marginBottom: 10 }}>
                    <input type="number" placeholder="₹ amount" value={newBill.amount} onChange={e => setNewBill(p => ({ ...p, amount: e.target.value }))} />
                    <input type="number" placeholder="Due day (1-31)" value={newBill.dueDay} onChange={e => setNewBill(p => ({ ...p, dueDay: e.target.value }))} min="1" max="31" />
                    <select value={newBill.category} onChange={e => setNewBill(p => ({ ...p, category: e.target.value }))}>
                      {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.icon} {c.label}</option>)}
                    </select>
                  </div>
                  <button className="btn" style={{ fontSize: 12 }} onClick={async () => {
                    if (!newBill.label || !newBill.amount || !newBill.dueDay) return;
                    const r = await api("addBill", newBill);
                    setData(r);
                    setNewBill({ label: "", amount: "", dueDay: "", category: "bills", icon: "🧾" });
                    setShowNewBill(false);
                  }}>Add bill</button>
                </div>
              )}

              <div style={{ marginTop: showNewBill ? 14 : 8 }}>
                {cfgBills.map(b => {
                  const draft = editBill[b.id] || {};
                  const valAmt    = draft.amount    !== undefined ? draft.amount    : b.amount;
                  const valDue    = draft.dueDay    !== undefined ? draft.dueDay    : b.dueDay;
                  const valLabel  = draft.label     !== undefined ? draft.label     : b.label;
                  const dirty = draft.amount !== undefined || draft.dueDay !== undefined || draft.label !== undefined;
                  return (
                    <div key={b.id} style={{ padding: "10px 0", borderBottom: "0.5px solid #222" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                        <span style={{ fontSize: 15 }}>{b.icon}</span>
                        <input
                          type="text"
                          value={valLabel}
                          onChange={e => setEditBill(p => ({ ...p, [b.id]: { ...(p[b.id] || {}), label: e.target.value } }))}
                          style={{ flex: 1, fontSize: 12.5 }}
                        />
                        <button onClick={async () => {
                          if (!confirm(`Remove "${b.label}" from fixed bills?`)) return;
                          const r = await api("removeBill", { id: b.id });
                          setData(r);
                        }} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
                      </div>
                      <div style={{ display: "flex", gap: 7, alignItems: "center", marginLeft: 23 }}>
                        <span style={{ fontSize: 11, color: "#888" }}>Amount ₹</span>
                        <input
                          type="number"
                          value={valAmt}
                          onChange={e => setEditBill(p => ({ ...p, [b.id]: { ...(p[b.id] || {}), amount: e.target.value } }))}
                          style={{ width: 110, fontSize: 12 }}
                        />
                        <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>Due day of month</span>
                        <input
                          type="number"
                          min="1" max="31"
                          value={valDue}
                          onChange={e => setEditBill(p => ({ ...p, [b.id]: { ...(p[b.id] || {}), dueDay: e.target.value } }))}
                          style={{ width: 56, fontSize: 12 }}
                          title="Day of the month this bill is due (1-31)"
                        />
                        <button className="btn-o" style={{ marginLeft: "auto", padding: "5px 11px", fontSize: 11 }} disabled={!dirty} onClick={async () => {
                          const r = await api("updateBill", { id: b.id, patch: draft });
                          setData(r);
                          setEditBill(p => { const n = { ...p }; delete n[b.id]; return n; });
                        }}>Save</button>
                      </div>
                    </div>
                  );
                })}
                {cfgBills.length === 0 && <div style={{ fontSize: 12.5, color: "#666", padding: "10px 0" }}>No fixed bills. Click + Add bill above.</div>}
              </div>
            </div>

            {/* ── EDIT GOALS ── */}
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🎯 Edit goals</div>
              <div style={{ fontSize: 12, color: "#777", marginBottom: 12 }}>Renovation targets. The "immediate" goal drives the Today tab progress bar.</div>
              {Object.entries(cfgGoals).map(([key, g]) => {
                const draft = editGoal[key] || {};
                const valNeeded = draft.needed !== undefined ? draft.needed : g.needed;
                const valLabel  = draft.label  !== undefined ? draft.label  : g.label;
                const dirty = draft.needed !== undefined || draft.label !== undefined;
                return (
                  <div key={key} style={{ padding: "10px 0", borderBottom: "0.5px solid #222" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                      <span style={{ fontSize: 15 }}>{g.icon}</span>
                      <input
                        type="text"
                        value={valLabel}
                        onChange={e => setEditGoal(p => ({ ...p, [key]: { ...(p[key] || {}), label: e.target.value } }))}
                        style={{ flex: 1, fontSize: 12.5 }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 7, alignItems: "center", marginLeft: 23 }}>
                      <span style={{ fontSize: 11, color: "#777" }}>target ₹</span>
                      <input
                        type="number"
                        value={valNeeded}
                        onChange={e => setEditGoal(p => ({ ...p, [key]: { ...(p[key] || {}), needed: e.target.value } }))}
                        style={{ width: 130, fontSize: 12 }}
                      />
                      <button className="btn-o" style={{ marginLeft: "auto", padding: "5px 11px", fontSize: 11 }} disabled={!dirty} onClick={async () => {
                        const r = await api("updateGoal", { id: key, ...draft });
                        setData(r);
                        setEditGoal(p => { const n = { ...p }; delete n[key]; return n; });
                      }}>Save</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── EDIT DEBT BALANCES ── */}
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>⚔️ Edit debt balances</div>
              <div style={{ fontSize: 12, color: "#777", marginBottom: 12 }}>Update current outstanding directly when bank statements come in.</div>
              {data.state.debts.map(d => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, flex: 1, color: "#ccc" }}>{d.name}</span>
                  <input
                    type="number"
                    value={editDebt[d.id] !== undefined ? editDebt[d.id] : Math.round(d.balance)}
                    onChange={e => setEditDebt(p => ({ ...p, [d.id]: e.target.value }))}
                    style={{ width: 110 }}
                  />
                  <button className="btn-o" onClick={async () => {
                    const val = Number(editDebt[d.id]);
                    if (isNaN(val) || val < 0) return;
                    const r = await api("updateDebt", { id: d.id, balance: val });
                    setData(r);
                    setEditDebt(p => { const n = { ...p }; delete n[d.id]; return n; });
                  }}>Save</button>
                </div>
              ))}
            </div>

            {/* ── SALARY DAY ── */}
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Salary-day status</div>
              <div className="row">
                <span>Envelope accounts created</span>
                <button className="btn-o" style={{ color: data.state.flags.envelopesSetup ? "#3FA66A" : "#bbb" }} onClick={() => setFlag("envelopesSetup", !data.state.flags.envelopesSetup)}>{data.state.flags.envelopesSetup ? "✓ Done" : "Mark done"}</button>
              </div>
              <div className="row">
                <span>Salary received this month</span>
                <button className="btn-o" style={{ color: data.state.flags.salaryReceived ? "#3FA66A" : "#bbb" }} onClick={() => setFlag("salaryReceived", !data.state.flags.salaryReceived)}>{data.state.flags.salaryReceived ? "✓ Yes" : "Mark received"}</button>
              </div>
            </div>

            {/* Bottom row: refresh + reset */}
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14 }}>
              <button className="btn-o" onClick={loadHealth} style={{ fontSize: 11 }}>↻ Refresh status</button>
              <button className="btn-o" style={{ fontSize: 11, color: "#E24B4A", borderColor: "#3a2020" }} onClick={async () => {
                if (!confirm("Reset profile, envelopes, bills, and goals to factory defaults? This won't touch your expenses or debt balances.")) return;
                const r = await api("resetConfig", {});
                setData(r);
              }}>↺ Reset config to defaults</button>
            </div>
          </div>
          );
        })()}

        {/* ═══════════════ SETUP ═══════════════ */}
        {tab === "setup" && (
          <div>
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Salary-day status</div>
              <div className="row">
                <span>Envelope accounts created</span>
                <button className="btn-o" style={{ color: state.flags.envelopesSetup ? "#3FA66A" : "#bbb" }} onClick={() => setFlag("envelopesSetup", !state.flags.envelopesSetup)}>{state.flags.envelopesSetup ? "✓ Done" : "Mark done"}</button>
              </div>
              <div className="row">
                <span>Salary received this month</span>
                <button className="btn-o" style={{ color: state.flags.salaryReceived ? "#3FA66A" : "#bbb" }} onClick={() => setFlag("salaryReceived", !state.flags.salaryReceived)}>{state.flags.salaryReceived ? "✓ Yes" : "Mark received"}</button>
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>🔌 Connect OpenCLAW automation</div>
              <div style={{ fontSize: 13, color: "#bbb", lineHeight: 1.7, marginBottom: 12 }}>
                Point your email-reading automation at this endpoint. Every time it detects a spend (bank SMS/email), it POSTs the amount and merchant. The app auto-categorizes and updates your daily allowance instantly.
              </div>
              <div style={{ background: "#0e0e0e", border: "0.5px solid #333", borderRadius: 9, padding: "12px 14px", fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#9c9", overflowX: "auto" }}>
                <div style={{ color: "#666", marginBottom: 6 }}># POST to:</div>
                <div style={{ color: "#fff" }}>https://YOUR-APP.vercel.app/api/log-expense</div>
                <div style={{ color: "#666", margin: "10px 0 6px" }}># Body (JSON):</div>
                <div>{`{`}</div>
                <div>&nbsp;&nbsp;"amount": 450,</div>
                <div>&nbsp;&nbsp;"merchant": "Swiggy",</div>
                <div>&nbsp;&nbsp;"category": "food",&nbsp;&nbsp;<span style={{ color: "#666" }}>// optional, auto-detected</span></div>
                <div>&nbsp;&nbsp;"secret": "your-secret"&nbsp;<span style={{ color: "#666" }}>// if LOG_SECRET set</span></div>
                <div>{`}`}</div>
              </div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 10, lineHeight: 1.6 }}>
                The endpoint replies with how much you have left to spend today — your automation can text that back to you.
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Auto-categorization</div>
              <div style={{ fontSize: 12.5, color: "#999", lineHeight: 1.7 }}>
                Swiggy/Zomato/Blinkit → Food · Amazon/Myntra/bars → Lifestyle · Uber/petrol → Commute · recharges/rent → Bills. Edit the keyword lists in <span style={{ color: "#9c9", fontFamily: "monospace" }}>lib/finance.js</span> anytime.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
