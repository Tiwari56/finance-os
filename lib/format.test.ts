// ════════════════════════════════════════════════════════════════
//  tests/lib/format.test.ts
//  Pure function tests — no DB, no network
// ════════════════════════════════════════════════════════════════
import { describe, it, expect } from "vitest";
import { fmt, fmtL, fmtPct, startOfDay, startOfMonth, startOfWeek } from "@/lib/format";

describe("fmt()", () => {
    it("formats a round number with ₹ prefix", () => {
        expect(fmt(1000)).toBe("₹1,000");
    });
    it("formats zero", () => {
        expect(fmt(0)).toBe("₹0");
    });
    it("formats negative as absolute value", () => {
        expect(fmt(-500)).toBe("₹500");
    });
    it("handles null", () => {
        expect(fmt(null)).toBe("₹0");
    });
    it("handles undefined", () => {
        expect(fmt(undefined)).toBe("₹0");
    });
    it("rounds to nearest rupee", () => {
        expect(fmt(99.9)).toBe("₹100");
    });
    it("formats lakh amount with Indian grouping", () => {
        expect(fmt(100000)).toBe("₹1,00,000");
    });
});

describe("fmtL()", () => {
    it("shows L suffix for amounts >= 1 lakh", () => {
        expect(fmtL(150000)).toContain("L");
    });
    it("formats 1.5L correctly", () => {
        expect(fmtL(150000)).toBe("₹1.50L");
    });
    it("falls back to fmt for amounts < 1 lakh", () => {
        expect(fmtL(50000)).toBe("₹50,000");
    });
    it("handles zero", () => {
        expect(fmtL(0)).toBe("₹0");
    });
});

describe("fmtPct()", () => {
    it("formats percentage", () => {
        expect(fmtPct(42)).toBe("42%");
    });
    it("rounds to 0 decimals", () => {
        expect(fmtPct(42.7)).toBe("43%");
    });
    it("treats negative as absolute", () => {
        expect(fmtPct(-10)).toBe("10%");
    });
    it("handles null/undefined", () => {
        expect(fmtPct(null)).toBe("0%");
        expect(fmtPct(undefined)).toBe("0%");
    });
});

describe("startOfDay()", () => {
    it("strips time to midnight", () => {
        const ts = new Date(2025, 5, 15, 14, 30, 0).getTime();
        const result = startOfDay(ts);
        const d = new Date(result);
        expect(d.getHours()).toBe(0);
        expect(d.getMinutes()).toBe(0);
        expect(d.getSeconds()).toBe(0);
    });
    it("same day ts produces same result", () => {
        const a = new Date(2025, 5, 15, 1, 0, 0).getTime();
        const b = new Date(2025, 5, 15, 23, 0, 0).getTime();
        expect(startOfDay(a)).toBe(startOfDay(b));
    });
});

describe("startOfMonth()", () => {
    it("returns first day of month at midnight", () => {
        const ts = new Date(2025, 5, 15).getTime();
        const result = startOfMonth(ts);
        const d = new Date(result);
        expect(d.getDate()).toBe(1);
        expect(d.getHours()).toBe(0);
    });
});

describe("startOfWeek()", () => {
    it("returns Monday for a Wednesday", () => {
        // June 11 2025 is a Wednesday
        const ts = new Date(2025, 5, 11).getTime();
        const d = new Date(startOfWeek(ts));
        expect(d.getDay()).toBe(1); // Monday
        expect(d.getDate()).toBe(9); // June 9
    });
    it("returns same Monday for Monday itself", () => {
        const ts = new Date(2025, 5, 9).getTime(); // June 9 2025 = Monday
        const d = new Date(startOfWeek(ts));
        expect(d.getDate()).toBe(9);
    });
    it("returns prior Monday for Sunday", () => {
        const ts = new Date(2025, 5, 15).getTime(); // June 15 2025 = Sunday
        const d = new Date(startOfWeek(ts));
        expect(d.getDay()).toBe(1); // Monday
    });
});
