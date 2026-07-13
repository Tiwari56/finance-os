// ════════════════════════════════════════════════════════════════
//  features/advisor/api/key.ts
//  BYOK management:
//    GET  /api/advisor/key   → status (masked hint, source, usage)
//    POST /api/advisor/key   → { apiKey }        — validate + save
//                              { remove: true }  — delete stored key
//
//  The key is validated against the Anthropic API with a 10-token
//  test call BEFORE saving, so users can't save a broken key.
//  Stored AES-256-GCM encrypted. Never returned in responses.
// ════════════════════════════════════════════════════════════════

import { z } from "zod";
import { db } from "@/features/core/db/client";
import { aiSettings } from "@/features/core/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { aiAccessStatus } from "@/lib/aiAccess";
import { requireUser } from "@/lib/requireUser";
import { eq } from "drizzle-orm";

const SetKeyBody = z.object({
    apiKey: z.string().min(20).max(200).optional(),
    model: z.string().max(60).optional(),
    remove: z.boolean().optional(),
});

async function validateAnthropicKey(apiKey: string, model: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model,
                max_tokens: 5,
                messages: [{ role: "user", content: "hi" }],
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) return { ok: true };
        const data = await res.json().catch(() => ({}));
        const msg: string = (data as any)?.error?.message ?? `HTTP ${res.status}`;
        if (res.status === 401) return { ok: false, error: "Invalid API key — check you copied the whole key." };
        if (res.status === 404) return { ok: false, error: `Model not available on this key (${msg}).` };
        return { ok: false, error: msg };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Could not reach Anthropic API" };
    }
}

export async function getKeyStatus(): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;
    return Response.json(await aiAccessStatus(userId as string));
}

export async function setKey(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = SetKeyBody.safeParse(body);
    if (!parsed.success) {
        return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }
    const { apiKey, model = "claude-sonnet-4-6", remove } = parsed.data;

    if (remove) {
        await db.delete(aiSettings).where(eq(aiSettings.userId, userId as string));
        return Response.json({ ok: true, removed: true });
    }

    if (!apiKey) {
        return Response.json({ ok: false, error: "apiKey required (or pass remove: true)" }, { status: 400 });
    }
    if (!apiKey.startsWith("sk-ant-")) {
        return Response.json({ ok: false, error: "That doesn't look like an Anthropic key (should start with sk-ant-)." }, { status: 400 });
    }

    // Validate against the live API before saving
    const check = await validateAnthropicKey(apiKey, model);
    if (!check.ok) {
        return Response.json({ ok: false, error: check.error }, { status: 400 });
    }

    await db
        .insert(aiSettings)
        .values({
            userId: userId as string,
            provider: "anthropic",
            encryptedKey: encryptSecret(apiKey),
            model,
            updatedTs: Date.now(),
        })
        .onConflictDoUpdate({
            target: aiSettings.userId,
            set: { encryptedKey: encryptSecret(apiKey), model, updatedTs: Date.now() },
        });

    return Response.json({ ok: true, saved: true });
}
