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
    // EMI-reality fields (all optional — wizard / edit form may send them)
    principal: z.number().min(0).optional(),
    dueDay: z.number().int().min(1).max(28).optional(),
    tenureMonths: z.number().int().min(0).optional(),
    openedTs: z.number().optional(),
    creditLimit: z.number().min(0).optional(),
    minDue: z.number().min(0).optional(),
    statementBalance: z.number().min(0).optional(),
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
    // New loans: default original amount to the current balance if not given.
    await db.insert(debts).values({
        id, userId,
        status: "active",
        ...data,
        principal: data.principal ?? data.balance,
    });
    return Response.json({ ok: true, id });
}

// ─── Pay ──────────────────────────────────────────────────────────
//  Real-life payments aren't "pay off the whole thing". `kind` captures
//  what actually happened so the balance, status and recommendations
//  stay honest:
//    emi      — scheduled EMI / monthly instalment
//    min      — credit-card minimum due
//    full     — full statement / clear the card
//    partial  — any ad-hoc part payment
//    extra    — extra attack on top of the EMI (avalanche)
//    foreclose— close the loan early, balance → 0
//    settle   — mark a friend/informal debt settled, balance → 0
const PAY_LABELS: Record<string, string> = {
    emi: "EMI payment", min: "Minimum due paid", full: "Paid in full",
    partial: "Part payment", extra: "Extra payment",
    foreclose: "Foreclosed", settle: "Settled",
};
const PayBody = z.object({
    debtId: z.string(),
    amount: z.number().positive().optional(),  // optional for foreclose/settle (uses full balance)
    kind: z.enum(["emi", "min", "full", "partial", "extra", "foreclose", "settle"]).default("partial"),
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

    const { debtId, kind, note, expenseId, ts } = parsed.data;

    // Verify ownership before touching anything
    const [debt] = await db.select().from(debts)
        .where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
        .limit(1);
    if (!debt) return Response.json({ ok: false, error: "Debt not found" }, { status: 404 });

    // foreclose / settle clear the whole balance; everything else needs an amount
    const closing = kind === "foreclose" || kind === "settle";
    const amount = closing ? Math.max(0, debt.balance) : parsed.data.amount;
    if (!amount || amount <= 0) {
        return Response.json({ ok: false, error: "Amount required" }, { status: 400 });
    }

    const payTs = ts ?? Date.now();
    const newBalance = Math.max(0, debt.balance - amount);

    const id = "pay_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
    await db.insert(debtPayments).values({
        id, ts: payTs, debtId, amount, note: note ?? PAY_LABELS[kind], expenseId,
    });

    // Status: explicit for close actions; auto-settle when balance hits 0.
    const status = kind === "foreclose" ? "foreclosed"
        : kind === "settle" ? "settled"
        : newBalance <= 0 ? "settled"
        : debt.status;

    // Credit-card statement tracking: clearing in full zeroes the statement;
    // paying the minimum satisfies the min-due for this cycle.
    const minDuePatch =
        kind === "full" ? { minDue: 0, statementBalance: 0 }
        : kind === "min" ? { minDue: 0 }
        : debt.minDue != null ? { minDue: Math.max(0, debt.minDue - amount) }
        : {};

    await db.update(debts)
        .set({ balance: newBalance, status, lastPaidTs: payTs, ...minDuePatch })
        .where(eq(debts.id, debtId));

    return Response.json({ ok: true, id, newBalance, status });
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
