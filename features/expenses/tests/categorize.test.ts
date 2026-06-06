// ════════════════════════════════════════════════════════════════
//  tests/lib/categorize.test.ts
//  Pure function tests — no DB, no network
// ════════════════════════════════════════════════════════════════
import { describe, it, expect } from "vitest";
import { categorize, isFlexCategory, CATEGORIES } from "@/features/expenses/lib/categorize";

describe("categorize()", () => {
    it("maps swiggy → food", () => {
        expect(categorize("Swiggy Order")).toBe("food");
    });
    it("maps zomato → food", () => {
        expect(categorize("Zomato")).toBe("food");
    });
    it("maps amazon → freedom", () => {
        expect(categorize("Amazon Pay")).toBe("freedom");
    });
    it("maps netflix → subscriptions", () => {
        expect(categorize("Netflix Monthly")).toBe("subscriptions");
    });
    it("maps uber → commute", () => {
        expect(categorize("Uber Ride")).toBe("commute");
    });
    it("maps EMI keyword → debt", () => {
        expect(categorize("HDFC EMI payment")).toBe("debt");
    });
    it("maps rent → rent", () => {
        expect(categorize("Rent paid to landlord")).toBe("rent");
    });
    it("maps unknown merchant → other", () => {
        expect(categorize("Random XYZ Co")).toBe("other");
    });
    it("is case-insensitive", () => {
        expect(categorize("SWIGGY")).toBe("food");
        expect(categorize("Netflix")).toBe("subscriptions");
    });
    it("handles empty string", () => {
        expect(categorize("")).toBe("other");
    });
    it("handles undefined", () => {
        expect(categorize(undefined as unknown as string)).toBe("other");
    });
    it("all category keys exist in CATEGORIES", () => {
        const cats = ["food", "freedom", "rent", "maintenance", "subscriptions", "family", "commute", "bills", "sip", "debt", "renovation", "other"];
        cats.forEach(c => expect(CATEGORIES).toHaveProperty(c));
    });
});

describe("isFlexCategory()", () => {
    it("food is flex", () => expect(isFlexCategory("food")).toBe(true));
    it("freedom is flex", () => expect(isFlexCategory("freedom")).toBe(true));
    it("rent is NOT flex", () => expect(isFlexCategory("rent")).toBe(false));
    it("sip is NOT flex", () => expect(isFlexCategory("sip")).toBe(false));
    it("debt is NOT flex", () => expect(isFlexCategory("debt")).toBe(false));
});
