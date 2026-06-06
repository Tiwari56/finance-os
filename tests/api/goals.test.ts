// ════════════════════════════════════════════════════════════════
//  tests/api/goals.test.ts
//  Tests for goals CRUD + contributions — uses in-memory SQLite
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

const { upsertGoal, listGoals, contributeGoal } = await import("@/features/goals/api/index");

function post(body: unknown): Request {
    return new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

describe("goals API", () => {
    beforeEach(async () => {
        const { db } = await setupTestDb();
        testDb = db;
    });

    describe("upsertGoal()", () => {
        it("creates a goal and returns id", async () => {
            const res = await upsertGoal(post({ label: "Emergency Fund", needed: 100000 }));
            const data = await res.json();
            expect(data.ok).toBe(true);
            expect(data.id).toMatch(/^goal_/);
        });

        it("updates existing goal when id provided", async () => {
            const r1 = await upsertGoal(post({ label: "Old", needed: 50000 }));
            const { id } = await r1.json();
            const r2 = await upsertGoal(post({ id, label: "Updated", needed: 60000 }));
            expect((await r2.json()).id).toBe(id);
        });

        it("rejects missing label", async () => {
            const res = await upsertGoal(post({ needed: 10000 }));
            expect(res.status).toBe(400);
        });

        it("rejects zero needed amount", async () => {
            const res = await upsertGoal(post({ label: "X", needed: 0 }));
            expect(res.status).toBe(400);
        });

        it("accepts optional targetDate", async () => {
            const res = await upsertGoal(post({ label: "Trip", needed: 50000, targetDate: "2025-12-31" }));
            expect((await res.json()).ok).toBe(true);
        });
    });

    describe("listGoals()", () => {
        it("returns empty list initially", async () => {
            const res = await listGoals(new Request("http://localhost/api/goals/list"));
            const data = await res.json();
            expect(data.ok).toBe(true);
            expect(data.goals).toHaveLength(0);
        });

        it("lists active goals after insertion", async () => {
            await upsertGoal(post({ label: "Car", needed: 500000 }));
            const res = await listGoals(new Request("http://localhost/api/goals/list"));
            const data = await res.json();
            expect(data.goals).toHaveLength(1);
            expect(data.goals[0].label).toBe("Car");
        });
    });

    describe("contributeGoal()", () => {
        it("records contribution and increases saved", async () => {
            const r = await upsertGoal(post({ label: "Emergency", needed: 100000 }));
            const { id: goalId } = await r.json();

            const res = await contributeGoal(post({ goalId, amount: 5000, note: "Monthly SIP" }));
            const data = await res.json();
            expect(data.ok).toBe(true);

            // Verify saved was updated
            const list = await (await listGoals(new Request("http://localhost"))).json();
            expect(list.goals[0].saved).toBe(5000);
        });

        it("rejects missing goalId", async () => {
            const res = await contributeGoal(post({ amount: 1000 }));
            expect(res.status).toBe(400);
        });

        it("rejects zero contribution", async () => {
            const res = await contributeGoal(post({ goalId: "goal_x", amount: 0 }));
            expect(res.status).toBe(400);
        });

        it("accumulates multiple contributions", async () => {
            const r = await upsertGoal(post({ label: "Fund", needed: 50000 }));
            const { id: goalId } = await r.json();
            await contributeGoal(post({ goalId, amount: 1000 }));
            await contributeGoal(post({ goalId, amount: 2000 }));
            const list = await (await listGoals(new Request("http://localhost"))).json();
            expect(list.goals[0].saved).toBe(3000);
        });
    });
});
