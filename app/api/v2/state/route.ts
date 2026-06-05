// ════════════════════════════════════════════════════════════════
//  app/api/v2/state/route.ts
//  New DB-backed state endpoint for the redesigned frontend.
//  Returns everything the Today tab needs in one fetch.
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
import { dailyAllowance } from "@/features/allowance/lib/math";
import { gte, eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        // Parallel DB reads
        const [
            profileRows,
            flagRows,
            allEnvelopes,
            allDebts,
            recentExpenses,
            monthExpenses,
            todayExpenses,
            allBills,
            monthBillPayments,
            openIous,
            activeGoals,
            recentDebtPayments,
        ] = await Promise.all([
            db.select().from(profile).limit(1),
            db.select().from(flags).limit(1),
            db.select().from(envelopes).orderBy(envelopes.order),
            db.select().from(debts).orderBy(debts.order),
            db.select().from(expenses).orderBy(desc(expenses.ts)).limit(30),
            db.select().from(expenses).where(gte(expenses.ts, monthStart)),
            db.select().from(expenses).where(gte(expenses.ts, dayStart)),
            db.select().from(bills).where(eq(bills.active, true)).orderBy(bills.order),
            db.select().from(billPayments).where(eq(billPayments.month, monthKey)),
            db.select().from(ious).orderBy(ious.ts),
            db.select().from(goals).where(eq(goals.active, true)).orderBy(goals.order),
            db.select().from(debtPayments).where(gte(debtPayments.ts, monthStart)),
        ]);

        const userProfile = profileRows[0] ?? { name: "User", income: 180000, salaryDay: 1, currency: "INR" };
        const userFlags = flagRows[0] ?? { salaryReceived: false, envelopesSetup: false, setupComplete: false };

        // Flex budget (food + freedom envelopes)
        const flexEnvIds = new Set(["food", "freedom"]);
        const flexBudget = allEnvelopes
            .filter(e => flexEnvIds.has(e.id))
            .reduce((s, e) => s + e.amount, 0) || 30000;

        // Month flex spent
        const flexCatToEnv: Record<string, string> = {
            food: "food", freedom: "food", // map: category → envelope group
        };
        const monthFlexSpent = monthExpenses
            .filter(e => {
                // food and freedom envelope categories
                const flexCategories = ["food", "freedom", "renovation", "other"];
                return flexCategories.includes(e.category);
            })
            .reduce((s, e) => s + e.amount, 0);

        const todaySpent = todayExpenses
            .filter(e => ["food", "freedom", "renovation", "other"].includes(e.category))
            .reduce((s, e) => s + e.amount, 0);

        const allowance = dailyAllowance(flexBudget, monthFlexSpent);

        // Bills status
        const paidMap = new Map(monthBillPayments.map(p => [p.billId, p]));
        const billsWithStatus = allBills.map(b => {
            const payment = paidMap.get(b.id) ?? null;
            const today = now.getDate();
            return {
                ...b,
                payment,
                paid: !!payment,
                overdue: !payment && today > b.dueDay,
                dueSoon: !payment && !!(today <= b.dueDay && b.dueDay - today <= 3),
            };
        });

        // Debt summary
        const totalOutstanding = allDebts.reduce((s, d) => s + Math.max(0, d.balance), 0);
        const monthDebtPaid = recentDebtPayments.reduce((s, p) => s + p.amount, 0);

        // IOU summary
        const openIouList = openIous.filter(i => !i.settledTs);
        const totalIouOpen = openIouList.reduce((s, i) => s + i.amount, 0);

        return NextResponse.json({
            ok: true,
            profile: userProfile,
            flags: userFlags,
            envelopes: allEnvelopes,
            allowance: { ...allowance, todaySpent, flexBudget },
            expenses: {
                recent: recentExpenses,
                monthTotal: monthExpenses.reduce((s, e) => s + e.amount, 0),
                todayTotal: todayExpenses.reduce((s, e) => s + e.amount, 0),
            },
            bills: billsWithStatus,
            debts: {
                list: allDebts,
                totalOutstanding,
                monthPaid: monthDebtPaid,
            },
            ious: {
                open: openIouList,
                totalOpen: totalIouOpen,
            },
            goals: activeGoals,
        });
    } catch (err) {
        console.error("[/api/v2/state]", err);
        return NextResponse.json({ ok: false, error: "DB not ready — run migration first" }, { status: 503 });
    }
}
