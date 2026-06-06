"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import { fmt, fmtL } from "@/lib/format";
import {
    Surface, Pill, Money, ProgressBar, Collapsible, Input,
    Loading, EmptyState, apiFetch, apiPost, startOfDay,
    type StateData, type Bill, type Debt, type Expense, type Envelope,
} from "@/lib/ui";
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
    const [showAddExpense, setShowAddExpense] = useState(false);
    const [payingBillId, setPayingBillId] = useState<string | null>(null);

    const payBill = useMutation({
        mutationFn: (body: unknown) => apiPost("/api/bills/pay", body),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["state"] }),
    });

    const { allowance, bills, expenses, debts, ious, goals, envelopes, profile } = data;
    const cycle = salaryCycle(profile, allowance);
    const urgent = bills.filter(b => b.overdue || b.dueSoon);
    const todayExp = expenses.recent.filter(e => e.ts >= startOfDay());
    const paidCount = bills.filter(b => b.paid).length;
    const billsRemaining = bills.filter(b => !b.paid).reduce((s, b) => s + b.amount, 0);

    // Envelope spent — sum expenses by envelope this cycle
    const envelopeSpent = computeEnvelopeSpent(envelopes, expenses.recent, cycle.lastSalary.getTime());

    return (
        <div className="space-y-3 pb-32 fade-in">

            {/* ── Salary cycle hero ───────────────────────────────── */}
            <SalaryCycleHero cycle={cycle} allowance={allowance} profile={profile} billsRemaining={billsRemaining} />

            {/* ── Salary day celebration (only on day=1) ──────────── */}
            {cycle.isSalaryDay && (
                <Surface elevated className="p-4 !border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">💎</span>
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-emerald-300">Salary day!</p>
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
                    <div className="flex items-center gap-2 mb-2.5">
                        <span className="text-base">🔴</span>
                        <p className="text-sm font-medium text-red-300">
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
                icon="📋"
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
                icon="📝"
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
                    icon="📥"
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
                className="fixed bottom-20 right-4 z-20 w-14 h-14 rounded-full text-white text-2xl font-light shadow-2xl pulse-glow transition-transform active:scale-95"
                style={{ background: "linear-gradient(135deg, #4d8cff 0%, #2563eb 100%)" }}
                aria-label="Add expense"
            >
                +
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
    cycle, allowance, profile, billsRemaining,
}: { cycle: Cycle; allowance: StateData["allowance"]; profile: StateData["profile"]; billsRemaining: number }) {
    const accent = allowance.pctBudgetGone > 80 ? "bad" : allowance.pctBudgetGone > 60 ? "warn" : "good";
    const heroGradient = accent === "bad"
        ? "from-red-500/20 via-red-500/5 to-transparent"
        : accent === "warn"
            ? "from-yellow-500/15 via-yellow-500/5 to-transparent"
            : "from-emerald-500/15 via-emerald-500/5 to-transparent";

    const remainingToday = Math.max(0, allowance.perDay - allowance.todaySpent);

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
                        {accent === "good" ? "On track" : accent === "warn" ? "Watch pace" : "Burning fast"}
                    </Pill>
                </div>

                {/* Big number: today's allowance left */}
                <p className="text-[11px] text-zinc-400 uppercase tracking-widest mb-1">You can spend today</p>
                <div className="flex items-baseline gap-3 mb-3">
                    <Money value={remainingToday} large accent={accent as "good" | "warn" | "bad"} />
                    <span className="text-xs text-zinc-500">of {fmt(allowance.perDay)} daily</span>
                </div>

                {/* Cycle progress with payday marker */}
                <div className="relative">
                    <ProgressBar pct={allowance.pctBudgetGone} />
                    {/* "where we should be" marker line */}
                    <div
                        className="absolute top-0 h-1.5 w-px bg-white/30"
                        style={{ left: `${cycle.cyclePct}%` }}
                        title={`You should be at ~${cycle.cyclePct}% by now`}
                    />
                </div>
                <div className="flex justify-between text-[11px] text-zinc-500 mt-2">
                    <span>{allowance.pctBudgetGone}% flex spent</span>
                    <span>Payday in {cycle.daysLeft}d · {cycle.nextSalaryStr}</span>
                </div>

                {/* Quick metrics row */}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/5">
                    <Stat label="Income" value={fmtL(profile.income)} />
                    <Stat label="Bills to pay" value={billsRemaining > 0 ? fmt(billsRemaining) : "All clear"} subtle={billsRemaining === 0} />
                    <Stat label="Flex left" value={fmt(allowance.remaining)} subtle />
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
                    const used = spent[e.id] ?? 0;
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

    const debtEnv = envelopes.find(e => e.id === "debt");
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
                    <div className="flex items-center gap-2">
                        <span className="text-base">⚔️</span>
                        <span className="text-[11px] uppercase tracking-widest text-red-300">Debt command</span>
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
                            <span className="text-[10px] uppercase tracking-wider text-red-300 font-medium">
                                💀 Avalanche target
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
    const out: Record<string, number> = {};
    for (const env of envelopes) out[env.id] = 0;
    for (const e of expenses) {
        if (e.ts < sinceTs) continue;
        const envId = CAT_TO_ENV[e.category] ?? "freedom";
        out[envId] = (out[envId] ?? 0) + e.amount;
    }
    return out;
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
    const [amount, setAmount] = useState("");
    const [merchant, setMerchant] = useState("");
    const [category, setCategory] = useState("food");

    const log = useMutation({
        mutationFn: (body: unknown) => apiPost("/api/expenses/log", body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["state"] }); onClose(); },
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

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 flex items-end fade-in"
            onClick={onClose}
        >
            <div
                className="surface-elev rounded-t-3xl w-full max-w-xl mx-auto p-6 space-y-4 slide-up"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold text-white">Add expense</p>
                    <button
                        onClick={onClose}
                        className="text-zinc-500 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5"
                    >
                        ×
                    </button>
                </div>

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

                <button
                    onClick={() => log.mutate({ amount: Number(amount), merchant, category, source: "manual" })}
                    disabled={!amount || log.isPending}
                    className="btn-primary w-full !py-4 !text-base"
                >
                    {log.isPending ? "Logging…" : `Log ₹${amount || "0"}`}
                </button>
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════
//  DEBTS TAB
// ════════════════════════════════════════════════════════════════════
function DebtsTab() {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({ queryKey: ["debts"], queryFn: () => apiFetch("/api/debts/list") });
    const pay = useMutation({
        mutationFn: (body: unknown) => apiPost("/api/debts/pay", body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["debts"] }); qc.invalidateQueries({ queryKey: ["state"] }); },
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
        { key: "cc", label: "💳 Credit cards", debts: active.filter(d => d.type === "cc") },
        { key: "formal", label: "🏦 Loans", debts: active.filter(d => d.type === "formal") },
        { key: "friend", label: "🤝 Friends", debts: active.filter(d => d.type === "friend") },
    ];

    return (
        <div className="space-y-4 pb-24 fade-in">
            <Surface elevated className="p-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/15 to-transparent pointer-events-none" />
                <div className="relative">
                    <p className="text-[11px] uppercase tracking-widest text-zinc-400 mb-1">Total outstanding</p>
                    <p className="text-4xl font-bold text-red-400 tabular-nums tracking-tight">{fmtL(total)}</p>
                    <p className="text-xs text-zinc-500 mt-1">{active.length} active · {settled.length} settled</p>
                </div>
            </Surface>

            {/* Strategy guidance */}
            {avalancheTarget && avalancheTarget.rate > 0 && (
                <Surface className="p-4 !border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-transparent">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] uppercase tracking-widest text-yellow-300">💀 Avalanche strategy</span>
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
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium px-1 mb-2">✓ Settled</p>
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
//  HISTORY TAB
// ════════════════════════════════════════════════════════════════════
function HistoryTab() {
    const [months, setMonths] = useState(6);
    const { data, isLoading } = useQuery({
        queryKey: ["history", months],
        queryFn: () => apiFetch(`/api/history?months=${months}`),
    });

    if (isLoading) return <Loading />;

    const ms = (data?.months ?? []) as Array<{ label: string; spent: number; debtPaid: number; isCurrent: boolean }>;
    const maxVal = Math.max(...ms.map(m => m.spent + m.debtPaid), 1);

    return (
        <div className="space-y-4 pb-24 fade-in">
            <div className="flex gap-2 overflow-x-auto">
                {[3, 6, 12, 24].map(m => (
                    <button
                        key={m}
                        onClick={() => setMonths(m)}
                        className={`text-xs px-3 py-1.5 rounded-full transition-all shrink-0 ${months === m
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                            : "bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10"}`}
                    >
                        Last {m}mo
                    </button>
                ))}
            </div>

            {ms.length === 0
                ? <EmptyState icon="📊" title="No history yet" hint="Log expenses and they'll show up here over time." />
                : (
                    <div className="space-y-2">
                        {[...ms].reverse().map(m => {
                            const total = m.spent + m.debtPaid;
                            const pct = (total / maxVal) * 100;
                            const spentPct = total > 0 ? (m.spent / total) * pct : 0;
                            const paidPct = total > 0 ? (m.debtPaid / total) * pct : 0;
                            return (
                                <Surface key={m.label} className={`p-4 ${m.isCurrent ? "!border-yellow-500/30" : ""}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className={`text-sm font-medium ${m.isCurrent ? "text-yellow-400" : "text-zinc-200"}`}>
                                            {m.label}{m.isCurrent ? " · this month" : ""}
                                        </span>
                                        <span className="text-sm text-white tabular-nums">{fmt(total)}</span>
                                    </div>
                                    <div className="flex h-2 rounded-full bg-white/5 overflow-hidden">
                                        <div className="bg-blue-500/70" style={{ width: `${spentPct}%` }} />
                                        <div className="bg-emerald-500/70" style={{ width: `${paidPct}%` }} />
                                    </div>
                                    <div className="flex justify-between text-[11px] text-zinc-500 mt-1.5">
                                        <span>💸 Spent {fmt(m.spent)}</span>
                                        <span>✅ Paid {fmt(m.debtPaid)}</span>
                                    </div>
                                </Surface>
                            );
                        })}
                    </div>
                )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════
//  ADVISOR TAB
// ════════════════════════════════════════════════════════════════════
function AdvisorTab() {
    return (
        <div className="space-y-4 pb-24 fade-in">
            <AIInsight />
            <AIQuestion />
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════
//  ROOT
// ════════════════════════════════════════════════════════════════════
const TABS = [
    { id: "today", label: "Today", icon: "🏠" },
    { id: "debts", label: "Debts", icon: "⚔️" },
    { id: "history", label: "History", icon: "📊" },
    { id: "advisor", label: "AI", icon: "🧠" },
    { id: "config", label: "Config", icon: "⚙️" },
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
            <header className="sticky top-0 z-20 backdrop-blur-xl bg-black/60 border-b border-white/5">
                <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                            <span className="text-base">💎</span>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-zinc-100 leading-tight">Finance OS</p>
                            <p className="text-[10px] text-zinc-500 leading-tight">{dateStr}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {session?.user?.image ? (
                            <img
                                src={session.user.image}
                                alt={session.user.name ?? ""}
                                className="w-8 h-8 rounded-full border border-white/20"
                            />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-medium text-zinc-300">
                                {session?.user?.name?.charAt(0)?.toUpperCase() ?? "?"}
                            </div>
                        )}
                        <button
                            onClick={() => signOut({ callbackUrl: "/login" })}
                            className="text-xs text-zinc-500 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                            title="Sign out"
                        >
                            ↩
                        </button>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-xl mx-auto px-4 pt-4 relative z-10">
                {isLoading && <Loading label="Loading your finances…" />}
                {!isLoading && !dbReady && <DBNotReady />}
                {!isLoading && dbReady && stateData && (
                    <>
                        {tab === "today" && <TodayTab data={stateData} />}
                        {tab === "debts" && <DebtsTab />}
                        {tab === "history" && <HistoryTab />}
                        {tab === "advisor" && <AdvisorTab />}
                        {tab === "config" && <ConfigTab data={stateData} />}
                    </>
                )}
            </main>

            {/* Bottom nav */}
            <nav className="fixed bottom-0 left-0 right-0 z-20 backdrop-blur-xl bg-black/70 border-t border-white/5">
                <div className="max-w-xl mx-auto px-2 py-1.5 flex">
                    {TABS.map(t => {
                        const active = tab === t.id;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 rounded-xl transition-all relative ${active ? "text-blue-400" : "text-zinc-500 hover:text-zinc-300"}`}
                            >
                                {active && <span className="absolute top-0 inset-x-4 h-[2px] rounded-full bg-blue-400" />}
                                <span className="text-lg leading-none">{t.icon}</span>
                                <span className="text-[10px] leading-none font-medium">{t.label}</span>
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
