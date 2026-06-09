// ════════════════════════════════════════════════════════════════
//  features/expenses/api/list.ts
//  GET /api/expenses/list
//
//  Query params (all optional):
//    from        — ms epoch (only expenses >= from)
//    to          — ms epoch (only expenses <= to)
//    category    — filter by category key (food|debt|etc.)
//    merchant    — substring match (case-insensitive)
//    minAmount   — number
//    maxAmount   — number
//    limit       — page size, default 50, max 500
//    cursor      — opaque pagination cursor (last ts from previous page)
//    groupBy     — "day" to return rows grouped by date with daily totals
//
//  Always returns the caller's expenses only (user_id scoped).
// ════════════════════════════════════════════════════════════════

import { db } from "@/features/core/db/client";
import { expenses } from "../schema";
import { CATEGORIES, type CategoryKey } from "../lib/categorize";
import { desc, gte, lte, and, eq, lt, sql } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";

export async function listExpenses(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    const url   = new URL(req.url);
    const from  = url.searchParams.get("from");
    const to    = url.searchParams.get("to");
    const cat   = url.searchParams.get("category");
    const mer   = url.searchParams.get("merchant");
    const minA  = url.searchParams.get("minAmount");
    const maxA  = url.searchParams.get("maxAmount");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 500);
    const cursorTs = url.searchParams.get("cursor");
    const groupBy = url.searchParams.get("groupBy");

    const conditions = [eq(expenses.userId, userId as string)];
    if (from)     conditions.push(gte(expenses.ts, Number(from)));
    if (to)       conditions.push(lte(expenses.ts, Number(to)));
    if (cat)      conditions.push(eq(expenses.category, cat));
    if (mer)      conditions.push(sql`LOWER(${expenses.merchant}) LIKE ${"%" + mer.toLowerCase() + "%"}`);
    if (minA)     conditions.push(gte(expenses.amount, Number(minA)));
    if (maxA)     conditions.push(lte(expenses.amount, Number(maxA)));
    if (cursorTs) conditions.push(lt(expenses.ts, Number(cursorTs)));

    const rows = await db
        .select()
        .from(expenses)
        .where(and(...conditions))
        .orderBy(desc(expenses.ts))
        .limit(limit + 1);  // fetch one extra to detect next-page

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].ts : null;

    const enriched = page.map(r => {
        const meta = CATEGORIES[r.category as CategoryKey] ?? { label: r.category, icon: "📦", envelope: "freedom" };
        return {
            ...r,
            categoryMeta: { label: meta.label, icon: meta.icon, envelope: meta.envelope },
        };
    });

    if (groupBy === "day") {
        const byDay: Record<string, typeof enriched> = {};
        for (const e of enriched) {
            const d = new Date(e.ts);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            (byDay[key] ??= []).push(e);
        }
        const days = Object.entries(byDay)
            .map(([date, items]) => ({
                date,
                count: items.length,
                total: items.reduce((s, e) => s + Number(e.amount), 0),
                items,
            }))
            .sort((a, b) => b.date.localeCompare(a.date));
        return Response.json({ ok: true, days, nextCursor, hasMore });
    }

    return Response.json({ ok: true, expenses: enriched, nextCursor, hasMore });
}
