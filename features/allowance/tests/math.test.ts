// ════════════════════════════════════════════════════════════════
//  features/allowance/tests/math.test.ts
//  Pure-function tests for both dailyAllowance + smartAllowance
// ════════════════════════════════════════════════════════════════
import { describe, it, expect } from "vitest";
import { dailyAllowance, smartAllowance, type SmartAllowanceInput } from "../lib/math";

describe("dailyAllowance()", () => {
    const june15 = new Date(2025, 5, 15); // June 15, 2025

    it("splits remaining budget evenly across days left", () => {
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
        const lastDay = new Date(2025, 5, 30);
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
        expect(result.pctMonthGone).toBe(50);
    });

    it("handles zero budget gracefully", () => {
        expect(() => dailyAllowance(0, 0, june15)).not.toThrow();
    });
});

describe("smartAllowance()", () => {
    // Pin to day 15 of a 30-day cycle starting 1st June
    const now = new Date(2025, 5, 15); // 15 June 2025

    function base(overrides: Partial<SmartAllowanceInput> = {}): SmartAllowanceInput {
        return {
            income:           180_000,
            salaryDay:        1,
            flexSpentCycle:   7_000,    // half of the 14 days have eaten ~half of 14k
            flexBudgetCycle:  30_000,
            billsRemaining:   0,
            debtEmiRemaining: 0,
            sipRemaining:     0,
            todaySpentFlex:   0,
            todaySpentTotal:  0,
            now,
            ...overrides,
        };
    }

    it("returns on-track verdict when pace matches", () => {
        // Day 15 of 30 → 50% expected. Flex 50% gone = on-track.
        const r = smartAllowance(base({ flexSpentCycle: 15_000 }));
        expect(r.pace.verdict).toBe("on-track");
        expect(r.pace.overpaceBy).toBeLessThanOrEqual(0);
        expect(r.smartPerDay).toBe(r.baselinePerDay); // no correction
    });

    it("flags 'over' and shrinks smartPerDay when burning fast", () => {
        // 95% of flex gone by day 15 → 45% over pace
        const r = smartAllowance(base({ flexSpentCycle: 28_500 }));
        expect(r.pace.verdict).toBe("over");
        expect(r.smartPerDay).toBeLessThan(r.baselinePerDay);
    });

    it("flags 'under' and slightly raises smartPerDay when conservative", () => {
        // Only 10% of flex gone by day 15 (50% expected) → 40% under pace
        const r = smartAllowance(base({ flexSpentCycle: 3_000 }));
        expect(r.pace.verdict).toBe("under");
        expect(r.smartPerDay).toBeGreaterThanOrEqual(r.baselinePerDay);
    });

    it("subtracts today's flex spend from suggestedToday", () => {
        const r = smartAllowance(base({ todaySpentFlex: 500 }));
        expect(r.suggestedToday).toBe(Math.max(0, r.smartPerDay - 500));
    });

    it("collects bills + EMI + SIP into obligations", () => {
        const r = smartAllowance(base({
            billsRemaining:   23_500,
            debtEmiRemaining: 20_000,
            sipRemaining:     8_000,
        }));
        expect(r.obligations).toBe(51_500);
    });

    it("includes a rationale string", () => {
        const r = smartAllowance(base());
        expect(typeof r.rationale).toBe("string");
        expect(r.rationale.length).toBeGreaterThan(10);
    });

    it("clamps suggestedToday to 0 when over-spent today", () => {
        const r = smartAllowance(base({ flexSpentCycle: 28_000, todaySpentFlex: 5_000 }));
        expect(r.suggestedToday).toBe(0);
    });

    it("salaryDay defaults work for mid-cycle", () => {
        // Salary day = 5. Today = 15. So cycle started this month on the 5th, ends next month on the 5th.
        const r = smartAllowance(base({ salaryDay: 5 }));
        expect(r.cycle.dayOfCycle).toBe(11);  // June 5 → June 15 is day 11
        expect(r.cycle.daysInCycle).toBeGreaterThanOrEqual(28);
    });

    it("safelyAvailableFlex never goes negative", () => {
        const r = smartAllowance(base({ flexSpentCycle: 100_000 }));
        expect(r.safelyAvailableFlex).toBe(0);
    });
});
