"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Surface, apiPost, apiFetch, Loading } from "@/lib/ui";

// Parse the analyze-mode reply into 5 emoji-headed sections.
// Section markers in the advisor prompt:
//   📊 SPENDING HEALTH   💪 CAPACITY CHECK   🚨 TOP LEAK
//   💎 TOP OPPORTUNITY   📅 NEXT 7 DAYS
const SECTION_PATTERNS: Array<{ icon: string; key: string; label: string; accent: string }> = [
    { icon: "📊", key: "health", label: "Spending health", accent: "from-blue-500/15 to-blue-500/0" },
    { icon: "💪", key: "capacity", label: "Capacity check", accent: "from-purple-500/15 to-purple-500/0" },
    { icon: "🚨", key: "leak", label: "Top leak", accent: "from-red-500/15 to-red-500/0" },
    { icon: "💎", key: "opportunity", label: "Top opportunity", accent: "from-emerald-500/15 to-emerald-500/0" },
    { icon: "📅", key: "plan", label: "Next 7 days", accent: "from-yellow-500/15 to-yellow-500/0" },
];

interface Section { icon: string; label: string; body: string; accent: string }

function parseAnalysis(reply: string): Section[] {
    if (!reply) return [];
    const lines = reply.split("\n");
    const sections: Section[] = [];
    let current: Section | null = null;

    for (const raw of lines) {
        const line = raw.trim();
        const match = SECTION_PATTERNS.find(p => line.startsWith(p.icon));
        if (match) {
            if (current) sections.push(current);
            // Strip "📊 SPENDING HEALTH:" prefix to get just the body start
            const body = line.replace(match.icon, "").replace(/^[^:]*:/, "").trim();
            current = { icon: match.icon, label: match.label, body, accent: match.accent };
        } else if (current && line) {
            current.body += (current.body ? "\n" : "") + line;
        }
    }
    if (current) sections.push(current);
    return sections;
}

interface Props { compact?: boolean }

export function AIInsight({ compact = false }: Props) {
    const [refreshKey, setRefreshKey] = useState(0);
    // Compact (home page) never auto-fetches — user must explicitly open the AI tab.
    // Full mode also requires a manual click to avoid burning tokens on every mount.
    const [hasRequested, setHasRequested] = useState(false);

    const { data: healthData } = useQuery({
        queryKey: ["health-anthropic"],
        queryFn: () => apiFetch("/api/health"),
        staleTime: 5 * 60 * 1000,
    });
    const aiAvailable = healthData?.anthropic?.configured === true;

    const { data, isFetching, refetch, error } = useQuery({
        queryKey: ["ai-analysis", refreshKey],
        queryFn: () => apiPost("/api/advisor", { mode: "analyze" }),
        // Only fetch when user explicitly requests it — never on mount
        enabled: aiAvailable && hasRequested && !compact,
        staleTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    if (!aiAvailable) {
        return (
            <Surface className="p-4">
                <div className="flex items-start gap-3">
                    <span className="text-2xl">🧠</span>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200">AI Coach not connected</p>
                        <p className="text-xs text-zinc-500 mt-0.5">Set <code className="text-yellow-400 bg-black/40 px-1 rounded">ANTHROPIC_API_KEY</code> in env to enable daily analysis.</p>
                    </div>
                </div>
            </Surface>
        );
    }

    // Compact (home page) — static teaser, no API call
    if (compact) {
        return (
            <Surface className="p-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center shrink-0">
                        <span className="text-base">🧠</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200">AI Coach ready</p>
                        <p className="text-xs text-zinc-500 mt-0.5">Open the AI tab to run a full analysis of your finances.</p>
                    </div>
                </div>
            </Surface>
        );
    }

    return (
        <Surface elevated className="overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center">
                        <span className="text-base">🧠</span>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-zinc-100">AI Coach</p>
                        <p className="text-[11px] text-zinc-500">Live analysis of your finances</p>
                    </div>
                </div>
                <button
                    onClick={() => { setRefreshKey(k => k + 1); refetch(); }}
                    disabled={isFetching}
                    className="text-xs text-zinc-400 hover:text-white disabled:opacity-50 transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                >
                    {isFetching ? "Analyzing…" : "↻ Refresh"}
                </button>
            </div>

            {/* Body — show Run Analysis prompt if not yet requested */}
            {!hasRequested && !data && (
                <div className="p-6 flex flex-col items-center gap-4 text-center">
                    <p className="text-xs text-zinc-500">Each run uses ~1–2K tokens (~$0.003).</p>
                    <button onClick={() => setHasRequested(true)} className="btn-primary px-6">
                        Run Analysis
                    </button>
                </div>
            )}
            {(hasRequested || data) && (() => {
                const sections = parseAnalysis(data?.reply ?? "");
                return (
                    <div className="p-4">
                        {isFetching && !data && (
                            <div className="space-y-2">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-14 rounded-lg shimmer-bg" />
                                ))}
                                <p className="text-xs text-zinc-500 text-center pt-2">Reading your data…</p>
                            </div>
                        )}
                        {error && (
                            <p className="text-xs text-red-400">Failed to analyze — {(error as Error).message}</p>
                        )}
                        {!isFetching && sections.length === 0 && data?.reply && (
                            <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{data.reply}</p>
                        )}
                        {sections.length > 0 && (
                            <div className="space-y-2">
                                {(compact ? sections.slice(0, 2) : sections).map((s, i) => (
                                    <div
                                        key={i}
                                        className={`rounded-xl p-3 bg-gradient-to-br ${s.accent} border border-white/[0.04] slide-up`}
                                        style={{ animationDelay: `${i * 60}ms` }}
                                    >
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="text-base">{s.icon}</span>
                                            <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">{s.label}</p>
                                        </div>
                                        <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{s.body}</p>
                                    </div>
                                ))}
                                {compact && sections.length > 2 && (
                                    <p className="text-[11px] text-zinc-500 text-center pt-1">
                                        Open the AI tab for full analysis ({sections.length - 2} more sections)
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                );
            })()}
        </Surface>
    );
}

// Free-form Q&A — used as part of the full Advisor tab
export function AIQuestion() {
    const [q, setQ] = useState("");
    const ask = useMutation<{ reply?: string; error?: string }, Error, string>({
        mutationFn: (question: string) => apiPost("/api/advisor", { question }),
    });

    return (
        <Surface className="p-4">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-base">💬</span>
                <p className="text-sm font-medium text-zinc-200">Ask anything</p>
            </div>
            <textarea
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="E.g. Can I afford a ₹3000 dinner tonight? What's my biggest leak?"
                rows={3}
                className="w-full bg-black/30 text-white rounded-xl px-4 py-3 text-sm border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all placeholder-zinc-600 resize-none"
            />
            <button
                onClick={() => q.trim() && ask.mutate(q)}
                disabled={ask.isPending || !q.trim()}
                className="btn-primary w-full mt-3"
            >
                {ask.isPending ? "Thinking…" : "Ask AI Coach"}
            </button>
            {ask.data?.reply && (
                <div className="mt-4 rounded-xl border border-white/5 bg-black/30 p-4 slide-up">
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Reply</p>
                    <p className="text-sm text-zinc-100 whitespace-pre-wrap leading-relaxed">{ask.data.reply}</p>
                </div>
            )}
            {ask.data?.error && (
                <p className="text-xs text-red-400 mt-3">{ask.data.error}</p>
            )}
        </Surface>
    );
}
