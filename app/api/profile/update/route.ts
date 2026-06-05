// ════════════════════════════════════════════════════════════════
//  POST /api/profile/update
//  Update the single-row profile (name, income, salaryDay).
// ════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/features/core/db/client";
import { profile } from "@/features/core/db/schema";
import { eq } from "drizzle-orm";

const Body = z.object({
    name:      z.string().min(1).optional(),
    income:    z.number().positive().optional(),
    salaryDay: z.number().int().min(1).max(31).optional(),
});

export async function POST(req: Request) {
    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = Body.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const existing = await db.select().from(profile).limit(1);
    if (existing.length === 0) {
        await db.insert(profile).values({ id: "main", name: "User", income: 180000, salaryDay: 1, ...parsed.data });
    } else {
        await db.update(profile).set(parsed.data).where(eq(profile.id, "main"));
    }

    return NextResponse.json({ ok: true });
}
