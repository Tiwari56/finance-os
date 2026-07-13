// ════════════════════════════════════════════════════════════════
//  projects/schema.ts
//  Owns: projects table
//  Projects = spending-oriented tracked items (home renovation,
//  travel, car repair…). Unlike Goals (savings buckets), these
//  track how much you've *spent* on something vs a budget.
// ════════════════════════════════════════════════════════════════

import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const PRIORITY_LEVELS = ["immediate", "planned", "someday"] as const;
export const PROJECT_CATEGORIES = ["home", "travel", "health", "car", "education", "work", "other"] as const;

export const projects = sqliteTable(
    "projects",
    {
        id: text("id").primaryKey(),
        userId: text("user_id").notNull(),
        name: text("name").notNull(),
        description: text("description"),
        category: text("category").notNull().default("other"),     // PROJECT_CATEGORIES
        priority: text("priority").notNull().default("planned"),   // PRIORITY_LEVELS
        budget: real("budget").notNull().default(0),
        status: text("status").notNull().default("active"),        // active | completed | paused
        icon: text("icon").notNull().default("📦"),
        createdTs: integer("created_ts").notNull(),
        targetTs: integer("target_ts"),                            // optional deadline (epoch ms)
    },
    (t) => [
        index("projects_user_id_idx").on(t.userId),
        index("projects_status_idx").on(t.status),
    ]
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
