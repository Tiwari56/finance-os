import type { FeatureManifest } from "@/features/core/types";

export async function advisorChat(req: Request): Promise<Response> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return Response.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
    }

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const { prompt } = body as { prompt?: string };
    if (!prompt) return Response.json({ ok: false, error: "prompt required" }, { status: 400 });

    // Forward to existing /api/advisor logic for now — full migration in Phase 4
    const res = await fetch(new URL("/api/advisor", req.url).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
}

const manifest: FeatureManifest = {
    id: "advisor",
    name: "AI Advisor",
    description: "Claude-powered financial analysis. Ask anything about your finances. Requires ANTHROPIC_API_KEY environment variable.",
    category: "analysis",
    icon: "🧠",
    version: 1,

    dependencies: ["expenses", "debts", "envelopes"],

    routes: {
        "POST /chat": advisorChat,
    },

    settings: [
        {
            key: "api_key_configured",
            label: "Anthropic API key",
            description: "Set ANTHROPIC_API_KEY in Vercel environment variables. Never paste your key here — this setting just shows status.",
            type: "boolean",
            default: false,
        },
    ],

    health: async () => {
        const ok = !!process.env.ANTHROPIC_API_KEY;
        return { ok, info: ok ? "API key set" : "ANTHROPIC_API_KEY not configured — AI Advisor disabled" };
    },
};

export default manifest;
