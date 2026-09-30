import { loadGraph, fileOf, type GNode, type RepoGraph } from "./graph";
import { isTestPath } from "./analysis/languages";

export interface ImpactItem {
  key: string;
  label: string;
  kind: string;
  path?: string;
  depth: number;
  relation: string;
  via: string[];
  score: number;
}
export interface ImpactResult {
  targets: { key: string; label: string; kind: string; path?: string }[];
  impacted: ImpactItem[];
  impactedFiles: { path: string; key: string; depth: number; reasons: string[] }[];
  coChange: { path: string; key: string; count: number; confidence: number }[];
  tests: { path: string; key: string; reason: string }[];
  risk: { score: number; level: "low" | "medium" | "high"; factors: { label: string; points: number; detail: string }[] };
  graph: { nodes: { id: string; label: string; kind: string; group: string; depth: number }[]; links: { source: string; target: string; type: string }[] };
}

const label = (n: GNode) => (n.kind === "entity" ? n.qualifiedName ?? n.name : n.kind === "file" ? n.path! : n.name);

/** Parse a unified diff into changed files + changed line ranges (new side). */
export function parseDiff(diff: string): { path: string; ranges: [number, number][] }[] {
  const out: { path: string; ranges: [number, number][] }[] = [];
  let cur: { path: string; ranges: [number, number][] } | null = null;
  for (const line of diff.split("\n")) {
    const m = line.match(/^\+\+\+ (?:b\/)?(.+?)\s*$/);
    if (m && m[1] !== "/dev/null") { cur = { path: m[1].trim(), ranges: [] }; out.push(cur); continue; }
    const g = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (g) { cur = { path: g[2].trim(), ranges: [] }; out.push(cur); continue; }
    const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (h && cur) {
      const s = parseInt(h[1], 10), n = h[2] ? parseInt(h[2], 10) : 1;
      cur.ranges.push([s, s + Math.max(0, n - 1)]);
    }
  }
  const merged = new Map<string, { path: string; ranges: [number, number][] }>();
  for (const f of out) {
    const e = merged.get(f.path);
    if (e) e.ranges.push(...f.ranges); else merged.set(f.path, { ...f });
  }
  return [...merged.values()];
}

export function targetsFromDiff(g: RepoGraph, diff: string): string[] {
  const keys: string[] = [];
  for (const f of parseDiff(diff)) {
    const file = g.files.find((x) => x.path === f.path || x.path!.endsWith("/" + f.path) || f.path.endsWith("/" + x.path));
    if (!file) continue;
    const ents = g.entities.filter((e) => e.fileKey === file.key && f.ranges.some(([a, b]) => e.startLine! <= b && e.endLine! >= a));
    // prefer the innermost entities
    const inner = ents.filter((e) => !ents.some((o) => o !== e && o.startLine! >= e.startLine! && o.endLine! <= e.endLine!));
    if (inner.length && inner.length <= 12) keys.push(...inner.map((e) => e.key));
    else keys.push(file.key);
  }
  return [...new Set(keys)];
}

export async function computeImpact(repoId: string, targetKeys: string[]): Promise<ImpactResult> {
  const g = await loadGraph(repoId);
  const targets = targetKeys.map((k) => g.nodes.get(k)).filter((n): n is GNode => !!n);
  if (!targets.length) throw new Error("Select at least one file or code entity (or paste a diff that touches indexed files).");

  const targetSet = new Set(targets.map((t) => t.key));
  const best = new Map<string, ImpactItem>();
  const parent = new Map<string, string>();
  type Q = { key: string; depth: number; rel: string };
  const queue: Q[] = [];
  const MAX_DEPTH = 3;

  // seed: targets + entities contained in target files
  for (const t of targets) {
    queue.push({ key: t.key, depth: 0, rel: "target" });
    if (t.kind === "file") {
      for (const e of g.out.get(t.key) || []) if (e.type === "CONTAINS") {
        queue.push({ key: e.to, depth: 0, rel: "target" });
        parent.set(e.to, t.key);
        for (const e2 of g.out.get(e.to) || []) if (e2.type === "CONTAINS") { queue.push({ key: e2.to, depth: 0, rel: "target" }); parent.set(e2.to, e.to); }
      }
    }
  }
  const visited = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur.key)) continue;
    visited.add(cur.key);
    if (cur.depth >= MAX_DEPTH) continue;
    const curNode = g.nodes.get(cur.key);
    const deps: { key: string; rel: string; w: number }[] = [];
    for (const e of g.in.get(cur.key) || []) {
      if (e.type === "CALLS") deps.push({ key: e.to, rel: "calls", w: e.weight });
      else if (e.type === "EXTENDS") deps.push({ key: e.to, rel: "extends", w: 2 });
      else if (e.type === "IMPORTS") deps.push({ key: e.to, rel: "imports", w: 1 });
    }
    // exported entity: modules importing its file are potentially affected
    if (curNode?.kind === "entity" && curNode.exported && curNode.fileKey && cur.depth === 0) {
      for (const e of (g.in.get(curNode.fileKey) || []).slice(0, 15)) if (e.type === "IMPORTS") deps.push({ key: e.to, rel: "imports module of", w: 0.6 });
    }
    for (const d of deps) {
      if (targetSet.has(d.key)) continue;
      const n = g.nodes.get(d.key);
      if (!n) continue;
      const depth = cur.depth + 1;
      const score = (1 / depth) * Math.min(2, 0.6 + Math.log2(1 + d.w));
      const prev = best.get(d.key);
      if (!prev || prev.depth > depth || (prev.depth === depth && prev.score < score)) {
        parent.set(d.key, cur.key);
        best.set(d.key, { key: d.key, label: label(n), kind: n.kind === "entity" ? n.type! : n.kind, path: n.path, depth, relation: d.rel, via: [], score });
      }
      if (!visited.has(d.key)) queue.push({ key: d.key, depth, rel: d.rel });
    }
  }
  for (const it of best.values()) {
    const via: string[] = [];
    let p = parent.get(it.key);
    let guard = 0;
    while (p && guard++ < 6) {
      const n = g.nodes.get(p);
      if (n) via.push(label(n));
      if (targetSet.has(p)) break;
      p = parent.get(p);
    }
    it.via = via;
  }
  const impacted = [...best.values()].sort((a, b) => a.depth - b.depth || b.score - a.score).slice(0, 300);

  // aggregate to files
  const targetFiles = new Set(targets.map((t) => fileOf(g, t.key)?.key).filter(Boolean) as string[]);
  const fileAgg = new Map<string, { path: string; key: string; depth: number; reasons: Set<string> }>();
  for (const it of impacted) {
    const f = fileOf(g, it.key);
    if (!f || targetFiles.has(f.key)) continue;
    const cur = fileAgg.get(f.key) || { path: f.path!, key: f.key, depth: it.depth, reasons: new Set<string>() };
    cur.depth = Math.min(cur.depth, it.depth);
    cur.reasons.add(`${it.relation} ${it.via[0] ?? ""}`.trim());
    fileAgg.set(f.key, cur);
  }
  const impactedFiles = [...fileAgg.values()].sort((a, b) => a.depth - b.depth).map((f) => ({ ...f, reasons: [...f.reasons].slice(0, 4) }));

  // historical coupling
  const co = new Map<string, number>();
  for (const fk of targetFiles) for (const e of g.out.get(fk) || []) if (e.type === "CO_CHANGED" && !targetFiles.has(e.to)) co.set(e.to, (co.get(e.to) || 0) + e.weight);
  const targetCommits = Math.max(1, ...[...targetFiles].map((k) => g.nodes.get(k)?.commitCount || 0));
  const coChange = [...co.entries()]
    .map(([key, count]) => ({ key, path: g.nodes.get(key)?.path ?? key.slice(2), count, confidence: Math.min(1, count / targetCommits) }))
    .sort((a, b) => b.count - a.count).slice(0, 15);

  // tests
  const tests = new Map<string, { path: string; key: string; reason: string }>();
  for (const f of impactedFiles) if (isTestPath(f.path)) tests.set(f.key, { path: f.path, key: f.key, reason: "depends on changed code" });
  for (const c of coChange) if (isTestPath(c.path)) tests.set(c.key, { path: c.path, key: c.key, reason: "historically changes together" });
  for (const tk of targetFiles) {
    const stem = (g.nodes.get(tk)?.name || "").replace(/\.[^.]+$/, "").toLowerCase();
    if (stem.length < 3) continue;
    for (const f of g.files) if (isTestPath(f.path!) && f.name.toLowerCase().includes(stem)) tests.set(f.key, { path: f.path!, key: f.key, reason: "test named after changed file" });
  }
  const testList = [...tests.values()].slice(0, 20);

  // risk score
  const factors: ImpactResult["risk"]["factors"] = [];
  const nonTestImpacted = impactedFiles.filter((f) => !isTestPath(f.path)).length;
  const breadth = Math.round(Math.min(1, nonTestImpacted / 20) * 35);
  factors.push({ label: "Blast radius", points: breadth, detail: `${nonTestImpacted} dependent files across ${new Set(impactedFiles.map((f) => f.path.split("/").slice(0, -1).join("/"))).size} directories` });
  const fanIn = Math.max(0, ...targets.map((t) => t.fanIn));
  const central = Math.round(Math.min(1, fanIn / 12) * 20);
  factors.push({ label: "Centrality", points: central, detail: `highest fan-in among targets: ${fanIn}` });
  const allCommits = g.files.map((f) => f.commitCount || 0).sort((a, b) => a - b);
  const pct = allCommits.length ? allCommits.filter((c) => c <= targetCommits).length / allCommits.length : 0;
  const churnPts = targetCommits > 1 ? Math.round(pct * 15) : 0;
  factors.push({ label: "Change frequency", points: churnPts, detail: `${targetCommits} recent commits touch the target (${Math.round(pct * 100)}th percentile)` });
  const coPts = Math.round(Math.min(1, coChange.reduce((s, c) => s + c.count, 0) / 12) * 10);
  factors.push({ label: "Hidden coupling", points: coPts, detail: `${coChange.length} files historically change alongside it` });
  const testPts = testList.length === 0 ? 15 : testList.length < 2 ? 6 : 0;
  factors.push({ label: "Test coverage signal", points: testPts, detail: testList.length ? `${testList.length} related test files found` : "no related tests detected" });
  const authors = Math.max(0, ...[...targetFiles].map((k) => g.nodes.get(k)?.authors || 0));
  const busPts = authors === 1 && targetCommits >= 3 ? 5 : 0;
  factors.push({ label: "Knowledge concentration", points: busPts, detail: authors ? `${authors} author(s) have touched the target recently` : "no history available" });
  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  const level = score < 30 ? "low" : score < 60 ? "medium" : "high";

  // visual graph
  const gnodes: ImpactResult["graph"]["nodes"] = targets.map((t) => ({ id: t.key, label: t.kind === "file" ? t.name : t.qualifiedName ?? t.name, kind: t.kind === "entity" ? t.type! : t.kind, group: "target", depth: 0 }));
  const gl: ImpactResult["graph"]["links"] = [];
  const inGraph = new Set(gnodes.map((n) => n.id));
  for (const it of impacted.slice(0, 70)) {
    const n = g.nodes.get(it.key)!;
    gnodes.push({ id: it.key, label: n.kind === "file" ? n.name : n.qualifiedName ?? n.name, kind: it.kind, group: isTestPath(n.path || "") ? "test" : `d${it.depth}`, depth: it.depth });
    inGraph.add(it.key);
  }
  for (const it of impacted.slice(0, 70)) {
    let p = parent.get(it.key);
    // walk up until we hit something in the graph (skips contained-entity hops)
    let guard = 0;
    while (p && !inGraph.has(p) && guard++ < 5) p = parent.get(p);
    if (p && inGraph.has(p)) gl.push({ source: p, target: it.key, type: it.relation });
  }
  for (const c of coChange.slice(0, 8)) {
    if (!inGraph.has(c.key)) { gnodes.push({ id: c.key, label: c.path.split("/").pop()!, kind: "file", group: "cochange", depth: 1 }); inGraph.add(c.key); }
    const tf = [...targetFiles][0];
    if (tf) {
      if (!inGraph.has(tf)) { const n = g.nodes.get(tf)!; gnodes.push({ id: tf, label: n.name, kind: "file", group: "target", depth: 0 }); inGraph.add(tf); }
      gl.push({ source: tf, target: c.key, type: "co-changes" });
    }
  }

  return {
    targets: targets.map((t) => ({ key: t.key, label: label(t), kind: t.kind === "entity" ? t.type! : t.kind, path: t.path })),
    impacted,
    impactedFiles,
    coChange,
    tests: testList,
    risk: { score, level, factors },
    graph: { nodes: gnodes, links: gl },
  };
}
