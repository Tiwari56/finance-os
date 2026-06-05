// ════════════════════════════════════════════════════════════════
//  app/api/[...feature]/route.ts
//  Catch-all dispatcher — parses /api/<featureId>/<action>
//  and delegates to the feature's route handler.
//
//  Example:  POST /api/expenses/log  → expenses.routes["POST /log"]
//            GET  /api/bills/status  → bills.routes["GET  /status"]
// ════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { FEATURES_ORDERED } from "@/features/_registry";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ feature: string[] }> };

async function dispatch(req: NextRequest, ctx: Ctx): Promise<Response> {
    const { feature: segments } = await ctx.params;
    if (!segments || segments.length < 2) {
        return NextResponse.json({ ok: false, error: "Route requires /api/<feature>/<action>" }, { status: 404 });
    }

    const [featureId, ...actionParts] = segments;
    const actionPath = "/" + actionParts.join("/");
    const method = req.method.toUpperCase();

    const feature = FEATURES_ORDERED.find(f => f.id === featureId);
    if (!feature) {
        return NextResponse.json({ ok: false, error: `Unknown feature: ${featureId}` }, { status: 404 });
    }

    // Try exact match first: "POST /log", then method-agnostic: "/log"
    const routes = feature.routes ?? {};
    const handler =
        routes[`${method} ${actionPath}`] ??
        routes[`${method}  ${actionPath}`] ?? // handle double-space from manifest formatting
        routes[actionPath];

    if (!handler) {
        return NextResponse.json(
            { ok: false, error: `No handler for ${method} /api/${featureId}${actionPath}` },
            { status: 404 }
        );
    }

    try {
        return await handler(req, { request: req, settings: {}, sameOrigin: true });
    } catch (err) {
        console.error(`[${featureId}${actionPath}]`, err);
        return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
    }
}

export { dispatch as GET, dispatch as POST, dispatch as PUT, dispatch as DELETE, dispatch as PATCH };
