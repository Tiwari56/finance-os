import { z } from "zod";
import { db } from "@/features/core/db/client";
import { envelopes } from "../schema";
import { envelopeKeyOf } from "../lib/keys";
import { eq, and } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";

export async function listEnvelopes(_req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    const rows = await db.select().from(envelopes)
        .where(eq(envelopes.userId, userId))
        .orderBy(envelopes.order);
    return Response.json({
        ok: true,
        envelopes: rows.map(e => ({ ...e, key: envelopeKeyOf(e.id) })),
    });
}

const UpdateBody = z.object({
    id: z.string(),
    amount: z.number().min(0),
    label: z.string().optional(),
    desc: z.string().optional(),
});

export async function updateEnvelope(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = UpdateBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const { id, ...data } = parsed.data;
    const updated = await db.update(envelopes).set(data)
        .where(and(eq(envelopes.id, id), eq(envelopes.userId, userId)))
        .returning({ id: envelopes.id });
    if (updated.length === 0) return Response.json({ ok: false, error: "Envelope not found" }, { status: 404 });
    return Response.json({ ok: true });
}
