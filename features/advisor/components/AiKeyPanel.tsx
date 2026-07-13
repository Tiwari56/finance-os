"use client";

// ════════════════════════════════════════════════════════════════
//  AiKeyPanel — connect / manage your own Anthropic API key (BYOK).
//  Used inside the AI tab's locked state and in Config → AI Coach.
//
//  The key is POSTed once, validated live against the Anthropic API,
//  stored encrypted server-side, and never shown again (masked hint
//  only). Users can replace or remove it any time.
// ════════════════════════════════════════════════════════════════

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Surface, Pill, Input, apiFetch, apiPost } from "@/lib/ui";

export interface AiKeyStatus {
    ok: boolean;
    allowed: boolean;
    source: "byok" | "admin-env" | null;
    keyHint: string | null;
    model: string | null;
    reason: "no-key" | "daily-cap" | "no-user" | null;
    message: string | null;
    isAdmin: boolean;
    usedToday: number;
    dailyCap: number | null;
}

export function useAiKeyStatus() {
    return useQuery<AiKeyStatus>({
        queryKey: ["ai-key-status"],
        queryFn: () => apiFetch("/api/advisor/key"),
        staleTime: 60_000,
    });
}

export function AiKeyPanel({ compact = false }: { compact?: boolean }) {
    const qc = useQueryClient();
    const { data: status, isLoading } = useAiKeyStatus();
    const [keyInput, setKeyInput] = useState("");
    const [showForm, setShowForm] = useState(false);

    const save = useMutation<{ ok: boolean; error?: string }, Error, { apiKey?: string; remove?: boolean }>({
        mutationFn: (body) => apiPost("/api/advisor/key", body),
        onSuccess: (res) => {
            if (res.ok) {
                setKeyInput("");
                setShowForm(false);
                qc.invalidateQueries({ queryKey: ["ai-key-status"] });
            }
        },
    });

    if (isLoading || !status) {
        return <Surface className="p-4"><div className="h-10 shimmer-bg rounded-lg" /></Surface>;
    }

    const saveError = save.data && !save.data.ok ? save.data.error : save.error?.message;

    return (
        <Surface className="p-4 space-y-3">
            {/* Status row */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center shrink-0">
                        <span className="text-base">🔑</span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200">AI access</p>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                            {status.source === "byok" && <>Using <span className="text-emerald-400">your key</span> ({status.keyHint}) — billed to your Anthropic account.</>}
                            {status.source === "admin-env" && <>Using the <span className="text-blue-400">server key</span> (admin) — {status.usedToday}/{status.dailyCap} requests today.</>}
                            {!status.allowed && status.reason === "no-key" && <>Connect your own Anthropic API key to unlock the AI coach.</>}
                            {!status.allowed && status.reason === "daily-cap" && <>{status.message}</>}
                        </p>
                    </div>
                </div>
                {status.allowed
                    ? <Pill color="green">{status.source === "byok" ? "Your key" : "Server key"}</Pill>
                    : <Pill color={status.reason === "daily-cap" ? "yellow" : "zinc"}>{status.reason === "daily-cap" ? "Capped" : "Locked"}</Pill>}
            </div>

            {/* Actions */}
            {!showForm && (
                <div className="flex flex-wrap gap-2">
                    {status.source !== "byok" && (
                        <button onClick={() => setShowForm(true)} className="btn-primary !py-2 !px-4 !text-xs">
                            {status.reason === "no-key" ? "Connect your API key" : "Use my own key instead"}
                        </button>
                    )}
                    {status.source === "byok" && (
                        <>
                            <button onClick={() => setShowForm(true)} className="btn-soft !py-2 !px-4 !text-xs">
                                Replace key
                            </button>
                            <button
                                onClick={() => save.mutate({ remove: true })}
                                disabled={save.isPending}
                                className="btn-soft !py-2 !px-4 !text-xs !text-red-300"
                            >
                                {save.isPending ? "Removing…" : "Remove key"}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Key entry form */}
            {showForm && (
                <div className="space-y-2 pt-1">
                    <Input
                        type="password"
                        placeholder="sk-ant-api03-…"
                        value={keyInput}
                        onChange={e => setKeyInput(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={() => save.mutate({ apiKey: keyInput.trim() })}
                            disabled={!keyInput.trim().startsWith("sk-ant-") || save.isPending}
                            className="btn-primary !py-2 !px-4 !text-xs flex-1"
                        >
                            {save.isPending ? "Validating…" : "Validate & save"}
                        </button>
                        <button
                            onClick={() => { setShowForm(false); setKeyInput(""); save.reset(); }}
                            className="btn-soft !py-2 !px-4 !text-xs"
                        >
                            Cancel
                        </button>
                    </div>
                    {saveError && <p className="text-[11px] text-red-400">{saveError}</p>}
                    {!compact && (
                        <div className="text-[11px] text-zinc-500 leading-relaxed space-y-1 pt-1">
                            <p>• Get a key at <span className="text-zinc-300">console.anthropic.com</span> → API keys. New accounts get free credits.</p>
                            <p>• Your key is validated with a tiny test call, then stored <span className="text-zinc-300">encrypted</span> — the app never shows it again.</p>
                            <p>• A typical analysis costs less than ₹1. You control spending from your own Anthropic dashboard.</p>
                        </div>
                    )}
                </div>
            )}
        </Surface>
    );
}
