import { json, route } from "@/lib/api";
import { gitAvailable } from "@/lib/git";
import { pickEmbedSpace, providerOrder } from "@/lib/llm";
import { currentSchedule, lastCronRun, startScheduler, syncAllState } from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  startScheduler();
  const [git, providers, embed, sched] = await Promise.all([gitAvailable(), providerOrder(), pickEmbedSpace(), currentSchedule()]);
  return json({
    git,
    providers,
    llm: providers.length > 0,
    embeddings: embed,
    cron: { expr: sched.expr, label: sched.label, source: sched.source, enabled: !!sched.expr, next: sched.next, last: lastCronRun() },
    syncAll: syncAllState(),
  });
});
