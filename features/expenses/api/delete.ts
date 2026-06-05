// ════════════════════════════════════════════════════════════════
//  expenses/api/delete.ts
//  POST /api/expenses/delete
// ════════════════════════════════════════════════════════════════

import { z } from "zod";
import { db } from "@/features/core/db/client";
import { expenses } from "../schema";
import { eq } from "drizzle-orm";

const Body = z.object({ id: z.string() });

export async function deleteExpense(req: Request): Promise<Response> {
    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }

    const parsed = Body.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "id required" }, { status: 400 });

    await db.delete(expenses).where(eq(expenses.id, parsed.data.id));
    return Response.json({ ok: true });
}
