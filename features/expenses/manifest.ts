// ════════════════════════════════════════════════════════════════
//  expenses/manifest.ts
// ════════════════════════════════════════════════════════════════

import type { FeatureManifest } from "@/features/core/types";
import { expenses } from "./schema";
import { logExpense } from "./api/log";
import { listExpenses } from "./api/list";
import { deleteExpense } from "./api/delete";

const manifest: FeatureManifest = {
    id: "expenses",
    name: "Expense tracker",
    description: "Log every transaction. Webhook target for SMS automation (n8n → /api/expenses/log). Auto-categorizes by merchant keyword.",
    category: "money",
    icon: "💸",
    version: 1,

    schemas: [expenses],

    routes: {
        "POST /log": ((req: Request) => logExpense(req)) as any,
        "GET  /list": listExpenses,
        "POST /delete": deleteExpense,
    },

    settings: [
        {
            key: "default_currency",
            label: "Default currency",
            description: "Currency code for all logged expenses.",
            type: "string",
            default: "INR",
            placeholder: "INR",
        },
    ],

    health: async () => ({ ok: true, info: "Ready" }),
};

export default manifest;
