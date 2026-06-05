// ════════════════════════════════════════════════════════════════
//  FINANCE OS — Core Engine
//  All money math, projections, daily allowance, and coaching logic.
// ════════════════════════════════════════════════════════════════

export const PROFILE = {
  name: "Nishit",
  income: 180000,
  salaryDay: 1, // day of month salary arrives
};

// ─── DEBTS (avalanche = highest interest first) ───────────────────
export const INIT_DEBTS = [
  { id: "cc1",      name: "Credit Card 1",      balance: 19000,  rate: 40, emi: 0,     color: "#E24B4A", type: "cc" },
  { id: "cc2",      name: "Credit Card 2",      balance: 19000,  rate: 40, emi: 0,     color: "#D85A30", type: "cc" },
  { id: "axis",     name: "Axis Personal Loan", balance: 400000, rate: 18, emi: 11000, color: "#C2410C", type: "formal" },
  { id: "mf",       name: "MF Pledge Loan",     balance: 250000, rate: 11, emi: 2000,  color: "#BA7517", type: "formal" },
  { id: "edu",      name: "Education Loan",     balance: 400000, rate: 8,  emi: 7000,  color: "#5F5E5A", type: "formal" },
  { id: "f_priyank", name: "Priyank",           balance: 10000,  rate: 0,  emi: 0,     color: "#9F77DD", type: "friend" },
  { id: "f_lakhan",  name: "Lakhan",            balance: 42000,  rate: 0,  emi: 0,     color: "#AF87ED", type: "friend" },
  { id: "f_tomar",   name: "Tomar",             balance: 6000,   rate: 0,  emi: 0,     color: "#7F67BD", type: "friend" },
  { id: "f_asad",    name: "Asad",              balance: 5000,   rate: 0,  emi: 0,     color: "#8F77CD", type: "friend" },
  { id: "f_rana",    name: "Rana",              balance: 5000,   rate: 0,  emi: 0,     color: "#6F57AD", type: "friend" },
  { id: "f_other",   name: "Friends (others)",  balance: 5000,   rate: 0,  emi: 0,     color: "#5F478D", type: "friend" },
];

// ─── THE 6 ENVELOPES (the system) ─────────────────────────────────
export const ENVELOPES = [
  { id: "survival",  label: "Survival",        amount: 63500, icon: "🏠", locked: true,  desc: "Rent, maintenance, OTT, Furlenco, family mobile, commute." },
  { id: "food",      label: "Food",            amount: 15000, icon: "🍱", locked: false, desc: "Groceries + cooking. Delivery only if balance left." },
  { id: "freedom",   label: "Freedom Money",   amount: 15000, icon: "🎯", locked: false, desc: "Cash only. Personal, party, smokes. When zero, month is done." },
  { id: "sip",       label: "SIP",             amount: 8000,  icon: "📈", locked: true,  desc: "Auto-debit MF SIP. Never pause." },
  { id: "debt",      label: "Debt Assault",    amount: 73500, icon: "⚔️", locked: true,  desc: "EMIs (₹20k) + extra attack (₹53.5k). Highest interest first." },
  { id: "emergency", label: "Emergency Vault", amount: 5000,  icon: "🔒", locked: true,  desc: "Small buffer until renovation is funded, then build." },
];

// Daily spendable = food + freedom only (the two flexible envelopes)
// Derived from ENVELOPES so changing one place auto-syncs everywhere.
export const DAILY_FLEX_BUDGET = ENVELOPES
  .filter(e => e.id === "food" || e.id === "freedom")
  .reduce((s, e) => s + e.amount, 0);

// ─── FIXED BILLS (recurring, expected) ────────────────────────────
export const FIXED_BILLS = [
  { id: "rent",        label: "Rent",                       amount: 28000, dueDay: 5,  category: "rent",          icon: "🏠" },
  { id: "family",      label: "Family mobile recharges",    amount: 15000, dueDay: 7,  category: "family",        icon: "📱" },
  { id: "maintenance", label: "Maintenance + electricity",  amount: 8000,  dueDay: 10, category: "maintenance",   icon: "⚡" },
  { id: "furlenco",    label: "Furlenco (furniture rent)",  amount: 5000,  dueDay: 10, category: "furniture",     icon: "🛋️" },
  { id: "ott",         label: "OTT (Netflix/Prime/Hotstar)", amount: 1500, dueDay: 15, category: "subscriptions", icon: "📺" },
  { id: "sip",         label: "SIP (mutual fund)",          amount: 8000,  dueDay: 1,  category: "sip",           icon: "📈" },
];

// ─── GOALS ────────────────────────────────────────────────────────
export const GOALS = {
  renovationImmediate: { id: "renoNow",  label: "Tile work (immediate)",  needed: 200000, icon: "🧱" },
  renovationFull:      { id: "renoFull", label: "Full renovation",        needed: 600000, icon: "🏗️" },
};

// ─── EXPENSE CATEGORIES for auto-logging from email ───────────────
export const CATEGORIES = {
  food:          { label: "Food",          envelope: "food",     icon: "🍱", keywords: ["swiggy","zomato","blinkit","zepto","grocery","restaurant","cafe","dominos","kfc","mcdonald","dunzo","bigbasket","instamart"] },
  freedom:       { label: "Lifestyle",     envelope: "freedom",  icon: "🎯", keywords: ["amazon","flipkart","myntra","bookmyshow","pvr","bar","liquor","smoke","cigarette","party","uber eats","nykaa","ajio"] },
  rent:          { label: "Rent",          envelope: "survival", icon: "🏠", keywords: ["rent","landlord"] },
  maintenance:   { label: "Maintenance",   envelope: "survival", icon: "⚡", keywords: ["maintenance","society","electricity","water","gas"] },
  subscriptions: { label: "Subscriptions", envelope: "survival", icon: "📺", keywords: ["netflix","prime","hotstar","spotify","youtube"] },
  family:        { label: "Family",        envelope: "survival", icon: "📱", keywords: ["family","recharge","jio","airtel","vi ","vodafone"] },
  furniture:     { label: "Furniture",     envelope: "survival", icon: "🛋️", keywords: ["furlenco","rentomojo","cityfurnish"] },
  commute:       { label: "Commute",       envelope: "survival", icon: "🚇", keywords: ["uber","ola","rapido","metro","petrol","fuel","fastag","irctc"] },
  bills:         { label: "Bills",         envelope: "survival", icon: "🧾", keywords: ["broadband","insurance"] },
  sip:           { label: "SIP",           envelope: "sip",      icon: "📈", keywords: ["sip","mutual fund","mf "] },
  debt:          { label: "Debt/EMI",      envelope: "debt",     icon: "💳", keywords: ["emi","loan","credit card","axis","repayment"] },
  renovation:    { label: "Renovation",    envelope: "freedom",  icon: "🧱", keywords: ["tile","paint","carpenter","plumber","renovation","cement"] },
  other:         { label: "Other",         envelope: "freedom",  icon: "📦", keywords: [] },
};

// Auto-categorize a transaction from merchant text
export function categorize(text = "") {
  const lower = text.toLowerCase();
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    if (cat.keywords.some(k => lower.includes(k))) return key;
  }
  return "other";
}

// ─── CONFIG GETTERS ───────────────────────────────────────────────
// All UI-editable settings live in state.config (set via /api/state actions).
// These getters fall back to the defaults above when nothing's been edited.

export const getProfile   = (state) => state?.config?.profile   || PROFILE;
export const getEnvelopes = (state) => state?.config?.envelopes || ENVELOPES;
export const getBills     = (state) => state?.config?.bills     || FIXED_BILLS;
export const getGoals     = (state) => state?.config?.goals     || GOALS;

export const getDailyFlexBudget = (state) =>
  getEnvelopes(state)
    .filter(e => e.id === "food" || e.id === "freedom")
    .reduce((s, e) => s + e.amount, 0);

// Default config snapshot — used when initializing or resetting
export function defaultConfig() {
  return {
    profile:   { ...PROFILE },
    envelopes: ENVELOPES.map(e => ({ ...e })),
    bills:     FIXED_BILLS.map(b => ({ ...b })),
    goals:     {
      renovationImmediate: { ...GOALS.renovationImmediate },
      renovationFull:      { ...GOALS.renovationFull },
    },
  };
}

// ─── AVALANCHE PROJECTION ─────────────────────────────────────────
export function avalanche(debts, monthlyPayment) {
  let bal = debts.map(d => ({ ...d }));
  let months = 0;
  const hist = [{ month: 0, total: bal.reduce((s, d) => s + d.balance, 0), payoffs: [] }];
  while (bal.some(d => d.balance > 0) && months < 120) {
    months++;
    let rem = monthlyPayment;
    const payoffs = [];
    // Pay minimums / EMIs
    bal = bal.map(d => {
      if (d.balance <= 0) return d;
      const p = Math.min(d.emi || 0, d.balance);
      rem -= p;
      const nb = Math.max(0, d.balance - p);
      if (nb <= 1 && d.balance > 1) payoffs.push(d.name);
      return { ...d, balance: nb };
    });
    // Avalanche remaining at highest rate
    const targets = [...bal].filter(d => d.balance > 0).sort((a, b) => b.rate - a.rate);
    for (const t of targets) {
      if (rem <= 0) break;
      const p = Math.min(rem, t.balance);
      rem -= p;
      bal = bal.map(d => {
        if (d.id !== t.id) return d;
        const nb = Math.max(0, d.balance - p);
        if (nb <= 1 && d.balance > 1) payoffs.push(d.name);
        return { ...d, balance: nb };
      });
    }
    // Monthly interest
    bal = bal.map(d => d.balance > 0 ? { ...d, balance: d.balance * (1 + d.rate / 100 / 12) } : d);
    hist.push({ month: months, total: bal.reduce((s, d) => s + d.balance, 0), payoffs });
  }
  return { months, hist, finalBal: bal };
}

// ─── DAILY ALLOWANCE ──────────────────────────────────────────────
// Given days left in month and remaining flex budget, how much per day?
export function dailyAllowance(flexBudgetTotal, spentThisMonth, today = new Date()) {
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();
  const daysLeft = Math.max(1, daysInMonth - dayOfMonth + 1);
  const remaining = Math.max(0, flexBudgetTotal - spentThisMonth);
  return {
    perDay: Math.floor(remaining / daysLeft),
    remaining,
    daysLeft,
    dayOfMonth,
    daysInMonth,
    pctMonthGone: Math.round((dayOfMonth / daysInMonth) * 100),
    pctBudgetGone: Math.round((spentThisMonth / flexBudgetTotal) * 100),
  };
}

// ─── COACHING ENGINE (strict mode) ────────────────────────────────
// Generates the hard-truth daily verdict based on current state.
export function coachVerdict({ allowance, todaySpent, monthSpent, flexBudget }) {
  const { perDay, remaining, daysLeft, pctMonthGone, pctBudgetGone } = allowance;
  const verdicts = [];

  // The danger signal: burning budget faster than time
  if (pctBudgetGone > pctMonthGone + 15) {
    verdicts.push({
      level: "danger",
      title: "You're burning too fast.",
      body: `You've spent ${pctBudgetGone}% of your flexible money but only ${pctMonthGone}% of the month is gone. At this pace you'll be broke and borrowing again before payday. Stop the discretionary spending NOW.`,
    });
  } else if (pctBudgetGone > pctMonthGone + 5) {
    verdicts.push({
      level: "warning",
      title: "Slightly ahead of pace.",
      body: `Pull it back. You're ${pctBudgetGone - pctMonthGone}% over where you should be. Cook at home today. No deliveries.`,
    });
  } else {
    verdicts.push({
      level: "good",
      title: "On track. Hold the line.",
      body: `You've used ${pctBudgetGone}% of flex money, ${pctMonthGone}% of the month gone. This is discipline. Don't get comfortable — keep it boring.`,
    });
  }

  // Today's specific overspend
  if (todaySpent > perDay && perDay > 0) {
    verdicts.push({
      level: "danger",
      title: `Today's limit blown.`,
      body: `You had ₹${perDay.toLocaleString("en-IN")} for today. You've already spent ₹${todaySpent.toLocaleString("en-IN")}. Every rupee past this comes out of tomorrow. Close the wallet.`,
    });
  }

  // Near-empty warning
  if (remaining < perDay * 2 && daysLeft > 2) {
    verdicts.push({
      level: "danger",
      title: "Almost out, days to go.",
      body: `Only ₹${remaining.toLocaleString("en-IN")} flex money left and ${daysLeft} days until payday. This is survival mode now — food only, no extras. Do NOT touch the debt vault. Do NOT borrow.`,
    });
  }

  return verdicts;
}

// ─── NEXT ACTION ENGINE ───────────────────────────────────────────
// What's the single most important thing to do right now?
export function nextAction({ debts, salaryReceived, envelopesSetup, monthSpent, flexBudget }) {
  const cc = debts.filter(d => d.type === "cc" && d.balance > 0);
  const totalCC = cc.reduce((s, d) => s + d.balance, 0);

  if (!envelopesSetup) {
    return {
      tag: "SETUP",
      title: "Set up your envelope accounts",
      body: "Open your bank app. Create 2 accounts: 'DEBT VAULT' and 'EMERGENCY'. Set auto-debit on salary credit. This is the foundation — do it before anything else.",
      cta: "Mark as done",
    };
  }
  if (salaryReceived && totalCC > 0) {
    return {
      tag: "TODAY",
      title: `Attack the credit cards (₹${totalCC.toLocaleString("en-IN")})`,
      body: `Salary's in. Before you spend a single rupee on anything else, transfer ₹${Math.min(totalCC, 70000).toLocaleString("en-IN")} from your debt vault to clear the credit cards. They bleed 40% interest — every day they sit is money lost.`,
      cta: "I've paid it",
    };
  }
  if (salaryReceived) {
    return {
      tag: "TODAY",
      title: "Lock away the debt + emergency money",
      body: "Salary's in. Transfer ₹70K to debt vault and ₹10K to emergency RIGHT NOW, before you see it as spendable. Then withdraw ₹10K cash for the month.",
      cta: "Done — locked away",
    };
  }
  return {
    tag: "DAILY",
    title: "Log every rupee today",
    body: "No salary action needed today. Your only job: log everything you spend, stay under your daily allowance, and don't touch what's locked.",
    cta: "Got it",
  };
}

// ─── WHOLE-MONEY VIEW ─────────────────────────────────────────────
// Shows: income, per-envelope spent/remaining, total committed vs free
export function wholeMoneyView(state, today = new Date()) {
  const envelopesCfg = getEnvelopes(state);
  const profile      = getProfile(state);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const monthExpenses = state.expenses.filter(e => e.ts >= monthStart);

  // Spending per envelope. Skip expenses that have a paired debtPayment —
  // those are already counted via the debtPayments sum below.
  const linkedExpenseIds = new Set(
    (state.debtPayments || []).filter(p => p.expenseId).map(p => p.expenseId)
  );
  const byEnvelope = {};
  envelopesCfg.forEach(env => { byEnvelope[env.id] = 0; });
  for (const e of monthExpenses) {
    if (linkedExpenseIds.has(e.id)) continue;
    const env = CATEGORIES[e.category]?.envelope || "freedom";
    byEnvelope[env] = (byEnvelope[env] || 0) + e.amount;
  }

  // Debt payments this month → goes against debt envelope
  const debtPaid = state.debtPayments
    .filter(p => p.ts >= monthStart)
    .reduce((s, p) => s + p.amount, 0);
  byEnvelope.debt = (byEnvelope.debt || 0) + debtPaid;

  const envelopes = envelopesCfg.map(env => {
    const spent = byEnvelope[env.id] || 0;
    const remaining = Math.max(0, env.amount - spent);
    const overspent = Math.max(0, spent - env.amount);
    const pct = env.amount > 0 ? Math.round((spent / env.amount) * 100) : 0;
    return { ...env, spent, remaining, overspent, pct };
  });

  const income = profile.income;
  const totalCommitted = envelopes.reduce((s, e) => s + e.amount, 0);
  const totalSpent     = envelopes.reduce((s, e) => s + e.spent, 0);
  const totalRemaining = Math.max(0, income - totalSpent);
  const totalOverspent = envelopes.reduce((s, e) => s + e.overspent, 0);

  return {
    income,
    totalCommitted,
    totalSpent,
    totalRemaining,
    totalOverspent,
    envelopes,
    pctSpent: Math.round((totalSpent / income) * 100),
  };
}

// ─── BILLS TRACKER ────────────────────────────────────────────────
// Check which fixed bills have been paid this month
export function billsStatus(state, today = new Date()) {
  const billsCfg = getBills(state);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const dayOfMonth = today.getDate();
  return billsCfg.map(bill => {
    const paid = state.expenses
      .filter(e => e.ts >= monthStart && e.category === bill.category)
      .reduce((s, e) => s + e.amount, 0);
    const isPaid = paid >= bill.amount * 0.9; // 90%+ counts as paid
    const isOverdue = !isPaid && dayOfMonth > bill.dueDay;
    const isDueSoon = !isPaid && !isOverdue && (bill.dueDay - dayOfMonth) <= 3 && (bill.dueDay - dayOfMonth) >= 0;
    return { ...bill, paid, isPaid, isOverdue, isDueSoon, daysUntilDue: bill.dueDay - dayOfMonth };
  });
}

// ─── RECOMMENDATION ENGINE ────────────────────────────────────────
// What should you do/pay/avoid right now?
export function recommendations(state, view, bills, today = new Date()) {
  const recs = [];
  const dayOfMonth = today.getDate();

  // 1. OVERDUE BILLS — top priority
  bills.filter(b => b.isOverdue).forEach(b => {
    recs.push({
      urgency: "danger",
      icon: b.icon,
      title: `${b.label} OVERDUE`,
      body: `Expected ₹${b.amount.toLocaleString("en-IN")} by day ${b.dueDay}, today is day ${dayOfMonth}. Pay this NOW before late fees.`,
      amount: b.amount,
    });
  });

  // 2. DUE SOON BILLS
  bills.filter(b => b.isDueSoon).forEach(b => {
    recs.push({
      urgency: "warning",
      icon: b.icon,
      title: `${b.label} due in ${b.daysUntilDue} day${b.daysUntilDue === 1 ? "" : "s"}`,
      body: `₹${b.amount.toLocaleString("en-IN")} expected. Make sure money is in the survival account.`,
      amount: b.amount,
    });
  });

  // 3. CREDIT CARD URGENCY (40% interest is bleeding)
  const cc = state.debts.filter(d => d.type === "cc" && d.balance > 1);
  const totalCC = cc.reduce((s, d) => s + d.balance, 0);
  if (totalCC > 0) {
    recs.push({
      urgency: "danger",
      icon: "💳",
      title: `Clear credit cards (₹${Math.round(totalCC).toLocaleString("en-IN")})`,
      body: `Burning ${cc[0]?.rate || 40}% interest. Every day this sits = money lost. Clear from debt vault THIS week.`,
      amount: totalCC,
    });
  }

  // 4. ENVELOPE OVERRUNS
  view.envelopes.forEach(env => {
    if (env.overspent > 0 && !env.locked) {
      recs.push({
        urgency: "warning",
        icon: env.icon,
        title: `${env.label} overspent by ₹${env.overspent.toLocaleString("en-IN")}`,
        body: `Pull back. This needs to come out of another flex envelope or wait till next month.`,
        amount: env.overspent,
      });
    }
  });

  // 5. RENOVATION GOAL
  const reno = getGoals(state).renovationImmediate;
  const renoSaved = state.goalSavings?.renovation || 0;
  const renoGap = Math.max(0, reno.needed - renoSaved);
  if (renoGap > 0) {
    const monthsAtCurrent = Math.ceil(renoGap / 30000); // assume ₹30k/mo savings is realistic
    recs.push({
      urgency: "info",
      icon: reno.icon,
      title: `Tile work fund: ₹${renoSaved.toLocaleString("en-IN")} / ₹${reno.needed.toLocaleString("en-IN")}`,
      body: `Gap of ₹${renoGap.toLocaleString("en-IN")}. At ₹30k/mo saving pace, ~${monthsAtCurrent} months. Consider: pause SIP for 2 months OR sell ₹2L of free MF corpus.`,
      amount: renoGap,
    });
  }

  // 6. UNDERUSED FLEX (positive feedback)
  const flexEnvs = view.envelopes.filter(e => !e.locked);
  const totalFlexSpent = flexEnvs.reduce((s, e) => s + e.spent, 0);
  const totalFlexBudget = flexEnvs.reduce((s, e) => s + e.amount, 0);
  const pctMonth = Math.round((dayOfMonth / new Date(today.getFullYear(), today.getMonth()+1, 0).getDate()) * 100);
  const pctFlex = totalFlexBudget > 0 ? Math.round((totalFlexSpent / totalFlexBudget) * 100) : 0;
  if (pctMonth > 50 && pctFlex < pctMonth - 10) {
    const extra = totalFlexBudget - totalFlexSpent - Math.round((totalFlexBudget * (100 - pctMonth)) / 100);
    if (extra > 2000) {
      recs.push({
        urgency: "good",
        icon: "💎",
        title: `You're ₹${extra.toLocaleString("en-IN")} ahead on flex spending`,
        body: `Don't relax — sweep this to debt or renovation fund instead of letting it leak.`,
        amount: extra,
      });
    }
  }

  return recs;
}

export const fmt  = n => "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");
export const fmtL = n => Math.abs(n) >= 100000 ? "₹" + (n / 100000).toFixed(2) + "L" : fmt(n);
