import { prisma } from "@/lib/db";
import { body, fail, json, route, type Ctx } from "@/lib/api";
import { docPlan, generateDoc } from "@/lib/docs";
import { hasLLM } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const [plan, docs, llm] = await Promise.all([docPlan(id), prisma.document.findMany({ where: { repoId: id }, orderBy: { updatedAt: "desc" } }), hasLLM()]);
  return json({ plan, docs, llm });
});

/** Generate (or regenerate) one document by slug. */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body<{ slug?: string }>(req);
  if (!b.slug) return fail("slug is required");
  const d = await generateDoc(id, b.slug);
  const saved = await prisma.document.findUnique({ where: { repoId_slug: { repoId: id, slug: b.slug } } });
  return json(saved ?? d);
});
