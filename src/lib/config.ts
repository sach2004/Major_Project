import path from "node:path";

const num = (v: string | undefined, d: number) => {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const CONFIG = {
  dataDir: path.join(process.cwd(), ".data"),
  reposDir: path.join(process.cwd(), ".data", "repos"),
  maxFiles: num(process.env.MAX_FILES, 3000),
  maxFileBytes: num(process.env.MAX_FILE_BYTES, 400_000),
  maxCommits: num(process.env.MAX_COMMITS, 400),
  cloneDepth: num(process.env.CLONE_DEPTH, 400),
  maxEmbedChunks: num(process.env.MAX_EMBED_CHUNKS, 2500),
  syncCron: process.env.SYNC_CRON || "*/30 * * * *",
};
