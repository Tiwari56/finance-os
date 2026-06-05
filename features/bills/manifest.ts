import type { FeatureManifest } from "@/features/core/types";
import { bills, billPayments } from "./schema";
import { getBillsStatus, upsertBill, payBill, undoBill, deleteBill } from "./api/index";

const manifest: FeatureManifest = {
    id: "bills",
    name: "Fixed bills tracker",
    description: "Track recurring monthly bills (rent, OTT, family mobile) with due dates. Bills can be marked paid in full or partial; status shows overdue/due-soon.",
    category: "money",
    icon: "📋",
    version: 1,

    schemas: [bills, billPayments],
    dependencies: ["expenses", "envelopes"],

    routes: {
        "GET  /status": getBillsStatus,
        "POST /upsert": upsertBill,
        "POST /pay": payBill,
        "POST /undo": undoBill,
        "POST /delete": deleteBill,
    },

    settings: [
        {
            key: "due_soon_threshold_days",
            label: "Mark bill as 'due soon' if within...",
            description: "How many days before due date should the bill turn yellow on the dashboard?",
            type: "number",
            default: 3,
            min: 0,
            max: 14,
        },
    ],

    health: async () => ({ ok: true, info: "Ready" }),
};

export default manifest;
