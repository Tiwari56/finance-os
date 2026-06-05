// ════════════════════════════════════════════════════════════════
//  GET /api/config/registry
//  Returns the live feature manifests + per-feature health checks.
//  This is what the Config tab renders — no hardcoded list anywhere.
// ════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { FEATURES_ORDERED } from "@/features/_registry";

export const dynamic = "force-dynamic";

export async function GET() {
    const features = await Promise.all(
        FEATURES_ORDERED.map(async (f) => {
            let health: { ok: boolean; info?: string } = { ok: true };
            try {
                if (f.health) health = await f.health();
            } catch (err) {
                health = { ok: false, info: (err as Error).message };
            }
            return {
                id:           f.id,
                name:         f.name,
                description:  f.description,
                category:     f.category,
                icon:         f.icon,
                version:      f.version,
                dependencies: f.dependencies ?? [],
                routes:       Object.keys(f.routes ?? {}),
                settings:     f.settings ?? [],
                health,
            };
        })
    );

    return NextResponse.json({ ok: true, features });
}
