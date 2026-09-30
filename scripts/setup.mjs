// Zero-config bootstrap: ensures .env exists, generates the Prisma client and
// creates/updates the local SQLite database. Runs automatically on `npm install`
// and before `npm run dev` / `npm run build`.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quiet = process.argv.includes("--quiet");
const log = (m) => !quiet && console.log(`\x1b[33m[setup]\x1b[0m ${m}`);
const run = (cmd) => execSync(cmd, { cwd: root, stdio: quiet ? "pipe" : "inherit", env: { ...process.env } });

const envPath = path.join(root, ".env");
if (!existsSync(envPath)) {
  const example = path.join(root, ".env.example");
  if (existsSync(example)) copyFileSync(example, envPath);
  else appendFileSync(envPath, 'DATABASE_URL="file:./dev.db?socket_timeout=30"\n');
  log("created .env");
}
if (!/^DATABASE_URL=/m.test(readFileSync(envPath, "utf8"))) {
  appendFileSync(envPath, '\nDATABASE_URL="file:./dev.db?socket_timeout=30"\n');
  log("added DATABASE_URL to .env");
}
mkdirSync(path.join(root, ".data", "repos"), { recursive: true });

try {
  if (!existsSync(path.join(root, "node_modules", ".prisma", "client", "index.js")) || !quiet) {
    log("generating Prisma client");
    run("npx prisma generate");
  }
  log("syncing SQLite schema");
  run("npx prisma db push --skip-generate --accept-data-loss");
  log("ready ✓  run: npm run dev");
} catch (e) {
  console.error("[setup] database setup failed:", e?.stderr?.toString?.() || e?.message || e);
  process.exit(1);
}
