// ════════════════════════════════════════════════════════════════
//  debts/api/index.ts
//  POST /api/debts/pay       — record a payment
//  POST /api/debts/upsert    — add or update a debt
//  POST /api/debts/delete    — remove a debt
//  GET  /api/debts/list      — list all debts + payments
// ════════════════════════════════════════════════════════════════

import { z } from "zod";
import { db } from "@/features/core/db/client";
import { debts, debtPayments } from "../schema";
import { eq, desc } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";

// ─── List ─────────────────────────────────────────────────────────
export async function listDebts(_req: Request): Promise<Response> {
    const rows = await db.select().from(debts).orderBy(debts.order, debts.type);
    const payments = await db.select().from(debtPayments).orderBy(desc(debtPayments.ts)).limit(200);
    return Response.json({ ok: true, debts: rows, payments });
}

// ─── Upsert ───────────────────────────────────────────────────────
const UpsertBody = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    balance: z.number().min(0),
    rate: z.number().min(0),
    emi: z.number().min(0).default(0),
    color: z.string().optional().default("#9F77DD"),
    type: z.enum(["cc", "formal", "friend"]).default("friend"),
    order: z.number().optional().default(0),
});

export async function upsertDebt(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = UpsertBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const { id: existingId, ...data } = parsed.data;
    const id = existingId ?? "debt_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);

    await db.insert(debts).values({ id, userId: userId, ...data }).onConflictDoUpdate({ target: debts.id, set: data });
    return Response.json({ ok: true, id });
}

// ─── Pay ──────────────────────────────────────────────────────────
const PayBody = z.object({
    debtId: z.string(),
    amount: z.number().positive(),
    note: z.string().optional(),
    expenseId: z.string().optional(),
    ts: z.number().optional(),
});

export async function payDebt(req: Request): Promise<Response> {
    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = PayBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const { debtId, amount, note, expenseId, ts } = parsed.data;
    const id = "pay_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
    const now = ts ?? Date.now();

    await db.insert(debtPayments).values({ id, ts: now, debtId, amount, note, expenseId });

    // Reduce outstanding balance
    const [debt] = await db.select().from(debts).where(eq(debts.id, debtId)).limit(1);
    if (debt) {
        await db.update(debts)
            .set({ balance: Math.max(0, debt.balance - amount) })
            .where(eq(debts.id, debtId));
    }

    return Response.json({ ok: true, id });
}

// ─── Delete ───────────────────────────────────────────────────────
const DeleteBody = z.object({ id: z.string() });

export async function deleteDebt(req: Request): Promise<Response> {
    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = DeleteBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "id required" }, { status: 400 });

    await db.delete(debts).where(eq(debts.id, parsed.data.id));
    return Response.json({ ok: true });
}
