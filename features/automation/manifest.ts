import type { FeatureManifest } from "@/features/core/types";

const manifest: FeatureManifest = {
    id: "automation",
    name: "SMS / n8n automation",
    description: "Webhook target for n8n SMS → expense pipeline. Idempotency via clientRequestId. Backward-compat shim keeps /api/log-expense working.",
    category: "automation",
    icon: "📱",
    version: 1,

    dependencies: ["expenses"],

    routes: {},

    settings: [
        {
            key: "webhook_secret",
            label: "Webhook secret (LOG_SECRET)",
            description: "Set this in Vercel env → LOG_SECRET. Required on all POST /api/expenses/log calls from n8n.",
            type: "string",
            default: "",
            placeholder: "a-long-random-string",
        },
    ],

    health: async () => ({ ok: true, info: "Active — /api/expenses/log and /api/log-expense both mounted" }),
};

export default manifest;
