// ════════════════════════════════════════════════════════════════
//  bills/schema.ts
//  Owns: bills, bill_payments tables
// ════════════════════════════════════════════════════════════════

import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const bills = sqliteTable("bills", {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    amount: real("amount").notNull(),
    dueDay: integer("due_day").notNull(),         // day of month (1-31)
    category: text("category").notNull().default("other"),
    icon: text("icon").notNull().default("🧾"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    order: integer("order").notNull().default(0),
});

export const billPayments = sqliteTable(
    "bill_payments",
    {
        id: text("id").primaryKey(),
        ts: integer("ts").notNull(),
        billId: text("bill_id").notNull().references(() => bills.id),
        amount: real("amount").notNull(),
        month: text("month").notNull(), // "YYYY-MM" — one payment per bill per month
        partial: integer("partial", { mode: "boolean" }).notNull().default(false),
        note: text("note"),
    },
    (t) => [
        index("bill_payments_month_idx").on(t.month),
        index("bill_payments_bill_id_idx").on(t.billId),
    ]
);

export type Bill = typeof bills.$inferSelect;
export type NewBill = typeof bills.$inferInsert;
export type BillPayment = typeof billPayments.$inferSelect;
