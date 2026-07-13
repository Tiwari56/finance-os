// Seeds the uitest@local.test account with rich mock data so every feature
// is visible during local development. Safe to re-run — clears and re-seeds.
// Usage: node scripts/seed-mock-data.mjs
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../data/finance.db");
const db = new Database(DB_PATH);

const run = (sql, params = []) => db.prepare(sql).run(...params);
const all = (sql, params = []) => db.prepare(sql).all(...params);

// ─── find uitest user ────────────────────────────────────────────
const user = db.prepare("SELECT id FROM users WHERE email = ?").get("uitest@local.test");
if (!user) { console.error("uitest@local.test not found. Register the account first."); process.exit(1); }
const UID = user.id;
console.log("Seeding for", UID);

// ─── helpers ────────────────────────────────────────────────────
const id = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
const daysAgo = (n, hour = 12) => Date.now() - (n * 86400000) + (hour * 3600000);

// ─── clear existing data for this user ──────────────────────────
for (const tbl of ["expenses","debts","debt_payments","bills","bill_payments","goals","ious","projects","envelopes"]) {
  try { db.prepare(`DELETE FROM ${tbl} WHERE user_id = ?`).run(UID); } catch(e) { /* table may not exist */ }
}
// Re-seed profile & flags
run("INSERT OR REPLACE INTO profile (id, name, income, salary_day, currency) VALUES (?,?,?,?,?)",
  [UID, "Demo User", 120000, 1, "INR"]);
run("INSERT OR REPLACE INTO flags (id, setup_complete, envelopes_setup, salary_received, banked_week, banked_week_key, banked_total) VALUES (?,1,1,0,0,null,0)", [UID]);

// ─── envelopes ──────────────────────────────────────────────────
const envs = [
  { key: "rent",   label: "Rent & bills",          amount: 30000, icon: "🏠", locked: 1 },
  { key: "food",   label: "Food & groceries",       amount: 12000, icon: "🍱", locked: 0 },
  { key: "freedom",label: "Fun & shopping",         amount: 8000,  icon: "🎯", locked: 0 },
  { key: "sip",    label: "Savings & investing",    amount: 15000, icon: "📈", locked: 1 },
  { key: "debt",   label: "Debt payments",          amount: 20000, icon: "💳", locked: 0 },
  { key: "emergency", label: "Emergency fund",      amount: 5000,  icon: "🛡️", locked: 0 },
];
envs.forEach((e, i) => run(
  "INSERT INTO envelopes (id, user_id, label, amount, icon, locked, \"order\") VALUES (?,?,?,?,?,?,?)",
  [`${UID}:${e.key}`, UID, e.label, e.amount, e.icon, e.locked, i]
));

// ─── projects ───────────────────────────────────────────────────
const projData = [
  { name: "Tile work",      category: "home",   priority: "immediate", budget: 45000,  icon: "🏠", description: "Replace bathroom floor tiles" },
  { name: "Full renovation",category: "home",   priority: "planned",   budget: 250000, icon: "🏠", description: "Kitchen + living room overhaul" },
  { name: "Europe trip",    category: "travel", priority: "someday",   budget: 180000, icon: "✈️", description: "Budget trip, 3 countries" },
  { name: "Car service",    category: "car",    priority: "immediate", budget: 15000,  icon: "🚗", description: "Annual maintenance + tyres" },
];
const projIds = {};
projData.forEach(p => {
  const pid = id("proj");
  projIds[p.name] = pid;
  run("INSERT INTO projects (id, user_id, name, description, category, priority, budget, status, icon, created_ts) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [pid, UID, p.name, p.description, p.category, p.priority, p.budget, "active", p.icon, daysAgo(30)]);
});

// ─── expenses ───────────────────────────────────────────────────
const expense = (merchant, amount, category, daysBack, projName) =>
  run("INSERT INTO expenses (id, user_id, ts, amount, category, merchant, source, project_id) VALUES (?,?,?,?,?,?,?,?)",
    [id("exp"), UID, daysAgo(daysBack, 10 + Math.floor(Math.random()*10)), amount, category, merchant, "manual", projName ? projIds[projName] : null]);

// This week
expense("Swiggy",         420,  "food",    0);
expense("Blinkit",        890,  "food",    1);
expense("Uber",           180,  "commute", 1);
expense("Netflix",        649,  "subscriptions", 2);
expense("DMart",         2100,  "food",    2);
expense("Pharmacy",       380,  "other",   2);
expense("Tile work labour", 12000, "other", 3, "Tile work");

// Last week
expense("Swiggy",         350,  "food",    7);
expense("Café Coffee Day", 280, "food",    8);
expense("Amazon",        1599,  "freedom", 8);
expense("Rapido",         120,  "commute", 9);
expense("Zomato",         540,  "food",    9);
expense("Tile materials",8500,  "other",  10, "Tile work");
expense("CarDekho service", 6800, "other", 10, "Car service");

// Older this month
expense("Swiggy",         490,  "food",   14);
expense("BigBasket",     3200,  "food",   15);
expense("Spotify",        119,  "subscriptions", 15);
expense("Petrol",        2200,  "commute",16);
expense("Myntra",        1850,  "freedom",17);
expense("Haircut",        300,  "freedom",18);
expense("Electricity bill",1400,"maintenance",20);
expense("Renovation consult",5000,"other",21, "Full renovation");
expense("Tata Power",    1200,  "maintenance",22);
expense("Swiggy",         610,  "food",   23);
expense("Movie tickets",  900,  "freedom",24);
expense("Medicine",       450,  "other",  25);

// ─── debts ──────────────────────────────────────────────────────
const debtRows = [
  { id:"debt_axis",    name: "Axis Bank Personal Loan", balance: 285000, rate: 13.5, emi: 9500, type: "formal", principal: 400000, dueDay: 5, tenureMonths: 48 },
  { id:"debt_edu",     name: "Education Loan",          balance: 460000, rate: 10.5, emi: 7000, type: "formal", principal: 600000, dueDay: 10, tenureMonths: 84 },
  { id:"debt_cc1",     name: "HDFC Credit Card",        balance: 24500,  rate: 36,   emi: 0,    type: "cc",     creditLimit: 100000, minDue: 1225, statementBalance: 24500 },
  { id:"debt_friend1", name: "Rahul",                   balance: 12000,  rate: 0,    emi: 0,    type: "friend" },
  { id:"debt_friend2", name: "Deepak",                  balance: 5000,   rate: 0,    emi: 0,    type: "friend" },
];
debtRows.forEach((d, i) => run(
  `INSERT INTO debts (id, user_id, name, balance, rate, emi, type, color, "order", principal, due_day, tenure_months, status, credit_limit, min_due, statement_balance)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?)`,
  [d.id, UID, d.name, d.balance, d.rate, d.emi, d.type, "#5b7cfa", i,
   d.principal ?? d.balance, d.dueDay ?? null, d.tenureMonths ?? null,
   d.creditLimit ?? null, d.minDue ?? null, d.statementBalance ?? null]
));

// Debt payments history
const debtPay = (debtId, amount, daysBack) =>
  run("INSERT INTO debt_payments (id, debt_id, amount, ts, note) VALUES (?,?,?,?,?)",
    [id("dp"), debtId, amount, daysAgo(daysBack), "emi"]);
debtPay("debt_axis",    9500, 5);
debtPay("debt_edu",     7000, 5);
debtPay("debt_cc1",     5000, 8);

// ─── bills ──────────────────────────────────────────────────────
const billRows = [
  { label: "Rent",          amount: 18000, dueDay: 1,  icon: "🏠" },
  { label: "Electricity",   amount: 1500,  dueDay: 15, icon: "⚡" },
  { label: "Internet",      amount: 999,   dueDay: 10, icon: "📡" },
  { label: "Phone",         amount: 699,   dueDay: 5,  icon: "📱" },
  { label: "OTT Bundle",    amount: 649,   dueDay: 18, icon: "📺" },
];
billRows.forEach((b, i) => run(
  `INSERT INTO bills (id, user_id, label, amount, due_day, icon, active, "order") VALUES (?,?,?,?,?,?,1,?)`,
  [id("bill"), UID, b.label, b.amount, b.dueDay, b.icon, i]
));

// ─── goals ──────────────────────────────────────────────────────
run(`INSERT INTO goals (id, user_id, label, needed, saved, icon, active, "order") VALUES (?,?,?,?,?,?,1,0)`,
  [id("goal"), UID, "Emergency fund (6 months)", 72000, 18000, "🛡️"]);
run(`INSERT INTO goals (id, user_id, label, needed, saved, icon, active, "order") VALUES (?,?,?,?,?,?,1,1)`,
  [id("goal"), UID, "Europe trip", 180000, 42000, "✈️"]);

// ─── IOUs ───────────────────────────────────────────────────────
run("INSERT INTO ious (id, user_id, name, amount, ts, note) VALUES (?,?,?,?,?,?)",
  [id("iou"), UID, "Priya", 3500, daysAgo(12), "Lunch bill"]);
run("INSERT INTO ious (id, user_id, name, amount, ts, note) VALUES (?,?,?,?,?,?)",
  [id("iou"), UID, "Karan", 1200, daysAgo(5), "Cab split"]);

db.close();
console.log("Mock data seeded successfully for uitest@local.test");
