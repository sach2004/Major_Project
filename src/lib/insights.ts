import { loadGraph, repoStamp } from "./graph";
import { cached } from "./cache";
import { sampleCycle, stronglyConnected } from "./analysis/graph-algos";
import { CODE_LANGS, isTestPath, type Lang } from "./analysis/languages";
import { moduleOf } from "./modules";

export interface Issue {
  id: string;
  category: "cycle" | "god-file" | "hotspot" | "dead-code" | "orphan" | "bus-factor" | "large-function" | "module-cycle";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  keys: string[];
  metric?: number;
}

export interface InsightReport {
  health: number;
  counts: Record<string, number>;
  issues: Issue[];
  modules: { name: string; files: number; loc: number; fanIn: number; fanOut: number; instability: number }[];
  moduleEdges: { source: string; target: string; weight: number }[];
}

const ENTRY = /(^|\/)(index|main|app|server|cli|__main__|__init__|setup|manage|program|mod|lib|page|layout|route|middleware|config)\.[a-z]+$/i;
const SPECIAL_FN = /^(main|constructor|init|__\w+__|render|setup|teardown|handle\w*|on[A-Z]\w*|get|post|put|patch|delete|default|toString|equals|hashCode|run|execute|apply|call|invoke|test\w*|it|describe|beforeEach|afterEach|configure|register|build|new|drop|fmt|from|into|serve|ServeHTTP|Main|Dispose|OnModelCreating|ngOnInit|componentDidMount)$/;

export async function computeInsights(repoId: string): Promise<InsightReport> {
  const g = await loadGraph(repoId);
  const issues: Issue[] = [];
  const codeFiles = g.files.filter((f) => CODE_LANGS.has(f.language as Lang));

  // --- circular dependencies (file level)
  const adj = new Map<string, string[]>();
  for (const f of codeFiles) adj.set(f.key, (g.out.get(f.key) || []).filter((e) => e.type === "IMPORTS" && e.to.startsWith("f:")).map((e) => e.to));
  const sccs = stronglyConnected(codeFiles.map((f) => f.key), adj).sort((a, b) => b.length - a.length);
  sccs.slice(0, 15).forEach((comp, i) => {
    const cyc = sampleCycle(comp, adj);
    issues.push({
      id: `cycle-${i}`, category: "cycle", severity: comp.length > 4 ? "high" : "medium",
      title: `Circular dependency between ${comp.length} files`,
      detail: cyc.map((k) => k.slice(2)).join(" → "),
      keys: comp, metric: comp.length,
    });
  });

  // --- module-level graph & cycles
  const modAgg = new Map<string, { files: number; loc: number }>();
  for (const f of codeFiles) {
    const m = moduleOf(f.path!);
    const v = modAgg.get(m) || { files: 0, loc: 0 };
    v.files++; v.loc += f.loc || 0;
    modAgg.set(m, v);
  }
  const mEdges = new Map<string, number>();
  for (const f of codeFiles) {
    const ms = moduleOf(f.path!);
    for (const e of g.out.get(f.key) || []) {
      if (e.type !== "IMPORTS" || !e.to.startsWith("f:")) continue;
      const t = g.nodes.get(e.to);
      if (!t?.path) continue;
      const mt = moduleOf(t.path);
      if (mt === ms) continue;
      const k = `${ms}\u0000${mt}`;
      mEdges.set(k, (mEdges.get(k) || 0) + 1);
    }
  }
  const moduleEdges = [...mEdges.entries()].map(([k, w]) => { const [source, target] = k.split("\u0000"); return { source, target, weight: w }; });
  const mAdj = new Map<string, string[]>();
  for (const e of moduleEdges) (mAdj.get(e.source) ?? mAdj.set(e.source, []).get(e.source)!).push(e.target);
  stronglyConnected([...modAgg.keys()], mAdj).slice(0, 5).forEach((comp, i) => {
    issues.push({ id: `mcycle-${i}`, category: "module-cycle", severity: "high", title: `Modules depend on each other: ${comp.join(", ")}`, detail: sampleCycle(comp, mAdj).join(" → "), keys: [], metric: comp.length });
  });
  const modules = [...modAgg.entries()].map(([name, v]) => {
    const fanOut = moduleEdges.filter((e) => e.source === name).reduce((s, e) => s + e.weight, 0);
    const fanIn = moduleEdges.filter((e) => e.target === name).reduce((s, e) => s + e.weight, 0);
    return { name, ...v, fanIn, fanOut, instability: fanIn + fanOut ? +(fanOut / (fanIn + fanOut)).toFixed(2) : 0 };
  }).sort((a, b) => b.loc - a.loc);

  // --- god files
  const coupling = codeFiles.map((f) => ({ f, c: f.fanIn + f.fanOut })).sort((a, b) => b.c - a.c);
  const cThresh = Math.max(10, coupling[Math.floor(coupling.length * 0.05)]?.c ?? 10);
  for (const { f, c } of coupling.slice(0, 10)) {
    if (c < cThresh || (f.loc || 0) < 250) continue;
    const ents = (g.out.get(f.key) || []).filter((e) => e.type === "CONTAINS").length;
    issues.push({ id: `god-${f.key}`, category: "god-file", severity: (f.loc || 0) > 800 ? "high" : "medium", title: `God file: ${f.path}`, detail: `${f.loc} lines, ${ents} top-level entities, coupled to ${c} files (in ${f.fanIn} / out ${f.fanOut})`, keys: [f.key], metric: c });
  }

  // --- hotspots (churn × size)
  const hot = codeFiles.filter((f) => (f.commitCount || 0) >= 2).map((f) => ({ f, s: (f.commitCount || 0) * Math.log2(2 + (f.loc || 0)) })).sort((a, b) => b.s - a.s);
  const maxHot = hot[0]?.s || 1;
  for (const { f, s } of hot.slice(0, 10)) {
    const rel = s / maxHot;
    if (rel < 0.25) continue;
    issues.push({ id: `hot-${f.key}`, category: "hotspot", severity: rel > 0.7 ? "high" : rel > 0.45 ? "medium" : "low", title: `Hotspot: ${f.path}`, detail: `${f.commitCount} commits in recent history, ${f.churn} lines churned, ${f.loc} LOC — frequently changed and sizeable`, keys: [f.key], metric: Math.round(rel * 100) });
  }

  // --- bus factor
  for (const f of codeFiles.filter((f) => f.authors === 1 && (f.commitCount || 0) >= 4).sort((a, b) => (b.commitCount || 0) - (a.commitCount || 0)).slice(0, 8)) {
    issues.push({ id: `bus-${f.key}`, category: "bus-factor", severity: "low", title: `Single-owner file: ${f.path}`, detail: `All ${f.commitCount} recent commits come from one author — knowledge concentration risk`, keys: [f.key], metric: f.commitCount });
  }

  // --- dead code candidates
  const dead = g.entities.filter((e) =>
    (e.type === "function" || e.type === "method") && e.fanIn === 0 && !e.exported && !isTestPath(e.path!) && !SPECIAL_FN.test(e.name) && !e.name.startsWith("test"),
  );
  for (const e of dead.slice(0, 40)) {
    issues.push({ id: `dead-${e.key}`, category: "dead-code", severity: "low", title: `Possibly unused: ${e.qualifiedName}`, detail: `${e.type} in ${e.path}:${e.startLine} is private and has no detected callers`, keys: [e.key] });
  }

  // --- large functions
  for (const e of g.entities.filter((e) => (e.type === "function" || e.type === "method") && (e.loc || 0) > 90).sort((a, b) => (b.loc || 0) - (a.loc || 0)).slice(0, 10)) {
    issues.push({ id: `big-${e.key}`, category: "large-function", severity: (e.loc || 0) > 200 ? "medium" : "low", title: `Long ${e.type}: ${e.qualifiedName}`, detail: `${e.loc} lines in ${e.path}:${e.startLine} — consider splitting`, keys: [e.key], metric: e.loc });
  }

  // --- orphans
  const orphans = codeFiles.filter((f) => f.fanIn === 0 && !(g.out.get(f.key) || []).some((e) => e.type === "IMPORTS" && e.to.startsWith("f:")) && !ENTRY.test(f.path!) && !isTestPath(f.path!) && (f.loc || 0) > 15);
  for (const f of orphans.slice(0, 15)) {
    issues.push({ id: `orphan-${f.key}`, category: "orphan", severity: "low", title: `Isolated file: ${f.path}`, detail: "Not imported by, and does not import, any other indexed file", keys: [f.key] });
  }

  const counts: Record<string, number> = {};
  for (const i of issues) counts[i.category] = (counts[i.category] || 0) + 1;
  const penalty = issues.reduce((s, i) => s + (i.severity === "high" ? 6 : i.severity === "medium" ? 3 : 0.6), 0);
  const health = Math.max(10, Math.round(100 - Math.min(90, penalty / Math.max(1, Math.sqrt(codeFiles.length / 40)))));
  const sevRank = { high: 0, medium: 1, low: 2 } as const;
  issues.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
  return { health, counts, issues, modules, moduleEdges };
}

/** Cached per analysis run — insights are recomputed only after the repo is re-indexed. */
export async function getInsights(repoId: string): Promise<InsightReport> {
  const stamp = await repoStamp(repoId);
  return cached(repoId, "insights", stamp, () => computeInsights(repoId));
}
