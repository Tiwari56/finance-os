// ════════════════════════════════════════════════════════════════
//  ious/schema.ts
//  Owns: ious table (money you lent to others)
// ════════════════════════════════════════════════════════════════

import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const ious = sqliteTable(
    "ious",
    {
        id: text("id").primaryKey(),
        name: text("name").notNull(),
        amount: real("amount").notNull(),
        ts: integer("ts").notNull(),           // when lent
        note: text("note"),
        settledTs: integer("settled_ts"),             // null = open; set = settled
        settledAmt: real("settled_amt"),               // may differ (partial)
    },
    (t) => [index("ious_settled_ts_idx").on(t.settledTs)]
);

export type IOU = typeof ious.$inferSelect;
export type NewIOU = typeof ious.$inferInsert;
