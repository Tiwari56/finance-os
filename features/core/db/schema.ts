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
