// ════════════════════════════════════════════════════════════════
//  app/api/[...feature]/route.ts
//  Catch-all dispatcher — parses /api/<featureId>/<action>
//  and delegates to the feature's route handler.
//
//  Example:  POST /api/expenses/log  → expenses.routes["POST /log"]
//            GET  /api/bills/status  → bills.routes["GET  /status"]
//
//  Resolves the user session ONCE here and passes the user-id into
//  the feature handler. Handlers can also still call requireUser()
//  themselves; this is just a convenience for handlers that take
//  a second `sessionUserId` arg.
// ════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { FEATURES_ORDERED } from "@/features/_registry";
import { auth } from "@/auth";

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

    // Try exact match first ("POST /log"), then "POST  /log" (double-space
    // from manifest formatting), then bare path-only fallback.
    const routes = feature.routes ?? {};
    const handler =
        routes[`${method} ${actionPath}`] ??
        routes[`${method}  ${actionPath}`] ??
        routes[actionPath];

    if (!handler) {
        return NextResponse.json(
            { ok: false, error: `No handler for ${method} /api/${featureId}${actionPath}` },
            { status: 404 }
        );
    }

    // Resolve user session for the handler. Public routes (log-expense,
    // health) are exempt at the middleware level and don't need this;
    // private routes need a session.
    const session = await auth();
    const userId = session?.user?.id;

    try {
        // The ActionHandler signature is (input, ctx). Most feature
        // handlers ignore `input` and use ctx + the raw request. We
        // pass the Request as input here for handlers that need it
        // (parsing body, query params, etc) and the resolved session
        // userId in the ctx.
        return await handler(req as unknown as never, {
            request: req as unknown as Request,
            settings: {},
            sameOrigin: true,
            userId,
        });
    } catch (err) {
        console.error(`[${featureId}${actionPath}]`, err);
        return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
    }
}

export { dispatch as GET, dispatch as POST, dispatch as PUT, dispatch as DELETE, dispatch as PATCH };
