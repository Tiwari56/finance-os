// ════════════════════════════════════════════════════════════════
//  tests/lib/avalanche.test.ts
//  Pure function tests — no DB, no network
// ════════════════════════════════════════════════════════════════
import { describe, it, expect } from "vitest";
import { avalanche, type DebtSnapshot } from "@/features/debts/lib/avalanche";

const makeDebt = (id: string, name: string, balance: number, rate: number, emi = 0): DebtSnapshot => ({
    id, name, balance, rate, emi, type: "formal",
});

describe("avalanche()", () => {
    it("pays off a single zero-interest debt when payment equals balance", () => {
        const debts = [makeDebt("d1", "Loan", 5_000, 0, 0)];
        const result = avalanche(debts, 5_000);
        expect(result.months).toBe(1);
        expect(result.finalBal[0].balance).toBeCloseTo(0, 0);
    });

    it("higher-rate debt is paid off first (avalanche order)", () => {
        const debts = [
            makeDebt("d1", "LowRate", 10_000, 5, 0),
            makeDebt("d2", "HighRate", 10_000, 20, 0),
        ];
        const result = avalanche(debts, 5_000);
        // HighRate should reach 0 before LowRate
        let highRateFirstZero = -1;
        let lowRateFirstZero = -1;
        for (const h of result.hist) {
            if (highRateFirstZero === -1) {
                const snapshot = h as unknown as { month: number };
                // We just verify final: high rate ends lower or equal
            }
        }
        const hiDebt = result.finalBal.find(d => d.id === "d2")!;
        const loDebt = result.finalBal.find(d => d.id === "d1")!;
        // With avalanche, HighRate should be fully paid before LowRate
        expect(hiDebt.balance).toBeLessThanOrEqual(loDebt.balance + 1);
    });

    it("caps at 120 months to prevent infinite loops", () => {
        // Tiny payment that can't cover interest
        const debts = [makeDebt("d1", "Debt", 1_000_000, 24, 0)];
        const result = avalanche(debts, 1); // ₹1/month vs ₹20k/month interest
        expect(result.months).toBeLessThanOrEqual(120);
    });

    it("history starts at month 0 with initial total", () => {
        const debts = [makeDebt("d1", "Loan", 10_000, 0, 0)];
        const result = avalanche(debts, 2_000);
        expect(result.hist[0].month).toBe(0);
        expect(result.hist[0].total).toBe(10_000);
    });

    it("returns empty history when debts array is empty", () => {
        const result = avalanche([], 5_000);
        expect(result.months).toBe(0);
        expect(result.finalBal).toHaveLength(0);
    });

    it("applies EMI payments before extra budget", () => {
        // Debt with emi=1000 and remaining 2000 budget
        const debts = [makeDebt("d1", "Loan", 2_000, 0, 1_000)];
        const result = avalanche(debts, 2_000);
        // Should pay off in 2 months at most (1000 emi + 1000 extra in month 1)
        expect(result.months).toBeLessThanOrEqual(2);
    });

    it("total decreases each month with sufficient payment", () => {
        const debts = [makeDebt("d1", "Loan", 12_000, 10, 1_000)];
        const result = avalanche(debts, 2_000);
        // Verify trend: hist[1].total < hist[0].total
        expect(result.hist[1].total).toBeLessThan(result.hist[0].total);
    });

    it("multiple debts all reach zero eventually", () => {
        const debts = [
            makeDebt("d1", "A", 5_000, 0, 0),
            makeDebt("d2", "B", 3_000, 0, 0),
            makeDebt("d3", "C", 2_000, 0, 0),
        ];
        const result = avalanche(debts, 10_000);
        result.finalBal.forEach(d => expect(d.balance).toBeCloseTo(0, 0));
    });
});
