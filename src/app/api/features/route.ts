import { prisma } from "@/lib/db";
import { body, json, route } from "@/lib/api";
import { PHASE_2_FEATURES, PHASE_2_LOCKED_DEFAULT, PHASE_2_SETTING_KEY, type Phase2Feature } from "@/lib/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEATURES = Object.keys(PHASE_2_FEATURES) as Phase2Feature[];
const keyFor = (f: Phase2Feature) => `${PHASE_2_SETTING_KEY}:${f}`;

async function locks(): Promise<Record<Phase2Feature, boolean>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [PHASE_2_SETTING_KEY, ...FEATURES.map(keyFor)] } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  // per-feature value wins; otherwise the old all-features switch; otherwise the default
  const fallback = map.has(PHASE_2_SETTING_KEY) ? map.get(PHASE_2_SETTING_KEY) !== "false" : PHASE_2_LOCKED_DEFAULT;
  return Object.fromEntries(FEATURES.map((f) => [f, map.has(keyFor(f)) ? map.get(keyFor(f)) !== "false" : fallback])) as Record<Phase2Feature, boolean>;
}

export const GET = route(async () => json({ locks: await locks() }));

/** { feature: "chat", locked: false } for one feature, or { all: true, locked: true } for every feature. */
export const POST = route(async (req: Request) => {
  const b = await body<{ feature?: string; all?: boolean; locked?: boolean }>(req);
  if (typeof b.locked === "boolean") {
    const value = b.locked ? "true" : "false";
    const targets = b.all ? FEATURES : FEATURES.filter((f) => f === b.feature);
    for (const f of targets) {
      await prisma.setting.upsert({ where: { key: keyFor(f) }, update: { value }, create: { key: keyFor(f), value } });
    }
  }
  return json({ locks: await locks() });
});
