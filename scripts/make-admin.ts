// ════════════════════════════════════════════════════════════════
//  scripts/make-admin.ts
//  Promote (or demote) a user by email.
//
//  Usage:
//    npx tsx scripts/make-admin.ts you@example.com          # promote
//    npx tsx scripts/make-admin.ts you@example.com user     # demote
//
//  Works against local file DB by default; set TURSO_DATABASE_URL +
//  TURSO_AUTH_TOKEN to run against production.
// ════════════════════════════════════════════════════════════════

import { createClient } from "@libsql/client";

const email = process.argv[2];
const role = process.argv[3] ?? "admin";

if (!email || !["admin", "user"].includes(role)) {
    console.error("Usage: npx tsx scripts/make-admin.ts <email> [admin|user]");
    process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL ?? "file:./data/finance.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient(authToken ? { url, authToken } : { url });

async function main() {
    const found = await client.execute({ sql: "SELECT id, name, role FROM users WHERE email = ?", args: [email] });
    if (found.rows.length === 0) {
        console.error(`❌  No user with email ${email}`);
        process.exit(1);
    }
    await client.execute({ sql: "UPDATE users SET role = ? WHERE email = ?", args: [role, email] });
    console.log(`✓ ${email} (${found.rows[0].name}) → role=${role}`);
    console.log(`  DB: ${url.startsWith("libsql") ? new URL(url).host : url}`);
}

main().catch(e => { console.error(e); process.exit(1); });
