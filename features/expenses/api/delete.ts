// ════════════════════════════════════════════════════════════════
//  expenses/api/delete.ts
//  POST /api/expenses/delete — scoped to the session user.
// ════════════════════════════════════════════════════════════════

import { z } from "zod";
import { db } from "@/features/core/db/client";
import { expenses } from "../schema";
import { eq, and } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";

const Body = z.object({ id: z.string() });

export async function deleteExpense(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }

    const parsed = Body.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "id required" }, { status: 400 });

    await db.delete(expenses).where(and(eq(expenses.id, parsed.data.id), eq(expenses.userId, userId)));
    return Response.json({ ok: true });
}
