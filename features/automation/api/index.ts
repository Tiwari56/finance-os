// ════════════════════════════════════════════════════════════════
//  automation/api/index.ts
//  GET  /api/automation/webhook         — n8n setup info for the
//                                         signed-in user (endpoint,
//                                         secret, sample payload).
//                                         Creates a secret on first
//                                         call if none exists.
//  POST /api/automation/webhook/rotate  — invalidate + regenerate.
// ════════════════════════════════════════════════════════════════

import { db } from "@/features/core/db/client";
import { flags } from "@/features/core/db/schema";
import { generateWebhookSecret } from "@/features/core/lib/onboarding";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";

async function ensureSecret(userId: string): Promise<string> {
    const [row] = await db.select({ secret: flags.webhookSecret })
        .from(flags)
        .where(eq(flags.id, userId))
        .limit(1);
    if (row?.secret) return row.secret;

    const secret = generateWebhookSecret();
    if (row) {
        await db.update(flags).set({ webhookSecret: secret }).where(eq(flags.id, userId));
    } else {
        await db.insert(flags).values({ id: userId, webhookSecret: secret });
    }
    return secret;
}

function webhookPayload(req: Request, secret: string) {
    const origin = new URL(req.url).origin;
    const endpoint = `${origin}/api/log-expense`;
    const sampleBody = {
        secret,
        amount: 249,
        merchant: "Swiggy",
        source: "n8n",
        clientRequestId: "sms-<unique-sms-id>",
        ts: Date.now(),
    };
    return {
        ok: true,
        endpoint,
        secret,
        sampleBody,
        curl: `curl -X POST ${endpoint} -H 'Content-Type: application/json' -d '${JSON.stringify(sampleBody)}'`,
        notes: [
            "The secret identifies your account — no userId needed.",
            "clientRequestId makes retries idempotent (same id won't double-log).",
            "category is optional; the merchant name is auto-categorized.",
        ],
    };
}

export async function getWebhookInfo(_input: unknown, ctx: { request: Request }): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    const secret = await ensureSecret(userId);
    return Response.json(webhookPayload(ctx.request, secret));
}

export async function rotateWebhookSecret(_input: unknown, ctx: { request: Request }): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    const secret = generateWebhookSecret();
    const updated = await db.update(flags).set({ webhookSecret: secret })
        .where(eq(flags.id, userId))
        .returning({ id: flags.id });
    if (updated.length === 0) {
        await db.insert(flags).values({ id: userId, webhookSecret: secret });
    }
    return Response.json(webhookPayload(ctx.request, secret));
}
