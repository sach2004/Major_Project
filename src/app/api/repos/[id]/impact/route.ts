import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { body, fail, json, route, type Ctx } from "@/lib/api";
import { loadGraph } from "@/lib/graph";
import { computeImpact, targetsFromDiff } from "@/lib/impact";
import { findSeeds } from "@/lib/retrieval";
import { complete, hasLLM } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const SYSTEM = "You are a staff engineer reviewing a proposed code change. Using the dependency-graph impact analysis and Git co-change history provided, explain in markdown: 1) **Summary** of what the change touches, 2) **Blast radius** — the most important downstream components and why they are affected, 3) **Risk** — interpret the risk score and its factors, 4) **Test plan** — concrete tests/files to run or add, 5) **Reviewers & rollout** tips. Be specific and cite paths in backticks. Under 350 words.";

export const GET = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const aid = new URL(req.url).searchParams.get("aid");
  if (aid) {
    const a = await prisma.impactAnalysis.findFirst({ where: { id: aid, repoId: id } });
    if (!a) return fail("Analysis not found", 404);
    return json({ ...a, targets: JSON.parse(a.targets), result: JSON.parse(a.result) });
  }
  const list = await prisma.impactAnalysis.findMany({ where: { repoId: id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, targets: true, description: true, riskScore: true, createdAt: true, provider: true } });
  return json(list.map((a) => ({ ...a, targets: JSON.parse(a.targets) })));
});

export const DELETE = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const aid = new URL(req.url).searchParams.get("aid");
  await prisma.impactAnalysis.deleteMany({ where: aid ? { id: aid, repoId: id } : { repoId: id } });
  return json({ ok: true });
});

/** Predict change impact from selected targets, a pasted unified diff and/or a plain-English description. */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body<{ targets?: string[]; diff?: string; description?: string; explain?: boolean; fresh?: boolean }>(req);
  const g = await loadGraph(id);
  const keys = new Set<string>((b.targets || []).filter((k) => g.nodes.has(k)));
  if (b.diff?.trim()) for (const k of targetsFromDiff(g, b.diff)) keys.add(k);
  if (!keys.size && b.description?.trim()) for (const s of findSeeds(g, b.description).slice(0, 4)) keys.add(s.key);
  if (!keys.size) return fail("Pick at least one file or function, paste a diff, or name a component in the description.");

  // Result cache: identical inputs on the same analysis snapshot reuse the saved analysis (no LLM call).
  const inputHash = createHash("sha1").update(JSON.stringify([[...keys].sort(), (b.description || "").trim().toLowerCase(), (b.diff || "").trim()])).digest("hex");
  const repo = await prisma.repository.findUnique({ where: { id }, select: { lastAnalyzedAt: true } });
  const llm = b.explain !== false && (await hasLLM());
  if (!b.fresh && repo?.lastAnalyzedAt) {
    const prev = await prisma.impactAnalysis.findFirst({ where: { repoId: id, inputHash, createdAt: { gt: repo.lastAnalyzedAt } }, orderBy: { createdAt: "desc" } });
    if (prev && (prev.explanation || !llm) && !prev.explanation?.startsWith("_AI explanation unavailable")) {
      return json({ id: prev.id, createdAt: prev.createdAt, description: prev.description, targets: JSON.parse(prev.targets), result: JSON.parse(prev.result), explanation: prev.explanation, provider: prev.provider, cached: true });
    }
  }

  const result = await computeImpact(id, [...keys]);
  let explanation: string | null = null;
  let provider: string | null = null;
  if (llm) {
    const prompt = `Proposed change${b.description ? `: ${b.description}` : ""}

Changed targets:
${result.targets.map((t) => `- ${t.kind} ${t.label}`).join("\n")}

Risk score: ${result.risk.score}/100 (${result.risk.level})
Factors:
${result.risk.factors.map((f) => `- ${f.label} (+${f.points}): ${f.detail}`).join("\n")}

Impacted components (depth = hops from the change):
${result.impacted.slice(0, 40).map((i) => `- [d${i.depth}] ${i.kind} ${i.label} — ${i.relation}${i.via.length ? ` via ${i.via.join(" → ")}` : ""}`).join("\n") || "- none"}

Files impacted: ${result.impactedFiles.length}
Historically co-changed files (from Git):
${result.coChange.slice(0, 12).map((c) => `- ${c.path} (${c.count}× together, ${Math.round(c.confidence * 100)}% confidence)`).join("\n") || "- none"}

Related tests:
${result.tests.slice(0, 15).map((t) => `- ${t.path} — ${t.reason}`).join("\n") || "- none found"}
${b.diff ? `\nDiff excerpt:\n\`\`\`diff\n${b.diff.slice(0, 5000)}\n\`\`\`` : ""}`;
    try {
      const r = await complete({ system: SYSTEM, prompt });
      explanation = r.text;
      provider = r.provider;
    } catch (e) {
      explanation = `_AI explanation unavailable: ${e instanceof Error ? e.message : String(e)}_`;
    }
  }
  const saved = await prisma.impactAnalysis.create({
    data: { repoId: id, targets: JSON.stringify(result.targets), description: b.description?.trim() || (b.diff ? "Diff analysis" : null), riskScore: result.risk.score, result: JSON.stringify(result), explanation, provider, inputHash },
  });
  return json({ id: saved.id, createdAt: saved.createdAt, description: saved.description, targets: result.targets, result, explanation, provider });
});
