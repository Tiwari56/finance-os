import type { FeatureManifest } from "@/features/core/types";
import { getWebhookInfo, rotateWebhookSecret } from "./api";

const manifest: FeatureManifest = {
    id: "automation",
    name: "SMS / n8n automation",
    description: "Webhook target for n8n SMS → expense pipeline. Each account has its own webhook secret (no shared env var needed). Idempotency via clientRequestId. Backward-compat shim keeps /api/log-expense working.",
    category: "automation",
    icon: "📱",
    version: 2,

    dependencies: ["expenses"],

    routes: {
        "GET  /webhook": getWebhookInfo,
        "POST /webhook/rotate": rotateWebhookSecret,
    },

    settings: [],

    health: async () => ({ ok: true, info: "Active — /api/expenses/log and /api/log-expense both mounted" }),
};

export default manifest;
