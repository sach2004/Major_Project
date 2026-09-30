import { json, route } from "@/lib/api";
import { runScheduledSync, syncAllState } from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => json(syncAllState()));

/** "Update all now" — pulls every repository with auto-sync on, one after another. */
export const POST = route(async () => {
  if (syncAllState().running) return json({ ...syncAllState(), alreadyRunning: true });
  runScheduledSync("manual").catch((e) => console.error("[sync-all] failed:", e));
  await new Promise((r) => setTimeout(r, 150));
  return json(syncAllState(), 202);
});
