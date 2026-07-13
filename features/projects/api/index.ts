import { z } from "zod";
import { db } from "@/features/core/db/client";
import { projects } from "../schema";
import { expenses } from "@/features/expenses/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireUser } from "@/lib/requireUser";

export async function listProjects(_req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    const rows = await db.select().from(projects)
        .where(and(eq(projects.userId, userId), eq(projects.status, "active")))
        .orderBy(projects.createdTs);

    // Compute spent-so-far per project from linked expenses
    const spent: Record<string, number> = {};
    for (const p of rows) {
        const [s] = await db
            .select({ total: sql<number>`sum(${expenses.amount})` })
            .from(expenses)
            .where(and(eq(expenses.userId, userId), eq(expenses.projectId, p.id)));
        spent[p.id] = Number(s?.total ?? 0);
    }

    return Response.json({ ok: true, projects: rows.map(p => ({ ...p, spent: spent[p.id] ?? 0 })) });
}

const UpsertBody = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    category: z.string().default("other"),
    priority: z.enum(["immediate", "planned", "someday"]).default("planned"),
    budget: z.number().min(0).default(0),
    status: z.enum(["active", "completed", "paused"]).default("active"),
    icon: z.string().default("📦"),
    targetTs: z.number().optional(),
});

export async function upsertProject(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = UpsertBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const { id, ...data } = parsed.data;
    const projectId = id ?? ("proj_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5));

    await db.insert(projects)
        .values({ id: projectId, userId, createdTs: Date.now(), ...data })
        .onConflictDoUpdate({
            target: projects.id,
            set: { ...data },
        });

    return Response.json({ ok: true, id: projectId });
}

const DeleteBody = z.object({ id: z.string() });

export async function deleteProject(req: Request): Promise<Response> {
    const { userId, error } = await requireUser();
    if (error) return error;

    let body: unknown;
    try { body = await req.json(); } catch { body = {}; }
    const parsed = DeleteBody.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });

    await db.delete(projects).where(and(eq(projects.id, parsed.data.id), eq(projects.userId, userId)));
    return Response.json({ ok: true });
}
