// ════════════════════════════════════════════════════════════════
//  tests/api/debts.test.ts
//  Tests for debt CRUD operations — uses in-memory SQLite
// ════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupTestDb } from "../helpers/db";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/features/core/db/allSchemas";

let testDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("@/features/core/db/client", () => ({
    get db() { return testDb; },
}));

vi.mock("@/lib/requireUser", () => ({
    requireUser: vi.fn().mockResolvedValue({ userId: "test-user", error: null }),
}));

const { upsertDebt, payDebt, listDebts, deleteDebt } = await import("@/features/debts/api/index");

function post(body: unknown): Request {
    return new Request("http://localhost/api/debts", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

describe("debts API", () => {
    beforeEach(async () => {
        const { db } = await setupTestDb();
        testDb = db;
    });

    describe("upsertDebt()", () => {
        it("creates a new debt and returns id", async () => {
            const res = await upsertDebt(post({ name: "HDFC CC", balance: 50000, rate: 36, emi: 2000, type: "cc" }));
            const data = await res.json();
            expect(data.ok).toBe(true);
            expect(data.id).toMatch(/^debt_/);
        });

        it("updates existing debt when id provided", async () => {
            const r1 = await upsertDebt(post({ name: "Old Name", balance: 10000, rate: 10, emi: 500, type: "formal" }));
            const { id } = await r1.json();
            const r2 = await upsertDebt(post({ id, name: "New Name", balance: 8000, rate: 10, emi: 500, type: "formal" }));
            const d2 = await r2.json();
            expect(d2.ok).toBe(true);
            expect(d2.id).toBe(id);
        });

        it("rejects missing name", async () => {
            const res = await upsertDebt(post({ balance: 1000, rate: 5, emi: 0, type: "friend" }));
            expect(res.status).toBe(400);
        });

        it("rejects negative balance", async () => {
            const res = await upsertDebt(post({ name: "X", balance: -100, rate: 5, emi: 0, type: "friend" }));
            expect(res.status).toBe(400);
        });
    });

    describe("listDebts()", () => {
        it("returns empty list initially", async () => {
            const res = await listDebts(new Request("http://localhost/api/debts/list"));
            const data = await res.json();
            expect(data.ok).toBe(true);
            expect(data.debts).toHaveLength(0);
        });

        it("lists debts after insertion", async () => {
            await upsertDebt(post({ name: "Test", balance: 5000, rate: 12, emi: 500, type: "formal" }));
            const res = await listDebts(new Request("http://localhost/api/debts/list"));
            const data = await res.json();
            expect(data.debts).toHaveLength(1);
            expect(data.debts[0].name).toBe("Test");
        });
    });

    describe("payDebt()", () => {
        it("records payment and reduces balance", async () => {
            const r1 = await upsertDebt(post({ name: "Loan", balance: 10000, rate: 0, emi: 0, type: "formal" }));
            const { id: debtId } = await r1.json();

            const res = await payDebt(post({ debtId, amount: 2000 }));
            const data = await res.json();
            expect(data.ok).toBe(true);

            // Verify balance reduced in DB
            const list = await (await listDebts(new Request("http://localhost"))).json();
            expect(list.debts[0].balance).toBe(8000);
        });

        it("rejects zero amount", async () => {
            const res = await payDebt(post({ debtId: "debt_x", amount: 0 }));
            expect(res.status).toBe(400);
        });

        it("rejects missing debtId", async () => {
            const res = await payDebt(post({ amount: 500 }));
            expect(res.status).toBe(400);
        });
    });

    describe("payDebt() — real-life kinds", () => {
        it("foreclose clears the full balance and marks status", async () => {
            const r1 = await upsertDebt(post({ name: "Car loan", balance: 50000, rate: 9, emi: 5000, type: "formal" }));
            const { id: debtId } = await r1.json();
            const res = await payDebt(post({ debtId, kind: "foreclose" }));
            const data = await res.json();
            expect(data.ok).toBe(true);
            expect(data.newBalance).toBe(0);
            expect(data.status).toBe("foreclosed");
        });

        it("settle clears a friend debt without an amount", async () => {
            const r1 = await upsertDebt(post({ name: "Rahul", balance: 3000, rate: 0, emi: 0, type: "friend" }));
            const { id: debtId } = await r1.json();
            const res = await payDebt(post({ debtId, kind: "settle" }));
            const data = await res.json();
            expect(data.newBalance).toBe(0);
            expect(data.status).toBe("settled");
        });

        it("paying the minimum due zeroes min_due and reduces balance", async () => {
            const r1 = await upsertDebt(post({ name: "Amex", balance: 40000, rate: 42, emi: 0, type: "cc", minDue: 2000, statementBalance: 40000 }));
            const { id: debtId } = await r1.json();
            await payDebt(post({ debtId, amount: 2000, kind: "min" }));
            const list = await (await listDebts(new Request("http://localhost"))).json();
            expect(list.debts[0].minDue).toBe(0);
            expect(list.debts[0].balance).toBe(38000);
        });

        it("auto-settles when a part payment clears the balance", async () => {
            const r1 = await upsertDebt(post({ name: "Tiny", balance: 1000, rate: 0, emi: 0, type: "friend" }));
            const { id: debtId } = await r1.json();
            const res = await payDebt(post({ debtId, amount: 1000, kind: "partial" }));
            const data = await res.json();
            expect(data.status).toBe("settled");
        });

        it("new loan defaults principal to its starting balance", async () => {
            const r1 = await upsertDebt(post({ name: "Bike loan", balance: 60000, rate: 11, emi: 3000, type: "formal" }));
            const { id } = await r1.json();
            const list = await (await listDebts(new Request("http://localhost"))).json();
            const d = list.debts.find((x: { id: string; principal: number }) => x.id === id);
            expect(d.principal).toBe(60000);
        });
    });

    describe("deleteDebt()", () => {
        it("removes a debt", async () => {
            const r = await upsertDebt(post({ name: "X", balance: 1000, rate: 0, emi: 0, type: "friend" }));
            const { id } = await r.json();

            await deleteDebt(post({ id }));
            const list = await (await listDebts(new Request("http://localhost"))).json();
            expect(list.debts).toHaveLength(0);
        });

        it("returns 400 when id missing", async () => {
            const res = await deleteDebt(post({}));
            expect(res.status).toBe(400);
        });
    });
});
