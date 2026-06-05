import type { FeatureManifest } from "@/features/core/types";
import { goals, goalContributions } from "./schema";
import { listGoals, contributeGoal, upsertGoal } from "./api/index";

const manifest: FeatureManifest = {
    id: "goals",
    name: "Savings goals",
    description: "Save toward goals like renovation fund. Track contributions over time. Goal card on dashboard hides when target is reached.",
    category: "money",
    icon: "🧱",
    version: 1,

    schemas: [goals, goalContributions],

    routes: {
        "GET  /list": listGoals,
        "POST /contribute": contributeGoal,
        "POST /upsert": upsertGoal,
    },

    health: async () => ({ ok: true, info: "Ready" }),
};

export default manifest;
