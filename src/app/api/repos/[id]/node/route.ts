import { prisma } from "@/lib/db";
import { fail, json, route, type Ctx } from "@/lib/api";
import { loadGraph, neighbours, type GNode } from "@/lib/graph";
import { readRepoFile } from "@/lib/source";
import { moduleOf } from "@/lib/modules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ref = (n: GNode) => ({ key: n.key, kind: n.kind, name: n.kind === "entity" ? n.qualifiedName ?? n.name : n.kind === "file" ? n.path : n.name, type: n.type ?? n.language, path: n.path, line: n.startLine });

/** Detail for one knowledge-graph node: metadata, source, relationships, history. */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const key = new URL(req.url).searchParams.get("key");
  if (!key) return fail("key is required");
  const g = await loadGraph(id);
  const n = g.nodes.get(key);
  if (!n) return fail("Node not found", 404);

  const nb = neighbours(g, key);
  const group = (type: string, dir: "in" | "out") =>
    nb.filter((x) => x.type === type && x.dir === dir).sort((a, b) => b.weight - a.weight || b.node.fanIn - a.node.fanIn).slice(0, 50).map((x) => ({ ...ref(x.node), weight: x.weight }));
  const relations = {
    contains: group("CONTAINS", "out"),
    containedIn: group("CONTAINS", "in"),
    imports: group("IMPORTS", "out"),
    importedBy: group("IMPORTS", "in"),
    calls: group("CALLS", "out"),
    calledBy: group("CALLS", "in"),
    extends: group("EXTENDS", "out"),
    extendedBy: group("EXTENDS", "in"),
    coChanged: group("CO_CHANGED", "out"),
  };

  if (n.kind === "package") {
    return json({ node: ref(n), kind: "package", relations, usedBy: relations.importedBy.length });
  }

  const filePath = n.path!;
  const source = await readRepoFile(id, filePath);
  let summary: string | null = null;
  let signature: string | null = null;
  let meta: Record<string, unknown> = {};
  if (n.kind === "file") {
    const f = await prisma.file.findFirst({ where: { repoId: id, key }, select: { summary: true, externalDeps: true, lastModified: true, size: true } });
    summary = f?.summary ?? null;
    meta = { externalDeps: f?.externalDeps ? JSON.parse(f.externalDeps) : [], lastModified: f?.lastModified, size: f?.size };
  } else {
    const e = await prisma.codeEntity.findFirst({ where: { repoId: id, key }, select: { summary: true, signature: true, exported: true, parentKey: true } });
    summary = e?.summary ?? null;
    signature = e?.signature ?? null;
    meta = { exported: e?.exported, parent: e?.parentKey ? (g.nodes.get(e.parentKey) ? ref(g.nodes.get(e.parentKey)!) : null) : null };
  }

  const commitFiles = await prisma.commitFile.findMany({
    where: { repoId: id, path: filePath },
    orderBy: { commit: { committedAt: "desc" } },
    take: 20,
    select: { changeType: true, additions: true, deletions: true, commit: { select: { sha: true, message: true, committedAt: true, developer: { select: { name: true } } } } },
  });

  return json({
    node: { ...ref(n), loc: n.loc, fanIn: n.fanIn, fanOut: n.fanOut, churn: n.churn, commitCount: n.commitCount, authors: n.authors, startLine: n.startLine, endLine: n.endLine, language: n.language, module: moduleOf(filePath) },
    kind: n.kind,
    summary,
    signature,
    meta,
    source: source == null ? null : n.kind === "entity" ? { text: source.split("\n").slice(n.startLine! - 1, n.endLine!).join("\n"), startLine: n.startLine } : { text: source.split("\n").slice(0, 1500).join("\n"), startLine: 1, truncated: source.split("\n").length > 1500 },
    relations,
    commits: commitFiles.map((c) => ({ sha: c.commit.sha, message: c.commit.message.split("\n")[0], date: c.commit.committedAt, author: c.commit.developer?.name ?? "unknown", changeType: c.changeType, additions: c.additions, deletions: c.deletions })),
  });
});
