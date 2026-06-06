// ════════════════════════════════════════════════════════════════
//  debts/schema.ts
//  Owns: debts, debt_payments tables
// ════════════════════════════════════════════════════════════════

import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { expenses } from "../expenses/schema";

export const debts = sqliteTable("debts", {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    name: text("name").notNull(),
    balance: real("balance").notNull().default(0),
    rate: real("rate").notNull().default(0),     // annual interest %
    emi: real("emi").notNull().default(0),      // monthly minimum payment
    color: text("color").notNull().default("#9F77DD"),
    type: text("type").notNull().default("friend"), // "cc" | "formal" | "friend"
    order: integer("order").notNull().default(0),
});

export const debtPayments = sqliteTable(
    "debt_payments",
    {
        id: text("id").primaryKey(),
        ts: integer("ts").notNull(),
        debtId: text("debt_id").notNull().references(() => debts.id),
        amount: real("amount").notNull(),
        note: text("note"),
        expenseId: text("expense_id").references(() => expenses.id), // linked expense if any
    },
    (t) => [
        index("debt_payments_ts_idx").on(t.ts),
        index("debt_payments_debt_id_idx").on(t.debtId),
    ]
);

export type Debt = typeof debts.$inferSelect;
export type NewDebt = typeof debts.$inferInsert;
export type DebtPayment = typeof debtPayments.$inferSelect;
