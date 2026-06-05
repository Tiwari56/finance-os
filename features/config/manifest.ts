import type { FeatureManifest } from "@/features/core/types";

const manifest: FeatureManifest = {
    id: "config",
    name: "Configuration",
    description: "Central settings hub. Lists every feature with description, status, and inline settings. Generated from feature manifests — no settings are hidden.",
    category: "system",
    icon: "⚙️",
    version: 1,

    routes: {},

    health: async () => ({ ok: true, info: "Ready" }),
};

export default manifest;
