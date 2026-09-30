import { nextRun, schedule, validCron } from "./cron";
import { prisma, ensurePragmas } from "./db";
import { getSettings, invalidateSettings } from "./settings";
import { scheduleFor, type ScheduleInfo } from "./schedule";
import { startJob, isRunning } from "./pipeline";

export interface SyncAllState { running: boolean; trigger: "cron" | "manual" | null; startedAt: string | null; finishedAt: string | null; total: number; done: number; current: string | null }

const g = globalThis as unknown as {
  __schedulerStarted?: boolean;
  __lastCronRun?: Date | null;
  __cronStop?: (() => void) | null;
  __cronExpr?: string | null;
  __syncAll?: SyncAllState;
};

g.__syncAll ??= { running: false, trigger: null, startedAt: null, finishedAt: null, total: 0, done: 0, current: null };

export function lastCronRun() {
  return g.__lastCronRun ?? null;
}

export function syncAllState(): SyncAllState {
  return g.__syncAll!;
}

export async function currentSchedule(): Promise<ScheduleInfo & { next: Date | null; active: string | null }> {
  const info = scheduleFor(await getSettings());
  const valid = info.expr && validCron(info.expr) ? info.expr : null;
  return { ...info, expr: valid, next: valid ? nextRun(valid) : null, active: g.__cronExpr ?? null };
}

/** Update every repository that has auto-sync on, one after another. */
export async function runScheduledSync(trigger: "cron" | "manual" = "cron") {
  await ensurePragmas();
  const state = g.__syncAll!;
  if (state.running) return { started: 0, skipped: "already running" };
  const repos = await prisma.repository.findMany({ where: { syncEnabled: true, status: { in: ["ready", "error"] } }, select: { id: true, name: true } });
  if (trigger === "cron") g.__lastCronRun = new Date();
  Object.assign(state, { running: true, trigger, startedAt: new Date().toISOString(), finishedAt: null, total: repos.length, done: 0, current: null });
  let started = 0;
  try {
    for (const r of repos) {
      state.current = r.name;
      if (!isRunning(r.id)) {
        await startJob(r.id, "sync", trigger);
        started++;
      }
      for (let i = 0; i < 20 * 60 && isRunning(r.id); i++) await new Promise((res) => setTimeout(res, 1000));
      state.done++;
    }
  } finally {
    Object.assign(state, { running: false, current: null, finishedAt: new Date().toISOString() });
  }
  return { started };
}

/** (Re)apply the schedule from settings. Safe to call any time; replaces the previous timer. */
export async function rescheduleSync() {
  invalidateSettings();
  const info = scheduleFor(await getSettings());
  if (g.__cronStop) { g.__cronStop(); g.__cronStop = null; }
  g.__cronExpr = null;
  if (!info.expr || !validCron(info.expr)) {
    console.log("[scheduler] automatic updates off");
    return;
  }
  g.__cronStop = schedule(info.expr, () => {
    runScheduledSync("cron").catch((e) => console.error("[scheduler] sync failed:", e));
  });
  g.__cronExpr = info.expr;
  console.log(`[scheduler] automatic updates: ${info.label} (${info.expr})`);
}

export function startScheduler() {
  if (g.__schedulerStarted) return;
  g.__schedulerStarted = true;
  rescheduleSync().catch((e) => console.error("[scheduler] could not start:", e));
  const live = (globalThis as unknown as { __running?: Map<string, string> }).__running ?? new Map<string, string>();
  const liveRepos = [...live.keys()];
  const liveJobs = [...live.values()];
  prisma.analysisJob
    .updateMany({ where: { status: { in: ["queued", "running"] }, id: { notIn: liveJobs } }, data: { status: "failed", error: "Interrupted by server restart", completedAt: new Date() } })
    .then(() => prisma.repository.updateMany({ where: { status: "analyzing", lastAnalyzedAt: { not: null }, id: { notIn: liveRepos } }, data: { status: "ready" } }))
    .then(() => prisma.repository.updateMany({ where: { status: { in: ["analyzing", "pending"] }, id: { notIn: liveRepos } }, data: { status: "error", error: "Analysis interrupted by server restart — click Try again" } }))
    .catch(() => {});
}
