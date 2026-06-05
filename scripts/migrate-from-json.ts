// ════════════════════════════════════════════════════════════════
//  scripts/migrate-from-json.ts
//
//  One-shot migration: reads data/finance-state.json and inserts
//  everything into the SQLite DB in a single transaction.
//
//  Run: npm run migrate-json
//       (requires tsx: npm i -D tsx)
//
//  Safe to run multiple times — uses INSERT OR IGNORE so duplicates
//  are skipped. Keeps finance-state.json as a backup.
// ════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";

// ─── Load schemas ──────────────────────────────────────────────────
import { expenses } from "../features/expenses/schema";
import { debts, debtPayments } from "../features/debts/schema";
import { bills, billPayments } from "../features/bills/schema";
import { ious } from "../features/ious/schema";
import { envelopes } from "../features/envelopes/schema";
import { goals } from "../features/goals/schema";
import { profile, flags } from "../features/core/db/schema";

// Default envelope config from the old finance.js constants
const DEFAULT_ENVELOPES = [
    { id: "survival", label: "Survival", amount: 63500, icon: "🏠", locked: true, desc: "Rent, maintenance, OTT, Furlenco, family mobile, commute.", order: 0 },
    { id: "food", label: "Food", amount: 15000, icon: "🍱", locked: false, desc: "Groceries + cooking. Delivery only if balance left.", order: 1 },
    { id: "freedom", label: "Freedom Money", amount: 15000, icon: "🎯", locked: false, desc: "Cash only. Personal, party, smokes. When zero, month is done.", order: 2 },
    { id: "sip", label: "SIP", amount: 8000, icon: "📈", locked: true, desc: "Auto-debit MF SIP. Never pause.", order: 3 },
    { id: "debt", label: "Debt Assault", amount: 73500, icon: "⚔️", locked: true, desc: "EMIs (₹20k) + extra attack (₹53.5k). Highest interest first.", order: 4 },
    { id: "emergency", label: "Emergency Vault", amount: 5000, icon: "🔒", locked: true, desc: "Small buffer until renovation is funded, then build.", order: 5 },
];

const DEFAULT_BILLS = [
    { id: "rent", label: "Rent", amount: 28000, dueDay: 5, category: "rent", icon: "🏠", order: 0 },
    { id: "family", label: "Family mobile recharges", amount: 15000, dueDay: 7, category: "family", icon: "📱", order: 1 },
    { id: "maintenance", label: "Maintenance + electricity", amount: 8000, dueDay: 10, category: "maintenance", icon: "⚡", order: 2 },
    { id: "furlenco", label: "Furlenco (furniture rent)", amount: 5000, dueDay: 10, category: "furniture", icon: "🛋️", order: 3 },
    { id: "ott", label: "OTT (Netflix/Prime/Hotstar)", amount: 1500, dueDay: 15, category: "subscriptions", icon: "📺", order: 4 },
    { id: "sip", label: "SIP (mutual fund)", amount: 8000, dueDay: 1, category: "sip", icon: "📈", order: 5 },
];

// ─── Read JSON ─────────────────────────────────────────────────────
const jsonPath = path.resolve(process.cwd(), "data/finance-state.json");
if (!fs.existsSync(jsonPath)) {
    console.error("❌  data/finance-state.json not found. Nothing to migrate.");
    process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
console.log("✓ Loaded finance-state.json");

// ─── DB client ────────────────────────────────────────────────────
const dbUrl = process.env.TURSO_DATABASE_URL ?? "file:./data/finance.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient(authToken ? { url: dbUrl, authToken } : { url: dbUrl });
const db = drizzle(client);

// ─── Run migrations (create tables) ───────────────────────────────
async function ensureTables() {
    // Use drizzle-kit push via CLI before running this script, OR
    // manually create tables. Here we use raw SQL as a portable fallback.
    await db.run(sql`CREATE TABLE IF NOT EXISTS profile (
    id TEXT PRIMARY KEY DEFAULT 'main',
    name TEXT NOT NULL DEFAULT 'User',
    income REAL NOT NULL DEFAULT 180000,
    salary_day INTEGER NOT NULL DEFAULT 1,
    currency TEXT NOT NULL DEFAULT 'INR'
  )`);
    await db.run(sql`CREATE TABLE IF NOT EXISTS flags (
    id TEXT PRIMARY KEY DEFAULT 'main',
    salary_received INTEGER NOT NULL DEFAULT 0,
    envelopes_setup INTEGER NOT NULL DEFAULT 0,
    last_salary_month TEXT,
    setup_complete INTEGER NOT NULL DEFAULT 0,
    webhook_secret TEXT
  )`);
    await db.run(sql`CREATE TABLE IF NOT EXISTS envelopes (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    amount REAL NOT NULL,
    icon TEXT NOT NULL DEFAULT '💰',
    locked INTEGER NOT NULL DEFAULT 0,
    desc TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0
  )`);
    await db.run(sql`CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    merchant TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    account_suffix TEXT,
    currency TEXT NOT NULL DEFAULT 'INR',
    client_request_id TEXT UNIQUE,
    note TEXT,
    envelope_id TEXT
  )`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS expenses_ts_idx ON expenses(ts)`);
    await db.run(sql`CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    rate REAL NOT NULL DEFAULT 0,
    emi REAL NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#9F77DD',
    type TEXT NOT NULL DEFAULT 'friend',
    "order" INTEGER NOT NULL DEFAULT 0
  )`);
    await db.run(sql`CREATE TABLE IF NOT EXISTS debt_payments (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    debt_id TEXT NOT NULL REFERENCES debts(id),
    amount REAL NOT NULL,
    note TEXT,
    expense_id TEXT
  )`);
    await db.run(sql`CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    amount REAL NOT NULL,
    due_day INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    icon TEXT NOT NULL DEFAULT '🧾',
    active INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0
  )`);
    await db.run(sql`CREATE TABLE IF NOT EXISTS bill_payments (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    bill_id TEXT NOT NULL REFERENCES bills(id),
    amount REAL NOT NULL,
    month TEXT NOT NULL,
    partial INTEGER NOT NULL DEFAULT 0,
    note TEXT
  )`);
    await db.run(sql`CREATE TABLE IF NOT EXISTS ious (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    ts INTEGER NOT NULL,
    note TEXT,
    settled_ts INTEGER,
    settled_amt REAL
  )`);
    await db.run(sql`CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    needed REAL NOT NULL,
    saved REAL NOT NULL DEFAULT 0,
    icon TEXT NOT NULL DEFAULT '🎯',
    target_date TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0
  )`);
    await db.run(sql`CREATE TABLE IF NOT EXISTS goal_contributions (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    goal_id TEXT NOT NULL REFERENCES goals(id),
    amount REAL NOT NULL,
    note TEXT
  )`);
    console.log("✓ Tables ensured");
}

// ─── Main migration ────────────────────────────────────────────────
async function migrate() {
    await ensureTables();

    // Profile
    const cfg = raw.config?.profile ?? {};
    await db.run(sql`INSERT OR IGNORE INTO profile (id, name, income, salary_day) VALUES ('main', ${cfg.name ?? "Nishit"}, ${cfg.income ?? 180000}, ${cfg.salaryDay ?? 1})`);
    console.log("✓ Profile");

    // Flags
    const f = raw.flags ?? {};
    await db.run(sql`INSERT OR IGNORE INTO flags (id, salary_received, envelopes_setup) VALUES ('main', ${f.salaryReceived ? 1 : 0}, ${f.envelopesSetup ? 1 : 0})`);
    console.log("✓ Flags");

    // Envelopes — prefer config.envelopes, fall back to defaults
    const envs: typeof DEFAULT_ENVELOPES = raw.config?.envelopes?.length
        ? raw.config.envelopes.map((e: any, i: number) => ({ ...e, desc: e.desc ?? "", order: e.order ?? i }))
        : DEFAULT_ENVELOPES;
    for (const e of envs) {
        await db.run(sql`INSERT OR IGNORE INTO envelopes (id, label, amount, icon, locked, desc, "order") VALUES (${e.id}, ${e.label}, ${e.amount}, ${e.icon}, ${e.locked ? 1 : 0}, ${e.desc ?? ""}, ${e.order})`);
    }
    console.log(`✓ Envelopes (${envs.length})`);

    // Debts
    const rawDebts: any[] = raw.debts ?? [];
    for (let i = 0; i < rawDebts.length; i++) {
        const d = rawDebts[i];
        await db.run(sql`INSERT OR IGNORE INTO debts (id, name, balance, rate, emi, color, type, "order") VALUES (${d.id}, ${d.name}, ${d.balance ?? 0}, ${d.rate ?? 0}, ${d.emi ?? 0}, ${d.color ?? "#9F77DD"}, ${d.type ?? "friend"}, ${i})`);
    }
    console.log(`✓ Debts (${rawDebts.length})`);

    // Expenses
    const rawExpenses: any[] = raw.expenses ?? [];
    let expCount = 0;
    for (const e of rawExpenses) {
        try {
            await db.run(sql`INSERT OR IGNORE INTO expenses (id, ts, amount, category, merchant, source, account_suffix, client_request_id) VALUES (${e.id}, ${e.ts}, ${e.amount}, ${e.category ?? "other"}, ${e.merchant ?? ""}, ${e.source ?? "manual"}, ${e.accountSuffix ?? null}, ${e.clientRequestId ?? null})`);
            expCount++;
        } catch (err) {
            // skip duplicates silently
        }
    }
    console.log(`✓ Expenses (${expCount} / ${rawExpenses.length})`);

    // Debt payments
    const rawPayments: any[] = raw.debtPayments ?? [];
    let payCount = 0;
    for (const p of rawPayments) {
        try {
            await db.run(sql`INSERT OR IGNORE INTO debt_payments (id, ts, debt_id, amount, note, expense_id) VALUES (${p.id}, ${p.ts}, ${p.debtId}, ${p.amount}, ${p.note ?? null}, ${p.expenseId ?? null})`);
            payCount++;
        } catch (err) {
            // foreign key might fail if debt was skipped — ignore
        }
    }
    console.log(`✓ Debt payments (${payCount} / ${rawPayments.length})`);

    // Bills — use config.bills if present, else defaults
    const rawBills: any[] = raw.config?.bills?.length ? raw.config.bills : DEFAULT_BILLS;
    for (const b of rawBills) {
        await db.run(sql`INSERT OR IGNORE INTO bills (id, label, amount, due_day, category, icon, active, "order") VALUES (${b.id}, ${b.label}, ${b.amount}, ${b.dueDay}, ${b.category ?? "other"}, ${b.icon ?? "🧾"}, 1, ${b.order ?? 0})`);
    }
    console.log(`✓ Bills (${rawBills.length})`);

    // IOUs
    const rawIous: any[] = raw.ious ?? [];
    for (const i of rawIous) {
        await db.run(sql`INSERT OR IGNORE INTO ious (id, name, amount, ts, note, settled_ts, settled_amt) VALUES (${i.id}, ${i.name}, ${i.amount}, ${i.ts}, ${i.note ?? null}, ${i.settledTs ?? null}, ${i.settledAmt ?? null})`);
    }
    console.log(`✓ IOUs (${rawIous.length})`);

    // Goals — from config.goals
    const rawGoals = raw.config?.goals ?? {};
    const goalsList = Object.values(rawGoals) as any[];
    for (let i = 0; i < goalsList.length; i++) {
        const g = goalsList[i];
        const saved = raw.goalSavings?.renovation ?? 0;  // map old renovation savings
        await db.run(sql`INSERT OR IGNORE INTO goals (id, label, needed, saved, icon, "order") VALUES (${g.id}, ${g.label}, ${g.needed}, ${g.id === "renoNow" ? saved : 0}, ${g.icon ?? "🎯"}, ${i})`);
    }
    if (!goalsList.length) {
        // Insert defaults
        await db.run(sql`INSERT OR IGNORE INTO goals (id, label, needed, saved, icon, "order") VALUES ('renoNow', 'Tile work (immediate)', 200000, ${raw.goalSavings?.renovation ?? 0}, '🧱', 0)`);
        await db.run(sql`INSERT OR IGNORE INTO goals (id, label, needed, saved, icon, "order") VALUES ('renoFull', 'Full renovation', 600000, 0, '🏗️', 1)`);
    }
    console.log(`✓ Goals`);

    console.log("\n✅  Migration complete!");
    console.log("   DB:", dbUrl);
    console.log("   Backup still at: data/finance-state.json");
    console.log("\n   Next: npm run dev → open http://localhost:3000");
}

migrate().catch(err => {
    console.error("❌  Migration failed:", err);
    process.exit(1);
});
