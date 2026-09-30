import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma, ensurePragmas } from "./db";

type PrismaLike = typeof prisma;
import { CONFIG } from "./config";
import { analyzeDirectory, type AnalysisResult } from "./analysis/analyze-core";
import { isTestPath } from "./analysis/languages";
import { cloneRepo, currentBranch, headSha, isGitDir, listTrackedFiles, pullLatest, readLog, type GitCommit } from "./git";
import { getSettings } from "./settings";
import { complete, embedTexts, hasLLM, pickEmbedSpace, spaceAvailable } from "./llm";
import { invalidateRepoCaches } from "./cache";

const g = globalThis as unknown as { __running?: Map<string, string> };
const running: Map<string, string> = g.__running ?? new Map();
g.__running = running;

export function isRunning(repoId: string) {
  return running.has(repoId);
}

async function chunked<T>(items: T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

class JobReporter {
  private last = 0;
  constructor(public id: string) {}
  async update(progress: number, stage: string, message: string, force = false) {
    const now = Date.now();
    if (!force && now - this.last < 600) return;
    this.last = now;
    await prisma.analysisJob.update({ where: { id: this.id }, data: { progress: Math.min(100, Math.round(progress)), stage, message } }).catch(() => {});
  }
}

export async function startJob(repoId: string, type: "analyze" | "sync", trigger: "manual" | "cron" | "initial"): Promise<{ jobId: string; alreadyRunning: boolean }> {
  await ensurePragmas();
  const existing = running.get(repoId);
  if (existing) return { jobId: existing, alreadyRunning: true };
  const job = await prisma.analysisJob.create({ data: { repoId, type, trigger, status: "queued", stage: "queued", message: "Waiting to start" } });
  running.set(repoId, job.id);
  // fire and forget — runs inside the Node server process
  void runJob(repoId, job.id, type).finally(() => running.delete(repoId));
  return { jobId: job.id, alreadyRunning: false };
}

async function runJob(repoId: string, jobId: string, type: "analyze" | "sync") {
  const rep = new JobReporter(jobId);
  const started = new Date();
  await prisma.analysisJob.update({ where: { id: jobId }, data: { status: "running", startedAt: started, stage: "fetch", message: "Preparing repository" } });
  try {
    const repo = await prisma.repository.findUniqueOrThrow({ where: { id: repoId } });
    await prisma.repository.update({ where: { id: repoId }, data: { status: repo.status === "ready" ? "ready" : "analyzing", error: null } });
    const settings = await getSettings();

    /* ---------------- 1. fetch / sync ---------------- */
    let dir: string;
    let sha: string | null = null;
    let branch = repo.branch;
    if (repo.isLocal) {
      dir = repo.url;
      if (!existsSync(dir)) throw new Error(`Local path not found: ${dir}`);
      await rep.update(3, "fetch", "Reading local repository", true);
      if (await isGitDir(dir)) {
        sha = await headSha(dir).catch(() => null);
        branch = branch || (await currentBranch(dir).catch(() => null));
      }
    } else {
      dir = path.join(CONFIG.reposDir, repo.id);
      const cloned = existsSync(path.join(dir, ".git"));
      if (!cloned) {
        await rep.update(2, "fetch", `Cloning ${repo.url}`, true);
        await cloneRepo(repo.url, dir, repo.branch, CONFIG.cloneDepth, settings.githubToken);
        branch = await currentBranch(dir);
      } else {
        await rep.update(2, "fetch", "Fetching latest changes", true);
        branch = branch || (await currentBranch(dir));
        await pullLatest(dir, branch, CONFIG.cloneDepth, repo.url, settings.githubToken);
      }
      sha = await headSha(dir);
    }

    if (type === "sync" && repo.status === "ready" && sha && sha === repo.headSha) {
      await prisma.repository.update({ where: { id: repoId }, data: { lastSyncedAt: new Date(), branch } });
      await prisma.analysisJob.update({ where: { id: jobId }, data: { status: "skipped", progress: 100, stage: "done", message: "Already up to date — no new commits", completedAt: new Date() } });
      return;
    }

    /* ---------------- 2. static analysis ---------------- */
    const fileList = await listTrackedFiles(dir);
    const result = await analyzeDirectory(dir, {
      maxFiles: CONFIG.maxFiles,
      maxFileBytes: CONFIG.maxFileBytes,
      fileList,
      onProgress: (p, m) => rep.update(5 + p * 0.8, "analyze", m),
    });
    if (!result.files.length) throw new Error("No supported source files found in this repository.");

    /* ---------------- 3. git history ---------------- */
    await rep.update(56, "history", "Extracting Git history", true);
    const commits: GitCommit[] = sha ? await readLog(dir, CONFIG.maxCommits).catch(() => []) : [];

    /* ---------------- 4. persist knowledge ---------------- */
    await rep.update(60, "store", "Writing knowledge graph", true);
    const cachedVectors = await loadVectorCache(repoId, repo.embeddingModel);
    await persist(repoId, result, commits);

    /* ---------------- 5. embeddings ---------------- */
    let embeddingModel = repo.embeddingModel;
    let embedNote = "";
    if (await hasLLM()) {
      try {
        const space = (await spaceAvailable(repo.embeddingModel)) ? repo.embeddingModel! : (await pickEmbedSpace())!;
        embeddingModel = await embedRepo(repoId, space, space === repo.embeddingModel ? cachedVectors : new Map(), (p, m) => rep.update(72 + p * 0.2, "embed", m));
      } catch (e) {
        embedNote = ` (vector index skipped: ${(e as Error).message.slice(0, 140)} — keyword retrieval still active)`;
        await prisma.embedding.deleteMany({ where: { repoId } });
        embeddingModel = null;
      }
    } else {
      embedNote = " (no LLM key — keyword retrieval only)";
      embeddingModel = null;
    }

    /* ---------------- 6. architecture summary ---------------- */
    const contentHash = createHash("sha1").update(result.files.map((f) => `${f.path}:${f.hash}`).sort().join("\n")).digest("hex");
    let summary = repo.summary;
    if (summary && repo.contentHash === contentHash) {
      await rep.update(94, "summary", "Code unchanged, reusing architecture summary", true);
    } else if (await hasLLM()) {
      await rep.update(94, "summary", "Writing architecture summary", true);
      summary = await summarize(repo.name, result).catch(() => summary);
    }

    await prisma.repository.update({
      where: { id: repoId },
      data: {
        status: "ready",
        error: null,
        headSha: sha,
        branch,
        localPath: dir,
        stats: JSON.stringify({ ...result.stats, commits: commits.length }),
        packages: JSON.stringify(result.packages.slice(0, 200)),
        embeddingModel,
        summary,
        contentHash,
        lastAnalyzedAt: new Date(),
        lastSyncedAt: new Date(),
      },
    });
    invalidateRepoCaches(repoId);
    await prisma.analysisJob.update({
      where: { id: jobId },
      data: { status: "completed", progress: 100, stage: "done", message: `Indexed ${result.stats.files} files, ${Object.values(result.stats.entities).reduce((a, b) => a + b, 0)} entities, ${commits.length} commits${embedNote}`, completedAt: new Date() },
    });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    const repo = await prisma.repository.findUnique({ where: { id: repoId } });
    await prisma.repository.update({ where: { id: repoId }, data: { status: repo?.lastAnalyzedAt ? "ready" : "error", error: msg.slice(0, 1000) } }).catch(() => {});
    await prisma.analysisJob.update({ where: { id: jobId }, data: { status: "failed", error: msg.slice(0, 2000), message: "Failed", completedAt: new Date() } }).catch(() => {});
  }
}

async function loadVectorCache(repoId: string, space: string | null): Promise<Map<string, Buffer>> {
  const map = new Map<string, Buffer>();
  if (!space) return map;
  const rows = await prisma.embedding.findMany({ where: { repoId, model: space }, select: { hash: true, vector: true } });
  for (const r of rows) map.set(r.hash, Buffer.from(r.vector));
  return map;
}

async function persist(repoId: string, r: AnalysisResult, commits: GitCommit[]) {
  // one transaction: the UI keeps reading the previous snapshot until the new one commits
  await prisma.$transaction(async (tx) => {
    await writeSnapshot(tx as unknown as typeof prisma, repoId, r, commits);
  }, { maxWait: 60_000, timeout: 15 * 60_000 });
}

async function writeSnapshot(prisma: PrismaLike, repoId: string, r: AnalysisResult, commits: GitCommit[]) {
  // keep AI explanations for code that did not change (same file content hash)
  const oldFiles = await prisma.file.findMany({ where: { repoId }, select: { path: true, hash: true, summary: true } });
  const oldFileHash = new Map(oldFiles.map((f) => [f.path, f.hash]));
  const keptFileSummary = new Map(oldFiles.filter((f) => f.summary).map((f) => [`${f.path}\u0000${f.hash}`, f.summary!]));
  const oldEnts = await prisma.codeEntity.findMany({ where: { repoId, summary: { not: null } }, select: { key: true, summary: true, file: { select: { path: true } } } });
  const keptEntSummary = new Map<string, { summary: string; path: string }>(oldEnts.map((e: { key: string; summary: string | null; file: { path: string } }) => [e.key, { summary: e.summary!, path: e.file.path }]));

  // wipe previous snapshot (cascades to entities/chunks/embeddings)
  await prisma.graphEdge.deleteMany({ where: { repoId } });
  await prisma.commitFile.deleteMany({ where: { repoId } });
  await prisma.commit.deleteMany({ where: { repoId } });
  await prisma.developer.deleteMany({ where: { repoId } });
  await prisma.embedding.deleteMany({ where: { repoId } });
  await prisma.codeChunk.deleteMany({ where: { repoId } });
  await prisma.codeEntity.deleteMany({ where: { repoId } });
  await prisma.file.deleteMany({ where: { repoId } });

  const filePaths = new Set(r.files.map((f) => f.path));

  // ---- history metrics
  const churn = new Map<string, number>();
  const commitCount = new Map<string, number>();
  const authorsBy = new Map<string, Set<string>>();
  const lastMod = new Map<string, Date>();
  for (const c of commits) {
    for (const f of c.files) {
      churn.set(f.path, (churn.get(f.path) || 0) + f.additions + f.deletions);
      commitCount.set(f.path, (commitCount.get(f.path) || 0) + 1);
      const s = authorsBy.get(f.path) || new Set();
      s.add(c.authorEmail);
      authorsBy.set(f.path, s);
      const d = new Date(c.date);
      if (!lastMod.has(f.path) || lastMod.get(f.path)! < d) lastMod.set(f.path, d);
    }
  }

  // ---- co-change edges
  const pair = new Map<string, number>();
  for (const c of commits) {
    const fs = c.files.map((f) => f.path).filter((p) => filePaths.has(p));
    if (fs.length < 2 || fs.length > 40) continue;
    fs.sort();
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
      const k = `${fs[i]}\u0000${fs[j]}`;
      pair.set(k, (pair.get(k) || 0) + 1);
    }
  }
  const minCo = commits.length < 30 ? 1 : 2;
  const coEdges = [...pair.entries()].filter(([, n]) => n >= minCo).sort((a, b) => b[1] - a[1]).slice(0, 20000);
  for (const [k, n] of coEdges) {
    const [a, b] = k.split("\u0000");
    r.edges.push({ source: `f:${a}`, target: `f:${b}`, type: "CO_CHANGED", weight: n });
  }

  // ---- degree metrics
  const fin = new Map<string, number>(), fout = new Map<string, number>();
  for (const e of r.edges) {
    if (e.type === "IMPORTS" && e.target.startsWith("f:")) {
      fout.set(e.source, (fout.get(e.source) || 0) + 1);
      fin.set(e.target, (fin.get(e.target) || 0) + 1);
    }
    if (e.type === "CALLS" || e.type === "EXTENDS") {
      fout.set(e.source, (fout.get(e.source) || 0) + 1);
      fin.set(e.target, (fin.get(e.target) || 0) + 1);
    }
  }

  // ---- files
  const fileId = new Map<string, string>();
  const fileRows = r.files.map((f) => {
    const id = randomUUID();
    fileId.set(f.path, id);
    return {
      id, repoId, key: f.key, path: f.path, language: f.language, loc: f.loc, size: f.size, hash: f.hash,
      fanIn: fin.get(f.key) || 0, fanOut: fout.get(f.key) || 0,
      churn: churn.get(f.path) || 0, commitCount: commitCount.get(f.path) || 0,
      authors: authorsBy.get(f.path)?.size || 0, lastModified: lastMod.get(f.path) || null,
      externalDeps: f.externalDeps.length ? JSON.stringify(f.externalDeps) : null,
      summary: keptFileSummary.get(`${f.path}\u0000${f.hash}`) ?? null,
    };
  });
  await chunked(fileRows, 200, (b) => prisma.file.createMany({ data: b }));

  // ---- entities
  const entityId = new Map<string, string>();
  const entRows = r.files.flatMap((f) =>
    f.entities.map((e) => {
      const id = randomUUID();
      entityId.set(e.key, id);
      return {
        id, repoId, fileId: fileId.get(f.path)!, key: e.key, name: e.name, qualifiedName: e.qualifiedName, type: e.type,
        startLine: e.startLine, endLine: e.endLine, signature: e.signature, parentKey: e.parentKey, exported: e.exported,
        fanIn: fin.get(e.key) || 0, fanOut: fout.get(e.key) || 0,
        summary: (() => {
          const k = keptEntSummary.get(e.key);
          return k && oldFileHash.get(k.path) === f.hash ? k.summary : null;
        })(),
      };
    }),
  );
  await chunked(entRows, 200, (b) => prisma.codeEntity.createMany({ data: b }));

  // ---- chunks
  const chunkRows = r.chunks.map((c) => ({
    id: randomUUID(), repoId, fileId: fileId.get(c.filePath)!, entityId: c.entityKey ? entityId.get(c.entityKey) ?? null : null,
    content: c.content, chunkIndex: c.chunkIndex, startLine: c.startLine, endLine: c.endLine, hash: c.hash,
  }));
  await chunked(chunkRows, 150, (b) => prisma.codeChunk.createMany({ data: b }));

  // ---- edges
  const edgeRows = r.edges.map((e) => ({ id: randomUUID(), repoId, source: e.source, target: e.target, type: e.type, weight: e.weight }));
  await chunked(edgeRows, 300, (b) => prisma.graphEdge.createMany({ data: b }));

  // ---- developers & commits
  const devId = new Map<string, string>();
  const devRows: { id: string; repoId: string; name: string; email: string }[] = [];
  for (const c of commits) {
    if (!devId.has(c.authorEmail)) {
      const id = randomUUID();
      devId.set(c.authorEmail, id);
      devRows.push({ id, repoId, name: c.authorName, email: c.authorEmail });
    }
  }
  await chunked(devRows, 200, (b) => prisma.developer.createMany({ data: b }));
  const seen = new Set<string>();
  const commitRows: { id: string; repoId: string; sha: string; developerId: string | null; message: string; committedAt: Date; additions: number; deletions: number; filesChanged: number }[] = [];
  const cfRows: { id: string; repoId: string; commitId: string; path: string; changeType: string; additions: number; deletions: number }[] = [];
  for (const c of commits) {
    if (seen.has(c.sha)) continue;
    seen.add(c.sha);
    const id = randomUUID();
    commitRows.push({
      id, repoId, sha: c.sha, developerId: devId.get(c.authorEmail) ?? null, message: c.message.slice(0, 2000),
      committedAt: new Date(c.date), additions: c.files.reduce((s, f) => s + f.additions, 0), deletions: c.files.reduce((s, f) => s + f.deletions, 0), filesChanged: c.files.length,
    });
    for (const f of c.files.slice(0, 300)) cfRows.push({ id: randomUUID(), repoId, commitId: id, path: f.path, changeType: f.changeType, additions: f.additions, deletions: f.deletions });
  }
  await chunked(commitRows, 200, (b) => prisma.commit.createMany({ data: b }));
  await chunked(cfRows, 300, (b) => prisma.commitFile.createMany({ data: b }));
}

async function embedRepo(repoId: string, space: string, cache: Map<string, Buffer>, progress: (p: number, m: string) => Promise<void>): Promise<string> {
  const rows = await prisma.codeChunk.findMany({
    where: { repoId },
    select: { id: true, hash: true, content: true, startLine: true, endLine: true, file: { select: { path: true, language: true } }, entity: { select: { qualifiedName: true, type: true } } },
  });
  // prioritise code entities, then module code, then docs; skip tests last
  const score = (r: (typeof rows)[number]) => (r.entity ? 0 : 1) + (["markdown", "json", "yaml", "toml", "text"].includes(r.file.language) ? 2 : 0) + (isTestPath(r.file.path) ? 3 : 0);
  rows.sort((a, b) => score(a) - score(b));
  const selected = rows.slice(0, CONFIG.maxEmbedChunks);

  const reuse = selected.filter((r) => cache.has(r.hash));
  const todo = selected.filter((r) => !cache.has(r.hash));
  let finalSpace = space;
  const rowsOut: { id: string; repoId: string; chunkId: string; model: string; dims: number; hash: string; vector: Buffer }[] = [];
  for (const r of reuse) {
    const buf = cache.get(r.hash)!;
    rowsOut.push({ id: randomUUID(), repoId, chunkId: r.id, model: space, dims: buf.byteLength / 4, hash: r.hash, vector: buf });
  }
  if (todo.length) {
    const texts = todo.map((r) => `File: ${r.file.path} (lines ${r.startLine}-${r.endLine})${r.entity ? `\n${r.entity.type} ${r.entity.qualifiedName}` : ""}\n\n${r.content}`);
    const { vectors, space: used } = await embedTexts(texts, space, "doc", (done) => progress((done / todo.length) * 100, `Embedding code & docs (${done + reuse.length}/${selected.length})`));
    finalSpace = used;
    todo.forEach((r, i) => {
      const v = vectors[i];
      rowsOut.push({ id: randomUUID(), repoId, chunkId: r.id, model: used, dims: v.length, hash: r.hash, vector: Buffer.from(v.buffer, v.byteOffset, v.byteLength) });
    });
  }
  // if the model changed mid-way (fallback), drop reused vectors from the old space
  const final = rowsOut.filter((r) => r.model === finalSpace);
  await chunked(final, 100, (b) => prisma.embedding.createMany({ data: b }));
  return finalSpace;
}

async function summarize(name: string, r: AnalysisResult): Promise<string | null> {
  const dirs = new Map<string, { files: number; loc: number }>();
  for (const f of r.files) {
    const d = f.path.split("/").slice(0, 2).join("/");
    const key = f.path.includes("/") ? d.replace(/\/[^/]*\.[^/]*$/, "") : "(root)";
    const v = dirs.get(key) || { files: 0, loc: 0 };
    v.files++; v.loc += f.loc;
    dirs.set(key, v);
  }
  const topDirs = [...dirs.entries()].sort((a, b) => b[1].loc - a[1].loc).slice(0, 15).map(([d, v]) => `- ${d}: ${v.files} files, ${v.loc} LOC`).join("\n");
  const fanIn = new Map<string, number>();
  for (const e of r.edges) if (e.type === "IMPORTS" && e.target.startsWith("f:")) fanIn.set(e.target, (fanIn.get(e.target) || 0) + 1);
  const central = [...fanIn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `- ${k.slice(2)} (imported by ${n})`).join("\n");
  const readme = r.files.find((f) => /^readme\.(md|rst|txt)$/i.test(f.path))?.content.slice(0, 2500) ?? "(no README)";
  const prompt = `Repository: ${name}
Languages: ${r.stats.languages.slice(0, 6).map((l) => `${l.language} (${l.files} files)`).join(", ")}
Entities: ${JSON.stringify(r.stats.entities)}
Top directories:
${topDirs}
Most depended-on files:
${central || "- none detected"}
External packages: ${r.packages.slice(0, 25).map((p) => p.name).join(", ")}
README excerpt:
${readme}

Write a concise architecture summary (120-180 words, markdown, no headings): what the system does, its main layers/modules and how they interact, and the key technologies.`;
  const out = await complete({ system: "You are a senior software architect writing crisp, factual repository overviews. Never invent components that are not evidenced.", prompt });
  return out.text.trim() || null;
}
