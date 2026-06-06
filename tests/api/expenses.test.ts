// ════════════════════════════════════════════════════════════════
//  tests/api/expenses.test.ts
//  Tests for expense log / list / delete — uses in-memory SQLite
// ════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupTestDb } from "../helpers/db";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/features/core/db/allSchemas";

// ─── We need to override the db module before importing the handlers ──
let testDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("@/features/core/db/client", () => ({
    get db() { return testDb; },
}));

// ─── Also mock auth so we can control session in tests ────────────
vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));
vi.mock("@/lib/requireUser", () => ({
    requireUser: vi.fn().mockResolvedValue({ userId: "test-user", error: null }),
}));

// Import handlers AFTER mocks are in place
const { logExpense } = await import("@/features/expenses/api/log");
const { listExpenses } = await import("@/features/expenses/api/list");
const { deleteExpense } = await import("@/features/expenses/api/delete");

function makeReq(body: unknown, method = "POST", url = "http://localhost/api/expenses/log"): Request {
    return new Request(url, {
        method,
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

describe("POST /api/expenses/log", () => {
    beforeEach(async () => {
        const { db } = await setupTestDb();
        testDb = db;
    });

    it("logs a valid expense and returns ok + id", async () => {
        const req = makeReq({ amount: 150, merchant: "Swiggy", userId: "test-user" });
        const res = await logExpense(req, "test-user");
        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.ok).toBe(true);
        expect(data.logged?.id).toMatch(/^exp_/);
    });

    it("auto-categorizes merchant", async () => {
        const req = makeReq({ amount: 200, merchant: "Zomato Food", userId: "test-user" });
        const res = await logExpense(req, "test-user");
        const data = await res.json();
        expect(data.logged?.category).toBe("food");
    });

    it("rejects missing amount", async () => {
        const req = makeReq({ merchant: "Test" });
        const res = await logExpense(req, "test-user");
        expect(res.status).toBe(400);
    });

    it("rejects negative amount", async () => {
        const req = makeReq({ amount: -100, merchant: "Test" });
        const res = await logExpense(req, "test-user");
        expect(res.status).toBe(400);
    });

    it("rejects missing userId (no session, no body userId)", async () => {
        const req = makeReq({ amount: 100, merchant: "Test" });
        // No sessionUserId passed
        const res = await logExpense(req);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain("userId");
    });

    it("is idempotent with clientRequestId", async () => {
        const body = { amount: 100, merchant: "Test", userId: "test-user", clientRequestId: "req-001" };
        const req1 = makeReq(body);
        const req2 = makeReq(body);
        const r1 = await logExpense(req1, "test-user");
        const r2 = await logExpense(req2, "test-user");
        const d1 = await r1.json();
        const d2 = await r2.json();
        expect(d1.ok).toBe(true);
        expect(d2.duplicate).toBe(true);
        expect(d2.logged.id).toBe(d1.logged.id);
    });
});

describe("GET /api/expenses/list", () => {
    beforeEach(async () => {
        const { db } = await setupTestDb();
        testDb = db;
        // Pre-seed an expense
        await logExpense(
            makeReq({ amount: 500, merchant: "Amazon", userId: "test-user" }),
            "test-user"
        );
    });

    it("returns list with ok:true", async () => {
        const req = new Request("http://localhost/api/expenses/list");
        const res = await listExpenses(req);
        const data = await res.json();
        expect(data.ok).toBe(true);
        expect(Array.isArray(data.expenses)).toBe(true);
        expect(data.expenses.length).toBeGreaterThan(0);
    });

    it("respects limit param", async () => {
        const req = new Request("http://localhost/api/expenses/list?limit=1");
        const res = await listExpenses(req);
        const data = await res.json();
        expect(data.expenses.length).toBeLessThanOrEqual(1);
    });
});

describe("POST /api/expenses/delete", () => {
    beforeEach(async () => {
        const { db } = await setupTestDb();
        testDb = db;
    });

    it("deletes an existing expense", async () => {
        // First log an expense
        const logRes = await logExpense(makeReq({ amount: 300, merchant: "Test", userId: "test-user" }), "test-user");
        const { logged } = await logRes.json();

        const req = makeReq({ id: logged.id });
        const res = await deleteExpense(req);
        const data = await res.json();
        expect(data.ok).toBe(true);
    });

    it("returns ok:true even for non-existent id (idempotent delete)", async () => {
        const req = makeReq({ id: "exp_nonexistent" });
        const res = await deleteExpense(req);
        expect((await res.json()).ok).toBe(true);
    });

    it("returns 400 when id is missing", async () => {
        const req = makeReq({});
        const res = await deleteExpense(req);
        expect(res.status).toBe(400);
    });
});
