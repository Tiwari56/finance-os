"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Surface, Pill, Input, apiFetch, apiPost, Loading, Collapsible } from "@/lib/ui";
import { fmt } from "@/lib/format";
import type { StateData } from "@/lib/ui";

interface FeatureMeta {
    id: string; name: string; description: string; category: string;
    icon: string; version: number;
    dependencies: string[]; routes: string[];
    settings: Array<{ key: string; label: string; description: string; type: string; default: unknown; placeholder?: string; min?: number; max?: number; options?: Array<{value: string; label: string}> }>;
    health: { ok: boolean; info?: string };
}

const CAT_META: Record<string, { label: string; color: string }> = {
    money:      { label: "💰 Money",       color: "blue"   },
    debts:      { label: "⚔️ Debts",        color: "red"    },
    analysis:   { label: "📊 Analysis",    color: "purple" },
    automation: { label: "🤖 Automation",  color: "yellow" },
    system:     { label: "⚙️ System",      color: "zinc"   },
};
const CAT_ORDER = ["money", "debts", "analysis", "automation", "system"];

export function ConfigTab({ data }: { data: StateData }) {
    const qc = useQueryClient();

    const { data: registry, isLoading: regLoading } = useQuery({
        queryKey: ["config-registry"],
        queryFn:  () => apiFetch("/api/config/registry"),
    });
    const { data: health } = useQuery({
        queryKey: ["health"],
        queryFn:  () => apiFetch("/api/health"),
        refetchInterval: 60_000,
    });

    const features: FeatureMeta[] = registry?.features ?? [];

    // ─── Group by category ────────────────────────────────────────
    const byCat: Record<string, FeatureMeta[]> = {};
    for (const f of features) (byCat[f.category] ??= []).push(f);

    return (
        <div className="space-y-6 pb-24">

            {/* ── Profile editor ──────────────────────────────────── */}
            <ProfileSection data={data} />

            {/* ── Envelopes editor ────────────────────────────────── */}
            <EnvelopesSection data={data} />

            {/* ── Features (grouped) ──────────────────────────────── */}
            {regLoading && <Loading label="Loading feature registry…" />}

            {!regLoading && CAT_ORDER.filter(c => byCat[c]?.length).map(cat => (
                <section key={cat}>
                    <div className="flex items-center justify-between px-1 mb-2">
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">{CAT_META[cat]?.label ?? cat}</p>
                        <p className="text-[11px] text-zinc-600">{byCat[cat].length} feature{byCat[cat].length > 1 ? "s" : ""}</p>
                    </div>
                    <div className="space-y-2">
                        {byCat[cat].map(f => <FeatureCard key={f.id} feature={f} />)}
                    </div>
                </section>
            ))}

            {/* ── Bills CRUD ───────────────────────────────────────── */}
            <BillsSection />

            {/* ── System / Integrations Health ─────────────────────── */}
            <section>
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium px-1 mb-2">🔌 Integrations</p>
                <div className="space-y-2">
                    <IntegrationRow
                        icon="🧠"
                        name="Anthropic Claude (AI Coach)"
                        envKey="ANTHROPIC_API_KEY"
                        configured={!!health?.anthropic?.configured}
                        hint={health?.anthropic?.hint}
                        testUrl="/api/health?test=anthropic"
                    />
                    <IntegrationRow
                        icon="📧"
                        name="Resend (Email reports)"
                        envKey="RESEND_API_KEY"
                        configured={!!health?.resend?.configured}
                        hint={health?.resend?.hint}
                        extraInfo={health?.resend?.reportEmail ? `Sends to ${health.resend.reportEmail}` : "REPORT_EMAIL not set"}
                        testUrl="/api/health?test=resend"
                    />
                    <IntegrationRow
                        icon="📱"
                        name="SMS Webhook (n8n)"
                        envKey="LOG_SECRET"
                        configured={!!health?.openclaw?.secretConfigured}
                        hint={health?.openclaw?.secretHint}
                        extraInfo="Endpoint: /api/expenses/log (new) · /api/log-expense (legacy)"
                    />
                </div>
            </section>

            {/* ── Storage ──────────────────────────────────────────── */}
            <section>
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium px-1 mb-2">💾 Storage</p>
                <Surface className="p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Backend</span>
                        <span className="text-zinc-100 font-medium">{health?.storage?.type ?? "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Persistent</span>
                        <Pill color={health?.storage?.persistent ? "green" : "yellow"}>
                            {health?.storage?.persistent ? "Yes" : "No"}
                        </Pill>
                    </div>
                    {health?.storage?.records && (
                        <div className="flex justify-between text-sm">
                            <span className="text-zinc-400">Records</span>
                            <span className="text-zinc-300 tabular-nums text-xs">
                                {health.storage.records.expenses} expenses · {health.storage.records.debtPayments} payments
                            </span>
                        </div>
                    )}
                    {health?.storage?.filePath && (
                        <div className="flex justify-between text-sm">
                            <span className="text-zinc-400">File</span>
                            <code className="text-[11px] text-zinc-500">{health.storage.filePath}</code>
                        </div>
                    )}
                </Surface>
            </section>

        </div>
    );
}

// ─── Profile editor ────────────────────────────────────────────────
function ProfileSection({ data }: { data: StateData }) {
    const qc = useQueryClient();
    const [name, setName] = useState(data.profile.name);
    const [income, setIncome] = useState(String(data.profile.income));
    const [day, setDay] = useState(String(data.profile.salaryDay));
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        setDirty(
            name !== data.profile.name ||
            Number(income) !== data.profile.income ||
            Number(day) !== data.profile.salaryDay
        );
    }, [name, income, day, data.profile]);

    const save = useMutation({
        mutationFn: () => apiPost("/api/profile/update", {
            name, income: Number(income), salaryDay: Number(day),
        }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["state"] }); setDirty(false); },
    });

    return (
        <Surface elevated className="p-5">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <p className="text-sm font-semibold text-zinc-100">Profile</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Drives allowance + envelope calculations</p>
                </div>
                <span className="text-2xl">👤</span>
            </div>
            <div className="space-y-3">
                <div>
                    <label className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5 block">Name</label>
                    <Input value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5 block">Monthly income</label>
                        <Input type="number" value={income} onChange={e => setIncome(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5 block">Salary day</label>
                        <Input type="number" min={1} max={31} value={day} onChange={e => setDay(e.target.value)} />
                    </div>
                </div>
                <button
                    onClick={() => save.mutate()}
                    disabled={!dirty || save.isPending}
                    className="btn-primary w-full"
                >
                    {save.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
                </button>
            </div>
        </Surface>
    );
}

// ─── Envelopes editor ──────────────────────────────────────────────
function EnvelopesSection({ data }: { data: StateData }) {
    const qc = useQueryClient();
    const [amounts, setAmounts] = useState<Record<string, string>>(
        Object.fromEntries(data.envelopes.map(e => [e.id, String(e.amount)]))
    );

    const updateMutation = useMutation({
        mutationFn: (body: { id: string; amount: number }) => apiPost("/api/envelopes/update", body),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["state"] }),
    });

    const total = data.envelopes.reduce((s, e) => s + (Number(amounts[e.id]) || e.amount), 0);
    const income = data.profile.income;
    const diff = income - total;

    return (
        <Collapsible
            title="Budget envelopes"
            subtitle={`Total ${fmt(total)} / Income ${fmt(income)}`}
            icon="🧱"
            badge={diff === 0
                ? <Pill color="green">Balanced</Pill>
                : <Pill color={diff > 0 ? "yellow" : "red"}>{diff > 0 ? `+${fmt(diff)} unallocated` : `${fmt(-diff)} over`}</Pill>}
        >
            <div className="divide-y divide-white/5">
                {data.envelopes.map(e => {
                    const current = amounts[e.id] ?? String(e.amount);
                    const changed = Number(current) !== e.amount;
                    return (
                        <div key={e.id} className="flex items-center gap-3 py-3">
                            <span className="text-xl shrink-0">{e.icon}</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-zinc-200">{e.label}</p>
                                {e.locked && <p className="text-[10px] text-zinc-600 mt-0.5">Locked envelope</p>}
                            </div>
                            <input
                                type="number"
                                value={current}
                                onChange={ev => setAmounts(a => ({ ...a, [e.id]: ev.target.value }))}
                                onBlur={() => changed && updateMutation.mutate({ id: e.id, amount: Number(current) })}
                                className="w-28 bg-black/30 text-white text-right tabular-nums rounded-lg px-3 py-2 text-sm border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                            />
                        </div>
                    );
                })}
            </div>
            <p className="text-[11px] text-zinc-500 pt-3 mt-2 border-t border-white/5">
                Tap an amount, edit, and click away to save. <code className="text-zinc-400">food + freedom</code> drives the daily allowance.
            </p>
        </Collapsible>
    );
}

// ─── Bills editor ──────────────────────────────────────────────────
function BillsSection() {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["bills"],
        queryFn:  () => apiFetch("/api/bills/status"),
    });

    const upsert = useMutation({
        mutationFn: (body: unknown) => apiPost("/api/bills/upsert", body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["bills"] }); qc.invalidateQueries({ queryKey: ["state"] }); },
    });
    const del = useMutation({
        mutationFn: (id: string) => apiPost("/api/bills/delete", { id }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["bills"] }); qc.invalidateQueries({ queryKey: ["state"] }); },
    });

    const [adding, setAdding] = useState(false);
    const [label, setLabel] = useState("");
    const [amount, setAmount] = useState("");
    const [dueDay, setDueDay] = useState("");
    const [icon, setIcon] = useState("🧾");

    const bills = data?.bills ?? [];

    return (
        <Collapsible
            title="Fixed bills"
            subtitle={`${bills.length} active`}
            icon="📋"
            badge={<button onClick={(e) => { e.stopPropagation(); setAdding(true); }} className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded-lg hover:bg-blue-500/10">+ Add</button>}
        >
            {isLoading && <Loading />}

            {adding && (
                <div className="mb-3 p-3 rounded-xl bg-black/30 border border-white/10 space-y-2 slide-up">
                    <p className="text-xs uppercase tracking-wider text-zinc-500">New bill</p>
                    <div className="grid grid-cols-[60px_1fr] gap-2">
                        <Input value={icon} onChange={e => setIcon(e.target.value)} placeholder="🧾" />
                        <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Bill name (e.g. Rent)" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" />
                        <Input type="number" min={1} max={31} value={dueDay} onChange={e => setDueDay(e.target.value)} placeholder="Due day (1-31)" />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setAdding(false)} className="btn-soft flex-1">Cancel</button>
                        <button
                            onClick={() => {
                                if (!label || !amount || !dueDay) return;
                                upsert.mutate({ label, amount: Number(amount), dueDay: Number(dueDay), icon });
                                setLabel(""); setAmount(""); setDueDay(""); setIcon("🧾"); setAdding(false);
                            }}
                            className="btn-primary flex-1"
                        >
                            Add bill
                        </button>
                    </div>
                </div>
            )}

            <div className="divide-y divide-white/5">
                {bills.map((b: { id: string; label: string; amount: number; dueDay: number; icon: string }) => (
                    <div key={b.id} className="flex items-center gap-3 py-2.5">
                        <span className="text-lg">{b.icon}</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-zinc-200 truncate">{b.label}</p>
                            <p className="text-[11px] text-zinc-500">Day {b.dueDay} · {fmt(b.amount)}</p>
                        </div>
                        <button
                            onClick={() => confirm(`Remove ${b.label}?`) && del.mutate(b.id)}
                            className="text-[11px] text-zinc-500 hover:text-red-400 px-2 py-1 rounded"
                        >
                            Remove
                        </button>
                    </div>
                ))}
            </div>
        </Collapsible>
    );
}

// ─── Feature card (registry-driven) ────────────────────────────────
function FeatureCard({ feature }: { feature: FeatureMeta }) {
    const healthColor: "green" | "yellow" = feature.health.ok ? "green" : "yellow";
    return (
        <Surface className="overflow-hidden">
            <details className="group">
                <summary className="cursor-pointer list-none px-4 py-3 flex items-start gap-3 hover:bg-white/[0.02] transition-colors">
                    <span className="text-xl mt-0.5">{feature.icon}</span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-zinc-100">{feature.name}</p>
                            <Pill color={healthColor}>{feature.health.ok ? "active" : "warn"}</Pill>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{feature.description}</p>
                    </div>
                    <span className="text-zinc-500 text-xs group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3">
                    {feature.health.info && (
                        <p className="text-[11px] text-zinc-500">{feature.health.info}</p>
                    )}

                    {feature.routes.length > 0 && (
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Endpoints</p>
                            <div className="flex flex-wrap gap-1.5">
                                {feature.routes.map(r => (
                                    <code key={r} className="text-[10px] bg-black/40 text-zinc-400 px-2 py-0.5 rounded font-mono">
                                        {r.replace(/^(\w+)\s+/, "$1 /api/" + feature.id)}
                                    </code>
                                ))}
                            </div>
                        </div>
                    )}

                    {feature.settings.length > 0 && (
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Settings</p>
                            <div className="space-y-2">
                                {feature.settings.map(s => (
                                    <div key={s.key} className="text-[11px]">
                                        <p className="text-zinc-300">{s.label}</p>
                                        <p className="text-zinc-500 mt-0.5">{s.description}</p>
                                        <p className="text-zinc-600 mt-0.5 font-mono">
                                            default: {JSON.stringify(s.default)}
                                            {s.placeholder ? ` · placeholder: ${s.placeholder}` : ""}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {feature.dependencies.length > 0 && (
                        <p className="text-[11px] text-zinc-500">
                            Depends on: {feature.dependencies.map(d => <code key={d} className="text-zinc-400 mr-1">{d}</code>)}
                        </p>
                    )}
                </div>
            </details>
        </Surface>
    );
}

// ─── Integration row ───────────────────────────────────────────────
function IntegrationRow({
    icon, name, envKey, configured, hint, extraInfo, testUrl,
}: {
    icon: string; name: string; envKey: string;
    configured: boolean; hint?: string; extraInfo?: string; testUrl?: string;
}) {
    const [testing, setTesting] = useState(false);
    const [result, setResult]   = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

    const runTest = async () => {
        if (!testUrl) return;
        setTesting(true); setResult(null);
        try {
            const r = await fetch(testUrl);
            setResult(await r.json());
        } catch (err) {
            setResult({ ok: false, error: (err as Error).message });
        } finally {
            setTesting(false);
        }
    };

    return (
        <Surface className="p-4">
            <div className="flex items-start gap-3">
                <span className="text-xl">{icon}</span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-zinc-100">{name}</p>
                        <Pill color={configured ? "green" : "yellow"}>
                            {configured ? "Set" : "Missing"}
                        </Pill>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                        <code className="text-zinc-400">{envKey}</code>
                        {hint && <span className="text-zinc-600 ml-2">{hint}</span>}
                    </p>
                    {extraInfo && <p className="text-[11px] text-zinc-500 mt-1">{extraInfo}</p>}
                    {result && (
                        <p className={`text-[11px] mt-2 ${result.ok ? "text-emerald-400" : "text-red-400"}`}>
                            {result.ok ? "✓ " + result.message : "✗ " + result.error}
                        </p>
                    )}
                </div>
                {testUrl && configured && (
                    <button onClick={runTest} disabled={testing}
                        className="text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-50 px-2 py-1 rounded-lg hover:bg-blue-500/10">
                        {testing ? "Testing…" : "Test"}
                    </button>
                )}
            </div>
        </Surface>
    );
}
