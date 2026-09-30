import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma: PrismaClient = g.__prisma ?? new PrismaClient({ log: ["error"] });
if (process.env.NODE_ENV !== "production") g.__prisma = prisma;

let pragmasApplied = false;
/** SQLite tuning: WAL so the UI can read while the analyzer writes. */
export async function ensurePragmas() {
  if (pragmasApplied) return;
  pragmasApplied = true;
  try {
    await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout=10000;");
    await prisma.$queryRawUnsafe("PRAGMA synchronous=NORMAL;");
  } catch {
    /* non-fatal */
  }
}
