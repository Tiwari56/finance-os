// ════════════════════════════════════════════════════════════════
//  tests/api/isolation.test.ts
//  Multi-user data isolation + per-user webhook secret resolution.
//  These guard the launch-blocking bugs: cross-user reads/writes and
//  the n8n webhook identifying the right account.
// ════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupTestDb } from "../helpers/db";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "@/features/core/db/allSchemas";

let testDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("@/features/core/db/client", () => ({
    get db() { return testDb; },
}));
vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));
vi.mock("@/lib/requireUser", () => ({
    requireUser: vi.fn().mockResolvedValue({ userId: "user-a", error: null }),
}));

const { logExpense } = await import("@/features/expenses/api/log");
const { deleteExpense } = await import("@/features/expenses/api/delete");
const { payDebt, listDebts } = await import("@/features/debts/api");
const { updateEnvelope } = await import("@/features/envelopes/api");
const { flags } = await import("@/features/core/db/schema");
const { expenses } = await import("@/features/expenses/schema");
const { debts } = await import("@/features/debts/schema");
const { envelopes } = await import("@/features/envelopes/schema");

function makeReq(body: unknown, url = "http://localhost/api/expenses/log"): Request {
    return new Request(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

const savedLogSecret = process.env.LOG_SECRET;

beforeEach(async () => {
    const { db } = await setupTestDb();
    testDb = db;
    delete process.env.LOG_SECRET;

    await testDb.insert(flags).values([
        { id: "user-a", webhookSecret: "whk_secret_for_a" },
        { id: "user-b", webhookSecret: "whk_secret_for_b" },
    ]);
});

afterEach(() => {
    if (savedLogSecret === undefined) delete process.env.LOG_SECRET;
    else process.env.LOG_SECRET = savedLogSecret;
});

describe("webhook secret → user resolution", () => {
    it("resolves the account from a per-user secret (no userId in body)", async () => {
        const res = await logExpense(makeReq({ amount: 120, merchant: "Swiggy", secret: "whk_secret_for_a" }));
        const data = await res.json();
        expect(data.ok).toBe(true);

        const [row] = await testDb.select().from(expenses).where(eq(expenses.id, data.logged.id));
        expect(row.userId).toBe("user-a");
    });

    it("resolves a different user from their secret", async () => {
        const res = await logExpense(makeReq({ amount: 80, merchant: "Zomato", secret: "whk_secret_for_b" }));
        const data = await res.json();
        const [row] = await testDb.select().from(expenses).where(eq(expenses.id, data.logged.id));
        expect(row.userId).toBe("user-b");
    });

    it("rejects an unknown secret when no userId fallback", async () => {
        const res = await logExpense(makeReq({ amount: 50, secret: "wrong" }));
        expect(res.status).toBe(400);
    });

    it("legacy mode: LOG_SECRET + body userId still works", async () => {
        process.env.LOG_SECRET = "global-secret";
        const res = await logExpense(makeReq({ amount: 60, secret: "global-secret", userId: "user-b" }));
        const data = await res.json();
        expect(data.ok).toBe(true);
        const [row] = await testDb.select().from(expenses).where(eq(expenses.id, data.logged.id));
        expect(row.userId).toBe("user-b");
    });

    it("legacy mode: wrong LOG_SECRET is unauthorized", async () => {
        process.env.LOG_SECRET = "global-secret";
        const res = await logExpense(makeReq({ amount: 60, secret: "nope", userId: "user-b" }));
        expect(res.status).toBe(401);
    });
});

describe("cross-user isolation", () => {
    it("debt auto-link never matches another user's debt", async () => {
        await testDb.insert(debts).values({
            id: "debt-b1", userId: "user-b", name: "HDFC Card",
            balance: 50_000, rate: 36, emi: 5000, color: "#fff", type: "cc", order: 0,
        });

        // user-a logs a debt payment to "HDFC Card" — must NOT touch user-b's debt
        const res = await logExpense(makeReq({ amount: 10_000, merchant: "HDFC Card", category: "debt" }), "user-a");
        const data = await res.json();
        expect(data.ok).toBe(true);

        const [bDebt] = await testDb.select().from(debts).where(eq(debts.id, "debt-b1"));
        expect(bDebt.balance).toBe(50_000);                 // untouched
        expect(data.debtLink.debtId).not.toBe("debt-b1");   // new friend debt for user-a

        const [newDebt] = await testDb.select().from(debts).where(eq(debts.id, data.debtLink.debtId));
        expect(newDebt.userId).toBe("user-a");
    });

    it("allowance math only counts the caller's expenses", async () => {
        // user-b has huge flex spend this month; must not affect user-a's remaining
        await testDb.insert(expenses).values({
            id: "exp-b1", userId: "user-b", ts: Date.now(), amount: 25_000,
            category: "food", merchant: "", source: "manual", currency: "INR",
        });

        const res = await logExpense(makeReq({ amount: 100, merchant: "Chai", category: "food" }), "user-a");
        const data = await res.json();
        // monthRemaining = flexBudget(30k default) - user-a spend(100) — not 30k - 25.1k
        expect(data.monthRemaining).toBe(30_000 - 100);
    });

    it("deleteExpense cannot delete another user's expense", async () => {
        await testDb.insert(expenses).values({
            id: "exp-b2", userId: "user-b", ts: Date.now(), amount: 500,
            category: "food", merchant: "", source: "manual", currency: "INR",
        });

        // requireUser mock returns user-a
        const res = await deleteExpense(makeReq({ id: "exp-b2" }));
        expect((await res.json()).ok).toBe(true);

        const rows = await testDb.select().from(expenses).where(eq(expenses.id, "exp-b2"));
        expect(rows.length).toBe(1);   // still there
    });

    it("payDebt returns 404 for another user's debt", async () => {
        await testDb.insert(debts).values({
            id: "debt-b2", userId: "user-b", name: "Loan",
            balance: 10_000, rate: 12, emi: 1000, color: "#fff", type: "formal", order: 0,
        });

        const res = await payDebt(makeReq({ debtId: "debt-b2", amount: 1000 }));
        expect(res.status).toBe(404);

        const [debt] = await testDb.select().from(debts).where(eq(debts.id, "debt-b2"));
        expect(debt.balance).toBe(10_000);
    });

    it("listDebts only returns the caller's debts", async () => {
        await testDb.insert(debts).values([
            { id: "debt-a1", userId: "user-a", name: "Mine",   balance: 100, rate: 0, emi: 0, color: "#fff", type: "friend", order: 0 },
            { id: "debt-b3", userId: "user-b", name: "Theirs", balance: 200, rate: 0, emi: 0, color: "#fff", type: "friend", order: 0 },
        ]);

        const res = await listDebts(makeReq({}));
        const data = await res.json();
        expect(data.debts.map((d: { id: string }) => d.id)).toEqual(["debt-a1"]);
    });

    it("updateEnvelope returns 404 for another user's envelope", async () => {
        await testDb.insert(envelopes).values({
            id: "user-b:food", userId: "user-b", label: "Food", amount: 10_000,
            icon: "🍱", locked: false, desc: "", order: 1,
        });

        const res = await updateEnvelope(makeReq({ id: "user-b:food", amount: 1 }));
        expect(res.status).toBe(404);

        const [env] = await testDb.select().from(envelopes).where(eq(envelopes.id, "user-b:food"));
        expect(env.amount).toBe(10_000);
    });
});
