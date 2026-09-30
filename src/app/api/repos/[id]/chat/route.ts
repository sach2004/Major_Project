import { prisma } from "@/lib/db";
import { body, fail, json, route, type Ctx } from "@/lib/api";
import { retrieve } from "@/lib/retrieval";
import { hasLLM, streamText } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYSTEM = `You are the AI Software Archaeologist, an expert on the user's codebase. Answer questions about architecture, code behaviour and design using ONLY the retrieved context (code excerpts + knowledge-graph facts + repository summary).
Rules:
- Cite files inline as \`path/to/file.ext:line\` when you rely on them.
- If the context is insufficient, say what is missing and which files are likely relevant — never invent code.
- Prefer concise markdown: short paragraphs, bullets, and small code blocks. Use a mermaid flowchart only when a flow/sequence genuinely helps.`;

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const rows = await prisma.userQuery.findMany({ where: { repoId: id }, orderBy: { createdAt: "asc" }, take: 100 });
  return json(rows.map((r) => ({ ...r, sources: r.sources ? JSON.parse(r.sources) : [] })));
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await prisma.userQuery.deleteMany({ where: { repoId: id } });
  return json({ ok: true });
});

/**
 * Streams the answer. Wire format (text/plain):
 *   line 1: JSON meta {sources, facts, mode}
 *   rest:   answer text deltas
 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body<{ question?: string; focusKeys?: string[]; fresh?: boolean }>(req);
  const question = (b.question || "").trim();
  if (!question) return fail("Ask a question");
  const repo = await prisma.repository.findUnique({ where: { id }, select: { name: true, summary: true, status: true, lastAnalyzedAt: true } });
  if (!repo) return fail("Repository not found", 404);
  if (!repo.lastAnalyzedAt) return fail("Repository is still being analyzed — try again in a moment.", 409);

  // Answer cache: the same question on the same analysis snapshot replays the earlier answer.
  if (!b.fresh && !b.focusKeys?.length) {
    const norm = (q: string) => q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const nq = norm(question);
    const recent = await prisma.userQuery.findMany({
      where: { repoId: id, provider: { not: null }, createdAt: { gt: repo.lastAnalyzedAt } },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    const hit = recent.find((q) => norm(q.question) === nq && q.answer && !q.answer.includes("**Error:**"));
    if (hit) {
      const enc = new TextEncoder();
      const answer = hit.answer!;
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(enc.encode(JSON.stringify({ sources: hit.sources ? JSON.parse(hit.sources) : [], facts: [], mode: "cached", cached: true, cachedAt: hit.createdAt }) + "\n"));
          for (let i = 0; i < answer.length; i += 400) controller.enqueue(enc.encode(answer.slice(i, i + 400)));
          await prisma.userQuery.create({ data: { repoId: id, question, answer, sources: hit.sources, provider: hit.provider } }).catch(() => {});
          controller.close();
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
    }
  }

  const r = await retrieve(id, question, { k: 10, focusKeys: b.focusKeys });
  const sources = r.chunks.map((c) => ({ path: c.path, startLine: c.startLine, endLine: c.endLine, entity: c.entityName, key: c.entityKey ?? c.fileKey, reasons: c.reasons }));
  const history = await prisma.userQuery.findMany({ where: { repoId: id, answer: { not: null } }, orderBy: { createdAt: "desc" }, take: 3 });
  const llm = await hasLLM();

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => controller.enqueue(enc.encode(s));
      send(JSON.stringify({ sources, facts: r.facts.slice(0, 12), mode: r.mode, seeds: r.seeds.map((s) => s.key) }) + "\n");
      let answer = "";
      let provider: string | null = null;
      try {
        if (!llm) {
          answer = [
            "_No LLM key configured — showing the most relevant code found by the knowledge graph and keyword search. Add a Gemini or OpenAI key in **Settings** for full answers._",
            "",
            ...r.facts.slice(0, 8).map((f) => `- ${f}`),
            "",
            ...sources.slice(0, 6).map((s) => `- \`${s.path}:${s.startLine}\`${s.entity ? ` — ${s.entity}` : ""}`),
          ].join("\n");
          send(answer);
        } else {
          const context = r.chunks
            .map((c, i) => `[${i + 1}] ${c.path}:${c.startLine}-${c.endLine}${c.entityName ? ` (${c.entityType} ${c.entityName})` : ""}\n\`\`\`\n${c.content.slice(0, 3500)}\n\`\`\``)
            .join("\n\n");
          const prev = history.reverse().map((h) => `Q: ${h.question}\nA: ${(h.answer || "").slice(0, 600)}`).join("\n\n");
          const prompt = `Repository: ${repo.name}
${repo.summary ? `Repository summary:\n${repo.summary.slice(0, 2500)}\n` : ""}
Knowledge-graph facts:
${r.facts.map((f) => `- ${f}`).join("\n") || "- (none)"}

Retrieved code (${r.mode} retrieval):
${context || "(no code matched)"}
${prev ? `\nRecent conversation:\n${prev}\n` : ""}
Question: ${question}`;
          for await (const ev of streamText({ system: SYSTEM, prompt })) {
            if (ev.provider) provider = `${ev.provider}:${ev.model}`;
            if (ev.delta) { answer += ev.delta; send(ev.delta); }
          }
        }
      } catch (e) {
        const msg = `\n\n**Error:** ${e instanceof Error ? e.message : String(e)}`;
        answer += msg;
        send(msg);
      } finally {
        try {
          await prisma.userQuery.create({ data: { repoId: id, question, answer, sources: JSON.stringify(sources), provider } });
        } catch { /* ignore */ }
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
});
