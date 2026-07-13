import type { FeatureManifest } from "@/features/core/types";
import { getKeyStatus, setKey } from "./api/key";

export async function advisorChat(req: Request): Promise<Response> {
    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const { prompt } = body as { prompt?: string };
    if (!prompt) return Response.json({ ok: false, error: "prompt required" }, { status: 400 });

    // Forward to /api/advisor which handles per-user key resolution
    // (BYOK → admin env → locked) plus the financial snapshot.
    const res = await fetch(new URL("/api/advisor", req.url).toString(), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            // forward the session cookie so /api/advisor sees the same user
            cookie: req.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({ question: prompt }),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
}

const manifest: FeatureManifest = {
    id: "advisor",
    name: "AI Advisor",
    description: "Claude-powered financial analysis. The app owner (admin) uses the server's API key with a daily cap; everyone else connects their own Anthropic key — stored encrypted, spend billed to their account.",
    category: "analysis",
    icon: "🧠",
    version: 2,

    dependencies: ["expenses", "debts", "envelopes"],

    routes: {
        "POST /chat": advisorChat,
        "GET  /key": getKeyStatus,
        "POST /key": setKey,
    },

    settings: [
        {
            key: "byok_info",
            label: "Your Anthropic API key",
            description: "Connect your own key in Config → AI Coach. It's validated live, encrypted at rest (AES-256-GCM), and your requests bill your own Anthropic account — not the app owner's.",
            type: "boolean",
            default: false,
        },
    ],

    health: async () => {
        const ok = !!process.env.ANTHROPIC_API_KEY;
        return {
            ok,
            info: ok
                ? "Server key set (admin only, daily-capped). Other users bring their own key."
                : "No server key — all users need their own key via Config → AI Coach.",
        };
    },
};

export default manifest;
