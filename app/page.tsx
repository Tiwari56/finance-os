"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import { fmt, fmtL } from "@/lib/format";
import {
    Surface, Pill, Money, ProgressBar, Collapsible, Input,
    Loading, EmptyState, DashboardSkeleton, useToast, apiFetch, apiPost, startOfDay,
    Icon, LogoMark,
    type StateData, type Bill, type Debt, type Expense, type Envelope,
} from "@/lib/ui";
import { avalanche } from "@/features/debts/lib/avalanche";
import { AIInsight, AIQuestion } from "@/features/advisor/components/AIInsight";
import { ConfigTab } from "@/features/config/components/ConfigTab";

// ════════════════════════════════════════════════════════════════════
//  Salary cycle math — derived once per render.
//  Income arrives on `salaryDay` each month. We treat the period from
//  the last salary credit to the next one as the "cycle". This drives
//  every header number (days-into-cycle, cycle progress, etc).
// ════════════════════════════════════════════════════════════════════
function salaryCycle(profile: StateData["profile"], allowance: StateData["allowance"]) {
    const now = new Date();
    const today = now.getDate();
    const m = now.getMonth();
    const y = now.getFullYear();
    const salaryDay = Math.min(profile.salaryDay ?? 1, 28);
    const lastSalary = today >= salaryDay
        ? new Date(y, m, salaryDay)
        : new Date(y, m - 1, salaryDay);
    const nextSalary = today >= salaryDay
        ? new Date(y, m + 1, salaryDay)
        : new Date(y, m, salaryDay);
    const totalDays = Math.round((nextSalary.getTime() - lastSalary.getTime()) / 86400000);
    const dayOfCycle = Math.max(1, Math.round((now.getTime() - lastSalary.getTime()) / 86400000) + 1);
    const daysLeft = Math.max(0, Math.round((nextSalary.getTime() - now.getTime()) / 86400000));
    const cyclePct = Math.min(100, Math.round((dayOfCycle / totalDays) * 100));
    const isSalaryDay = today === salaryDay;
    return {
        lastSalary, nextSalary, dayOfCycle, totalDays, daysLeft, cyclePct,
        isSalaryDay,
        nextSalaryStr: nextSalary.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    };
}

// ════════════════════════════════════════════════════════════════════
//  TODAY TAB
// ════════════════════════════════════════════════════════════════════
function TodayTab({ data }: { data: StateData }) {
    const qc = useQueryClient();
    const toast = useToast();
    const [showAddExpense, setShowAddExpense] = useState(false);
    const [payingBillId, setPayingBillId] = useState<string | null>(null);

    const payBill = useMutation({
        mutationFn: (body: unknown) => apiPost("/api/bills/pay", body),
        onSuccess: (res: { ok?: boolean; error?: string }) => {
            qc.invalidateQueries({ queryKey: ["state"] });
            if (res?.ok) toast("Bill marked paid ✓");
            else toast(res?.error ?? "Could not pay bill", "error");
        },
        onError: () => toast("Could not pay bill", "error"),
    });

    const { allowance, bills, expenses, debts, ious, goals, envelopes, profile, smartAllowance: smart } = data;
    const cycle = salaryCycle(profile, allowance);
    const urgent = bills.filter(b => b.overdue || b.dueSoon);
    const todayExp = expenses.recent.filter(e => e.ts >= startOfDay());
    const paidCount = bills.filter(b => b.paid).length;
    const billsRemaining = bills.filter(b => !b.paid).reduce((s, b) => s + b.amount, 0);

    // Envelope spent — sum expenses by envelope this cycle
    const envelopeSpent = computeEnvelopeSpent(envelopes, expenses.recent, cycle.lastSalary.getTime());

    return (
        <div className="space-y-3 pb-32 stagger-in">

            {/* ── Salary cycle hero ───────────────────────────────── */}
            <SalaryCycleHero cycle={cycle} allowance={allowance} profile={profile} billsRemaining={billsRemaining} smart={smart} />

            {/* ── Salary day celebration (only on day=1) ──────────── */}
            {cycle.isSalaryDay && (
                <Surface elevated className="p-4 !border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent">
                    <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-300 shrink-0">
                            <Icon name="banknote" size={20} />
                        </span>
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-emerald-300">Salary day</p>
                            <p className="text-[11px] text-emerald-200/70 mt-0.5">
                                Distribute {fmtL(profile.income)} across envelopes before today's first spend.
                            </p>
                        </div>
                    </div>
                </Surface>
            )}

            {/* ── Envelope strip — quick glance at each bucket ────── */}
            <EnvelopeStrip envelopes={envelopes} spent={envelopeSpent} />

            {/* ── Urgent attention ────────────────────────────────── */}
            {urgent.length > 0 && (
                <Surface className="p-4 !border-red-500/30 bg-gradient-to-br from-red-500/5 to-transparent">
                    <div className="flex items-center gap-2 mb-2.5 text-red-300">
                        <Icon name="alert-circle" size={16} strokeWidth={2} />
                        <p className="text-sm font-medium">
                            {urgent.length} bill{urgent.length > 1 ? "s" : ""} need{urgent.length === 1 ? "s" : ""} action
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        {urgent.map(b => (
                            <div key={b.id} className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm">{b.icon}</span>
                                    <span className="text-sm text-zinc-200 truncate">{b.label}</span>
                                    <Pill color={b.overdue ? "red" : "yellow"}>
                                        {b.overdue ? "overdue" : `day ${b.dueDay}`}
                                    </Pill>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-sm text-white tabular-nums">{fmt(b.amount)}</span>
                                    <button
                                        onClick={() => setPayingBillId(b.id)}
                                        className="btn-soft !text-[11px] !py-1 !px-2.5"
                                    >
                                        Pay
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Surface>
            )}

            {/* ── Debt Command Centre ─────────────────────────────── */}
            <DebtCommand debts={debts} envelopes={envelopes} envelopeSpent={envelopeSpent} cycle={cycle} />

            {/* ── AI insight ──────────────────────────────────────── */}
            <AIInsight compact />

            {/* ── Bills ────────────────────────────────────────────── */}
            <Collapsible
                title="Bills this month"
                icon={<Icon name="receipt" size={17} />}
                subtitle={`${paidCount} of ${bills.length} paid${billsRemaining > 0 ? ` · ${fmt(billsRemaining)} remaining` : ""}`}
                badge={paidCount === bills.length
                    ? <Pill color="green">All clear</Pill>
                    : <Pill color="zinc">{bills.length - paidCount} left</Pill>}
                defaultOpen
            >
                {bills.length === 0
                    ? <EmptyState icon="📋" title="No bills configured" hint="Add recurring bills in the Config tab." />
                    : (
                        <div className="divide-y divide-white/5">
                            {bills.map(b => (
                                <BillRow key={b.id} bill={b} onPay={() => setPayingBillId(b.id)} />
                            ))}
                        </div>
                    )}
            </Collapsible>

            {/* ── Today's log ──────────────────────────────────────── */}
            <Collapsible
                title="Today's expenses"
                icon={<Icon name="wallet" size={17} />}
                subtitle={`${todayExp.length} entries · ${fmt(allowance.todaySpent)}`}
                defaultOpen
            >
                {todayExp.length === 0
                    ? <EmptyState
                        icon="✨"
                        title="No expenses yet today"
                        hint="Tap + to log one, or wait for SMS automation."
                    />
                    : (
                        <div className="divide-y divide-white/5">
                            {todayExp.slice(0, 10).map(e => <ExpenseRow key={e.id} expense={e} />)}
                        </div>
                    )}
            </Collapsible>

            {/* ── IOUs ─────────────────────────────────────────────── */}
            {ious.open.length > 0 && (
                <Collapsible
                    title="Money owed to you"
                    icon={<Icon name="inbox" size={17} />}
                    subtitle={`${fmt(ious.totalOpen)} across ${ious.open.length} ${ious.open.length === 1 ? "person" : "people"}`}
                >
                    <div className="divide-y divide-white/5">
                        {ious.open.map(i => (
                            <div key={i.id} className="flex items-center justify-between py-2.5">
                                <div>
                                    <p className="text-sm text-zinc-200">{i.name}</p>
                                    {i.note && <p className="text-[11px] text-zinc-500">{i.note}</p>}
                                </div>
                                <span className="text-sm text-white tabular-nums">{fmt(i.amount)}</span>
                            </div>
                        ))}
                    </div>
                </Collapsible>
            )}

            {/* ── Goals ──────────────────────────────────────────── */}
            {goals.filter(g => g.needed > g.saved).map(g => {
                const pct = Math.min(100, (g.saved / g.needed) * 100);
                return (
                    <Surface key={g.id} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium text-zinc-200">{g.icon} {g.label}</p>
                            <p className="text-xs text-zinc-400 tabular-nums">
                                {fmt(g.saved)} <span className="text-zinc-600">/ {fmtL(g.needed)}</span>
                            </p>
                        </div>
                        <ProgressBar pct={pct} warn={50} danger={20} />
                        <p className="text-[11px] text-zinc-500 mt-2">{Math.round(pct)}% complete · {fmt(g.needed - g.saved)} to go</p>
                    </Surface>
                );
            })}

            {/* ── Floating + button ────────────────────────────────── */}
            <button
                onClick={() => setShowAddExpense(true)}
                className="fixed bottom-24 right-4 z-20 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-2xl pulse-glow transition-transform active:scale-95"
                style={{
                    background: "linear-gradient(135deg, #7d99ff 0%, #5b7cfa 60%, #8b5cf6 100%)",
                    border: "1px solid rgba(255,255,255,0.18)",
                }}
                aria-label="Add expense"
            >
                <Icon name="plus" size={24} strokeWidth={2.2} />
            </button>

            {showAddExpense && <AddExpenseSheet onClose={() => setShowAddExpense(false)} />}
            {payingBillId && (
                <PayBillSheet
                    bill={bills.find(b => b.id === payingBillId)!}
                    onClose={() => setPayingBillId(null)}
                    onSubmit={(amount, partial) => {
                        payBill.mutate({ billId: payingBillId, amount, partial });
                        setPayingBillId(null);
                    }}
                />
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════
//  SALARY CYCLE HERO
//  Replaces "spend today" with the bigger story: where are you in
//  the salary cycle, how much money is left, when does the next
//  salary arrive.
// ════════════════════════════════════════════════════════════════════
type Cycle = ReturnType<typeof salaryCycle>;
function SalaryCycleHero({
    cycle, allowance, profile, billsRemaining, smart,
}: {
    cycle: Cycle;
    allowance: StateData["allowance"];
    profile: StateData["profile"];
    billsRemaining: number;
    smart: StateData["smartAllowance"];
}) {
    // Map pace verdict → UI accent
    const accentMap: Record<typeof smart.pace.verdict, "good" | "warn" | "bad" | "good"> = {
        under: "good",
        "on-track": "good",
        watch: "warn",
        over: "bad",
    };
    const accent = accentMap[smart.pace.verdict];

    const verdictLabel: Record<typeof smart.pace.verdict, string> = {
        under: "Under pace",
        "on-track": "On track",
        watch: "Watch pace",
        over: "Burning fast",
    };

    const heroGradient = accent === "bad"
        ? "from-red-500/20 via-red-500/5 to-transparent"
        : accent === "warn"
            ? "from-yellow-500/15 via-yellow-500/5 to-transparent"
            : "from-emerald-500/15 via-emerald-500/5 to-transparent";

    return (
        <Surface elevated className="overflow-hidden relative">
            <div className={`absolute inset-0 bg-gradient-to-br ${heroGradient} pointer-events-none`} />
            <div className="relative p-5">
                {/* Salary cycle context strip */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Salary cycle</span>
                        <span className="text-[10px] text-zinc-600">·</span>
                        <span className="text-xs font-medium text-zinc-300 tabular-nums">
                            Day {cycle.dayOfCycle} <span className="text-zinc-600">of {cycle.totalDays}</span>
                        </span>
                    </div>
                    <Pill color={accent === "good" ? "green" : accent === "warn" ? "yellow" : "red"}>
                        {verdictLabel[smart.pace.verdict]}
                    </Pill>
                </div>

                {/* Big number: today's SMART allowance */}
                <p className="text-[11px] text-zinc-400 uppercase tracking-widest mb-1">You can spend today</p>
                <div className="flex items-baseline gap-3 mb-1">
                    <Money value={smart.suggestedToday} large accent={accent} />
                    <span className="text-xs text-zinc-500">
                        of {fmt(smart.smartPerDay)} smart-daily
                    </span>
                </div>

                {/* Why this number — one-line rationale */}
                <p className="text-[11px] text-zinc-500 mb-3 leading-relaxed">{smart.rationale}</p>

                {/* Cycle progress with payday marker */}
                <div className="relative">
                    <ProgressBar pct={smart.cycle.pctFlexGone} />
                    <div
                        className="absolute top-0 h-1.5 w-px bg-white/30"
                        style={{ left: `${smart.cycle.pctCycleGone}%` }}
                        title={`You should be at ~${smart.cycle.pctCycleGone}% by now`}
                    />
                </div>
                <div className="flex justify-between text-[11px] text-zinc-500 mt-2">
                    <span>{smart.cycle.pctFlexGone}% flex spent · {smart.cycle.pctCycleGone}% cycle gone</span>
                    <span>Payday in {cycle.daysLeft}d · {cycle.nextSalaryStr}</span>
                </div>

                {/* Quick metrics row */}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/5">
                    <Stat label="Income" value={fmtL(profile.income)} />
                    <Stat
                        label="Bills to pay"
                        value={billsRemaining > 0 ? fmt(billsRemaining) : "All clear"}
                        subtle={billsRemaining === 0}
                    />
                    <Stat label="Flex left" value={fmt(smart.safelyAvailableFlex)} subtle />
                </div>
            </div>
        </Surface>
    );
}

// ════════════════════════════════════════════════════════════════════
//  ENVELOPE STRIP
//  6 mini-cards (Survival, Food, Freedom, SIP, Debt, Emergency) with
//  remaining amount + sparkline. Tap to jump to envelope detail.
// ════════════════════════════════════════════════════════════════════
function EnvelopeStrip({ envelopes, spent }: { envelopes: Envelope[]; spent: Record<string, number> }) {
    if (envelopes.length === 0) return null;
    return (
        <Surface className="p-3">
            <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Envelopes this cycle</p>
                <span className="text-[10px] text-zinc-600">remaining</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {envelopes.map(e => {
                    const used = spent[e.key ?? e.id] ?? 0;
                    const remaining = Math.max(0, e.amount - used);
                    const pct = e.amount > 0 ? Math.min(100, (used / e.amount) * 100) : 0;
                    const color = pct > 90 ? "text-red-400" : pct > 70 ? "text-yellow-400" : "text-emerald-400";
                    return (
                        <div key={e.id} className="rounded-xl bg-black/20 border border-white/5 px-3 py-2.5">
                            <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-xs">{e.icon}</span>
                                <span className="text-[10px] text-zinc-400 truncate">{e.label}</span>
                            </div>
                            <p className={`text-sm font-semibold tabular-nums ${color}`}>{fmt(remaining)}</p>
                            <div className="h-0.5 rounded-full bg-white/5 overflow-hidden mt-1.5">
                                <div
                                    className={`h-full transition-all duration-500 ${pct > 90 ? "bg-red-500/70" : pct > 70 ? "bg-yellow-500/70" : "bg-emerald-500/70"}`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </Surface>
    );
}

// ════════════════════════════════════════════════════════════════════
//  DEBT COMMAND
//  Surfaces the data the user explicitly asked for: total outstanding,
//  paid this cycle, highest-interest debt (avalanche priority), and
//  a "debt-free ETA" projection if a debt envelope exists.
// ════════════════════════════════════════════════════════════════════
function DebtCommand({
    debts, envelopes, envelopeSpent, cycle,
}: { debts: StateData["debts"]; envelopes: Envelope[]; envelopeSpent: Record<string, number>; cycle: Cycle }) {
    const active = debts.list.filter(d => d.balance > 0);
    const totalCC = active.filter(d => d.type === "cc").reduce((s, d) => s + d.balance, 0);
    const totalFormal = active.filter(d => d.type === "formal").reduce((s, d) => s + d.balance, 0);
    const totalFriend = active.filter(d => d.type === "friend").reduce((s, d) => s + d.balance, 0);
    const sortedByRate = [...active].sort((a, b) => b.rate - a.rate);
    const priority = sortedByRate[0];

    const debtEnv = envelopes.find(e => (e.key ?? e.id) === "debt");
    const debtSpent = debtEnv ? envelopeSpent.debt ?? 0 : 0;
    const debtBudget = debtEnv?.amount ?? 0;
    const debtLeftThisCycle = Math.max(0, debtBudget - debtSpent);

    // Avalanche ETA: months to zero at current debt envelope rate
    const monthsToFree = debtBudget > 0 ? Math.ceil(debts.totalOutstanding / debtBudget) : null;

    if (active.length === 0) {
        return (
            <Surface className="p-4 !border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🎉</span>
                    <div>
                        <p className="text-sm font-semibold text-emerald-300">Debt-free</p>
                        <p className="text-[11px] text-emerald-200/70 mt-0.5">Now redirect that debt envelope to emergency / SIP / goals.</p>
                    </div>
                </div>
            </Surface>
        );
    }

    return (
        <Surface elevated className="overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/15 via-red-500/3 to-transparent pointer-events-none" />
            <div className="relative p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-red-300">
                        <Icon name="flame" size={15} strokeWidth={2} />
                        <span className="text-[11px] uppercase tracking-widest">Debt command</span>
                    </div>
                    {monthsToFree !== null && (
                        <Pill color={monthsToFree <= 12 ? "green" : monthsToFree <= 24 ? "yellow" : "red"}>
                            {monthsToFree}mo to free
                        </Pill>
                    )}
                </div>

                <div className="flex items-baseline gap-3 mb-3">
                    <p className="text-3xl font-bold text-red-400 tabular-nums tracking-tight">{fmtL(debts.totalOutstanding)}</p>
                    <span className="text-xs text-zinc-500">outstanding</span>
                </div>

                {/* Type breakdown */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                    <DebtSlice label="Cards" value={totalCC} color="red" priority />
                    <DebtSlice label="Loans" value={totalFormal} color="orange" />
                    <DebtSlice label="Friends" value={totalFriend} color="purple" />
                </div>

                {/* Highest-interest target */}
                {priority && priority.rate > 0 && (
                    <div className="rounded-xl bg-black/30 border border-red-500/15 px-3 py-2.5 mb-3">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] uppercase tracking-wider text-red-300 font-medium inline-flex items-center gap-1.5">
                                <Icon name="trending-down" size={12} strokeWidth={2.2} /> Avalanche target
                            </span>
                            <span className="text-[10px] text-zinc-500">attack first</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="min-w-0">
                                <p className="text-sm text-zinc-100 truncate">{priority.name}</p>
                                <p className="text-[11px] text-zinc-500">{priority.rate}% p.a.</p>
                            </div>
                            <p className="text-sm font-semibold text-white tabular-nums">{fmt(priority.balance)}</p>
                        </div>
                    </div>
                )}

                {/* This cycle's debt commitment */}
                <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-3 border-t border-white/5">
                    <span>This cycle: <span className="text-emerald-400 font-medium">{fmt(debts.monthPaid)}</span> paid</span>
                    {debtBudget > 0 && (
                        <span>{fmt(debtLeftThisCycle)} debt-envelope left · day {cycle.dayOfCycle}/{cycle.totalDays}</span>
                    )}
                </div>
            </div>
        </Surface>
    );
}

function DebtSlice({ label, value, color, priority }: { label: string; value: number; color: "red" | "orange" | "purple"; priority?: boolean }) {
    const colors = {
        red: { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-300" },
        orange: { bg: "bg-orange-500/10", border: "border-orange-500/20", text: "text-orange-300" },
        purple: { bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-300" },
    } as const;
    const c = colors[color];
    return (
        <div className={`rounded-xl ${c.bg} border ${c.border} px-3 py-2`}>
            <p className={`text-[10px] uppercase tracking-wider ${c.text} font-medium`}>{label}</p>
            <p className="text-sm font-semibold text-white tabular-nums mt-0.5">{value > 0 ? fmt(value) : "—"}</p>
            {priority && value > 0 && <p className="text-[9px] text-red-400/70 mt-0.5">highest cost</p>}
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════════
function computeEnvelopeSpent(envelopes: Envelope[], expenses: Expense[], sinceTs: number) {
    // Same category→envelope mapping the backend uses
    const CAT_TO_ENV: Record<string, string> = {
        food: "food",
        freedom: "freedom",
        rent: "survival",
        maintenance: "survival",
        subscriptions: "survival",
        family: "survival",
        furniture: "survival",
        commute: "survival",
        bills: "survival",
        sip: "sip",
        debt: "debt",
        renovation: "freedom",
        other: "freedom",
    };
    // Keyed by semantic envelope key ("food", "debt", …) — env ids are
    // namespaced per user, so always go through the key.
    const out: Record<string, number> = {};
    for (const env of envelopes) out[env.key ?? env.id] = 0;
    for (const e of expenses) {
        if (e.ts < sinceTs) continue;
        const envKey = CAT_TO_ENV[e.category] ?? "freedom";
        out[envKey] = (out[envKey] ?? 0) + e.amount;
    }
    return out;
}

function QuickStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
    return (
        <Surface className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-wider">
                {icon}
                <span className="truncate">{label}</span>
            </div>
            <p className={`text-sm font-semibold tabular-nums mt-1 ${color}`}>{value}</p>
        </Surface>
    );
}

function Stat({ label, value, subtle = false }: { label: string; value: string; subtle?: boolean }) {
    return (
        <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
            <p className={`text-sm font-medium tabular-nums ${subtle ? "text-zinc-400" : "text-white"} mt-0.5`}>{value}</p>
        </div>
    );
}

function BillRow({ bill, onPay }: { bill: Bill; onPay: () => void }) {
    return (
        <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
                <span className={`text-base ${bill.paid ? "opacity-50" : ""}`}>{bill.icon}</span>
                <div className="min-w-0">
                    <p className={`text-sm truncate ${bill.paid ? "text-zinc-500 line-through" : "text-zinc-200"}`}>
                        {bill.label}
                    </p>
                    <p className="text-[10px] text-zinc-600">Day {bill.dueDay}</p>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`text-sm tabular-nums ${bill.paid ? "text-zinc-500" : "text-white"}`}>{fmt(bill.amount)}</span>
                {!bill.paid && (
                    <button onClick={onPay} className="btn-soft !text-[11px] !py-1 !px-2.5">
                        Pay
                    </button>
                )}
                {bill.paid && <span className="text-emerald-400 text-base">✓</span>}
            </div>
        </div>
    );
}

function ExpenseRow({ expense }: { expense: Expense }) {
    const time = new Date(expense.ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    return (
        <div className="flex items-center justify-between py-2.5">
            <div className="min-w-0">
                <p className="text-sm text-zinc-200 truncate">{expense.merchant || "Unknown"}</p>
                <p className="text-[11px] text-zinc-500">{expense.category} · {time} · {expense.source}</p>
            </div>
            <span className="text-sm font-medium tabular-nums text-white shrink-0">{fmt(expense.amount)}</span>
        </div>
    );
}

// ─── Pay bill sheet (full vs partial) ─────────────────────────────
function PayBillSheet({ bill, onClose, onSubmit }: {
    bill: Bill;
    onClose: () => void;
    onSubmit: (amount: number, partial: boolean) => void;
}) {
    const [amount, setAmount] = useState(String(bill.amount));
    const partial = Number(amount) > 0 && Number(amount) < bill.amount;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 flex items-end fade-in" onClick={onClose}>
            <div className="surface-elev rounded-t-3xl w-full max-w-xl mx-auto p-6 space-y-4 slide-up" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-lg font-semibold text-white">Pay {bill.icon} {bill.label}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">Expected {fmt(bill.amount)}</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5">×</button>
                </div>

                <div>
                    <label className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5 block">Amount paid</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-lg">₹</span>
                        <Input
                            type="number"
                            inputMode="decimal"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            className="!pl-8 !text-2xl !font-semibold !tabular-nums"
                            autoFocus
                        />
                    </div>
                    {partial && (
                        <p className="text-[11px] text-yellow-400 mt-2">
                            ⚠ Partial — {fmt(bill.amount - Number(amount))} remaining for this bill
                        </p>
                    )}
                </div>

                <div className="flex gap-2">
                    <button onClick={() => setAmount(String(bill.amount))} className="btn-soft flex-1 !text-xs">
                        Full ({fmt(bill.amount)})
                    </button>
                    <button onClick={() => setAmount(String(Math.round(bill.amount / 2)))} className="btn-soft flex-1 !text-xs">
                        Half
                    </button>
                </div>

                <button
                    onClick={() => onSubmit(Number(amount), partial)}
                    disabled={!amount || Number(amount) <= 0}
                    className="btn-primary w-full !py-4 !text-base"
                >
                    {partial ? "Log partial payment" : "Mark fully paid"}
                </button>
            </div>
        </div>
    );
}

// ─── Add expense bottom sheet ─────────────────────────────────────
function AddExpenseSheet({ onClose }: { onClose: () => void }) {
    const qc = useQueryClient();
    const toast = useToast();
    const [amount, setAmount] = useState("");
    const [merchant, setMerchant] = useState("");
    const [category, setCategory] = useState("food");

    const log = useMutation({
        mutationFn: (body: unknown) => apiPost("/api/expenses/log", body),
        onSuccess: (res: { ok?: boolean; message?: string; error?: string }) => {
            qc.invalidateQueries({ queryKey: ["state"] });
            if (res?.ok) toast(res.message ?? "Expense logged ✓");
            else toast(res?.error ?? "Could not log expense", "error");
            onClose();
        },
        onError: () => toast("Could not log expense", "error"),
    });

    const CATEGORIES = [
        { id: "food", icon: "🍱", label: "Food" },
        { id: "freedom", icon: "🎯", label: "Lifestyle" },
        { id: "commute", icon: "🚇", label: "Commute" },
        { id: "subscriptions", icon: "📺", label: "Subs" },
        { id: "family", icon: "📱", label: "Family" },
        { id: "rent", icon: "🏠", label: "Rent" },
        { id: "maintenance", icon: "⚡", label: "Bills" },
        { id: "debt", icon: "💳", label: "Debt" },
        { id: "sip", icon: "📈", label: "SIP" },
        { id: "other", icon: "📦", label: "Other" },
    ];

    // Fix: the sheet must (a) stop short of the bottom nav so the button
    //  isn't covered, (b) be scrollable internally on small viewports, and
    //  (c) account for the iPhone safe-area inset.
    return (
        <div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end justify-center fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                className="surface-elev w-full max-w-xl rounded-t-3xl slide-up flex flex-col"
                style={{
                    // 100dvh handles the iOS viewport correctly. Cap at 90% so the
                    // backdrop is still visible above.
                    maxHeight: "min(90dvh, 720px)",
                    // Leave room for the bottom-nav. 64px nav + 16px breathing space.
                    paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* sticky header */}
                <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
                    <p className="text-lg font-semibold text-white">Add expense</p>
                    <button
                        onClick={onClose}
                        className="text-zinc-400 hover:text-white text-xl leading-none w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                {/* scrollable body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    <div>
                        <label className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5 block">Amount</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-lg">₹</span>
                            <Input
                                type="number"
                                inputMode="decimal"
                                placeholder="0"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                className="!pl-8 !text-2xl !font-semibold !tabular-nums"
                                autoFocus
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5 block">Merchant</label>
                        <Input
                            type="text"
                            placeholder="Where did you spend?"
                            value={merchant}
                            onChange={e => setMerchant(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5 block">Category</label>
                        <div className="grid grid-cols-5 gap-2">
                            {CATEGORIES.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setCategory(c.id)}
                                    className={`p-2 rounded-xl border text-center transition-all active:scale-95 ${category === c.id
                                        ? "border-blue-500/60 bg-blue-500/10"
                                        : "border-white/10 bg-black/20 hover:border-white/20"}`}
                                >
                                    <div className="text-xl">{c.icon}</div>
                                    <div className="text-[10px] text-zinc-400 mt-0.5 truncate">{c.label}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* sticky footer with the submit button — always visible */}
                <div className="px-5 py-4 border-t border-white/5 bg-black/30 shrink-0">
                    <button
                        onClick={() => log.mutate({ amount: Number(amount), merchant, category, source: "manual" })}
                        disabled={!amount || log.isPending}
                        className="btn-primary w-full !py-3.5 !text-base"
                    >
                        {log.isPending ? "Logging…" : `Log ₹${amount || "0"}`}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════
//  DEBTS TAB
// ════════════════════════════════════════════════════════════════════
function DebtsTab({ state }: { state: StateData }) {
    const qc = useQueryClient();
    const toast = useToast();
    const { data, isLoading } = useQuery({ queryKey: ["debts"], queryFn: () => apiFetch("/api/debts/list") });
    const pay = useMutation({
        mutationFn: (body: unknown) => apiPost("/api/debts/pay", body),
        onSuccess: (res: { ok?: boolean; error?: string }) => {
            qc.invalidateQueries({ queryKey: ["debts"] });
            qc.invalidateQueries({ queryKey: ["state"] });
            if (res?.ok) toast("⚔️ Debt payment recorded");
            else toast(res?.error ?? "Could not record payment", "error");
        },
        onError: () => toast("Could not record payment", "error"),
    });
    const [amounts, setAmounts] = useState<Record<string, string>>({});

    if (isLoading) return <Loading label="Loading debts…" />;
    const debts: Debt[] = data?.debts ?? [];
    const active = debts.filter(d => d.balance > 0);
    const settled = debts.filter(d => d.balance <= 0);
    const total = active.reduce((s, d) => s + d.balance, 0);
    const sortedByRate = [...active].sort((a, b) => b.rate - a.rate);
    const avalancheTarget = sortedByRate[0];

    const groups = [
        { key: "cc", label: "Credit cards", debts: active.filter(d => d.type === "cc") },
        { key: "formal", label: "Loans", debts: active.filter(d => d.type === "formal") },
        { key: "friend", label: "Friends & family", debts: active.filter(d => d.type === "friend") },
    ];

    return (
        <div className="space-y-4 pb-24 stagger-in">
            <Surface elevated className="p-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/15 to-transparent pointer-events-none" />
                <div className="relative">
                    <p className="text-[11px] uppercase tracking-widest text-zinc-400 mb-1">Total outstanding</p>
                    <p className="text-4xl font-bold text-red-400 tabular-nums tracking-tight">{fmtL(total)}</p>
                    <p className="text-xs text-zinc-500 mt-1">{active.length} active · {settled.length} settled</p>
                </div>
            </Surface>

            {/* Payoff projection — the "when am I free?" answer */}
            {active.length > 0 && <PayoffPlan debts={active} envelopes={state.envelopes} />}

            {/* Strategy guidance */}
            {avalancheTarget && avalancheTarget.rate > 0 && (
                <Surface className="p-4 !border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-transparent">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] uppercase tracking-widest text-yellow-300 inline-flex items-center gap-1.5">
                            <Icon name="trending-down" size={13} strokeWidth={2.2} /> Avalanche strategy
                        </span>
                        <Pill color="yellow">attack first</Pill>
                    </div>
                    <p className="text-sm text-zinc-200">Hit <strong>{avalancheTarget.name}</strong> ({avalancheTarget.rate}% p.a.) before any other. Every ₹1k cleared here saves the most interest.</p>
                </Surface>
            )}

            {groups.filter(g => g.debts.length > 0).map(g => (
                <section key={g.key}>
                    <div className="flex items-center justify-between px-1 mb-2">
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">{g.label}</p>
                        <p className="text-[11px] text-zinc-600 tabular-nums">{fmtL(g.debts.reduce((s, d) => s + d.balance, 0))}</p>
                    </div>
                    <div className="space-y-2">
                        {g.debts.map(d => (
                            <Surface key={d.id} className={`p-4 ${d.id === avalancheTarget?.id ? "!border-yellow-500/30" : ""}`}>
                                <div className="flex items-start justify-between mb-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-zinc-100 truncate flex items-center gap-2">
                                            {d.name}
                                            {d.id === avalancheTarget?.id && <Pill color="yellow">priority</Pill>}
                                        </p>
                                        <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                                            {d.rate > 0 && <span>{d.rate}% p.a.</span>}
                                            {d.emi > 0 && <span>· EMI {fmt(d.emi)}</span>}
                                        </div>
                                    </div>
                                    <p className="text-lg font-bold text-white tabular-nums shrink-0">{fmt(d.balance)}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        placeholder={`${fmt(d.emi || Math.round(d.balance / 6))}`}
                                        value={amounts[d.id] ?? ""}
                                        onChange={e => setAmounts(p => ({ ...p, [d.id]: e.target.value }))}
                                        className="!py-2.5"
                                    />
                                    <button
                                        onClick={() => {
                                            const amt = Number(amounts[d.id]);
                                            if (!amt) return;
                                            pay.mutate({ debtId: d.id, amount: amt });
                                            setAmounts(p => ({ ...p, [d.id]: "" }));
                                        }}
                                        className="btn-success shrink-0"
                                    >
                                        Pay
                                    </button>
                                </div>
                            </Surface>
                        ))}
                    </div>
                </section>
            ))}

            {settled.length > 0 && (
                <section>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium px-1 mb-2">Settled</p>
                    <Surface className="divide-y divide-white/5">
                        {settled.map(d => (
                            <div key={d.id} className="flex items-center justify-between px-4 py-2.5">
                                <span className="text-sm text-zinc-500 line-through">{d.name}</span>
                                <Pill color="green">Paid off</Pill>
                            </div>
                        ))}
                    </Surface>
                </section>
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════
//  PAYOFF PLAN
//  Runs the avalanche projection client-side and answers the real
//  question: "when am I debt-free, and what does paying more buy me?"
// ════════════════════════════════════════════════════════════════════
function PayoffPlan({ debts, envelopes }: { debts: Debt[]; envelopes: Envelope[] }) {
    const totalEmi = debts.reduce((s, d) => s + (d.emi || 0), 0);
    const debtEnv = envelopes.find(e => (e.key ?? e.id) === "debt");
    const defaultBudget = Math.max(totalEmi, debtEnv?.amount ?? 0) || Math.round(debts.reduce((s, d) => s + d.balance, 0) / 12);
    const [budget, setBudget] = useState(defaultBudget);

    const minBudget = Math.max(1000, totalEmi);
    const maxBudget = Math.max(minBudget * 3, defaultBudget * 2);

    const snapshots = debts.map(d => ({ id: d.id, name: d.name, balance: d.balance, rate: d.rate, emi: d.emi, type: d.type }));
    const plan = avalanche(snapshots, budget);
    const baseline = avalanche(snapshots, defaultBudget);

    const startTotal = debts.reduce((s, d) => s + d.balance, 0);
    const freeDate = new Date();
    freeDate.setMonth(freeDate.getMonth() + plan.months);
    const freeDateStr = freeDate.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    const stuck = plan.months >= 120;  // interest outruns the payment

    // Approximate interest paid: total outflow minus starting principal
    const interestPaid = Math.max(0, plan.months * budget - startTotal);
    const monthsSaved = baseline.months - plan.months;

    // Payoff order — month each debt hits zero
    const payoffEvents = plan.hist.flatMap(h => h.payoffs.map(name => ({ name, month: h.month })));

    // Sparkline of total balance over time
    const sparkPoints = (() => {
        const pts = plan.hist.map(h => h.total);
        if (pts.length < 2) return "";
        const max = Math.max(...pts, 1);
        const w = 100, h = 28;
        return pts
            .map((v, i) => `${((i / (pts.length - 1)) * w).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
            .join(" ");
    })();

    return (
        <Surface elevated className="overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-emerald-500/3 to-transparent pointer-events-none" />
            <div className="relative p-5">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] uppercase tracking-widest text-emerald-300 inline-flex items-center gap-1.5">
                        <Icon name="calendar" size={13} strokeWidth={2.2} /> Payoff plan
                    </span>
                    <Pill color={stuck ? "red" : plan.months <= 12 ? "green" : plan.months <= 24 ? "yellow" : "zinc"}>
                        {stuck ? "payment too low" : `${plan.months} months`}
                    </Pill>
                </div>

                {stuck ? (
                    <p className="text-sm text-red-300 mb-3">
                        At {fmt(budget)}/mo interest grows faster than you pay. Raise the slider to see a real payoff date.
                    </p>
                ) : (
                    <div className="flex items-baseline gap-3 mb-1">
                        <p className="text-3xl font-bold text-emerald-400 tracking-tight">{freeDateStr}</p>
                        <span className="text-xs text-zinc-500">debt-free date</span>
                    </div>
                )}

                {!stuck && (
                    <p className="text-[11px] text-zinc-500 mb-3">
                        ≈ {fmt(interestPaid)} interest along the way
                        {monthsSaved > 0 && <span className="text-emerald-400"> · {monthsSaved}mo faster than your current plan</span>}
                        {monthsSaved < 0 && <span className="text-yellow-400"> · {-monthsSaved}mo slower than your current plan</span>}
                    </p>
                )}

                {/* Balance decline sparkline */}
                {sparkPoints && !stuck && (
                    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-10 mb-3">
                        <polyline
                            points={`0,28 ${sparkPoints} 100,28`}
                            fill="rgba(63,166,106,0.12)"
                            stroke="none"
                        />
                        <polyline
                            points={sparkPoints}
                            fill="none"
                            stroke="#3FA66A"
                            strokeWidth="1.2"
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>
                )}

                {/* Monthly budget slider */}
                <div className="mb-1">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-zinc-400">Monthly attack budget</span>
                        <span className="text-white font-semibold tabular-nums">{fmt(budget)}</span>
                    </div>
                    <input
                        type="range"
                        min={minBudget}
                        max={maxBudget}
                        step={1000}
                        value={Math.min(budget, maxBudget)}
                        onChange={e => setBudget(Number(e.target.value))}
                        className="w-full accent-emerald-500"
                        aria-label="Monthly debt payment budget"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-600">
                        <span>EMIs only · {fmt(minBudget)}</span>
                        <span>{fmt(maxBudget)}</span>
                    </div>
                </div>

                {/* Payoff order timeline */}
                {payoffEvents.length > 0 && !stuck && (
                    <div className="pt-3 mt-2 border-t border-white/5 space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Payoff order (avalanche)</p>
                        {payoffEvents.map((p, i) => (
                            <div key={`${p.name}-${p.month}`} className="flex items-center gap-2.5 text-xs">
                                <span className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-center text-[10px] font-semibold shrink-0">
                                    {i + 1}
                                </span>
                                <span className="text-zinc-300 truncate flex-1">{p.name}</span>
                                <span className="text-zinc-500 tabular-nums shrink-0">month {p.month}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Surface>
    );
}

// ════════════════════════════════════════════════════════════════════
//  OVERVIEW TAB
//  Not just "today" — the full picture: cycle progress, spending mix,
//  debt status, top merchants, net wealth. This is your at-a-glance
//  "how am I doing?" view.
// ════════════════════════════════════════════════════════════════════
function OverviewTab({ data }: { data: StateData }) {
    const { profile, smartAllowance: smart, debts, ious, overview, envelopes, expenses } = data;
    const total = overview.cycleSpendByCategory.reduce((s, c) => s + c.amount, 0);

    return (
        <div className="space-y-3 pb-32 stagger-in">
            {/* ── Health header ─────────────────────────────────── */}
            <Surface elevated className="overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/15 via-blue-500/3 to-transparent pointer-events-none" />
                <div className="relative p-5">
                    <p className="text-[11px] text-zinc-400 uppercase tracking-widest mb-2">Financial overview</p>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Monthly income</p>
                            <Money value={profile.income} large />
                        </div>
                        <div>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Outstanding debt</p>
                            <p className="text-2xl font-bold text-red-400 tabular-nums">{fmtL(debts.totalOutstanding)}</p>
                        </div>
                    </div>

                    {/* Cycle pace bar */}
                    <div className="pt-3 border-t border-white/5">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-zinc-400">Cycle pace</span>
                            <span className="text-zinc-300 tabular-nums">
                                Day {smart.cycle.dayOfCycle}/{smart.cycle.daysInCycle} · {smart.cycle.pctFlexGone}% flex spent
                            </span>
                        </div>
                        <div className="relative">
                            <ProgressBar pct={smart.cycle.pctFlexGone} />
                            <div className="absolute top-0 h-1.5 w-px bg-white/30" style={{ left: `${smart.cycle.pctCycleGone}%` }} />
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-2">{smart.rationale}</p>
                    </div>
                </div>
            </Surface>

            {/* ── Three big totals ────────────────────────────── */}
            <div className="grid grid-cols-3 gap-2">
                <QuickStat icon={<Icon name="trending-down" size={13} />} label="Spent (cycle)" value={fmt(total)} color="text-white" />
                <QuickStat icon={<Icon name="check" size={13} />} label="Debt paid" value={fmt(debts.monthPaid)} color="text-emerald-400" />
                <QuickStat icon={<Icon name="inbox" size={13} />} label="Owed to you" value={fmt(ious.totalOpen)} color="text-blue-400" />
            </div>

            {/* ── Cycle spend by category ─────────────────────── */}
            <Collapsible
                title="Where this cycle's money went"
                icon={<Icon name="pie-chart" size={17} />}
                subtitle={`${overview.cycleSpendByCategory.length} categories · ${fmt(total)} total`}
                defaultOpen
            >
                {overview.cycleSpendByCategory.length === 0 ? (
                    <EmptyState icon="🌱" title="Cycle just started" hint="As you spend, the mix will appear here." />
                ) : (
                    <div className="space-y-2 pt-2">
                        {overview.cycleSpendByCategory.map(c => {
                            const pct = total > 0 ? (c.amount / total) * 100 : 0;
                            return (
                                <div key={c.category} className="flex items-center gap-3">
                                    <span className="text-base">{c.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-zinc-300 truncate">{c.label}</span>
                                            <span className="text-xs text-white tabular-nums shrink-0">{fmt(c.amount)}</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                            <div className="h-full bg-blue-500/60" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-zinc-500 tabular-nums w-9 text-right shrink-0">{Math.round(pct)}%</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Collapsible>

            {/* ── Top merchants ──────────────────────────────── */}
            <Collapsible
                title="Top merchants this cycle"
                icon={<Icon name="search" size={17} />}
                subtitle={`${overview.topMerchants.length} merchants`}
            >
                {overview.topMerchants.length === 0 ? (
                    <EmptyState icon="🛒" title="No merchant data yet" hint="As your SMS/manual entries come in, they'll rank here." />
                ) : (
                    <div className="divide-y divide-white/5">
                        {overview.topMerchants.map((m, i) => (
                            <div key={m.merchant} className="flex items-center justify-between py-2.5">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[10px] text-zinc-600 tabular-nums w-5">#{i + 1}</span>
                                    <span className="text-sm text-zinc-200 truncate">{m.merchant}</span>
                                </div>
                                <span className="text-sm text-white tabular-nums shrink-0">{fmt(m.amount)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </Collapsible>

            {/* ── Debt breakdown ─────────────────────────────── */}
            <Collapsible
                title="Debt breakdown"
                icon={<Icon name="credit-card" size={17} />}
                subtitle={`${debts.list.filter(d => d.balance > 0).length} active · ${fmtL(debts.totalOutstanding)} outstanding`}
            >
                <div className="space-y-2 pt-2">
                    {(["cc", "formal", "friend"] as const).map(type => {
                        const amount = debts.byType[type];
                        if (!amount) return null;
                        const label = type === "cc" ? "Credit cards" : type === "formal" ? "Loans" : "Friends & family";
                        const pct = debts.totalOutstanding > 0 ? (amount / debts.totalOutstanding) * 100 : 0;
                        return (
                            <div key={type} className="flex items-center gap-3">
                                <span className="text-xs text-zinc-300 w-32 truncate">{label}</span>
                                <div className="flex-1">
                                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                        <div className="h-full bg-red-500/60" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                                <span className="text-xs text-white tabular-nums w-16 text-right">{fmt(amount)}</span>
                            </div>
                        );
                    })}
                </div>
            </Collapsible>

            {/* ── Envelopes status ───────────────────────────── */}
            <Collapsible
                title="Envelopes"
                icon={<Icon name="wallet" size={17} />}
                subtitle={`${envelopes.length} envelopes · ${fmt(envelopes.reduce((s, e) => s + e.amount, 0))} total budget`}
            >
                <div className="space-y-2 pt-2">
                    {envelopes.map(e => (
                        <div key={e.id} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2">
                                <span className="text-base">{e.icon}</span>
                                <span className="text-sm text-zinc-300">{e.label}</span>
                                {e.locked && <Pill color="zinc">locked</Pill>}
                            </div>
                            <span className="text-sm text-white tabular-nums">{fmt(e.amount)}</span>
                        </div>
                    ))}
                </div>
            </Collapsible>

            {/* ── Helpful explainer ──────────────────────────── */}
            <Surface className="p-4 bg-gradient-to-br from-blue-500/5 to-transparent">
                <p className="text-[11px] uppercase tracking-wider text-blue-300 font-medium mb-1.5">How "spend today" is calculated</p>
                <p className="text-[12px] text-zinc-400 leading-relaxed">
                    We start from your flex budget (Food + Freedom envelopes), divide what's left by the days remaining in your salary cycle,
                    then adjust based on your pace so far. If you're burning fast we trim today's limit; if you're under-spending we relax it.
                    Bills, debt EMIs and SIPs are deducted separately so they never eat into your daily allowance.
                </p>
            </Surface>

            {/* small breathing room */}
            <div className="h-4" />
            <p className="text-center text-[10px] text-zinc-600">
                Most recent expense: {expenses.recent[0]
                    ? `${fmt(expenses.recent[0].amount)} at ${expenses.recent[0].merchant || "unknown"}`
                    : "none yet"}
            </p>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════
//  HISTORY TAB
//  Searchable, filterable log of EVERY expense ever, grouped by day.
// ════════════════════════════════════════════════════════════════════
function HistoryTab() {
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<string>("");
    const [range, setRange] = useState<"7d" | "30d" | "90d" | "all">("30d");

    const now = Date.now();
    const fromMs = range === "all" ? null
        : range === "7d" ? now - 7 * 86_400_000
            : range === "30d" ? now - 30 * 86_400_000
                : range === "90d" ? now - 90 * 86_400_000
                    : null;

    const params = new URLSearchParams({ groupBy: "day", limit: "200" });
    if (fromMs) params.set("from", String(fromMs));
    if (category) params.set("category", category);
    if (query) params.set("merchant", query);

    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ["history-list", range, category, query],
        queryFn: () => apiFetch(`/api/expenses/list?${params.toString()}`),
    });

    if (isLoading) return <Loading />;

    const days: Array<{ date: string; total: number; count: number; items: Array<Expense & { categoryMeta: { label: string; icon: string } }> }> = data?.days ?? [];
    const grandTotal = days.reduce((s, d) => s + d.total, 0);
    const grandCount = days.reduce((s, d) => s + d.count, 0);

    const CATS = [
        { id: "", label: "All" },
        { id: "food", label: "🍱 Food" },
        { id: "freedom", label: "🎯 Lifestyle" },
        { id: "commute", label: "🚇 Commute" },
        { id: "subscriptions", label: "📺 Subs" },
        { id: "family", label: "📱 Family" },
        { id: "rent", label: "🏠 Rent" },
        { id: "maintenance", label: "⚡ Bills" },
        { id: "debt", label: "💳 Debt" },
        { id: "sip", label: "📈 SIP" },
        { id: "other", label: "📦 Other" },
    ];

    return (
        <div className="space-y-3 pb-28 stagger-in">
            {/* Filters */}
            <Surface className="p-3 space-y-2">
                <Input
                    type="search"
                    placeholder="Search by merchant…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
                <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
                    {(["7d", "30d", "90d", "all"] as const).map(r => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`text-[11px] px-2.5 py-1 rounded-full transition-all shrink-0 ${range === r
                                ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                                : "bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10"}`}
                        >
                            {r === "7d" ? "Last 7 days" : r === "30d" ? "Last 30 days" : r === "90d" ? "Last 90 days" : "All time"}
                        </button>
                    ))}
                </div>
                <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
                    {CATS.map(c => (
                        <button
                            key={c.id}
                            onClick={() => setCategory(c.id)}
                            className={`text-[11px] px-2.5 py-1 rounded-full transition-all shrink-0 whitespace-nowrap ${category === c.id
                                ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                                : "bg-white/5 text-zinc-500 border border-white/10 hover:bg-white/10"}`}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            </Surface>

            {/* Summary strip */}
            <div className="flex items-center justify-between px-1 text-[11px] text-zinc-500">
                <span>
                    {grandCount} expense{grandCount === 1 ? "" : "s"} · {days.length} day{days.length === 1 ? "" : "s"}
                </span>
                <span className="tabular-nums">Total: <strong className="text-white">{fmt(grandTotal)}</strong></span>
                <button
                    onClick={() => refetch()}
                    className="text-zinc-400 hover:text-white"
                    aria-label="Refresh"
                >
                    {isFetching ? "⟳" : "↻"}
                </button>
            </div>

            {/* Day groups */}
            {days.length === 0 ? (
                <EmptyState
                    icon="📜"
                    title="Nothing here yet"
                    hint={query || category ? "Try clearing filters." : "Log your first expense to start the log."}
                />
            ) : (
                days.map(d => {
                    const date = new Date(d.date + "T00:00:00");
                    const label = date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
                    return (
                        <Surface key={d.date} className="overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.02] border-b border-white/5">
                                <span className="text-xs font-medium text-zinc-300">{label}</span>
                                <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                                    <span>{d.count} {d.count === 1 ? "entry" : "entries"}</span>
                                    <span className="tabular-nums text-white font-medium">{fmt(d.total)}</span>
                                </div>
                            </div>
                            <div className="divide-y divide-white/5">
                                {d.items.map(e => (
                                    <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <span className="text-base">{e.categoryMeta.icon}</span>
                                            <div className="min-w-0">
                                                <p className="text-sm text-zinc-200 truncate">{e.merchant || "Unknown"}</p>
                                                <p className="text-[10.5px] text-zinc-500">
                                                    {e.categoryMeta.label} · {new Date(e.ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                                                    {e.source && e.source !== "manual" && <span> · {e.source}</span>}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-sm font-medium tabular-nums text-white shrink-0">{fmt(e.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        </Surface>
                    );
                })
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════
//  ADVISOR TAB
// ════════════════════════════════════════════════════════════════════
function AdvisorTab() {
    return (
        <div className="space-y-4 pb-24 stagger-in">
            <AIInsight />
            <AIQuestion />
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════
//  ROOT
// ════════════════════════════════════════════════════════════════════
const TABS = [
    { id: "today", label: "Today", icon: "home" },
    { id: "overview", label: "Overview", icon: "pie-chart" },
    { id: "history", label: "History", icon: "clock" },
    { id: "debts", label: "Debts", icon: "credit-card" },
    { id: "advisor", label: "Coach", icon: "sparkles" },
    { id: "config", label: "Settings", icon: "sliders" },
] as const;

type TabId = typeof TABS[number]["id"];

export default function Home() {
    const [tab, setTab] = useState<TabId>("today");
    const { data: session } = useSession();
    const { data: stateData, isLoading } = useQuery<StateData>({
        queryKey: ["state"],
        queryFn: () => apiFetch("/api/v2/state"),
        refetchInterval: 60_000,
    });

    const dbReady = stateData?.ok === true;
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });

    return (
        <div className="min-h-screen relative">
            {/* Top bar */}
            <header className="sticky top-0 z-20 backdrop-blur-xl bg-[#0a0a0c]/75 border-b border-white/[0.06]">
                <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <LogoMark size={36} />
                        <div>
                            <p className="text-[15px] font-semibold text-white leading-tight tracking-tight">Finance OS</p>
                            <p className="text-[11px] text-zinc-500 leading-tight mt-0.5">{dateStr}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* User chip — shows name on sm+, avatar on xs */}
                        <div className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08]">
                            {session?.user?.image ? (
                                <img
                                    src={session.user.image}
                                    alt={session.user.name ?? ""}
                                    className="w-6 h-6 rounded-full border border-white/20"
                                />
                            ) : (
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-[11px] font-semibold text-white">
                                    {session?.user?.name?.charAt(0)?.toUpperCase() ?? "?"}
                                </div>
                            )}
                            <span className="text-xs font-medium text-zinc-300 max-w-[110px] truncate">
                                {session?.user?.name ?? session?.user?.email ?? "Signed in"}
                            </span>
                        </div>
                        <button
                            onClick={() => signOut({ callbackUrl: "/login" })}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] transition-colors"
                            title="Sign out"
                            aria-label="Sign out"
                        >
                            <Icon name="log-out" size={16} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-3xl mx-auto px-4 pt-4 relative z-10">
                {isLoading && <DashboardSkeleton />}
                {!isLoading && !dbReady && <DBNotReady />}
                {!isLoading && dbReady && stateData && (
                    <>
                        {tab === "today" && <TodayTab data={stateData} />}
                        {tab === "overview" && <OverviewTab data={stateData} />}
                        {tab === "history" && <HistoryTab />}
                        {tab === "debts" && <DebtsTab state={stateData} />}
                        {tab === "advisor" && <AdvisorTab />}
                        {tab === "config" && <ConfigTab data={stateData} />}
                    </>
                )}
            </main>

            {/* Bottom nav */}
            <nav
                className="fixed bottom-0 left-0 right-0 z-20 backdrop-blur-xl bg-[#0a0a0c]/85 border-t border-white/[0.06]"
                style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
            >
                <div className="max-w-3xl mx-auto px-2 py-1.5 flex">
                    {TABS.map(t => {
                        const active = tab === t.id;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                className={`flex-1 flex flex-col items-center justify-center py-2 gap-1 transition-all relative ${active ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                                aria-current={active ? "page" : undefined}
                            >
                                <span className={`flex items-center justify-center w-12 h-7 rounded-full transition-all duration-300 ${active ? "bg-[#5b7cfa]/25 text-[#9db4ff]" : ""}`}>
                                    <Icon name={t.icon} size={19} strokeWidth={active ? 2 : 1.7} />
                                </span>
                                <span className={`text-[10px] leading-none transition-colors ${active ? "font-semibold text-zinc-200" : "font-medium"}`}>{t.label}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}

function DBNotReady() {
    return (
        <Surface elevated className="p-6 my-6">
            <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">⚠️</span>
                <p className="text-base font-semibold text-yellow-400">Database not set up</p>
            </div>
            <p className="text-sm text-zinc-400 mb-3">Run the migration to set up the new SQLite backend:</p>
            <code className="block text-xs bg-black/40 px-4 py-3 rounded-xl text-emerald-400 font-mono border border-white/5">
                npm run migrate-json
            </code>
        </Surface>
    );
}
