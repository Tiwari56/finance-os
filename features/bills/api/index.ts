// ════════════════════════════════════════════════════════════════
//  bills/api/index.ts — all handlers scoped to the session user.
// ════════════════════════════════════════════════════════════════

import { z } from "zod";
import { db } from "@/features/core/db/client";
import { bills, billPayments } from "../schema";
import { eq, and, desc, getTableColumns } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";

function monthKey(d: Date = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Status ───────────────────────────────────────────────────────
export async function getBillsStatus(_req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    const now = new Date();
    const mk = monthKey(now);
    const allBills = await db.select().from(bills)
        .where(and(eq(bills.userId, userId), eq(bills.active, true)))
        .orderBy(bills.order);
    const payments = await db.select({ ...getTableColumns(billPayments) })
        .from(billPayments)
        .innerJoin(bills, eq(billPayments.billId, bills.id))
        .where(and(eq(bills.userId, userId), eq(billPayments.month, mk)));

    const paidMap = new Map(payments.map(p => [p.billId, p]));
    const withStatus = allBills.map(b => {
        const payment = paidMap.get(b.id);
        const today = now.getDate();
        const overdue = !payment && today > b.dueDay;
        const dueSoon = !payment && !overdue && (b.dueDay - today) <= 3;
        return { ...b, payment: payment ?? null, overdue, dueSoon };
    });

    return Response.json({ ok: true, bills: withStatus, month: mk });
}

// ─── Upsert bill ──────────────────────────────────────────────────
const UpsertBillBody = z.object({
    id: z.string().optional(),
    label: z.string().min(1),
    amount: z.number().positive(),
    dueDay: z.number().int().min(1).max(31),
    category: z.string().default("other"),
    icon: z.string().default("🧾"),
    order: z.number().default(0),
});

export async function upsertBill(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = UpsertBillBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const { id: existingId, ...data } = parsed.data;

    if (existingId) {
        const updated = await db.update(bills).set(data)
            .where(and(eq(bills.id, existingId), eq(bills.userId, userId)))
            .returning({ id: bills.id });
        if (updated.length === 0) return Response.json({ ok: false, error: "Bill not found" }, { status: 404 });
        return Response.json({ ok: true, id: existingId });
    }

    const id = "bill_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
    await db.insert(bills).values({ id, userId, ...data });
    return Response.json({ ok: true, id });
}

// ─── Pay bill ─────────────────────────────────────────────────────
const PayBillBody = z.object({
    billId: z.string(),
    amount: z.number().positive(),
    month: z.string().optional(),
    partial: z.boolean().default(false),
    note: z.string().optional(),
});

export async function payBill(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = PayBillBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const { billId, amount, partial, note } = parsed.data;

    const owned = await db.select({ id: bills.id }).from(bills)
        .where(and(eq(bills.id, billId), eq(bills.userId, userId)))
        .limit(1);
    if (owned.length === 0) return Response.json({ ok: false, error: "Bill not found" }, { status: 404 });

    const month = parsed.data.month ?? monthKey();
    const id = "bp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
    const ts = Date.now();

    await db.insert(billPayments)
        .values({ id, ts, billId, amount, month, partial: partial ?? false, note })
        .onConflictDoUpdate({ target: billPayments.id, set: { amount, partial: partial ?? false, note } });

    return Response.json({ ok: true, id });
}

// ─── Undo payment ─────────────────────────────────────────────────
const UndoBody = z.object({ billId: z.string(), month: z.string().optional() });

export async function undoBill(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = UndoBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "billId required" }, { status: 400 });

    const owned = await db.select({ id: bills.id }).from(bills)
        .where(and(eq(bills.id, parsed.data.billId), eq(bills.userId, userId)))
        .limit(1);
    if (owned.length === 0) return Response.json({ ok: false, error: "Bill not found" }, { status: 404 });

    const month = parsed.data.month ?? monthKey();
    const payments = await db.select().from(billPayments)
        .where(eq(billPayments.billId, parsed.data.billId))
        .orderBy(desc(billPayments.ts))
        .limit(1);

    if (payments.length && payments[0].month === month) {
        await db.delete(billPayments).where(eq(billPayments.id, payments[0].id));
    }

    return Response.json({ ok: true });
}

// ─── Delete bill ──────────────────────────────────────────────────
export async function deleteBill(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = z.object({ id: z.string() }).safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "id required" }, { status: 400 });

    await db.update(bills).set({ active: false })
        .where(and(eq(bills.id, parsed.data.id), eq(bills.userId, userId)));
    return Response.json({ ok: true });
}
