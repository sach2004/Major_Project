import { json, route, type Ctx } from "@/lib/api";
import { loadGraph, neighbours, type GNode } from "@/lib/graph";
import { getInsights } from "@/lib/insights";
import { moduleOf } from "@/lib/modules";
import { CODE_LANGS, type Lang } from "@/lib/analysis/languages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface VNode { id: string; label: string; kind: string; group: string; size: number; type?: string; language?: string; path?: string; fanIn?: number; fanOut?: number; churn?: number }
interface VLink { source: string; target: string; type: string; weight: number }

const toV = (n: GNode): VNode => ({
  id: n.key,
  label: n.kind === "entity" ? n.qualifiedName ?? n.name : n.kind === "file" ? n.name : n.name,
  kind: n.kind,
  group: n.path ? moduleOf(n.path) : "external",
  size: Math.max(1, Math.log2(2 + (n.loc || 1)) + Math.sqrt(n.fanIn || 0)),
  type: n.type,
  language: n.language,
  path: n.path,
  fanIn: n.fanIn,
  fanOut: n.fanOut,
  churn: n.churn,
});

/**
 * Knowledge-graph views.
 *  level=module  → module dependency graph
 *  level=file    → file import graph (+ optional co-change edges)
 *  level=entity  → class/function call & inheritance graph
 *  focus=<key>   → ego graph around one node (depth 1–2)
 */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const level = sp.get("level") || "file";
  const focus = sp.get("focus");
  const depth = Math.min(2, Math.max(1, parseInt(sp.get("depth") || "1", 10) || 1));
  const withCo = sp.get("cochange") === "1";
  const limit = Math.min(1500, parseInt(sp.get("limit") || "400", 10) || 400);
  const g = await loadGraph(id);

  if (focus) {
    const center = g.nodes.get(focus);
    if (!center) return json({ nodes: [], links: [], truncated: false });
    const keep = new Map<string, GNode>([[center.key, center]]);
    let frontier = [center.key];
    const links: VLink[] = [];
    const seen = new Set<string>();
    for (let d = 0; d < depth; d++) {
      const next: string[] = [];
      for (const k of frontier) {
        const nbs = neighbours(g, k).sort((a, b) => b.node.fanIn - a.node.fanIn).slice(0, d === 0 ? 60 : 12);
        for (const nb of nbs) {
          if (nb.type === "CO_CHANGED" && !withCo) continue;
          if (!keep.has(nb.node.key)) { keep.set(nb.node.key, nb.node); next.push(nb.node.key); }
          const [s, t] = nb.dir === "out" ? [k, nb.node.key] : [nb.node.key, k];
          const lk = `${s}|${t}|${nb.type}`;
          if (!seen.has(lk)) { seen.add(lk); links.push({ source: s, target: t, type: nb.type, weight: nb.weight }); }
        }
      }
      frontier = next;
    }
    return json({ nodes: [...keep.values()].map(toV), links, center: center.key, truncated: false });
  }

  if (level === "module") {
    const ins = await getInsights(id);
    return json({
      nodes: ins.modules.map((m) => ({ id: `m:${m.name}`, label: m.name, kind: "module", group: m.name, size: Math.max(2, Math.log2(2 + m.loc) * 1.4), fanIn: m.fanIn, fanOut: m.fanOut, files: m.files, loc: m.loc, instability: m.instability })),
      links: ins.moduleEdges.map((e) => ({ source: `m:${e.source}`, target: `m:${e.target}`, type: "DEPENDS_ON", weight: e.weight })),
      truncated: false,
    });
  }

  if (level === "entity") {
    const ents = g.entities.filter((e) => e.type !== "variable").sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut)).slice(0, limit);
    const set = new Set(ents.map((e) => e.key));
    const links: VLink[] = [];
    for (const e of ents) for (const ed of g.out.get(e.key) || []) {
      if ((ed.type === "CALLS" || ed.type === "EXTENDS") && set.has(ed.to) && ed.to !== e.key) links.push({ source: e.key, target: ed.to, type: ed.type, weight: ed.weight });
    }
    return json({ nodes: ents.map(toV), links, truncated: g.entities.length > ents.length, total: g.entities.length });
  }

  // file level
  const files = g.files
    .filter((f) => CODE_LANGS.has(f.language as Lang))
    .sort((a, b) => b.fanIn + b.fanOut + (b.churn || 0) / 50 - (a.fanIn + a.fanOut + (a.churn || 0) / 50))
    .slice(0, limit);
  const set = new Set(files.map((f) => f.key));
  const links: VLink[] = [];
  for (const f of files) for (const ed of g.out.get(f.key) || []) {
    if (!set.has(ed.to) || ed.to === f.key) continue;
    if (ed.type === "IMPORTS") links.push({ source: f.key, target: ed.to, type: "IMPORTS", weight: ed.weight });
    else if (withCo && ed.type === "CO_CHANGED" && f.key < ed.to) links.push({ source: f.key, target: ed.to, type: "CO_CHANGED", weight: ed.weight });
  }
  return json({ nodes: files.map(toV), links, truncated: g.files.length > files.length, total: g.files.length });
});
