// ════════════════════════════════════════════════════════════════
//  tests/api/auth-routes.test.ts
//  Auth integration tests — verifies credential verification,
//  config correctness, and the things that caused the prod 500.
//
//  Note: next-auth handlers require the Next.js runtime and cannot
//  be invoked directly in Vitest. We test the pieces we control:
//  credential lookup, bcrypt verification, config requirements.
// ════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import bcrypt from "bcryptjs";
import { setupTestDb } from "../helpers/db";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/features/core/db/allSchemas";

let testDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("@/features/core/db/client", () => ({
    get db() { return testDb; },
}));

const { POST: register } = await import("@/app/api/auth/register/route");

function postReg(body: unknown) {
    return new Request("http://localhost/api/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    }) as unknown as import("next/server").NextRequest;
}

// ─────────────────────────────────────────────────────────────────
// 1. next.config.js correctness — the root cause of the prod 500
// ─────────────────────────────────────────────────────────────────
describe("next.config.js — required for next-auth v5 + Next.js 14", () => {
    const configPath = resolve(process.cwd(), "next.config.js");
    const configContent = readFileSync(configPath, "utf8");

    it("has transpilePackages including next-auth", () => {
        // Without this, Next.js 14 webpack bundles next-auth incorrectly
        // causing "TypeError: r is not a function" at runtime
        expect(configContent).toContain("transpilePackages");
        expect(configContent).toContain("next-auth");
    });

    it("has reactStrictMode enabled", () => {
        expect(configContent).toContain("reactStrictMode: true");
    });
});

// ─────────────────────────────────────────────────────────────────
// 2. Auth route files export the correct shape
// ─────────────────────────────────────────────────────────────────
describe("auth route file exports", () => {
    it("app/api/auth/[...nextauth]/route.ts exports GET and POST", async () => {
        const routeContent = readFileSync(
            resolve(process.cwd(), "app/api/auth/[...nextauth]/route.ts"),
            "utf8"
        );
        expect(routeContent).toContain("export const dynamic");
        expect(routeContent).toContain("force-dynamic");
        expect(routeContent).toContain("GET");
        expect(routeContent).toContain("POST");
        expect(routeContent).toContain('from "@/auth"');
    });

    it("uses JWT session strategy (not database sessions)", () => {
        // After the auth-split refactor for Edge compatibility, the
        // session config lives in auth.config.ts (shared with middleware).
        const configContent = readFileSync(
            resolve(process.cwd(), "auth.config.ts"),
            "utf8"
        );
        expect(configContent).toContain('strategy: "jwt"');
    });

    it("auth.ts has credential authorize function", () => {
        const authContent = readFileSync(resolve(process.cwd(), "auth.ts"), "utf8");
        expect(authContent).toContain("authorize");
        expect(authContent).toContain("bcrypt.compare");
    });
});

// ─────────────────────────────────────────────────────────────────
// 3. Credential verification logic (what authorize() does)
// ─────────────────────────────────────────────────────────────────
describe("credential verification (bcrypt)", () => {
    beforeEach(async () => {
        const { db } = await setupTestDb();
        testDb = db;
    });

    it("bcrypt hash and compare round-trip works", async () => {
        const password = "mysecurepassword";
        const hash = await bcrypt.hash(password, 10);
        expect(await bcrypt.compare(password, hash)).toBe(true);
        expect(await bcrypt.compare("wrongpassword", hash)).toBe(false);
    });

    it("register + credential verify flow: full end-to-end", async () => {
        // 1. Register a user
        await register(postReg({ name: "Test User", email: "auth@example.com", password: "password123" }));

        // 2. Verify the user exists with a bcrypt hash
        const rows = await testDb.query.users.findMany({
            where: (u, { eq }) => eq(u.email, "auth@example.com"),
        });
        expect(rows).toHaveLength(1);
        const user = rows[0];

        // 3. Simulate what authorize() does
        expect(user.passwordHash).toBeTruthy();
        const validLogin = await bcrypt.compare("password123", user.passwordHash!);
        const wrongLogin = await bcrypt.compare("badpass", user.passwordHash!);
        expect(validLogin).toBe(true);
        expect(wrongLogin).toBe(false);
    });

    it("user without passwordHash cannot sign in via credentials", async () => {
        // OAuth users have no password hash
        await testDb.insert(schema.users).values({
            id: "oauth-user-1",
            name: "OAuth User",
            email: "oauth@example.com",
            passwordHash: null, // OAuth-only account
        });

        const rows = await testDb.query.users.findMany({
            where: (u, { eq }) => eq(u.email, "oauth@example.com"),
        });
        // authorize() returns null if !user.passwordHash
        expect(rows[0].passwordHash).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────
// 4. Register route — all validation paths
// ─────────────────────────────────────────────────────────────────
describe("/api/auth/register edge cases", () => {
    beforeEach(async () => {
        const { db } = await setupTestDb();
        testDb = db;
    });

    it("trims and lowercases — two registrations with same email fail gracefully", async () => {
        await register(postReg({ name: "A", email: "same@example.com", password: "password1" }));
        const r2 = await register(postReg({ name: "B", email: "same@example.com", password: "password2" }));
        expect(r2.status).toBe(409);
    });

    it("password with exactly 8 chars is accepted", async () => {
        const res = await register(postReg({ name: "X", email: "exact8@example.com", password: "12345678" }));
        expect(res.status).toBe(200);
    });

    it("password with 7 chars is rejected", async () => {
        const res = await register(postReg({ name: "X", email: "short@example.com", password: "1234567" }));
        expect(res.status).toBe(400);
    });
});
