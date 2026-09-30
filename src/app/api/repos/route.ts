import { existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { body, fail, json, route } from "@/lib/api";
import { gitAvailable, normalizeRepoUrl, repoKey, repoNameFromUrl } from "@/lib/git";
import { isRunning, startJob } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const repos = await prisma.repository.findMany({
    orderBy: { createdAt: "desc" },
    include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return json(repos.map((r) => ({ ...r, stats: r.stats ? JSON.parse(r.stats) : null, packages: undefined, running: isRunning(r.id), latestJob: r.jobs[0] ?? null, jobs: undefined })));
});

export const POST = route(async (req: Request) => {
  const b = await body<{ url?: string; branch?: string; name?: string }>(req);
  const raw = (b.url || "").trim();
  if (!raw) return fail("Enter a Git URL (https://github.com/owner/repo) or a local folder path.");
  let url = raw;
  let isLocal = false;
  if (raw.startsWith("~")) url = path.join(os.homedir(), raw.slice(1));
  if (path.isAbsolute(url) || /^[A-Za-z]:[\\/]/.test(url)) {
    if (!existsSync(url) || !statSync(url).isDirectory()) return fail(`Folder not found: ${url}`);
    url = path.resolve(url);
    isLocal = true;
  } else {
    url = normalizeRepoUrl(raw);
    if (!/^(https?:\/\/|git@|ssh:\/\/)/.test(url)) return fail("That doesn't look like a Git URL. Try https://github.com/owner/repo");
    if (!(await gitAvailable())) return fail("Git is not installed on this machine. On macOS run `xcode-select --install`, then retry.");
  }
  const wantBranch = b.branch?.trim() || null;
  const key = isLocal ? url : repoKey(url);
  const existing = await prisma.repository.findMany({ where: { isLocal } });
  const dup = existing.find((r) => (isLocal ? r.url === url : repoKey(r.url) === key) && (!wantBranch || r.branch === wantBranch));
  if (dup) {
    // Same repository already analyzed: reuse it instantly and refresh quietly if it is stale.
    const stale = !dup.lastSyncedAt || Date.now() - new Date(dup.lastSyncedAt).getTime() > 10 * 60_000;
    let refreshed = false;
    if (dup.status === "ready" && stale && !isRunning(dup.id)) { await startJob(dup.id, "sync", "manual"); refreshed = true; }
    else if (dup.status === "error" && !isRunning(dup.id)) { await startJob(dup.id, "analyze", "manual"); refreshed = true; }
    return json({ ...dup, stats: undefined, packages: undefined, duplicate: true, refreshed });
  }
  const name = b.name?.trim() || (isLocal ? path.basename(url) : repoNameFromUrl(url));
  const repo = await prisma.repository.create({ data: { name, url, isLocal, branch: b.branch?.trim() || null, status: "analyzing" } });
  const { jobId } = await startJob(repo.id, "analyze", "initial");
  return json({ ...repo, jobId }, 201);
});
