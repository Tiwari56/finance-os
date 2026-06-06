import type { Config } from "drizzle-kit";

export default {
    schema: "./features/core/db/allSchemas.ts",
    out: "./db/migrations",
    dialect: "turso",
    dbCredentials: {
        url: process.env.TURSO_DATABASE_URL ?? "file:./data/finance.db",
        authToken: process.env.TURSO_AUTH_TOKEN,
    },
} satisfies Config;
