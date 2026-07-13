// ════════════════════════════════════════════════════════════════
//  core/schema.ts
//  Owns: users (auth), profile, flags, month_history
// ════════════════════════════════════════════════════════════════

import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";

// ─── NextAuth / Auth.js required tables ──────────────────────────
export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "timestamp_ms" }),
    image: text("image"),
    passwordHash: text("password_hash"),   // null for OAuth-only users
    // "admin" = app owner (uses server ANTHROPIC_API_KEY, manages users).
    // "user"  = everyone else (must bring their own AI key).
    // First registered account is auto-promoted to admin.
    role: text("role").notNull().default("user"),
});

// ─── AI Advisor: per-user key + usage tracking ────────────────────
/**
 * BYOK (bring-your-own-key) storage. One row per user who connected
 * their own Anthropic key. The key is AES-256-GCM encrypted with a
 * server secret — never stored or logged in plaintext.
 */
export const aiSettings = sqliteTable("ai_settings", {
    userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("anthropic"),
    encryptedKey: text("encrypted_key").notNull(),  // iv:tag:ciphertext, base64
    model: text("model").notNull().default("claude-sonnet-4-6"),
    updatedTs: integer("updated_ts").notNull(),
});

/**
 * Daily request counter per user. Used to cap admin-key usage so a
 * bug or a leaked admin session can't drain the owner's account.
 */
export const aiUsage = sqliteTable("ai_usage", {
    id: text("id").primaryKey(),            // userId + ":" + "YYYY-MM-DD"
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(),             // "YYYY-MM-DD"
    count: integer("count").notNull().default(0),
});

export const accounts = sqliteTable("accounts", {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
}, (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]);

export const sessions = sqliteTable("sessions", {
    sessionToken: text("session_token").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable("verification_tokens", {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
}, (t) => [primaryKey({ columns: [t.identifier, t.token] })]);

/** Per-user profile (replaces single-row "main" profile) */
export const profile = sqliteTable("profile", {
    id: text("id").primaryKey(),   // = userId
    name: text("name").notNull().default("User"),
    income: real("income").notNull().default(180000),
    salaryDay: integer("salary_day").notNull().default(1),
    currency: text("currency").notNull().default("INR"),
});

/** Per-user flags */
export const flags = sqliteTable("flags", {
    id: text("id").primaryKey(),   // = userId
    salaryReceived: integer("salary_received", { mode: "boolean" }).notNull().default(false),
    envelopesSetup: integer("envelopes_setup", { mode: "boolean" }).notNull().default(false),
    lastSalaryMonth: text("last_salary_month"),
    setupComplete: integer("setup_complete", { mode: "boolean" }).notNull().default(false),
    webhookSecret: text("webhook_secret"),
    // Carry-forward: money the user banked from unspent weekly budget.
    bankedWeek: real("banked_week").notNull().default(0),       // banked this week (resets per week)
    bankedWeekKey: text("banked_week_key"),                     // ISO date of the week it belongs to
    bankedTotal: real("banked_total").notNull().default(0),     // lifetime saved by not spending
});

/** Per-month summary snapshots for history tab */
export const monthHistory = sqliteTable("month_history", {
    id: text("id").primaryKey(),            // userId + ":" + "YYYY-MM"
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    month: text("month").notNull(),         // "YYYY-MM"
    totalSpent: real("total_spent").notNull().default(0),
    flexSpent: real("flex_spent").notNull().default(0),
    totalPaid: real("total_paid").notNull().default(0),
    netDebt: real("net_debt").notNull().default(0),
    savedGoals: real("saved_goals").notNull().default(0),
    snapshotTs: integer("snapshot_ts").notNull(),
});

export type User = typeof users.$inferSelect;
export type Profile = typeof profile.$inferSelect;
export type Flags = typeof flags.$inferSelect;
export type MonthHistory = typeof monthHistory.$inferSelect;
export type AiSettings = typeof aiSettings.$inferSelect;
export type AiUsage = typeof aiUsage.$inferSelect;
