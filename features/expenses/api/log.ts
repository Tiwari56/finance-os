// ════════════════════════════════════════════════════════════════
//  expenses/api/log.ts
//  POST /api/expenses/log  (n8n webhook target)
//  Also reachable at /api/log-expense (legacy alias).
//
//  Auto-links debt-category expenses to a matching debt (creates a
//  paired debt_payment row + reduces the debt balance). Friend names
//  not yet known get a new debt row at balance=0.
// ════════════════════════════════════════════════════════════════

import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/features/core/db/client";
import { expenses } from "../schema";
import { debts, debtPayments } from "@/features/debts/schema";
import { envelopes } from "@/features/envelopes/schema";
import { categorize, isFlexCategory, CATEGORIES } from "../lib/categorize";
import { dailyAllowance } from "@/features/allowance/lib/math";
import { eq, gte, sql, inArray } from "drizzle-orm";

// ─── Auth ─────────────────────────────────────────────────────────
function secretsMatch(provided: string, expected: string): boolean {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    const maxLen = Math.max(a.length, b.length, 1);
    const aPad = Buffer.alloc(maxLen);
    const bPad = Buffer.alloc(maxLen);
    a.copy(aPad); b.copy(bPad);
    return timingSafeEqual(aPad, bPad) && a.length === b.length;
}

export function authed(req: Request, secret?: string): boolean {
    const expected = process.env.LOG_SECRET;
    if (!expected) return true;
    const url = new URL(req.url);
    const provided = url.searchParams.get("secret") ?? secret ?? "";
    return secretsMatch(provided, expected);
}

// ─── Fuzzy debt matcher (same logic the user approved earlier) ────
const STOPWORDS = new Set([
    "loan", "loans", "credit", "card", "cards", "emi", "payment", "payments", "pay",
    "the", "of", "for", "to", "and", "monthly", "this", "that", "forclose", "foreclose",
    "prepayment", "replayment", "repayment", "online", "app", "upi", "via", "amount",
]);
function tokenize(s: string) {
    return String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}
function findDebt(allDebts: { id: string; name: string }[], merchant: string) {
    const exact = allDebts.find((d) => d.name.toLowerCase() === merchant.toLowerCase());
    if (exact) return exact;
    const inputTokens = new Set(tokenize(merchant));
    if (inputTokens.size === 0) return null;
    for (const d of allDebts) {
        if (tokenize(d.name).some((t) => inputTokens.has(t))) return d;
    }
    return null;
}

// ─── Input schema ─────────────────────────────────────────────────
const LogBody = z.object({
    amount: z.number().positive(),
    merchant: z.string().optional().default(""),
    source: z.string().optional().default("n8n"),
    secret: z.string().optional(),
    category: z.string().optional(),
    clientRequestId: z.string().optional(),
    ts: z.number().optional(),
    currency: z.string().optional().default("INR"),
    accountSuffix: z.string().optional(),
    note: z.string().optional(),
});

export async function logExpense(req: Request): Promise<Response> {
    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }

    const parsed = LogBody.safeParse(body);
    if (!parsed.success) {
        return Response.json(
            { ok: false, error: "Invalid body", issues: parsed.error.issues },
            { status: 400 }
        );
    }

    const data = parsed.data;

    if (!authed(req, data.secret)) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Idempotency
    if (data.clientRequestId) {
        const existing = await db
            .select({ id: expenses.id })
            .from(expenses)
            .where(eq(expenses.clientRequestId, data.clientRequestId))
            .limit(1);
        if (existing.length > 0) {
            return Response.json({
                ok: true,
                duplicate: true,
                logged: { id: existing[0].id, amount: data.amount, merchant: data.merchant },
                message: "Already logged",
            });
        }
    }

    const category = (data.category || categorize(data.merchant)) as keyof typeof CATEGORIES;
    const ts = data.ts ?? Date.now();
    const id = "exp_" + ts + "_" + Math.random().toString(36).slice(2, 6);

    // ─── Insert expense ───────────────────────────────────────────
    await db.insert(expenses).values({
        id,
        ts,
        amount: data.amount,
        category,
        merchant: data.merchant ?? "",
        source: data.source ?? "n8n",
        accountSuffix: data.accountSuffix,
        currency: data.currency ?? "INR",
        clientRequestId: data.clientRequestId,
        note: data.note,
    });

    // ─── Auto-link debt-category expenses → debt_payments ────────
    let debtLinked: { debtId: string; debtName: string } | null = null;
    if (category === "debt" && data.merchant) {
        const allDebts = await db.select({ id: debts.id, name: debts.name, balance: debts.balance }).from(debts);
        const matched = findDebt(allDebts, data.merchant);

        let debtId: string;
        let debtName: string;
        if (matched) {
            debtId = matched.id;
            debtName = matched.name;
            // Reduce balance (clamp at 0)
            await db
                .update(debts)
                .set({ balance: sql`MAX(0, ${debts.balance} - ${data.amount})` })
                .where(eq(debts.id, matched.id));
        } else {
            // New friend debt — assume settled (balance = 0)
            debtId = "f_" + data.merchant.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) + "_" + Math.random().toString(36).slice(2, 5);
            debtName = data.merchant;
            await db.insert(debts).values({
                id: debtId,
                name: data.merchant,
                balance: 0,
                rate: 0,
                emi: 0,
                color: "#9F77DD",
                type: "friend",
                order: 99,
            });
        }
        await db.insert(debtPayments).values({
            id: "pay_" + ts + "_" + Math.random().toString(36).slice(2, 5),
            ts,
            debtId,
            amount: data.amount,
            expenseId: id,
        });
        debtLinked = { debtId, debtName };
    }

    // ─── Compute today's remaining (real envelopes-aware) ─────────
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // Flex spend = sum of expenses whose category maps to a flex envelope (food/freedom)
    const flexCategoryKeys = Object.entries(CATEGORIES)
        .filter(([, c]) => c.envelope === "food" || c.envelope === "freedom")
        .map(([k]) => k);

    const monthRows = await db
        .select({ total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
        .from(expenses)
        .where(sql`${expenses.ts} >= ${monthStart} AND ${expenses.category} IN (${sql.join(flexCategoryKeys.map(c => sql`${c}`), sql`, `)})`);
    const todayRows = await db
        .select({ total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
        .from(expenses)
        .where(sql`${expenses.ts} >= ${dayStart} AND ${expenses.category} IN (${sql.join(flexCategoryKeys.map(c => sql`${c}`), sql`, `)})`);

    const monthSpent = Number(monthRows[0]?.total ?? 0);
    const todaySpent = Number(todayRows[0]?.total ?? 0);

    // Flex budget = food + freedom envelopes (real, not hardcoded)
    const flexEnvs = await db
        .select({ amount: envelopes.amount })
        .from(envelopes)
        .where(inArray(envelopes.id, ["food", "freedom"]));
    const flexBudget = flexEnvs.reduce((s, e) => s + Number(e.amount || 0), 30000) - 30000 || 30000;
    // ↑ defensive fallback if envelopes table is empty

    const allowance = dailyAllowance(flexBudget, monthSpent);
    const isFlex = isFlexCategory(category);
    const remainingToday = Math.max(0, allowance.perDay - todaySpent);

    // ─── Build friendly response (matches old-style message) ──────
    const catMeta = CATEGORIES[category];
    const inr = (n: number) => "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");

    let message: string;
    if (debtLinked) {
        message = `⚔️ Logged ${inr(data.amount)} debt payment to ${debtLinked.debtName}.`;
    } else if (isFlex) {
        message = `Logged ${catMeta?.icon ?? "📦"} ${inr(data.amount)} (${catMeta?.label ?? category}). You have about ${inr(remainingToday)} left to spend today.`;
    } else {
        message = `Logged ${catMeta?.icon ?? "📦"} ${inr(data.amount)} (${catMeta?.label ?? category}) — fixed/bill, doesn't touch your daily allowance.`;
    }

    return Response.json({
        ok: true,
        logged: {
            id,
            ts,
            amount: data.amount,
            category,
            merchant: data.merchant ?? "",
            source: data.source ?? "n8n",
            currency: data.currency ?? "INR",
        },
        isFlexSpend: isFlex,
        todayRemaining: remainingToday,
        monthRemaining: Math.max(0, flexBudget - monthSpent),
        ...(debtLinked && { debtLink: debtLinked }),
        message,
    });
}
