import { json, route, type Ctx } from "@/lib/api";
import { loadGraph } from "@/lib/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface TreeNode { name: string; path: string; key?: string; language?: string; loc: number; churn: number; children?: TreeNode[] }

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const g = await loadGraph(id);
  const root: TreeNode = { name: "/", path: "", loc: 0, churn: 0, children: [] };
  const dirs = new Map<string, TreeNode>([["", root]]);
  for (const f of [...g.files].sort((a, b) => a.path!.localeCompare(b.path!))) {
    const parts = f.path!.split("/");
    let parent = root;
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      let d = dirs.get(acc);
      if (!d) {
        d = { name: parts[i], path: acc, loc: 0, churn: 0, children: [] };
        dirs.set(acc, d);
        parent.children!.push(d);
      }
      parent = d;
    }
    parent.children!.push({ name: parts[parts.length - 1], path: f.path!, key: f.key, language: f.language, loc: f.loc || 0, churn: f.churn || 0 });
  }
  const roll = (n: TreeNode): void => {
    if (!n.children) return;
    for (const c of n.children) roll(c);
    n.loc = n.children.reduce((s, c) => s + c.loc, 0);
    n.churn = n.children.reduce((s, c) => s + c.churn, 0);
    n.children.sort((a, b) => (a.children ? 0 : 1) - (b.children ? 0 : 1) || a.name.localeCompare(b.name));
  };
  roll(root);
  return json(root);
});
