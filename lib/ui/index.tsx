"use client";

import {
    useState, useEffect, useRef, useCallback,
    createContext, useContext,
} from "react";
import { fmt } from "@/lib/format";

export { Icon, LogoMark, type IconName } from "./icons";

// ─── Shared types ──────────────────────────────────────────────────
export interface AllowanceData {
    perDay: number; remaining: number; daysLeft: number; todaySpent: number;
    pctMonthGone: number; pctBudgetGone: number; flexBudget: number;
}
export interface Bill {
    id: string; label: string; amount: number; dueDay: number;
    icon: string; paid: boolean; overdue: boolean; dueSoon: boolean;
}
export interface Debt {
    id: string; name: string; balance: number; rate: number; emi: number;
    type: string; color: string;
    // EMI-reality fields (optional — older rows may be null)
    principal?: number | null;
    dueDay?: number | null;
    tenureMonths?: number | null;
    openedTs?: number | null;
    status?: string | null;
    lastPaidTs?: number | null;
    creditLimit?: number | null;
    minDue?: number | null;
    statementBalance?: number | null;
}
export interface Expense {
    id: string; ts: number; amount: number; category: string;
    merchant: string; source: string;
}
export interface IOU {
    id: string; name: string; amount: number; ts: number;
    note?: string; settledTs?: number;
}
export interface Goal {
    id: string; label: string; needed: number; saved: number; icon: string;
}
export interface Envelope {
    id: string; label: string; amount: number; icon: string; locked: boolean;
    /** Semantic key ("food", "debt", …) — ids are namespaced per user. */
    key?: string;
}
export interface SmartAllowance {
    suggestedToday: number;
    baselinePerDay: number;
    smartPerDay: number;
    obligations: number;
    safelyAvailableFlex: number;
    cycle: {
        daysInCycle: number;
        dayOfCycle: number;
        daysLeft: number;
        pctCycleGone: number;
        pctFlexGone: number;
        cycleStart: string;
        cycleEnd: string;
    };
    pace: {
        overpaceBy: number;
        verdict: "under" | "on-track" | "watch" | "over";
    };
    rationale: string;
}

export interface DebtTypeSummary {
    cc: number;
    formal: number;
    friend: number;
}

export interface CategorySpend {
    category: string;
    amount: number;
    label: string;
    icon: string;
}

export interface OverviewData {
    cycleStart: string;
    cycleSpendByCategory: CategorySpend[];
    topMerchants: { merchant: string; amount: number }[];
    netWealth: number;
    billsRemaining: number;
    debtEmiRemaining: number;
}

export interface WeeklyData {
    weekStart: string;
    limit: number;
    spent: number;
    totalSpent: number;
    remaining: number;
    safeToday: number;
    pctSpent: number;
    pctElapsed: number;
    overpaceBy: number;
    verdict: "under" | "on-track" | "watch" | "over";
    daysLeftInWeek: number;
    debtPaid: number;
    noSpendStreak: number;
    bankable: number;
    banked: number;
    bankedTotal: number;
    income: number;
    moneyLeftMonth: number;
    billsRemaining: number;
    debtDue: number;
    spentThisMonth: number;
}

export interface StateData {
    ok: boolean; error?: string;
    profile: { name: string; income: number; salaryDay: number };
    flags: { setupComplete: boolean; salaryReceived: boolean };
    allowance: AllowanceData;
    smartAllowance: SmartAllowance;
    weekly: WeeklyData;
    envelopes: Envelope[];
    expenses: { recent: Expense[]; monthTotal: number; todayTotal: number };
    bills: Bill[];
    debts: { list: Debt[]; totalOutstanding: number; monthPaid: number; byType: DebtTypeSummary };
    ious: { open: IOU[]; totalOpen: number };
    goals: Goal[];
    overview: OverviewData;
}

// ─── API helpers ───────────────────────────────────────────────────
export async function apiFetch(url: string) {
    const r = await fetch(url);
    return r.json();
}
export async function apiPost(url: string, body: unknown) {
    const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return r.json();
}

// ─── UI atoms ──────────────────────────────────────────────────────
export function Surface({
    children, className = "", elevated = false, as: As = "div", ...rest
}: {
    children: React.ReactNode;
    className?: string;
    elevated?: boolean;
    as?: any;
} & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <As
            className={`${elevated ? "surface-elev" : "surface"} ${className}`}
            {...rest}
        >
            {children}
        </As>
    );
}

export function Pill({
    children, color = "zinc",
}: { children: React.ReactNode; color?: "red" | "yellow" | "green" | "blue" | "zinc" | "purple" }) {
    const colors: Record<string, string> = {
        red: "bg-red-500/10 text-red-300 border border-red-500/20",
        yellow: "bg-yellow-500/10 text-yellow-300 border border-yellow-500/20",
        green: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
        blue: "bg-blue-500/10 text-blue-300 border border-blue-500/20",
        purple: "bg-purple-500/10 text-purple-300 border border-purple-500/20",
        zinc: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
    };
    return (
        <span className={`text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full ${colors[color]}`}>
            {children}
        </span>
    );
}

// ─── Count-up animation ────────────────────────────────────────────
//  Numbers glide to their new value instead of snapping. Respects
//  prefers-reduced-motion; first render shows the value immediately.
export function useCountUp(target: number, duration = 650): number {
    const [display, setDisplay] = useState(target);
    const prevRef = useRef(target);

    useEffect(() => {
        const from = prevRef.current;
        const to = target;
        if (from === to) return;
        prevRef.current = to;

        if (typeof window === "undefined" ||
            window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            setDisplay(to);
            return;
        }

        let raf: number;
        const start = performance.now();
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);   // ease-out cubic
            setDisplay(from + (to - from) * eased);
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, duration]);

    return display;
}

export function Money({ value, large = false, accent }: { value: number; large?: boolean; accent?: "good" | "warn" | "bad" }) {
    const display = useCountUp(value);
    const accentColors = {
        good: "text-emerald-400",
        warn: "text-yellow-400",
        bad: "text-red-400",
    };
    return (
        <span className={`tabular-nums font-semibold ${accent ? accentColors[accent] : "text-white"} ${large ? "text-3xl tracking-tight" : ""}`}>
            {fmt(Math.round(display))}
        </span>
    );
}

export function ProgressBar({
    pct, danger = 80, warn = 60,
}: { pct: number; danger?: number; warn?: number }) {
    const p = Math.max(0, Math.min(100, pct));
    const color =
        p > danger ? "from-red-500 to-red-400" :
            p > warn ? "from-yellow-500 to-yellow-400" :
                "from-emerald-500 to-emerald-400";
    return (
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
                className={`h-full bg-gradient-to-r ${color} transition-all duration-500 ease-out`}
                style={{ width: `${p}%` }}
            />
        </div>
    );
}

export function Collapsible({
    title, subtitle, badge, children, defaultOpen = false, icon,
}: {
    title: string;
    subtitle?: string;
    badge?: React.ReactNode;
    icon?: React.ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <Surface className="overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
            >
                <div className="flex items-center gap-3 min-w-0">
                    {icon && (
                        <span className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.06] flex items-center justify-center text-zinc-300 shrink-0">
                            {typeof icon === "string" ? <span className="text-lg leading-none">{icon}</span> : icon}
                        </span>
                    )}
                    <div className="min-w-0 text-left">
                        <p className="text-sm font-medium text-zinc-100">{title}</p>
                        {subtitle && <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {badge}
                    <span className={`text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <polyline points="6 9.5 12 15.5 18 9.5" />
                        </svg>
                    </span>
                </div>
            </button>
            <div
                className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
                <div className="overflow-hidden">
                    <div className="px-4 pb-4 pt-1 border-t border-white/5">{children}</div>
                </div>
            </div>
        </Surface>
    );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            className={`w-full bg-black/30 text-white rounded-xl px-4 py-3 text-sm border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all placeholder-zinc-600 ${props.className ?? ""}`}
        />
    );
}

export function Select({
    value, onChange, children, ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            value={value}
            onChange={onChange}
            className="w-full bg-black/30 text-white rounded-xl px-4 py-3 text-sm border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all appearance-none"
            {...rest}
        >
            {children}
        </select>
    );
}

export function Loading({ label }: { label?: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
            {label && <p className="text-xs text-zinc-500">{label}</p>}
        </div>
    );
}

export function EmptyState({ icon, title, hint, action }: {
    icon: string; title: string; hint?: string; action?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <span className="text-4xl mb-3 opacity-60">{icon}</span>
            <p className="text-sm font-medium text-zinc-300">{title}</p>
            {hint && <p className="text-xs text-zinc-500 mt-1 max-w-xs">{hint}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

export function startOfDay() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// ─── Skeletons ─────────────────────────────────────────────────────
export function Skeleton({ className = "" }: { className?: string }) {
    return <div className={`shimmer-bg rounded-xl ${className}`} aria-hidden />;
}

/** Shimmer placeholder shaped like the Today dashboard. */
export function DashboardSkeleton() {
    return (
        <div className="space-y-3 pt-1" aria-busy="true" aria-label="Loading">
            <div className="surface-elev p-5 space-y-4">
                <div className="flex justify-between">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-5 w-16 !rounded-full" />
                </div>
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-1.5 w-full !rounded-full" />
                <div className="grid grid-cols-3 gap-2 pt-2">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
            </div>
            <Skeleton className="h-40" />
            <Skeleton className="h-32" />
        </div>
    );
}

// ─── Toasts ────────────────────────────────────────────────────────
//  Lightweight feedback after actions (expense logged, bill paid…).
//  Mount <ToastProvider> once; call useToast()("message", "success").
type ToastKind = "success" | "error" | "info";
interface ToastItem { id: number; message: string; kind: ToastKind }

const ToastCtx = createContext<((message: string, kind?: ToastKind) => void) | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const push = useCallback((message: string, kind: ToastKind = "success") => {
        const id = Date.now() + Math.random();
        setToasts(t => [...t.slice(-2), { id, message, kind }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
    }, []);

    const kindStyles: Record<ToastKind, string> = {
        success: "border-emerald-500/30 bg-emerald-950/90 text-emerald-200",
        error: "border-red-500/30 bg-red-950/90 text-red-200",
        info: "border-blue-500/30 bg-blue-950/90 text-blue-200",
    };
    const kindIcon: Record<ToastKind, string> = { success: "✓", error: "✕", info: "ℹ" };

    return (
        <ToastCtx.Provider value={push}>
            {children}
            <div className="fixed top-3 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        role="status"
                        className={`toast-in pointer-events-auto max-w-md w-full sm:w-auto flex items-start gap-2.5 px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl text-sm leading-snug ${kindStyles[t.kind]}`}
                    >
                        <span className="shrink-0 font-bold">{kindIcon[t.kind]}</span>
                        <span className="min-w-0">{t.message}</span>
                    </div>
                ))}
            </div>
        </ToastCtx.Provider>
    );
}

export function useToast() {
    const push = useContext(ToastCtx);
    // Safe no-op when provider isn't mounted (tests, storybook)
    return push ?? (() => { });
}
