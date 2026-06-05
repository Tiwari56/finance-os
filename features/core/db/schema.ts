// ════════════════════════════════════════════════════════════════
//  core/schema.ts
//  Owns: profile, flags, month_history
// ════════════════════════════════════════════════════════════════

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

/** Single-row profile table — always id="main" */
export const profile = sqliteTable("profile", {
    id: text("id").primaryKey().default("main"),
    name: text("name").notNull().default("User"),
    income: real("income").notNull().default(180000),
    salaryDay: integer("salary_day").notNull().default(1),
    currency: text("currency").notNull().default("INR"),
});

/** Single-row flags — persisted across restarts */
export const flags = sqliteTable("flags", {
    id: text("id").primaryKey().default("main"),
    salaryReceived: integer("salary_received", { mode: "boolean" }).notNull().default(false),
    envelopesSetup: integer("envelopes_setup", { mode: "boolean" }).notNull().default(false),
    lastSalaryMonth: text("last_salary_month"),   // "YYYY-MM"
    setupComplete: integer("setup_complete", { mode: "boolean" }).notNull().default(false),
    webhookSecret: text("webhook_secret"),
});

/** Per-month summary snapshots for history tab */
export const monthHistory = sqliteTable("month_history", {
    id: text("id").primaryKey(),            // "YYYY-MM"
    totalSpent: real("total_spent").notNull().default(0),
    flexSpent: real("flex_spent").notNull().default(0),
    totalPaid: real("total_paid").notNull().default(0),  // debt payments
    netDebt: real("net_debt").notNull().default(0),
    savedGoals: real("saved_goals").notNull().default(0),
    snapshotTs: integer("snapshot_ts").notNull(),
});

export type Profile = typeof profile.$inferSelect;
export type Flags = typeof flags.$inferSelect;
export type MonthHistory = typeof monthHistory.$inferSelect;
