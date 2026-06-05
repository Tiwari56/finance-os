import type { FeatureManifest } from "@/features/core/types";
import { ious } from "./schema";
import { listIous, addIou, settleIou, deleteIou } from "./api/index";

const manifest: FeatureManifest = {
    id: "ious",
    name: "IOU tracker",
    description: "Track money you've lent to others. Mark as settled when repaid. Shows total outstanding and settlement history.",
    category: "money",
    icon: "📥",
    version: 1,

    schemas: [ious],

    routes: {
        "GET  /list": listIous,
        "POST /add": addIou,
        "POST /settle": settleIou,
        "POST /delete": deleteIou,
    },

    health: async () => ({ ok: true, info: "Ready" }),
};

export default manifest;
