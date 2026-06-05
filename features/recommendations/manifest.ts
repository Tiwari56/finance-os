import type { FeatureManifest } from "@/features/core/types";

const manifest: FeatureManifest = {
    id: "recommendations",
    name: "Smart recommendations",
    description: "Rule-based suggestions: overdue bills, budget pace alerts, debt actions, coach verdicts. Shown as attention cards on Today tab.",
    category: "analysis",
    icon: "💡",
    version: 1,

    dependencies: ["expenses", "envelopes", "bills", "debts"],

    routes: {},

    health: async () => ({ ok: true, info: "Ready" }),
};

export default manifest;
