import { z } from "zod";
import { db } from "@/features/core/db/client";
import { envelopes } from "../schema";
import { eq } from "drizzle-orm";

export async function listEnvelopes(_req: Request): Promise<Response> {
    const rows = await db.select().from(envelopes).orderBy(envelopes.order);
    return Response.json({ ok: true, envelopes: rows });
}

const UpdateBody = z.object({
    id: z.string(),
    amount: z.number().min(0),
    label: z.string().optional(),
    desc: z.string().optional(),
});

export async function updateEnvelope(req: Request): Promise<Response> {
    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = UpdateBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const { id, ...data } = parsed.data;
    await db.update(envelopes).set(data).where(eq(envelopes.id, id));
    return Response.json({ ok: true });
}
