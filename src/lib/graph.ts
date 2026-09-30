import { prisma } from "./db";
import { cached } from "./cache";

export type NodeKind = "file" | "entity" | "package";

export interface GNode {
  key: string;
  kind: NodeKind;
  name: string;
  path?: string;
  type?: string;
  language?: string;
  loc?: number;
  fileKey?: string;
  startLine?: number;
  endLine?: number;
  fanIn: number;
  fanOut: number;
  churn?: number;
  commitCount?: number;
  authors?: number;
  exported?: boolean;
  qualifiedName?: string;
}
export interface GEdge { to: string; type: string; weight: number }
export interface RepoGraph {
  nodes: Map<string, GNode>;
  out: Map<string, GEdge[]>;
  in: Map<string, GEdge[]>; // GEdge.to = source here
  files: GNode[];
  entities: GNode[];
  byName: Map<string, GNode[]>;
}

export async function repoStamp(repoId: string): Promise<number> {
  const r = await prisma.repository.findUnique({ where: { id: repoId }, select: { lastAnalyzedAt: true } });
  return r?.lastAnalyzedAt?.getTime() ?? 0;
}

export async function loadGraph(repoId: string): Promise<RepoGraph> {
  const stamp = await repoStamp(repoId);
  return cached(repoId, "graph", stamp, async () => {
    const [files, entities, edges] = await Promise.all([
      prisma.file.findMany({ where: { repoId }, select: { key: true, path: true, language: true, loc: true, fanIn: true, fanOut: true, churn: true, commitCount: true, authors: true } }),
      prisma.codeEntity.findMany({ where: { repoId }, select: { key: true, name: true, qualifiedName: true, type: true, startLine: true, endLine: true, fanIn: true, fanOut: true, exported: true, file: { select: { key: true, path: true, language: true } } } }),
      prisma.graphEdge.findMany({ where: { repoId }, select: { source: true, target: true, type: true, weight: true } }),
    ]);
    const nodes = new Map<string, GNode>();
    const fnodes: GNode[] = [];
    const enodes: GNode[] = [];
    for (const f of files) {
      const n: GNode = { key: f.key, kind: "file", name: f.path.split("/").pop()!, path: f.path, language: f.language, loc: f.loc, fanIn: f.fanIn, fanOut: f.fanOut, churn: f.churn, commitCount: f.commitCount, authors: f.authors };
      nodes.set(n.key, n);
      fnodes.push(n);
    }
    for (const e of entities) {
      const n: GNode = { key: e.key, kind: "entity", name: e.name, qualifiedName: e.qualifiedName, type: e.type, path: e.file.path, language: e.file.language, fileKey: e.file.key, startLine: e.startLine, endLine: e.endLine, loc: e.endLine - e.startLine + 1, fanIn: e.fanIn, fanOut: e.fanOut, exported: e.exported };
      nodes.set(n.key, n);
      enodes.push(n);
    }
    const out = new Map<string, GEdge[]>();
    const inn = new Map<string, GEdge[]>();
    for (const e of edges) {
      if (e.target.startsWith("p:") && !nodes.has(e.target)) nodes.set(e.target, { key: e.target, kind: "package", name: e.target.slice(2), fanIn: 0, fanOut: 0 });
      if (e.target.startsWith("p:")) nodes.get(e.target)!.fanIn++;
      (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push({ to: e.target, type: e.type, weight: e.weight });
      (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push({ to: e.source, type: e.type, weight: e.weight });
      if (e.type === "CO_CHANGED") {
        // symmetric
        (out.get(e.target) ?? out.set(e.target, []).get(e.target)!).push({ to: e.source, type: e.type, weight: e.weight });
        (inn.get(e.source) ?? inn.set(e.source, []).get(e.source)!).push({ to: e.target, type: e.type, weight: e.weight });
      }
    }
    const byName = new Map<string, GNode[]>();
    for (const n of enodes) {
      const k = n.name.toLowerCase();
      (byName.get(k) ?? byName.set(k, []).get(k)!).push(n);
    }
    return { nodes, out, in: inn, files: fnodes, entities: enodes, byName };
  });
}

export function fileOf(g: RepoGraph, key: string): GNode | undefined {
  const n = g.nodes.get(key);
  if (!n) return undefined;
  if (n.kind === "file") return n;
  return n.fileKey ? g.nodes.get(n.fileKey) : undefined;
}

/** Neighbours with a relationship label, both directions. */
export function neighbours(g: RepoGraph, key: string, types?: string[]): { node: GNode; type: string; dir: "out" | "in"; weight: number }[] {
  const res: { node: GNode; type: string; dir: "out" | "in"; weight: number }[] = [];
  for (const e of g.out.get(key) || []) {
    if (types && !types.includes(e.type)) continue;
    const n = g.nodes.get(e.to);
    if (n) res.push({ node: n, type: e.type, dir: "out", weight: e.weight });
  }
  for (const e of g.in.get(key) || []) {
    if (types && !types.includes(e.type)) continue;
    if (e.type === "CO_CHANGED") continue; // already added via symmetric out
    const n = g.nodes.get(e.to);
    if (n) res.push({ node: n, type: e.type, dir: "in", weight: e.weight });
  }
  return res;
}
