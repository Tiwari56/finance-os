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
    balance: real("balance").notNull().default(0),  // current outstanding
    rate: real("rate").notNull().default(0),        // annual interest % (ROI)
    emi: real("emi").notNull().default(0),          // monthly EMI / minimum payment
    color: text("color").notNull().default("#9F77DD"),
    type: text("type").notNull().default("friend"), // "cc" | "formal" | "friend"
    order: integer("order").notNull().default(0),

    // ── EMI-reality fields (added for real loan tracking) ──────────
    principal: real("principal").notNull().default(0),    // original loan amount
    dueDay: integer("due_day"),                           // EMI / statement due day 1-28 (null = unknown)
    tenureMonths: integer("tenure_months"),               // total tenure (null = revolving/unknown)
    openedTs: integer("opened_ts"),                       // when the loan started
    status: text("status").notNull().default("active"),   // "active" | "foreclosed" | "settled"
    lastPaidTs: integer("last_paid_ts"),                  // last payment timestamp

    // ── Credit-card specific (null for loans) ──────────────────────
    creditLimit: real("credit_limit"),                    // total card limit
    minDue: real("min_due"),                              // current statement minimum due
    statementBalance: real("statement_balance"),          // full statement amount owed
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
