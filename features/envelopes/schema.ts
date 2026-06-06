// ════════════════════════════════════════════════════════════════
//  envelopes/schema.ts
//  Owns: envelopes table (replaces config.envelopes JSON blob)
// ════════════════════════════════════════════════════════════════

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const envelopes = sqliteTable("envelopes", {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    label: text("label").notNull(),
    amount: real("amount").notNull(),
    icon: text("icon").notNull().default("💰"),
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),
    desc: text("desc").notNull().default(""),
    order: integer("order").notNull().default(0),
});

export type Envelope = typeof envelopes.$inferSelect;
export type NewEnvelope = typeof envelopes.$inferInsert;
