import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./db";

/** Read a repository file from the working copy, refusing any path that escapes the repo root. */
export async function readRepoFile(repoId: string, rel: string, maxBytes = 600_000): Promise<string | null> {
  const repo = await prisma.repository.findUnique({ where: { id: repoId }, select: { localPath: true } });
  if (!repo?.localPath) return null;
  const root = path.resolve(repo.localPath);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  try {
    const buf = await readFile(abs);
    return buf.subarray(0, maxBytes).toString("utf8");
  } catch {
    return null;
  }
}

export async function readLines(repoId: string, rel: string, start: number, end: number): Promise<string | null> {
  const src = await readRepoFile(repoId, rel);
  if (src == null) return null;
  return src.split("\n").slice(Math.max(0, start - 1), end).join("\n");
}
