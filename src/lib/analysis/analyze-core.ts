import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chunkFile } from "./chunker";
import { extractCalls, extractRefs } from "./calls";
import { CODE_LANGS, IGNORE_DIRS, detectLanguage, type Lang } from "./languages";
import { parseSource, type ImportRef, type ParsedEntity } from "./parser";
import { Resolver } from "./resolver";

export interface AEntity extends ParsedEntity {
  key: string;
  parentKey: string | null;
}
export interface AFile {
  path: string;
  key: string;
  language: Lang;
  loc: number;
  size: number;
  hash: string;
  content: string;
  entities: AEntity[];
  imports: ImportRef[];
  internalDeps: string[];
  externalDeps: string[];
}
export interface AEdge {
  source: string;
  target: string;
  type: "CONTAINS" | "IMPORTS" | "CALLS" | "EXTENDS" | "CO_CHANGED";
  weight: number;
}
export interface AChunk {
  filePath: string;
  entityKey: string | null;
  startLine: number;
  endLine: number;
  content: string;
  hash: string;
  chunkIndex: number;
}
export interface AnalysisResult {
  files: AFile[];
  edges: AEdge[];
  chunks: AChunk[];
  packages: { name: string; count: number }[];
  stats: {
    files: number;
    codeFiles: number;
    loc: number;
    entities: Record<string, number>;
    languages: { language: string; files: number; loc: number }[];
    edges: Record<string, number>;
    skippedFiles: number;
  };
}

export interface AnalyzeOptions {
  maxFiles: number;
  maxFileBytes: number;
  fileList?: string[] | null;
  onProgress?: (pct: number, message: string) => void | Promise<void>;
}

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

async function walk(root: string, rel = "", out: string[] = [], limit = 50000): Promise<string[]> {
  if (out.length >= limit) return out;
  let entries;
  try {
    entries = await readdir(path.join(root, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".github") continue;
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!IGNORE_DIRS.has(e.name)) await walk(root, p, out, limit);
    } else if (e.isFile()) out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

function readTsconfig(content: string): { baseUrl?: string; paths?: Record<string, string[]> } | null {
  try {
    const stripped = content
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'])\/\/.*$/gm, "$1")
      .replace(/,(\s*[}\]])/g, "$1");
    const j = JSON.parse(stripped);
    return j.compilerOptions || null;
  } catch {
    return null;
  }
}

export async function analyzeDirectory(root: string, opts: AnalyzeOptions): Promise<AnalysisResult> {
  const progress = async (p: number, m: string) => { if (opts.onProgress) await opts.onProgress(p, m); };
  await progress(0, "Scanning repository tree");

  let list = opts.fileList && opts.fileList.length ? opts.fileList : await walk(root);
  list = list.filter((p) => {
    const segs = p.split("/");
    if (segs.slice(0, -1).some((s) => IGNORE_DIRS.has(s))) return false;
    return detectLanguage(p) !== null;
  });
  // prioritise code, then docs/config; cap
  const rank = (p: string) => {
    const l = detectLanguage(p)!;
    if (CODE_LANGS.has(l)) return 0;
    if (l === "markdown") return 1;
    return 2;
  };
  list.sort((a, b) => rank(a) - rank(b) || a.split("/").length - b.split("/").length || a.localeCompare(b));
  let skipped = Math.max(0, list.length - opts.maxFiles);
  list = list.slice(0, opts.maxFiles);

  const files: AFile[] = [];
  let tsconfig: ReturnType<typeof readTsconfig> = null;
  const masks = new Map<string, string>();

  for (let i = 0; i < list.length; i++) {
    const rel = list[i];
    const abs = path.join(root, rel);
    try {
      const st = await stat(abs);
      if (!st.isFile() || st.size > opts.maxFileBytes || st.size === 0) { skipped++; continue; }
      const buf = await readFile(abs);
      if (buf.subarray(0, 8000).includes(0)) { skipped++; continue; }
      const content = buf.toString("utf8");
      const language = detectLanguage(rel)!;
      if ((rel === "tsconfig.json" || rel === "jsconfig.json") && !tsconfig) tsconfig = readTsconfig(content);
      const parsed = CODE_LANGS.has(language) ? parseSource(language, content) : { entities: [], imports: [], masked: content };
      if (CODE_LANGS.has(language)) masks.set(rel, parsed.masked);
      const fileKey = `f:${rel}`;
      const used = new Set<string>();
      const entities: AEntity[] = parsed.entities.map((e) => {
        let key = `e:${rel}#${e.qualifiedName}`;
        if (used.has(key)) key = `${key}@${e.startLine}`;
        used.add(key);
        return { ...e, key, parentKey: null };
      });
      entities.forEach((e) => { e.parentKey = e.parentIndex !== null ? entities[e.parentIndex]?.key ?? null : null; });
      files.push({
        path: rel, key: fileKey, language, loc: content.split("\n").length, size: st.size,
        hash: sha1(content), content, entities, imports: parsed.imports, internalDeps: [], externalDeps: [],
      });
    } catch {
      skipped++;
    }
    if (i % 100 === 0) await progress(Math.round((i / list.length) * 45), `Parsing source files (${i}/${list.length})`);
  }

  await progress(46, "Resolving imports & dependencies");
  const resolver = new Resolver(files.map((f) => f.path), tsconfig);
  const edges: AEdge[] = [];
  const edgeKey = new Map<string, AEdge>();
  const addEdge = (source: string, target: string, type: AEdge["type"], weight = 1) => {
    if (source === target) return;
    const k = `${type}|${source}|${target}`;
    const ex = edgeKey.get(k);
    if (ex) { ex.weight += weight; return; }
    const e = { source, target, type, weight };
    edgeKey.set(k, e);
    edges.push(e);
  };
  const pkgCount = new Map<string, number>();
  const fileByPath = new Map(files.map((f) => [f.path, f]));

  for (const f of files) {
    for (const e of f.entities) addEdge(e.parentKey ?? f.key, e.key, "CONTAINS");
    const internal = new Set<string>();
    const external = new Set<string>();
    for (const imp of f.imports) {
      const res = resolver.resolve(f.path, f.language, imp.spec, imp.names);
      for (const t of res.files) internal.add(t);
      if (!res.files.length && res.external) external.add(res.external);
    }
    f.internalDeps = [...internal];
    f.externalDeps = [...external];
    for (const t of internal) addEdge(f.key, `f:${t}`, "IMPORTS");
    for (const p of external) {
      addEdge(f.key, `p:${p}`, "IMPORTS");
      pkgCount.set(p, (pkgCount.get(p) || 0) + 1);
    }
  }

  await progress(55, "Building call graph & inheritance");
  // name index
  const byName = new Map<string, { key: string; file: string; type: string }[]>();
  for (const f of files) for (const e of f.entities) {
    const arr = byName.get(e.name);
    const rec = { key: e.key, file: f.path, type: e.type };
    if (arr) arr.push(rec); else byName.set(e.name, [rec]);
  }
  const family = (l: string) => (l === "typescript" || l === "javascript" ? "js" : l === "c" || l === "cpp" ? "c" : l);
  const langOf = new Map(files.map((x) => [x.path, family(x.language)]));
  /**
   * Resolve a referenced name to entity keys: same file first, then files this file imports,
   * then (calls only, never bare references) a unique same-language match anywhere.
   */
  const lookup = (name: string, f: AFile, want?: (t: string) => boolean, strict = false): string[] => {
    const cands = (byName.get(name) || []).filter((c) => !want || want(c.type));
    if (!cands.length) return [];
    const local = cands.filter((c) => c.file === f.path);
    if (local.length) return local.slice(0, 2).map((c) => c.key);
    const deps = new Set(f.internalDeps);
    const imported = cands.filter((c) => deps.has(c.file));
    if (imported.length) return imported.slice(0, 2).map((c) => c.key);
    if (strict) return [];
    const fam = family(f.language);
    const same = cands.filter((c) => langOf.get(c.file) === fam);
    if (same.length && same.length <= 2) return same.map((c) => c.key);
    return [];
  };

  const known = new Set(byName.keys());
  const callable = (t: string) => t !== "interface" && t !== "type" && t !== "enum";
  for (const f of files) {
    const masked = masks.get(f.path);
    if (!masked) continue;
    const mlines = masked.split("\n");
    // lines covered by a function/method body; the rest is module-level code
    const covered = new Uint8Array(mlines.length + 1);
    for (const e of f.entities) covered[e.startLine] = 1; // declaration headers are not usages
    for (const e of f.entities) {
      if (e.type === "function" || e.type === "method") {
        for (let l = e.startLine; l <= e.endLine && l <= mlines.length; l++) covered[l] = 1;
        const body = mlines.slice(e.startLine - 1, e.endLine).join("\n");
        const called = new Set<string>();
        for (const c of extractCalls(body, e.name)) {
          called.add(c.name);
          const targets = lookup(c.name, f, c.isNew ? (t) => t === "class" || t === "struct" : callable);
          for (const t of targets) if (t !== e.key) addEdge(e.key, t, "CALLS", c.count);
        }
        for (const name of extractRefs(body, known, e.name)) {
          if (called.has(name)) continue;
          for (const t of lookup(name, f, callable, true)) if (t !== e.key) addEdge(e.key, t, "CALLS", 0.5);
        }
      }
      for (const b of e.bases) {
        for (const t of lookup(b, f, (t) => t === "class" || t === "interface" || t === "trait" || t === "struct")) {
          if (t !== e.key) addEdge(e.key, t, "EXTENDS");
        }
      }
    }
    // module-level code (top-level statements, route/handler registration, exports)
    const top = mlines.filter((_, i) => !covered[i + 1]).join("\n");
    if (top.trim()) {
      const seen = new Set<string>();
      for (const c of extractCalls(top)) {
        seen.add(c.name);
        for (const t of lookup(c.name, f, callable)) addEdge(f.key, t, "CALLS", c.count);
      }
      for (const name of extractRefs(top, known)) {
        if (seen.has(name)) continue;
        for (const t of lookup(name, f, callable, true)) addEdge(f.key, t, "CALLS", 0.5);
      }
    }
  }

  await progress(62, "Chunking code & documentation");
  const chunks: AChunk[] = [];
  for (const f of files) {
    const raw = chunkFile(f.content, f.entities);
    raw.forEach((c, i) => {
      chunks.push({
        filePath: f.path,
        entityKey: c.entityIndex !== null ? f.entities[c.entityIndex]?.key ?? null : null,
        startLine: c.startLine,
        endLine: c.endLine,
        content: c.content,
        hash: sha1(`${f.path}\n${c.content}`),
        chunkIndex: i,
      });
    });
  }

  const entityCounts: Record<string, number> = {};
  for (const f of files) for (const e of f.entities) entityCounts[e.type] = (entityCounts[e.type] || 0) + 1;
  const langs = new Map<string, { files: number; loc: number }>();
  for (const f of files) {
    const l = langs.get(f.language) || { files: 0, loc: 0 };
    l.files++; l.loc += f.loc;
    langs.set(f.language, l);
  }
  const edgeCounts: Record<string, number> = {};
  for (const e of edges) edgeCounts[e.type] = (edgeCounts[e.type] || 0) + 1;
  void fileByPath;

  return {
    files,
    edges,
    chunks,
    packages: [...pkgCount.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    stats: {
      files: files.length,
      codeFiles: files.filter((f) => CODE_LANGS.has(f.language)).length,
      loc: files.reduce((s, f) => s + f.loc, 0),
      entities: entityCounts,
      languages: [...langs.entries()].map(([language, v]) => ({ language, ...v })).sort((a, b) => b.loc - a.loc),
      edges: edgeCounts,
      skippedFiles: skipped,
    },
  };
}
