// ════════════════════════════════════════════════════════════════
//  lib/aiAccess.ts — who may call the AI, and with which key?
//
//  Resolution order for a given user:
//    1. User connected their own key (BYOK)  → use it. Their spend.
//    2. User is admin + server env key set   → use env key, but
//       enforce a daily request cap so a bug or hijacked session
//       can't drain the owner's Anthropic account.
//    3. Otherwise → locked. UI shows "connect your own key".
//
//  Usage is recorded per user per day in ai_usage regardless of key
//  source, so the admin can see who uses what.
// ════════════════════════════════════════════════════════════════

import { db } from "@/features/core/db/client";
import { users, aiSettings, aiUsage } from "@/features/core/db/schema";
import { decryptSecret, maskKey } from "@/lib/crypto";
import { eq, sql } from "drizzle-orm";

/** Daily cap for requests billed to the server (admin env) key. */
export const ADMIN_KEY_DAILY_CAP = Number(process.env.AI_DAILY_CAP ?? 25);

export type AiAccess =
    | { allowed: true; key: string; model: string; source: "byok" | "admin-env"; keyHint: string }
    | { allowed: false; reason: "no-key" | "daily-cap" | "no-user"; message: string };

function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function resolveAiAccess(userId: string | null | undefined): Promise<AiAccess> {
    if (!userId) {
        return { allowed: false, reason: "no-user", message: "Sign in to use the AI coach." };
    }

    // 1) BYOK — user's own key always wins (their spend, no cap from us)
    const [own] = await db.select().from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1);
    if (own?.encryptedKey) {
        try {
            const key = decryptSecret(own.encryptedKey);
            return { allowed: true, key, model: own.model, source: "byok", keyHint: maskKey(key) };
        } catch (err) {
            console.error("[aiAccess] failed to decrypt stored key for", userId, err);
            // fall through — treat as no key
        }
    }

    // 2) Admin → server env key, capped per day
    const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (u?.role === "admin" && envKey) {
        const day = todayKey();
        const [usage] = await db.select().from(aiUsage).where(eq(aiUsage.id, `${userId}:${day}`)).limit(1);
        const used = usage?.count ?? 0;
        if (used >= ADMIN_KEY_DAILY_CAP) {
            return {
                allowed: false,
                reason: "daily-cap",
                message: `Daily AI limit reached (${ADMIN_KEY_DAILY_CAP} requests). Resets at midnight. This protects the shared account from runaway usage.`,
            };
        }
        return { allowed: true, key: envKey, model: "claude-sonnet-4-6", source: "admin-env", keyHint: maskKey(envKey) };
    }

    // 3) Locked
    return {
        allowed: false,
        reason: "no-key",
        message: "AI coach needs your own Anthropic API key. Add it in Config → AI Coach — takes 2 minutes and costs pennies per analysis.",
    };
}

/** Bump the caller's daily counter. Call after a successful AI request. */
export async function recordAiUsage(userId: string): Promise<void> {
    const day = todayKey();
    const id = `${userId}:${day}`;
    await db
        .insert(aiUsage)
        .values({ id, userId, day, count: 1 })
        .onConflictDoUpdate({ target: aiUsage.id, set: { count: sql`${aiUsage.count} + 1` } });
}

/** Status blob for the Config UI. Never contains the actual key. */
export async function aiAccessStatus(userId: string) {
    const access = await resolveAiAccess(userId);
    const day = todayKey();
    const [usage] = await db.select().from(aiUsage).where(eq(aiUsage.id, `${userId}:${day}`)).limit(1);
    const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);

    return {
        ok: true,
        allowed: access.allowed,
        source: access.allowed ? access.source : null,
        keyHint: access.allowed ? access.keyHint : null,
        model: access.allowed ? access.model : null,
        reason: access.allowed ? null : access.reason,
        message: access.allowed ? null : access.message,
        isAdmin: u?.role === "admin",
        usedToday: usage?.count ?? 0,
        dailyCap: u?.role === "admin" ? ADMIN_KEY_DAILY_CAP : null,
    };
}
