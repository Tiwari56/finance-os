import type { FeatureManifest } from "@/features/core/types";

const manifest: FeatureManifest = {
    id: "history",
    name: "Spending history",
    description: "6/12/24-month aggregated view of expenses, debt payments, and savings. Charts spending trends and category breakdowns.",
    category: "analysis",
    icon: "📊",
    version: 1,

    dependencies: ["expenses", "debts"],

    routes: {},

    health: async () => ({ ok: true, info: "Ready" }),
};

export default manifest;
