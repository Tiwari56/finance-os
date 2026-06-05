// ════════════════════════════════════════════════════════════════
//  Drizzle + libSQL singleton
//  Local dev: SQLite file at data/finance.db
//  Production: Turso URL + token via env vars
// ════════════════════════════════════════════════════════════════

import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./allSchemas";

function createDbClient() {
    // Vercel build/runtime cannot rely on a writable local file path.
    const fallbackUrl = process.env.NODE_ENV === "production"
        ? "file::memory:"
        : "file:./data/finance.db";
    const url = process.env.TURSO_DATABASE_URL ?? fallbackUrl;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    const client = createClient(
        authToken ? { url, authToken } : { url }
    );

    return drizzle(client, { schema });
}

// Singleton — reused across Next.js hot-reloads in dev
const globalForDb = globalThis as unknown as { _db?: ReturnType<typeof createDbClient> };
export const db = globalForDb._db ?? createDbClient();
if (process.env.NODE_ENV !== "production") globalForDb._db = db;

export type DB = typeof db;
