// lib/requireUser.ts — server-side session guard for API routes
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function requireUser() {
    const session = await auth();
    if (!session?.user?.id) {
        return { userId: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    return { userId: session.user.id, error: null };
}
