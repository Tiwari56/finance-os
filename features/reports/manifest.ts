import type { FeatureManifest } from "@/features/core/types";

const manifest: FeatureManifest = {
    id: "reports",
    name: "Email reports",
    description: "Daily and weekly email summaries via Resend. Includes spend breakdown, debt progress, bills status, and allowance snapshot.",
    category: "automation",
    icon: "📈",
    version: 1,

    dependencies: ["expenses", "debts", "bills", "envelopes"],

    routes: {},

    settings: [
        {
            key: "resend_api_key",
            label: "Resend API key",
            description: "Set RESEND_API_KEY in Vercel environment variables to enable email reports.",
            type: "boolean",
            default: false,
        },
        {
            key: "report_email",
            label: "Report recipient email",
            description: "Email address to send daily summaries to.",
            type: "string",
            default: "",
            placeholder: "you@example.com",
        },
    ],

    health: async () => {
        const ok = !!process.env.RESEND_API_KEY;
        return { ok, info: ok ? "Resend configured" : "RESEND_API_KEY not set — email reports disabled" };
    },
};

export default manifest;
