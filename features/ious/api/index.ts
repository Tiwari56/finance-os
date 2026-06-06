import { z } from "zod";
import { db } from "@/features/core/db/client";
import { ious } from "../schema";
import { eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";

// ─── List ─────────────────────────────────────────────────────────
export async function listIous(_req: Request): Promise<Response> {
    const rows = await db.select().from(ious).orderBy(ious.ts);
    return Response.json({ ok: true, ious: rows });
}

// ─── Add ──────────────────────────────────────────────────────────
const AddBody = z.object({
    name: z.string().min(1),
    amount: z.number().positive(),
    note: z.string().optional(),
    ts: z.number().optional(),
});

export async function addIou(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = AddBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const id = "iou_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
    const ts = parsed.data.ts ?? Date.now();

    await db.insert(ious).values({ id, ts, userId: userId, ...parsed.data });
    return Response.json({ ok: true, id });
}

// ─── Settle ───────────────────────────────────────────────────────
const SettleBody = z.object({
    id: z.string(),
    settledAmt: z.number().positive().optional(),
});

export async function settleIou(req: Request): Promise<Response> {
    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = SettleBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "id required" }, { status: 400 });

    await db.update(ious)
        .set({ settledTs: Date.now(), settledAmt: parsed.data.settledAmt ?? null })
        .where(eq(ious.id, parsed.data.id));
    return Response.json({ ok: true });
}

// ─── Delete ───────────────────────────────────────────────────────
export async function deleteIou(req: Request): Promise<Response> {
    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = z.object({ id: z.string() }).safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "id required" }, { status: 400 });

    await db.delete(ious).where(eq(ious.id, parsed.data.id));
    return Response.json({ ok: true });
}
