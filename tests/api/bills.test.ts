// ════════════════════════════════════════════════════════════════
//  tests/api/bills.test.ts
//  Tests for bills CRUD + pay — uses in-memory SQLite
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

const { upsertBill, payBill, getBillsStatus } = await import("@/features/bills/api/index");

function post(body: unknown): Request {
    return new Request("http://localhost/api/bills", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

describe("bills API", () => {
    beforeEach(async () => {
        const { db } = await setupTestDb();
        testDb = db;
    });

    describe("upsertBill()", () => {
        it("creates a bill and returns id", async () => {
            const res = await upsertBill(post({ label: "Netflix", amount: 649, dueDay: 15 }));
            const data = await res.json();
            expect(data.ok).toBe(true);
            expect(data.id).toMatch(/^bill_/);
        });

        it("updates existing bill when id provided", async () => {
            const r1 = await upsertBill(post({ label: "Old", amount: 100, dueDay: 1 }));
            const { id } = await r1.json();
            const r2 = await upsertBill(post({ id, label: "Updated", amount: 200, dueDay: 5 }));
            expect((await r2.json()).id).toBe(id);
        });

        it("rejects missing label", async () => {
            const res = await upsertBill(post({ amount: 100, dueDay: 5 }));
            expect(res.status).toBe(400);
        });

        it("rejects dueDay out of range", async () => {
            const res = await upsertBill(post({ label: "X", amount: 100, dueDay: 32 }));
            expect(res.status).toBe(400);
        });

        it("rejects dueDay 0", async () => {
            const res = await upsertBill(post({ label: "X", amount: 100, dueDay: 0 }));
            expect(res.status).toBe(400);
        });

        it("rejects zero amount", async () => {
            const res = await upsertBill(post({ label: "X", amount: 0, dueDay: 10 }));
            expect(res.status).toBe(400);
        });
    });

    describe("getBillsStatus()", () => {
        it("returns bills array with ok:true", async () => {
            await upsertBill(post({ label: "Electricity", amount: 2000, dueDay: 10 }));
            const res = await getBillsStatus(new Request("http://localhost/api/bills/status"));
            const data = await res.json();
            expect(data.ok).toBe(true);
            expect(Array.isArray(data.bills)).toBe(true);
            expect(data.bills.length).toBe(1);
        });

        it("marks bill as overdue when past dueDay", async () => {
            // Create a bill due on day 1 (always past on any day > 1)
            await upsertBill(post({ label: "Rent", amount: 10000, dueDay: 1 }));
            const res = await getBillsStatus(new Request("http://localhost/api/bills/status"));
            const data = await res.json();
            const today = new Date().getDate();
            if (today > 1) {
                expect(data.bills[0].overdue).toBe(true);
            }
        });
    });

    describe("payBill()", () => {
        it("records payment with ok:true", async () => {
            const r = await upsertBill(post({ label: "Broadband", amount: 999, dueDay: 5 }));
            const { id: billId } = await r.json();
            const res = await payBill(post({ billId, amount: 999 }));
            const data = await res.json();
            expect(data.ok).toBe(true);
        });

        it("rejects payment without billId", async () => {
            const res = await payBill(post({ amount: 100 }));
            expect(res.status).toBe(400);
        });
    });
});
