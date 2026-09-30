import { prisma } from "../db";
import { cached } from "../cache";
import { loadGraph, neighbours, repoStamp, type GNode, type RepoGraph } from "../graph";
import { embedTexts, spaceAvailable } from "../llm";
import { BM25, tokenize } from "./bm25";

export interface ChunkRec {
  id: string;
  path: string;
  fileKey: string;
  entityKey: string | null;
  entityName: string | null;
  entityType: string | null;
  startLine: number;
  endLine: number;
  content: string;
}

interface ChunkIndex {
  chunks: ChunkRec[];
  byId: Map<string, number>;
  bm25: BM25;
  byEntity: Map<string, number[]>;
  byFile: Map<string, number[]>;
}

interface VectorIndex {
  space: string;
  dims: number;
  rows: number[]; // chunk index
  mat: Float32Array;
}

async function chunkIndex(repoId: string): Promise<ChunkIndex> {
  const stamp = await repoStamp(repoId);
  return cached(repoId, "chunks", stamp, async () => {
    const rows = await prisma.codeChunk.findMany({
      where: { repoId },
      select: { id: true, content: true, startLine: true, endLine: true, file: { select: { path: true, key: true } }, entity: { select: { key: true, qualifiedName: true, type: true } } },
      orderBy: [{ fileId: "asc" }, { chunkIndex: "asc" }],
    });
    const chunks: ChunkRec[] = rows.map((r) => ({
      id: r.id, path: r.file.path, fileKey: r.file.key, entityKey: r.entity?.key ?? null, entityName: r.entity?.qualifiedName ?? null,
      entityType: r.entity?.type ?? null, startLine: r.startLine, endLine: r.endLine, content: r.content,
    }));
    const byId = new Map(chunks.map((c, i) => [c.id, i]));
    const byEntity = new Map<string, number[]>();
    const byFile = new Map<string, number[]>();
    chunks.forEach((c, i) => {
      if (c.entityKey) (byEntity.get(c.entityKey) ?? byEntity.set(c.entityKey, []).get(c.entityKey)!).push(i);
      (byFile.get(c.fileKey) ?? byFile.set(c.fileKey, []).get(c.fileKey)!).push(i);
    });
    const bm25 = new BM25(chunks.map((c) => `${c.path} ${c.entityName ?? ""} ${c.content}`));
    return { chunks, byId, bm25, byEntity, byFile };
  });
}

async function vectorIndex(repoId: string, ci: ChunkIndex): Promise<VectorIndex | null> {
  const repo = await prisma.repository.findUnique({ where: { id: repoId }, select: { embeddingModel: true, lastAnalyzedAt: true } });
  if (!repo?.embeddingModel) return null;
  const stamp = repo.lastAnalyzedAt?.getTime() ?? 0;
  return cached(repoId, "vectors", stamp, async () => {
    const embs = await prisma.embedding.findMany({ where: { repoId, model: repo.embeddingModel! }, select: { chunkId: true, dims: true, vector: true } });
    if (!embs.length) return null;
    const dims = embs[0].dims;
    const rows: number[] = [];
    const mat = new Float32Array(embs.length * dims);
    let n = 0;
    for (const e of embs) {
      const idx = ci.byId.get(e.chunkId);
      if (idx === undefined || e.dims !== dims) continue;
      const copy = new Uint8Array(e.vector); // aligned copy
      mat.set(new Float32Array(copy.buffer, 0, dims), n * dims);
      rows.push(idx);
      n++;
    }
    return { space: repo.embeddingModel!, dims, rows, mat: mat.subarray(0, n * dims) };
  });
}

function vectorSearch(vi: VectorIndex, q: Float32Array, k: number): { idx: number; score: number }[] {
  const res: { idx: number; score: number }[] = [];
  const { dims, mat, rows } = vi;
  if (q.length !== dims) return [];
  for (let r = 0; r < rows.length; r++) {
    let s = 0;
    const o = r * dims;
    for (let d = 0; d < dims; d++) s += mat[o + d] * q[d];
    res.push({ idx: rows[r], score: s });
  }
  return res.sort((a, b) => b.score - a.score).slice(0, k);
}

/** Find graph nodes explicitly mentioned in the question. */
const COMMON = new Set(["handle", "handler", "request", "response", "options", "config", "settings", "process", "result", "update", "create", "delete", "remove", "render", "parse", "format", "string", "number", "object", "values", "export", "import", "module", "client", "server", "service", "method", "function", "return", "change", "impact", "should", "happens", "startup", "architecture", "between", "without", "please", "explain", "where", "which"]);

export function findSeeds(g: RepoGraph, query: string, focusKeys: string[] = []): GNode[] {
  const seeds = new Map<string, GNode>();
  for (const k of focusKeys) { const n = g.nodes.get(k); if (n) seeds.set(k, n); }
  const words = query.match(/[A-Za-z_$][\w$]*(?:\.[\w$]+)*/g) || [];
  for (const raw of words) {
    if (raw.length < 3) continue;
    const last = raw.split(".").pop()!.toLowerCase();
    const cands = g.byName.get(last) || [];
    // identifier-looking tokens (camelCase, snake_case, dotted) are strong signals;
    // plain English words only count when they name exactly one symbol
    const identLike = /[A-Z_]/.test(raw.slice(1)) || raw.includes(".") || raw.includes("_") || /^[A-Z]/.test(raw);
    const plainOk = !identLike && cands.length === 1 && raw.length >= 6 && !COMMON.has(last);
    if (cands.length && (identLike || plainOk) && cands.length <= 6) for (const c of cands.slice(0, 3)) seeds.set(c.key, c);
  }
  const pathish = query.match(/[\w./-]+\.[a-z]{1,5}\b/gi) || [];
  for (const p of pathish) {
    const pl = p.toLowerCase();
    for (const f of g.files) {
      if (f.path!.toLowerCase().endsWith(pl) || f.name.toLowerCase() === pl) { seeds.set(f.key, f); break; }
    }
  }
  return [...seeds.values()].slice(0, 8);
}

function describeNode(n: GNode): string {
  if (n.kind === "file") return `file ${n.path}`;
  if (n.kind === "package") return `package ${n.name}`;
  return `${n.type} ${n.qualifiedName ?? n.name} (${n.path}:${n.startLine})`;
}

export function graphFacts(g: RepoGraph, keys: string[], limit = 24): string[] {
  const facts: string[] = [];
  const done = new Set<string>();
  for (const k of keys) {
    if (done.has(k) || facts.length >= limit) continue;
    done.add(k);
    const n = g.nodes.get(k);
    if (!n) continue;
    const nb = neighbours(g, k);
    const pick = (type: string, dir: "in" | "out", max = 6) => nb.filter((x) => x.type === type && x.dir === dir).sort((a, b) => b.weight - a.weight).slice(0, max).map((x) => (x.node.kind === "entity" ? x.node.qualifiedName ?? x.node.name : x.node.kind === "file" ? x.node.path : x.node.name));
    const parts: string[] = [];
    const calls = pick("CALLS", "out"), calledBy = pick("CALLS", "in");
    const imports = pick("IMPORTS", "out", 8), importedBy = pick("IMPORTS", "in", 8);
    const ext = pick("EXTENDS", "out"), extBy = pick("EXTENDS", "in");
    const co = pick("CO_CHANGED", "out", 5);
    const contains = pick("CONTAINS", "out", 10);
    if (contains.length) parts.push(`contains ${contains.join(", ")}`);
    if (calls.length) parts.push(`calls ${calls.join(", ")}`);
    if (calledBy.length) parts.push(`is called by ${calledBy.join(", ")}`);
    if (ext.length) parts.push(`extends/implements ${ext.join(", ")}`);
    if (extBy.length) parts.push(`is extended by ${extBy.join(", ")}`);
    if (imports.length) parts.push(`imports ${imports.join(", ")}`);
    if (importedBy.length) parts.push(`is imported by ${importedBy.join(", ")}`);
    if (co.length) parts.push(`historically co-changes with ${co.join(", ")}`);
    if (parts.length) facts.push(`${describeNode(n)} — ${parts.join("; ")}`);
  }
  return facts;
}

export interface Retrieved {
  chunks: (ChunkRec & { score: number; reasons: string[] })[];
  facts: string[];
  seeds: GNode[];
  mode: "hybrid" | "keyword";
}

export async function retrieve(repoId: string, query: string, opts: { k?: number; focusKeys?: string[] } = {}): Promise<Retrieved> {
  const k = opts.k ?? 10;
  const [g, ci] = await Promise.all([loadGraph(repoId), chunkIndex(repoId)]);
  const seeds = findSeeds(g, query, opts.focusKeys);

  const lists: { name: string; weight: number; items: number[] }[] = [];
  lists.push({ name: "keyword", weight: 1, items: ci.bm25.search(query, 40).map((x) => x.idx) });

  let mode: Retrieved["mode"] = "keyword";
  try {
    const vi = await vectorIndex(repoId, ci);
    if (vi && (await spaceAvailable(vi.space))) {
      const { vectors } = await embedTexts([query], vi.space, "query");
      lists.push({ name: "semantic", weight: 1.1, items: vectorSearch(vi, vectors[0], 40).map((x) => x.idx) });
      mode = "hybrid";
    }
  } catch {
    /* keyword-only fallback */
  }

  const seedItems: number[] = [];
  for (const s of seeds) {
    const arr = s.kind === "entity" ? ci.byEntity.get(s.key) : ci.byFile.get(s.key);
    if (arr) seedItems.push(...arr.slice(0, 3));
  }
  if (seedItems.length) lists.push({ name: "graph-match", weight: 1.3, items: seedItems });

  // preliminary fusion to find anchors for graph expansion
  const fuse = (ls: typeof lists) => {
    const sc = new Map<number, { s: number; r: Set<string> }>();
    for (const l of ls) l.items.forEach((idx, rank) => {
      const cur = sc.get(idx) || { s: 0, r: new Set<string>() };
      cur.s += l.weight / (60 + rank);
      cur.r.add(l.name);
      sc.set(idx, cur);
    });
    return sc;
  };
  const pre = [...fuse(lists).entries()].sort((a, b) => b[1].s - a[1].s).slice(0, 6);
  const anchorKeys = new Set<string>(seeds.map((s) => s.key));
  for (const [idx] of pre) {
    const c = ci.chunks[idx];
    anchorKeys.add(c.entityKey ?? c.fileKey);
  }
  const expand: number[] = [];
  for (const key of anchorKeys) {
    for (const nb of neighbours(g, key, ["CALLS", "EXTENDS", "IMPORTS"]).sort((a, b) => b.weight - a.weight).slice(0, 4)) {
      const arr = nb.node.kind === "entity" ? ci.byEntity.get(nb.node.key) : ci.byFile.get(nb.node.key);
      if (arr) expand.push(arr[0]);
    }
  }
  if (expand.length) lists.push({ name: "graph-neighbour", weight: 0.55, items: expand });

  const qTerms = new Set(tokenize(query));
  const scored = [...fuse(lists).entries()].map(([idx, v]) => {
    const c = ci.chunks[idx];
    let s = v.s;
    const pathTerms = tokenize(c.path + " " + (c.entityName ?? ""));
    if (pathTerms.some((t) => qTerms.has(t))) s += 0.004;
    if (/(^|\/)(test|tests|__tests__|spec)\//i.test(c.path) && !qTerms.has("test") && !qTerms.has("tests")) s *= 0.8;
    return { idx, s, reasons: [...v.r] };
  }).sort((a, b) => b.s - a.s);

  const perFile = new Map<string, number>();
  const picked: Retrieved["chunks"] = [];
  for (const x of scored) {
    const c = ci.chunks[x.idx];
    const n = perFile.get(c.path) || 0;
    if (n >= 3) continue;
    perFile.set(c.path, n + 1);
    picked.push({ ...c, score: x.s, reasons: x.reasons });
    if (picked.length >= k) break;
  }
  const factKeys = [...seeds.map((s) => s.key), ...picked.map((p) => p.entityKey ?? p.fileKey)];
  return { chunks: picked, facts: graphFacts(g, factKeys), seeds, mode };
}
