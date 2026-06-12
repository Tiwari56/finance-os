// ════════════════════════════════════════════════════════════════
//  core/lib/onboarding.ts
//  Seeds everything a fresh account needs so the dashboard renders
//  with sane defaults: profile row, flags row (with a ready-to-use
//  n8n webhook secret), and the six standard envelopes.
// ════════════════════════════════════════════════════════════════

import { randomBytes } from "node:crypto";
import { db } from "@/features/core/db/client";
import { profile, flags } from "@/features/core/db/schema";
import { envelopes } from "@/features/envelopes/schema";
import { DEFAULT_ENVELOPE_TEMPLATE, envelopeIdFor } from "@/features/envelopes/lib/keys";

export function generateWebhookSecret(): string {
    return "whk_" + randomBytes(24).toString("base64url");
}

export async function seedNewUser(userId: string, name: string): Promise<void> {
    await db.insert(profile)
        .values({ id: userId, name, income: 100_000, salaryDay: 1 })
        .onConflictDoNothing();

    await db.insert(flags)
        .values({ id: userId, webhookSecret: generateWebhookSecret() })
        .onConflictDoNothing();

    await db.insert(envelopes)
        .values(DEFAULT_ENVELOPE_TEMPLATE.map(t => ({
            id: envelopeIdFor(userId, t.key),
            userId,
            label: t.label,
            amount: t.amount,
            icon: t.icon,
            locked: t.locked,
            desc: t.desc,
            order: t.order,
        })))
        .onConflictDoNothing();
}
