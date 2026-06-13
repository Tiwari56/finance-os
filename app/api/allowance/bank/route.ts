// ════════════════════════════════════════════════════════════════
//  POST /api/allowance/bank   { amount }
//  Carry-forward: move unspent weekly budget into savings. Tracks the
//  amount banked this week (so it stops counting as spendable) and a
//  lifetime "saved by not spending" total.
// ════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/features/core/db/client";
import { flags } from "@/features/core/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";
import { generateWebhookSecret } from "@/features/core/lib/onboarding";

const Body = z.object({ amount: z.number().positive() });

/** Monday-based week start as a YYYY-MM-DD key. */
function weekKey(now = new Date()): string {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function POST(req: Request) {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = Body.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid amount" }, { status: 400 });
    const amount = Math.round(parsed.data.amount);

    const key = weekKey();
    const [row] = await db.select().from(flags).where(eq(flags.id, userId!)).limit(1);

    if (!row) {
        await db.insert(flags).values({
            id: userId!, webhookSecret: generateWebhookSecret(),
            bankedWeek: amount, bankedWeekKey: key, bankedTotal: amount,
        });
        return NextResponse.json({ ok: true, bankedWeek: amount, bankedTotal: amount });
    }

    // Reset this-week's tally when the week rolls over.
    const sameWeek = row.bankedWeekKey === key;
    const bankedWeek = (sameWeek ? row.bankedWeek : 0) + amount;
    const bankedTotal = (row.bankedTotal ?? 0) + amount;

    await db.update(flags)
        .set({ bankedWeek, bankedWeekKey: key, bankedTotal })
        .where(eq(flags.id, userId!));

    return NextResponse.json({ ok: true, bankedWeek, bankedTotal });
}
