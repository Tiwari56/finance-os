// ════════════════════════════════════════════════════════════════
//  debts/manifest.ts
// ════════════════════════════════════════════════════════════════

import type { FeatureManifest } from "@/features/core/types";
import { debts, debtPayments } from "./schema";
import { listDebts, upsertDebt, payDebt, deleteDebt } from "./api/index";

const manifest: FeatureManifest = {
    id: "debts",
    name: "Debt tracker",
    description: "Track credit cards, loans, and friend debts. Avalanche projection shows payoff timeline. Payments auto-reduce balances.",
    category: "debts",
    icon: "⚔️",
    version: 1,

    schemas: [debts, debtPayments],
    dependencies: ["expenses"],

    routes: {
        "GET  /list": listDebts,
        "POST /upsert": upsertDebt,
        "POST /pay": payDebt,
        "POST /delete": deleteDebt,
    },

    settings: [
        {
            key: "auto_link_debt_expenses",
            label: "Auto-link debt-category expenses",
            description: "When you log an expense with category 'debt', automatically pair it with a debt payment and reduce the matched debt's balance.",
            type: "boolean",
            default: true,
        },
    ],

    health: async () => ({ ok: true, info: "Ready" }),
};

export default manifest;
