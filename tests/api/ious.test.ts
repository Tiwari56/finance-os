// ════════════════════════════════════════════════════════════════
//  tests/api/ious.test.ts
//  Tests for IOUs (money lent) — uses in-memory SQLite
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

const { addIou, listIous, settleIou, deleteIou } = await import("@/features/ious/api/index");

function post(body: unknown): Request {
    return new Request("http://localhost/api/ious", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

describe("ious API", () => {
    beforeEach(async () => {
        const { db } = await setupTestDb();
        testDb = db;
    });

    describe("addIou()", () => {
        it("adds an IOU and returns id", async () => {
            const res = await addIou(post({ name: "Rahul", amount: 500 }));
            const data = await res.json();
            expect(data.ok).toBe(true);
            expect(data.id).toMatch(/^iou_/);
        });

        it("accepts optional note", async () => {
            const res = await addIou(post({ name: "Priya", amount: 1000, note: "Lunch split" }));
            expect((await res.json()).ok).toBe(true);
        });

        it("rejects missing name", async () => {
            const res = await addIou(post({ amount: 500 }));
            expect(res.status).toBe(400);
        });

        it("rejects zero amount", async () => {
            const res = await addIou(post({ name: "X", amount: 0 }));
            expect(res.status).toBe(400);
        });

        it("rejects negative amount", async () => {
            const res = await addIou(post({ name: "X", amount: -100 }));
            expect(res.status).toBe(400);
        });
    });

    describe("listIous()", () => {
        it("returns empty list initially", async () => {
            const res = await listIous(new Request("http://localhost"));
            const data = await res.json();
            expect(data.ok).toBe(true);
            expect(data.ious).toHaveLength(0);
        });

        it("lists IOUs after insertion", async () => {
            await addIou(post({ name: "Amit", amount: 250 }));
            const res = await listIous(new Request("http://localhost"));
            const data = await res.json();
            expect(data.ious).toHaveLength(1);
            expect(data.ious[0].name).toBe("Amit");
        });
    });

    describe("settleIou()", () => {
        it("marks IOU as settled", async () => {
            const r = await addIou(post({ name: "Ankit", amount: 300 }));
            const { id } = await r.json();

            const res = await settleIou(post({ id }));
            expect((await res.json()).ok).toBe(true);
        });

        it("accepts partial settle amount", async () => {
            const r = await addIou(post({ name: "Dev", amount: 1000 }));
            const { id } = await r.json();
            const res = await settleIou(post({ id, settledAmt: 500 }));
            expect((await res.json()).ok).toBe(true);
        });

        it("rejects missing id", async () => {
            const res = await settleIou(post({}));
            expect(res.status).toBe(400);
        });
    });

    describe("deleteIou()", () => {
        it("deletes an IOU", async () => {
            const r = await addIou(post({ name: "Temp", amount: 100 }));
            const { id } = await r.json();
            await deleteIou(post({ id }));
            const list = await (await listIous(new Request("http://localhost"))).json();
            expect(list.ious).toHaveLength(0);
        });

        it("returns 400 when id missing", async () => {
            const res = await deleteIou(post({}));
            expect(res.status).toBe(400);
        });
    });
});
