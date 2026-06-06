import { z } from "zod";
import { db } from "@/features/core/db/client";
import { goals, goalContributions } from "../schema";
import { eq, desc } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";

export async function listGoals(_req: Request): Promise<Response> {
    const rows = await db.select().from(goals).where(eq(goals.active, true)).orderBy(goals.order);
    return Response.json({ ok: true, goals: rows });
}

const ContributeBody = z.object({
    goalId: z.string(),
    amount: z.number().positive(),
    note: z.string().optional(),
});

export async function contributeGoal(req: Request): Promise<Response> {
    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = ContributeBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const { goalId, amount, note } = parsed.data;
    const id = "gc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
    const ts = Date.now();

    await db.insert(goalContributions).values({ id, ts, goalId, amount, note });

    const [goal] = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1);
    if (goal) {
        await db.update(goals).set({ saved: goal.saved + amount }).where(eq(goals.id, goalId));
    }

    return Response.json({ ok: true, id });
}

const UpsertGoalBody = z.object({
    id: z.string().optional(),
    label: z.string().min(1),
    needed: z.number().positive(),
    icon: z.string().default("🎯"),
    targetDate: z.string().optional(),
    order: z.number().default(0),
});

export async function upsertGoal(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = UpsertGoalBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const { id: existingId, ...data } = parsed.data;
    const id = existingId ?? "goal_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);

    await db.insert(goals).values({ id, userId: userId, ...data }).onConflictDoUpdate({ target: goals.id, set: data });
    return Response.json({ ok: true, id });
}
