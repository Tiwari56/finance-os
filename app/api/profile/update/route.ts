// ════════════════════════════════════════════════════════════════
//  POST /api/profile/update
//  Update the single-row profile (name, income, salaryDay).
// ════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/features/core/db/client";
import { profile } from "@/features/core/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";

const Body = z.object({
    name: z.string().min(1).optional(),
    income: z.number().positive().optional(),
    salaryDay: z.number().int().min(1).max(31).optional(),
});

export async function POST(req: Request) {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = Body.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const existing = await db.select().from(profile).where(eq(profile.id, userId!)).limit(1);
    if (existing.length === 0) {
        await db.insert(profile).values({ id: userId!, name: "User", income: 180000, salaryDay: 1, ...parsed.data });
    } else {
        await db.update(profile).set(parsed.data).where(eq(profile.id, userId!));
    }

    return NextResponse.json({ ok: true });
}
