import { z } from "zod";
import { db } from "@/features/core/db/client";
import { goals, goalContributions } from "../schema";
import { eq, and } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";

export async function listGoals(_req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    const rows = await db.select().from(goals)
        .where(and(eq(goals.userId, userId), eq(goals.active, true)))
        .orderBy(goals.order);
    return Response.json({ ok: true, goals: rows });
}

const ContributeBody = z.object({
    goalId: z.string(),
    amount: z.number().positive(),
    note: z.string().optional(),
});

export async function contributeGoal(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = ContributeBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const { goalId, amount, note } = parsed.data;

    const [goal] = await db.select().from(goals)
        .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
        .limit(1);
    if (!goal) return Response.json({ ok: false, error: "Goal not found" }, { status: 404 });

    const id = "gc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
    await db.insert(goalContributions).values({ id, ts: Date.now(), goalId, amount, note });
    await db.update(goals).set({ saved: goal.saved + amount }).where(eq(goals.id, goalId));

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

    if (existingId) {
        const updated = await db.update(goals).set(data)
            .where(and(eq(goals.id, existingId), eq(goals.userId, userId)))
            .returning({ id: goals.id });
        if (updated.length === 0) return Response.json({ ok: false, error: "Goal not found" }, { status: 404 });
        return Response.json({ ok: true, id: existingId });
    }

    const id = "goal_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
    await db.insert(goals).values({ id, userId, ...data });
    return Response.json({ ok: true, id });
}
