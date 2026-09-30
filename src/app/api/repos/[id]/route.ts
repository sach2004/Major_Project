import { rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { CONFIG } from "@/lib/config";
import { body, fail, json, route, type Ctx } from "@/lib/api";
import { isRunning } from "@/lib/pipeline";
import { invalidateRepoCaches } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const repo = await prisma.repository.findUnique({ where: { id } });
  if (!repo) return fail("Repository not found", 404);
  const [latestJob, developers, queries, impacts, docs] = await Promise.all([
    prisma.analysisJob.findFirst({ where: { repoId: id }, orderBy: { createdAt: "desc" } }),
    prisma.developer.count({ where: { repoId: id } }),
    prisma.userQuery.count({ where: { repoId: id } }),
    prisma.impactAnalysis.count({ where: { repoId: id } }),
    prisma.document.count({ where: { repoId: id } }),
  ]);
  return json({
    ...repo,
    stats: repo.stats ? JSON.parse(repo.stats) : null,
    packages: repo.packages ? JSON.parse(repo.packages) : [],
    running: isRunning(id),
    latestJob,
    counts: { developers, queries, impacts, docs },
  });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body<{ syncEnabled?: boolean; name?: string }>(req);
  const repo = await prisma.repository.update({ where: { id }, data: { ...(typeof b.syncEnabled === "boolean" ? { syncEnabled: b.syncEnabled } : {}), ...(b.name ? { name: b.name } : {}) } });
  return json(repo);
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (isRunning(id)) return fail("Analysis is running — wait for it to finish before deleting.", 409);
  const repo = await prisma.repository.findUnique({ where: { id } });
  if (!repo) return fail("Repository not found", 404);
  await prisma.repository.delete({ where: { id } });
  invalidateRepoCaches(id);
  if (!repo.isLocal) await rm(path.join(CONFIG.reposDir, id), { recursive: true, force: true }).catch(() => {});
  return json({ ok: true });
});
