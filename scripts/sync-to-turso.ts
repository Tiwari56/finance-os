// ════════════════════════════════════════════════════════════════
//  scripts/sync-to-turso.ts
//
//  One-shot data sync: copies every row from the LOCAL SQLite DB
//  (data/finance.db) into the remote Turso DB.
//
//  Use this after creating your Turso database to push your local
//  expenses, debts, bills, envelopes, etc. up to the cloud DB the
//  Vercel deployment will read from.
//
//  Run:
//    TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... \
//      npx tsx scripts/sync-to-turso.ts
//
//  Safe to run multiple times — uses INSERT OR REPLACE so rerunning
//  just refreshes the rows.
// ════════════════════════════════════════════════════════════════

import { createClient, type InStatement, type InValue } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";

const localUrl = "file:" + path.resolve(process.cwd(), "data/finance.db");
const remoteUrl = process.env.TURSO_DATABASE_URL;
const remoteToken = process.env.TURSO_AUTH_TOKEN;

if (!remoteUrl) {
    console.error("❌  TURSO_DATABASE_URL not set. Get one at turso.tech then re-run.");
    process.exit(1);
}
if (!fs.existsSync(path.resolve(process.cwd(), "data/finance.db"))) {
    console.error("❌  Local data/finance.db not found. Run the app locally first to create it.");
    process.exit(1);
}

const local = createClient({ url: localUrl });
const remote = createClient({ url: remoteUrl, authToken: remoteToken });

const TABLES = [
    "profile", "flags",
    "envelopes", "bills", "goals", "debts",
    "expenses", "debt_payments", "bill_payments",
    "ious", "goal_contributions",
];

// Quote identifiers that might be reserved keywords (e.g. "order")
function quote(name: string) {
    return `"${name.replace(/"/g, '""')}"`;
}

async function syncTable(name: string) {
    const rowsRes = await local.execute(`SELECT * FROM ${name}`);
    const rows = rowsRes.rows;
    if (rows.length === 0) {
        console.log(`  · ${name}: (empty)`);
        return 0;
    }
    const cols = rowsRes.columns ?? Object.keys(rows[0]);
    const colsSql = cols.map(quote).join(", ");
    const placeholders = cols.map(() => "?").join(", ");
    const stmt = `INSERT OR REPLACE INTO ${name} (${colsSql}) VALUES (${placeholders})`;

    // Batch in transactions of 200 rows
    const batchSize = 200;
    let total = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
        const slice = rows.slice(i, i + batchSize);
        const batch: InStatement[] = slice.map(r => ({
            sql: stmt,
            args: cols.map(c => (r as Record<string, unknown>)[c] as InValue ?? null),
        }));
        await remote.batch(batch, "write");
        total += slice.length;
    }
    console.log(`  ✓ ${name}: ${total} rows`);
    return total;
}

async function main() {
    console.log("→ Syncing local SQLite → Turso");
    console.log("  local:  " + localUrl);
    console.log("  remote: " + new URL(remoteUrl!).host);
    console.log();

    // Verify remote tables exist
    const remoteTables = await remote.execute("SELECT name FROM sqlite_master WHERE type='table'");
    const names = new Set(remoteTables.rows.map(r => String(r.name)));
    const missing = TABLES.filter(t => !names.has(t));
    if (missing.length > 0) {
        console.error("❌  Remote DB missing tables: " + missing.join(", "));
        console.error("    Run `npm run db:push` first to create the schema in Turso.");
        process.exit(1);
    }

    let totalRows = 0;
    for (const t of TABLES) {
        try {
            totalRows += await syncTable(t);
        } catch (err) {
            console.error(`  ✗ ${t}: ${(err as Error).message}`);
        }
    }

    console.log();
    console.log(`✓ Done. Synced ${totalRows} rows to ${new URL(remoteUrl!).host}.`);
    console.log();
    console.log("Next steps:");
    console.log("  1. Verify on https://app.turso.tech (your DB → Data tab)");
    console.log("  2. Set the same env vars in Vercel → Settings → Environment Variables");
    console.log("  3. Redeploy (vercel --prod)");
}

main().catch(err => {
    console.error("Sync failed:", err);
    process.exit(1);
});
