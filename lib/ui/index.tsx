"use client";

import { useState } from "react";
import { fmt } from "@/lib/format";

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
}
export interface StateData {
    ok: boolean; error?: string;
    profile: { name: string; income: number; salaryDay: number };
    flags: { setupComplete: boolean; salaryReceived: boolean };
    allowance: AllowanceData;
    envelopes: Envelope[];
    expenses: { recent: Expense[]; monthTotal: number; todayTotal: number };
    bills: Bill[];
    debts: { list: Debt[]; totalOutstanding: number; monthPaid: number };
    ious: { open: IOU[]; totalOpen: number };
    goals: Goal[];
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
        red:    "bg-red-500/10 text-red-300 border border-red-500/20",
        yellow: "bg-yellow-500/10 text-yellow-300 border border-yellow-500/20",
        green:  "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
        blue:   "bg-blue-500/10 text-blue-300 border border-blue-500/20",
        purple: "bg-purple-500/10 text-purple-300 border border-purple-500/20",
        zinc:   "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
    };
    return (
        <span className={`text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full ${colors[color]}`}>
            {children}
        </span>
    );
}

export function Money({ value, large = false, accent }: { value: number; large?: boolean; accent?: "good" | "warn" | "bad" }) {
    const accentColors = {
        good: "text-emerald-400",
        warn: "text-yellow-400",
        bad:  "text-red-400",
    };
    return (
        <span className={`tabular-nums font-semibold ${accent ? accentColors[accent] : "text-white"} ${large ? "text-3xl tracking-tight" : ""}`}>
            {fmt(value)}
        </span>
    );
}

export function ProgressBar({
    pct, danger = 80, warn = 60,
}: { pct: number; danger?: number; warn?: number }) {
    const p = Math.max(0, Math.min(100, pct));
    const color =
        p > danger ? "from-red-500 to-red-400" :
        p > warn   ? "from-yellow-500 to-yellow-400" :
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
    icon?: string;
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
                    {icon && <span className="text-xl">{icon}</span>}
                    <div className="min-w-0 text-left">
                        <p className="text-sm font-medium text-zinc-100">{title}</p>
                        {subtitle && <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {badge}
                    <span className={`text-zinc-500 text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
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
