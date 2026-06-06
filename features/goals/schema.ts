// ════════════════════════════════════════════════════════════════
//  goals/schema.ts
//  Owns: goals, goal_contributions tables
// ════════════════════════════════════════════════════════════════

import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const goals = sqliteTable("goals", {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    label: text("label").notNull(),
    needed: real("needed").notNull(),
    saved: real("saved").notNull().default(0),
    icon: text("icon").notNull().default("🎯"),
    targetDate: text("target_date"),    // "YYYY-MM-DD" optional
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    order: integer("order").notNull().default(0),
});

export const goalContributions = sqliteTable(
    "goal_contributions",
    {
        id: text("id").primaryKey(),
        ts: integer("ts").notNull(),
        goalId: text("goal_id").notNull().references(() => goals.id),
        amount: real("amount").notNull(),
        note: text("note"),
    },
    (t) => [index("goal_contributions_goal_id_idx").on(t.goalId)]
);

export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type GoalContribution = typeof goalContributions.$inferSelect;
