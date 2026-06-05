import type { FeatureManifest } from "@/features/core/types";
import { envelopes } from "./schema";
import { listEnvelopes, updateEnvelope } from "./api/index";

const manifest: FeatureManifest = {
    id: "envelopes",
    name: "Budget envelopes",
    description: "Six envelope budget system: Survival, Food, Freedom, SIP, Debt Assault, Emergency Vault. Allocations drive the daily allowance calculation.",
    category: "money",
    icon: "🧱",
    version: 1,

    schemas: [envelopes],

    routes: {
        "GET  /list": listEnvelopes,
        "POST /update": updateEnvelope,
    },

    health: async () => ({ ok: true, info: "Ready" }),
};

export default manifest;
