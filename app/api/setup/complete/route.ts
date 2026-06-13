// ════════════════════════════════════════════════════════════════
//  POST /api/setup/complete
//  Marks the one-time setup wizard as done for the current user.
// ════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/features/core/db/client";
import { flags } from "@/features/core/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";
import { generateWebhookSecret } from "@/features/core/lib/onboarding";

export async function POST() {
    const { userId, error } = await requireUser();
    if (error) return error;

    const existing = await db.select().from(flags).where(eq(flags.id, userId!)).limit(1);
    if (existing.length === 0) {
        await db.insert(flags).values({ id: userId!, setupComplete: true, webhookSecret: generateWebhookSecret() });
    } else {
        await db.update(flags).set({ setupComplete: true }).where(eq(flags.id, userId!));
    }
    return NextResponse.json({ ok: true });
}
