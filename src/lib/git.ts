import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

export interface GitCommitFile {
  path: string;
  changeType: string; // A M D R T
  additions: number;
  deletions: number;
}
export interface GitCommit {
  sha: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  files: GitCommitFile[];
}

function run(args: string[], cwd?: string, timeoutMs = 10 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 256 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo", LC_ALL: "C" },
      },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || err.message || "").toString().replace(/https:\/\/[^@\s]+@/g, "https://***@");
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            reject(new Error("Git is not installed or not on PATH. Install Git (on macOS run: xcode-select --install) and restart the app."));
          } else reject(new Error(msg.trim().split("\n").slice(-3).join(" ") || "git command failed"));
        } else resolve(stdout.toString());
      },
    );
  });
}

export async function gitAvailable(): Promise<boolean> {
  try {
    await run(["--version"], undefined, 10_000);
    return true;
  } catch {
    return false;
  }
}

export function withToken(url: string, token?: string | null): string {
  if (!token) return url;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return url;
    if (!u.username) {
      u.username = "x-access-token";
      u.password = token;
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function normalizeRepoUrl(input: string): string {
  let s = input.trim().replace(/\/+$/, "");
  // github shorthand: owner/repo
  if (/^[\w.-]+\/[\w.-]+$/.test(s)) s = `https://github.com/${s}`;
  // strip github browse suffixes
  s = s.replace(/^(https?:\/\/(?:www\.)?github\.com\/[^/]+\/[^/]+)\/(tree|blob)\/.*$/, "$1");
  if (/^https?:\/\/(www\.)?(github|gitlab)\.com\/[^/]+\/[^/.]+$/.test(s)) s += ".git";
  return s;
}

/** Canonical identity of a repository URL, so "Owner/Repo", ".../repo.git" and "http://www.github.com/owner/repo/" match. */
export function repoKey(url: string): string {
  return url
    .trim()
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^http:\/\//, "https://")
    .replace(/^https:\/\/www\./, "https://")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .toLowerCase();
}

export function repoNameFromUrl(url: string): string {
  const clean = url.replace(/\.git$/, "").replace(/\/+$/, "");
  const parts = clean.split(/[/:\\]/).filter(Boolean);
  return parts.slice(-2).join("/") || clean;
}

export async function cloneRepo(url: string, dest: string, branch: string | null, depth: number, token?: string | null) {
  if (existsSync(dest)) await rm(dest, { recursive: true, force: true });
  await mkdir(path.dirname(dest), { recursive: true });
  const args = ["clone", "--no-tags", "--single-branch", `--depth=${depth}`];
  if (branch) args.push("--branch", branch);
  args.push(withToken(url, token), dest);
  await run(args);
}

export async function currentBranch(dir: string): Promise<string> {
  return (await run(["rev-parse", "--abbrev-ref", "HEAD"], dir)).trim();
}

export async function headSha(dir: string): Promise<string> {
  return (await run(["rev-parse", "HEAD"], dir)).trim();
}

/** Fetch latest remote state and hard-reset the working tree to it. Returns new HEAD. */
export async function pullLatest(dir: string, branch: string, depth: number, url?: string, token?: string | null): Promise<string> {
  const remote = url ? withToken(url, token) : "origin";
  await run(["fetch", "--no-tags", `--depth=${depth}`, remote, branch], dir);
  await run(["reset", "--hard", "FETCH_HEAD"], dir);
  return headSha(dir);
}

export async function isGitDir(dir: string): Promise<boolean> {
  try {
    await run(["rev-parse", "--git-dir"], dir, 10_000);
    return true;
  } catch {
    return false;
  }
}

const SEP = "\x1e";
const FS = "\x1f";

export async function readLog(dir: string, maxCommits: number): Promise<GitCommit[]> {
  const out = await run(
    ["log", "--no-renames", "--no-merges", `-n`, String(maxCommits), "--raw", "--numstat", `--pretty=format:${SEP}%H${FS}%an${FS}%ae${FS}%aI${FS}%s`],
    dir,
  );
  return parseLog(out);
}

export function parseLog(out: string): GitCommit[] {
  const commits: GitCommit[] = [];
  for (const block of out.split(SEP)) {
    if (!block.trim()) continue;
    const nl = block.indexOf("\n");
    const header = nl === -1 ? block : block.slice(0, nl);
    const [sha, authorName, authorEmail, date, message] = header.split(FS);
    if (!sha || sha.length < 7) continue;
    const files = new Map<string, GitCommitFile>();
    const body = nl === -1 ? "" : block.slice(nl + 1);
    for (const line of body.split("\n")) {
      if (!line) continue;
      if (line.startsWith(":")) {
        // :100644 100644 abc def M\tpath
        const tab = line.indexOf("\t");
        if (tab === -1) continue;
        const meta = line.slice(0, tab).split(" ");
        const status = (meta[4] || "M")[0];
        const p = line.slice(tab + 1);
        const f = files.get(p) || { path: p, changeType: status, additions: 0, deletions: 0 };
        f.changeType = status;
        files.set(p, f);
      } else {
        const parts = line.split("\t");
        if (parts.length < 3) continue;
        const [a, d, ...rest] = parts;
        const p = rest.join("\t");
        const f = files.get(p) || { path: p, changeType: "M", additions: 0, deletions: 0 };
        f.additions = a === "-" ? 0 : parseInt(a, 10) || 0;
        f.deletions = d === "-" ? 0 : parseInt(d, 10) || 0;
        files.set(p, f);
      }
    }
    commits.push({ sha, authorName: authorName || "unknown", authorEmail: (authorEmail || "unknown").toLowerCase(), date, message: message || "", files: [...files.values()] });
  }
  return commits;
}

export async function listTrackedFiles(dir: string): Promise<string[] | null> {
  try {
    const out = await run(["ls-files", "-z"], dir, 60_000);
    return out.split("\0").filter(Boolean);
  } catch {
    return null;
  }
}
