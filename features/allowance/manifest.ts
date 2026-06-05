import type { FeatureManifest } from "@/features/core/types";

const manifest: FeatureManifest = {
    id: "allowance",
    name: "Daily allowance",
    description: "Computes how much you can spend today based on remaining flex budget (Food + Freedom) and days left in the month. Powers the hero card on Today tab.",
    category: "money",
    icon: "💰",
    version: 1,

    dependencies: ["expenses", "envelopes"],

    routes: {},

    health: async () => ({ ok: true, info: "Ready" }),
};

export default manifest;
