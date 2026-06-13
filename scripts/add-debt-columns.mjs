// One-off: add EMI-reality columns to the local `debts` table (idempotent).
// For Turso/prod, run `npm run db:push` during deploy.
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./data/finance.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient(authToken ? { url, authToken } : { url });

const cols = [
    ["principal", "REAL NOT NULL DEFAULT 0"],
    ["due_day", "INTEGER"],
    ["tenure_months", "INTEGER"],
    ["opened_ts", "INTEGER"],
    ["status", "TEXT NOT NULL DEFAULT 'active'"],
    ["last_paid_ts", "INTEGER"],
    ["credit_limit", "REAL"],
    ["min_due", "REAL"],
    ["statement_balance", "REAL"],
];

const existing = new Set(
    (await db.execute("PRAGMA table_info(debts)")).rows.map(r => r.name)
);

for (const [name, type] of cols) {
    if (existing.has(name)) { console.log(`= ${name} exists`); continue; }
    await db.execute(`ALTER TABLE debts ADD COLUMN ${name} ${type}`);
    console.log(`+ added ${name}`);
}
// Backfill principal = balance where principal is 0 but balance > 0 (best guess for legacy rows)
await db.execute("UPDATE debts SET principal = balance WHERE principal = 0 AND balance > 0");
console.log("done");
