// ════════════════════════════════════════════════════════════════
//  expenses/schema.ts
//  Owns: expenses table
// ════════════════════════════════════════════════════════════════

import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const expenses = sqliteTable(
    "expenses",
    {
        id: text("id").primaryKey(),
        userId: text("user_id"),
        ts: integer("ts").notNull(),                      // epoch ms
        amount: real("amount").notNull(),
        category: text("category").notNull().default("other"),
        merchant: text("merchant").notNull().default(""),
        source: text("source").notNull().default("manual"),   // "manual" | "sms" | "n8n"
        accountSuffix: text("account_suffix"),
        currency: text("currency").notNull().default("INR"),
        clientRequestId: text("client_request_id").unique(),           // idempotency
        note: text("note"),
        envelopeId: text("envelope_id"),                          // override
        projectId: text("project_id"),                            // optional link to a project
    },
    (t) => [
        index("expenses_ts_idx").on(t.ts),
        index("expenses_category_idx").on(t.category),
    ]
);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
