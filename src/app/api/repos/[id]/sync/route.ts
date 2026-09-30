import { prisma } from "@/lib/db";
import { body, fail, json, route, type Ctx } from "@/lib/api";
import { startJob } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Manual trigger: mode "sync" pulls latest commits (skips if unchanged); "analyze" forces a full re-analysis. */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body<{ mode?: "sync" | "analyze" }>(req);
  const repo = await prisma.repository.findUnique({ where: { id }, select: { id: true } });
  if (!repo) return fail("Repository not found", 404);
  const mode = b.mode === "analyze" ? "analyze" : "sync";
  const r = await startJob(id, mode, "manual");
  return json(r, r.alreadyRunning ? 200 : 202);
});
