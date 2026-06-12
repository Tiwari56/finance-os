// ════════════════════════════════════════════════════════════════
//  debts/api/index.ts
//  POST /api/debts/pay       — record a payment
//  POST /api/debts/upsert    — add or update a debt
//  POST /api/debts/delete    — remove a debt
//  GET  /api/debts/list      — list all debts + payments
//
//  Every handler is scoped to the session user.
// ════════════════════════════════════════════════════════════════

import { z } from "zod";
import { db } from "@/features/core/db/client";
import { debts, debtPayments } from "../schema";
import { eq, and, desc, getTableColumns } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";

// ─── List ─────────────────────────────────────────────────────────
export async function listDebts(_req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    const rows = await db.select().from(debts)
        .where(eq(debts.userId, userId))
        .orderBy(debts.order, debts.type);
    const payments = await db.select({ ...getTableColumns(debtPayments) })
        .from(debtPayments)
        .innerJoin(debts, eq(debtPayments.debtId, debts.id))
        .where(eq(debts.userId, userId))
        .orderBy(desc(debtPayments.ts))
        .limit(200);
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

    if (existingId) {
        const updated = await db.update(debts).set(data)
            .where(and(eq(debts.id, existingId), eq(debts.userId, userId)))
            .returning({ id: debts.id });
        if (updated.length === 0) return Response.json({ ok: false, error: "Debt not found" }, { status: 404 });
        return Response.json({ ok: true, id: existingId });
    }

    const id = "debt_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
    await db.insert(debts).values({ id, userId, ...data });
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
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = PayBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const { debtId, amount, note, expenseId, ts } = parsed.data;

    // Verify ownership before touching anything
    const [debt] = await db.select().from(debts)
        .where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
        .limit(1);
    if (!debt) return Response.json({ ok: false, error: "Debt not found" }, { status: 404 });

    const id = "pay_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
    await db.insert(debtPayments).values({ id, ts: ts ?? Date.now(), debtId, amount, note, expenseId });
    const newBalance = Math.max(0, debt.balance - amount);
    await db.update(debts).set({ balance: newBalance }).where(eq(debts.id, debtId));

    return Response.json({ ok: true, id, newBalance });
}

// ─── Delete ───────────────────────────────────────────────────────
const DeleteBody = z.object({ id: z.string() });

export async function deleteDebt(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = DeleteBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "id required" }, { status: 400 });

    await db.delete(debts).where(and(eq(debts.id, parsed.data.id), eq(debts.userId, userId)));
    return Response.json({ ok: true });
}
