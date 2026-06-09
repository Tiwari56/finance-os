// ════════════════════════════════════════════════════════════════
//  app/api/v2/state/route.ts
//  Main dashboard endpoint — everything Today + Overview need.
//  User-scoped via session. Returns:
//
//    profile, flags
//    envelopes, bills, debts, goals
//    allowance + smartAllowance (the dynamic limit)
//    expenses.{recent, monthTotal, todayTotal}
//    ious.{open, totalOpen}
//    debts.{list, totalOutstanding, monthPaid, byType}
//    overview.{cycleSpendByCategory, topMerchants, netWealth, ...}
// ════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { db } from "@/features/core/db/client";
import { expenses } from "@/features/expenses/schema";
import { debts, debtPayments } from "@/features/debts/schema";
import { bills, billPayments } from "@/features/bills/schema";
import { ious } from "@/features/ious/schema";
import { envelopes } from "@/features/envelopes/schema";
import { goals } from "@/features/goals/schema";
import { profile, flags } from "@/features/core/db/schema";
import { dailyAllowance, smartAllowance } from "@/features/allowance/lib/math";
import { CATEGORIES, isFlexCategory, type CategoryKey } from "@/features/expenses/lib/categorize";
import { gte, eq, desc, and } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

const FLEX_CATEGORIES = (Object.keys(CATEGORIES) as CategoryKey[])
    .filter(k => isFlexCategory(k));

function cycleStartDate(salaryDay: number, now: Date): Date {
    const d = Math.max(1, Math.min(28, salaryDay));
    const todayDate = now.getDate();
    return todayDate >= d
        ? new Date(now.getFullYear(), now.getMonth(),     d)
        : new Date(now.getFullYear(), now.getMonth() - 1, d);
}

export async function GET() {
    const { userId, error } = await requireUser();
    if (error) return error;

    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const dayStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const monthKey   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        // ─── Parallel reads ───────────────────────────────────────
        const [
            profileRows, flagRows,
            allEnvelopes, allDebts, allBills, activeGoals,
            recentExpenses, monthExpenses, todayExpenses,
            monthBillPayments, recentDebtPayments,
            allIous,
        ] = await Promise.all([
            db.select().from(profile).where(eq(profile.id, userId as string)).limit(1),
            db.select().from(flags).where(eq(flags.id, userId as string)).limit(1),
            db.select().from(envelopes).where(eq(envelopes.userId, userId as string)).orderBy(envelopes.order),
            db.select().from(debts).where(eq(debts.userId, userId as string)).orderBy(debts.order),
            db.select().from(bills).where(and(eq(bills.userId, userId as string), eq(bills.active, true))).orderBy(bills.order),
            db.select().from(goals).where(and(eq(goals.userId, userId as string), eq(goals.active, true))).orderBy(goals.order),
            db.select().from(expenses).where(eq(expenses.userId, userId as string)).orderBy(desc(expenses.ts)).limit(50),
            db.select().from(expenses).where(and(eq(expenses.userId, userId as string), gte(expenses.ts, monthStart))),
            db.select().from(expenses).where(and(eq(expenses.userId, userId as string), gte(expenses.ts, dayStart))),
            db.select().from(billPayments).where(eq(billPayments.month, monthKey)),
            db.select().from(debtPayments).where(gte(debtPayments.ts, monthStart)),
            db.select().from(ious).where(eq(ious.userId, userId as string)).orderBy(ious.ts),
        ]);

        const userProfile = (profileRows[0] as any) ?? { id: userId, name: "User", income: 180000, salaryDay: 1, currency: "INR" };
        const userFlags   = (flagRows[0]    as any) ?? { salaryReceived: false, envelopesSetup: false, setupComplete: false };

        const salaryDay = Number(userProfile.salaryDay ?? 1);
        const income    = Number(userProfile.income ?? 180000);

        // ─── Cycle math ───────────────────────────────────────────
        const cycleStartDt = cycleStartDate(salaryDay, now);
        const cycleStartMs = cycleStartDt.getTime();
        const cycleExpenses = recentExpenses.filter(e => e.ts >= cycleStartMs);
        const cycleDebtPays = recentDebtPayments.filter(p => p.ts >= cycleStartMs);

        // ─── Budgets + spend ──────────────────────────────────────
        const flexBudget = allEnvelopes
            .filter(e => e.id === "food" || e.id === "freedom")
            .reduce((s, e) => s + Number(e.amount), 0) || 30_000;

        const flexCatSet = new Set<string>(FLEX_CATEGORIES);
        const sum = (arr: { amount: number; category: string }[], pred: (e: { category: string }) => boolean) =>
            arr.filter(pred).reduce((s, e) => s + Number(e.amount), 0);

        const monthFlexSpent = sum(monthExpenses, e => flexCatSet.has(e.category));
        const todayFlexSpent = sum(todayExpenses, e => flexCatSet.has(e.category));
        const todayTotal     = todayExpenses.reduce((s, e) => s + Number(e.amount), 0);
        const cycleFlexSpent = sum(cycleExpenses, e => flexCatSet.has(e.category));

        // ─── Bills + EMI remaining ───────────────────────────────
        const paidBillIds = new Set(monthBillPayments.map(p => p.billId));
        const billsRemaining = allBills
            .filter(b => !paidBillIds.has(b.id))
            .reduce((s, b) => s + Number(b.amount), 0);

        const debtsActive = allDebts.filter(d => Number(d.balance) > 0);
        const totalCycleEmi    = debtsActive.reduce((s, d) => s + Number(d.emi || 0), 0);
        const debtPaidThisCyc  = cycleDebtPays.reduce((s, p) => s + Number(p.amount), 0);
        const debtEmiRemaining = Math.max(0, totalCycleEmi - debtPaidThisCyc);

        // ─── Allowance: legacy + smart ────────────────────────────
        const legacy = dailyAllowance(flexBudget, monthFlexSpent);
        const smart  = smartAllowance({
            income,
            salaryDay,
            flexSpentCycle:   cycleFlexSpent,
            flexBudgetCycle:  flexBudget,
            billsRemaining,
            debtEmiRemaining,
            sipRemaining:     0,
            todaySpentFlex:   todayFlexSpent,
            todaySpentTotal:  todayTotal,
            now,
        });

        // ─── Bills status ─────────────────────────────────────────
        const paidMap = new Map(monthBillPayments.map(p => [p.billId, p]));
        const billsWithStatus = allBills.map(b => {
            const payment = paidMap.get(b.id) ?? null;
            const today = now.getDate();
            return {
                ...b,
                payment,
                paid: !!payment,
                overdue: !payment && today > b.dueDay,
                dueSoon: !payment && today <= b.dueDay && b.dueDay - today <= 3,
            };
        });

        // ─── Debt summary ─────────────────────────────────────────
        const totalOutstanding = allDebts.reduce((s, d) => s + Math.max(0, Number(d.balance)), 0);
        const monthDebtPaid    = debtPaidThisCyc;
        const debtByType = {
            cc:     allDebts.filter(d => d.type === "cc"    ).reduce((s, d) => s + Number(d.balance), 0),
            formal: allDebts.filter(d => d.type === "formal").reduce((s, d) => s + Number(d.balance), 0),
            friend: allDebts.filter(d => d.type === "friend").reduce((s, d) => s + Number(d.balance), 0),
        };

        // ─── IOU summary ──────────────────────────────────────────
        const openIouList = allIous.filter(i => !i.settledTs);
        const totalIouOpen = openIouList.reduce((s, i) => s + Number(i.amount), 0);

        // ─── Overview aggregations ────────────────────────────────
        const cycleSpendByCategory = (() => {
            const map: Record<string, { amount: number; label: string; icon: string }> = {};
            for (const e of cycleExpenses) {
                const meta = CATEGORIES[e.category as CategoryKey] ?? { label: e.category, icon: "📦" };
                const cur = map[e.category] ?? { amount: 0, label: meta.label, icon: meta.icon };
                cur.amount += Number(e.amount);
                map[e.category] = cur;
            }
            return Object.entries(map)
                .map(([k, v]) => ({ category: k, ...v }))
                .sort((a, b) => b.amount - a.amount);
        })();

        const topMerchants = (() => {
            const map: Record<string, number> = {};
            for (const e of cycleExpenses) {
                if (!e.merchant) continue;
                map[e.merchant] = (map[e.merchant] ?? 0) + Number(e.amount);
            }
            return Object.entries(map)
                .map(([merchant, amount]) => ({ merchant, amount }))
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 8);
        })();

        const netWealth = income - totalOutstanding + totalIouOpen;

        return NextResponse.json({
            ok: true,
            profile: userProfile,
            flags: userFlags,
            envelopes: allEnvelopes,
            allowance: {
                ...legacy,
                todaySpent: todayFlexSpent,
                flexBudget,
            },
            smartAllowance: smart,
            expenses: {
                recent: recentExpenses,
                monthTotal: monthExpenses.reduce((s, e) => s + Number(e.amount), 0),
                todayTotal,
            },
            bills: billsWithStatus,
            debts: {
                list: allDebts,
                totalOutstanding,
                monthPaid: monthDebtPaid,
                byType: debtByType,
            },
            ious: {
                open: openIouList,
                totalOpen: totalIouOpen,
            },
            goals: activeGoals,
            overview: {
                cycleStart: cycleStartDt.toISOString(),
                cycleSpendByCategory,
                topMerchants,
                netWealth,
                billsRemaining,
                debtEmiRemaining,
            },
        });
    } catch (err) {
        console.error("[/api/v2/state]", err);
        return NextResponse.json({ ok: false, error: "DB not ready — run migration first" }, { status: 503 });
    }
}
