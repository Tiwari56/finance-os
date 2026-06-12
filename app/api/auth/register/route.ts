// app/api/auth/register/route.ts — email/password sign-up
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/features/core/db/client";
import { users } from "@/features/core/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { seedNewUser } from "@/features/core/lib/onboarding";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const { name, email, password } = await req.json();

    if (!email || !password || !name) {
        return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });
    }
    if (password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
        return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const id = randomUUID();

    await db.insert(users).values({ id, name, email, passwordHash });
    await seedNewUser(id, name);

    return NextResponse.json({ ok: true });
}
