// ════════════════════════════════════════════════════════════════
//  tests/lib/allowance.test.ts
//  Pure function tests — no DB, no network
// ════════════════════════════════════════════════════════════════
import { describe, it, expect } from "vitest";
import { dailyAllowance } from "@/features/allowance/lib/math";

describe("dailyAllowance()", () => {
    // Use a fixed date so tests are deterministic: 15th of a 30-day month
    const june15 = new Date(2025, 5, 15); // June 15, 2025 (0-indexed month)

    it("splits remaining budget evenly across days left", () => {
        // June has 30 days. Day 15 → 16 days left (15..30 inclusive)
        const result = dailyAllowance(16_000, 0, june15);
        expect(result.daysLeft).toBe(16);
        expect(result.perDay).toBe(1_000);
    });

    it("correctly subtracts spent from remaining", () => {
        const result = dailyAllowance(10_000, 4_000, june15);
        expect(result.remaining).toBe(6_000);
    });

    it("perDay is floored (integer rupees)", () => {
        const result = dailyAllowance(10_000, 1_000, june15);
        expect(Number.isInteger(result.perDay)).toBe(true);
    });

    it("remaining is 0 when overspent", () => {
        const result = dailyAllowance(5_000, 8_000, june15);
        expect(result.remaining).toBe(0);
    });

    it("perDay is 0 when budget exhausted", () => {
        const result = dailyAllowance(5_000, 5_000, june15);
        expect(result.perDay).toBe(0);
    });

    it("daysLeft is at least 1 even on last day of month", () => {
        const lastDay = new Date(2025, 5, 30); // June 30
        const result = dailyAllowance(3_000, 0, lastDay);
        expect(result.daysLeft).toBeGreaterThanOrEqual(1);
    });

    it("pctBudgetGone is 0 when nothing spent", () => {
        const result = dailyAllowance(10_000, 0, june15);
        expect(result.pctBudgetGone).toBe(0);
    });

    it("pctBudgetGone is 100 when fully spent", () => {
        const result = dailyAllowance(10_000, 10_000, june15);
        expect(result.pctBudgetGone).toBe(100);
    });

    it("pctMonthGone reflects day position", () => {
        const result = dailyAllowance(10_000, 0, june15);
        // Day 15 of 30 = 50%
        expect(result.pctMonthGone).toBe(50);
    });

    it("handles zero budget gracefully (no divide-by-zero)", () => {
        expect(() => dailyAllowance(0, 0, june15)).not.toThrow();
    });
});
