import { prisma } from "@/lib/db";
import { fail, json, route, type Ctx } from "@/lib/api";
import { isRunning } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const repo = await prisma.repository.findUnique({ where: { id }, select: { status: true, error: true, lastSyncedAt: true, lastAnalyzedAt: true, headSha: true } });
  if (!repo) return fail("Repository not found", 404);
  const jobs = await prisma.analysisJob.findMany({ where: { repoId: id }, orderBy: { createdAt: "desc" }, take: 25 });
  return json({ ...repo, running: isRunning(id), jobs });
});
