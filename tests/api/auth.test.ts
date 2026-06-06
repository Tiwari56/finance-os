// ════════════════════════════════════════════════════════════════
//  tests/api/auth.test.ts
//  Tests for /api/auth/register — validation logic
//  Uses in-memory SQLite; bcrypt is real (not mocked)
// ════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupTestDb } from "../helpers/db";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/features/core/db/allSchemas";

let testDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("@/features/core/db/client", () => ({
    get db() { return testDb; },
}));

// Import after mock
const { POST: register } = await import("@/app/api/auth/register/route");

function postReg(body: unknown) {
    return new Request("http://localhost/api/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    }) as unknown as import("next/server").NextRequest;
}

describe("/api/auth/register", () => {
    beforeEach(async () => {
        const { db } = await setupTestDb();
        testDb = db;
    });

    it("creates a user successfully and returns ok:true", async () => {
        const res = await register(postReg({ name: "Nishit", email: "test@example.com", password: "securepass" }));
        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.ok).toBe(true);
    });

    it("returns 409 when email already registered", async () => {
        await register(postReg({ name: "A", email: "dup@example.com", password: "password1" }));
        const res2 = await register(postReg({ name: "B", email: "dup@example.com", password: "password2" }));
        expect(res2.status).toBe(409);
    });

    it("returns 400 when name missing", async () => {
        const res = await register(postReg({ email: "x@example.com", password: "password1" }));
        expect(res.status).toBe(400);
    });

    it("returns 400 when email missing", async () => {
        const res = await register(postReg({ name: "X", password: "password1" }));
        expect(res.status).toBe(400);
    });

    it("returns 400 when password missing", async () => {
        const res = await register(postReg({ name: "X", email: "x@example.com" }));
        expect(res.status).toBe(400);
    });

    it("returns 400 when password is shorter than 8 characters", async () => {
        const res = await register(postReg({ name: "X", email: "x@example.com", password: "short" }));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain("8");
    });

    it("does NOT store plain-text password", async () => {
        await register(postReg({ name: "N", email: "safe@example.com", password: "mypassword123" }));
        // Read from DB and verify hash is different from raw password
        const { db } = { db: testDb };
        const rows = await db.query.users.findMany({ where: (u, { eq }) => eq(u.email, "safe@example.com") });
        expect(rows[0].passwordHash).not.toBe("mypassword123");
        expect(rows[0].passwordHash!.startsWith("$2")).toBe(true); // bcrypt prefix
    });
});
