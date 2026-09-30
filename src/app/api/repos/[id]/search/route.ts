import { json, route, type Ctx } from "@/lib/api";
import { loadGraph, type GNode } from "@/lib/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fuzzy name search over files + code entities (used by explorer & impact target picker). */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const q = (new URL(req.url).searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 1) return json([]);
  const g = await loadGraph(id);
  const scored: { n: GNode; s: number }[] = [];
  const consider = (n: GNode, hay: string, name: string) => {
    const h = hay.toLowerCase();
    const nm = name.toLowerCase();
    let s = 0;
    if (nm === q) s = 100;
    else if (nm.startsWith(q)) s = 70;
    else if (nm.includes(q)) s = 50;
    else if (h.includes(q)) s = 30;
    else return;
    s += Math.min(20, n.fanIn);
    if (n.kind === "file") s += 5;
    scored.push({ n, s });
  };
  for (const f of g.files) consider(f, f.path!, f.name);
  for (const e of g.entities) consider(e, `${e.qualifiedName} ${e.path}`, e.name);
  scored.sort((a, b) => b.s - a.s);
  return json(
    scored.slice(0, 25).map(({ n }) => ({
      key: n.key,
      kind: n.kind,
      name: n.kind === "entity" ? n.qualifiedName ?? n.name : n.name,
      type: n.type ?? n.language,
      path: n.path,
      line: n.startLine,
      fanIn: n.fanIn,
    })),
  );
});
