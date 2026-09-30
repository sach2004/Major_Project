import { prisma } from "@/lib/db";
import { body, fail, json, route, type Ctx } from "@/lib/api";
import { loadGraph } from "@/lib/graph";
import { graphFacts } from "@/lib/retrieval";
import { readRepoFile } from "@/lib/source";
import { complete, hasLLM } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM = "You are a senior engineer explaining code to a teammate who is new to the codebase. Be precise and grounded in the given source and relationships. Use short markdown: a one-sentence purpose line, then 'How it works' bullets, then 'Connections' (who uses it / what it depends on), then 'Watch out' (risks, edge cases) if any. Keep it under 250 words.";

/** AI explanation for a file or code entity. Cached on the node; pass refresh=true to regenerate. */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body<{ key?: string; refresh?: boolean }>(req);
  if (!b.key) return fail("key is required");
  const g = await loadGraph(id);
  const n = g.nodes.get(b.key);
  if (!n || n.kind === "package") return fail("Node not found", 404);

  const isFile = n.kind === "file";
  const existing = isFile
    ? await prisma.file.findFirst({ where: { repoId: id, key: n.key }, select: { id: true, summary: true } })
    : await prisma.codeEntity.findFirst({ where: { repoId: id, key: n.key }, select: { id: true, summary: true } });
  if (!existing) return fail("Node not found", 404);
  if (existing.summary && !b.refresh) return json({ text: existing.summary, cached: true });

  const facts = graphFacts(g, [n.key], 4);
  if (!(await hasLLM())) {
    const text = [`**${isFile ? n.path : n.qualifiedName}** — ${isFile ? `${n.language} file, ${n.loc} lines` : `${n.type} in \`${n.path}\` (lines ${n.startLine}–${n.endLine})`}.`, "", "**Relationships**", ...facts.map((f) => `- ${f}`), "", "_Add a Gemini or OpenAI key in Settings for a full AI explanation._"].join("\n");
    return json({ text, cached: false, provider: null });
  }

  const src = (await readRepoFile(id, n.path!)) ?? "";
  const lines = src.split("\n");
  const code = isFile ? lines.slice(0, 400).join("\n") : lines.slice(n.startLine! - 1, Math.min(n.endLine!, n.startLine! + 250)).join("\n");
  const prompt = `Explain this ${isFile ? "file" : n.type} from the repository.

Target: ${isFile ? n.path : `${n.qualifiedName} in ${n.path} (lines ${n.startLine}-${n.endLine})`}
Metrics: fan-in ${n.fanIn}, fan-out ${n.fanOut}${n.commitCount ? `, changed in ${n.commitCount} commits by ${n.authors} author(s)` : ""}

Knowledge-graph relationships:
${facts.map((f) => `- ${f}`).join("\n") || "- (none recorded)"}

Source:
\`\`\`${n.language ?? ""}
${code}
\`\`\``;
  const r = await complete({ system: SYSTEM, prompt });
  if (isFile) await prisma.file.update({ where: { id: existing.id }, data: { summary: r.text } });
  else await prisma.codeEntity.update({ where: { id: existing.id }, data: { summary: r.text } });
  return json({ text: r.text, cached: false, provider: r.provider });
});
