import { fail, json, route } from "@/lib/api";
import { runScheduledSync } from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * External cron hook (optional). The app already runs its own in-process scheduler;
 * this endpoint lets an OS cron / uptime pinger trigger the same sync:
 *   curl -X POST http://localhost:3000/api/cron/sync -H "Authorization: Bearer $CRON_SECRET"
 */
async function handler(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    const q = new URL(req.url).searchParams.get("secret");
    if (auth !== `Bearer ${secret}` && q !== secret) return fail("Unauthorized", 401);
  }
  runScheduledSync("manual").catch((e) => console.error("[cron] sync failed:", e));
  return json({ ok: true, started: true, at: new Date().toISOString() }, 202);
}
export const GET = route(handler);
export const POST = route(handler);
