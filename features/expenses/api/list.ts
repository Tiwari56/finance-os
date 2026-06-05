// ════════════════════════════════════════════════════════════════
//  expenses/api/list.ts
//  GET /api/expenses/list
// ════════════════════════════════════════════════════════════════

import { db } from "@/features/core/db/client";
import { expenses } from "../schema";
import { desc, gte, lte, and } from "drizzle-orm";

export async function listExpenses(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);

    const conditions = [];
    if (from) conditions.push(gte(expenses.ts, Number(from)));
    if (to) conditions.push(lte(expenses.ts, Number(to)));

    const rows = await db
        .select()
        .from(expenses)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(expenses.ts))
        .limit(limit);

    return Response.json({ ok: true, expenses: rows });
}
