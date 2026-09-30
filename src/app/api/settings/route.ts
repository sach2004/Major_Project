import { body, json, route } from "@/lib/api";
import { envSource, getSettings, mask, saveSettings } from "@/lib/settings";
import { providerOrder } from "@/lib/llm";
import { currentSchedule, rescheduleSync } from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function view() {
  const s = await getSettings();
  return {
    openaiKey: mask(s.openaiKey),
    geminiKey: mask(s.geminiKey),
    githubToken: mask(s.githubToken),
    preferred: s.preferred,
    openaiModel: s.openaiModel,
    geminiModel: s.geminiModel,
    syncEnabled: s.syncEnabled,
    syncMode: s.syncMode,
    syncEvery: s.syncEvery,
    syncTime: s.syncTime,
    syncDays: s.syncDays,
    fromEnv: envSource(),
    active: await providerOrder(),
    schedule: await currentSchedule(),
  };
}

export const GET = route(async () => json(await view()));

export const POST = route(async (req: Request) => {
  const b = await body<Record<string, any>>(req);
  const patch: Record<string, string | boolean | null> = {};
  for (const k of ["openaiKey", "geminiKey", "githubToken"]) {
    if (!(k in b)) continue;
    const v = b[k];
    if (typeof v === "string" && v.includes("••")) continue; // unchanged masked value
    patch[k] = typeof v === "string" ? v.trim() : v;
  }
  for (const k of ["preferred", "openaiModel", "geminiModel"]) if (k in b) patch[k] = typeof b[k] === "string" ? (b[k] as string).trim() : b[k];
  if (typeof b.syncMode === "string" && ["off", "interval", "daily", "weekly"].includes(b.syncMode)) patch.syncMode = b.syncMode;
  if (b.syncEvery != null) patch.syncEvery = String(b.syncEvery);
  if (typeof b.syncTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.syncTime)) patch.syncTime = b.syncTime;
  if (Array.isArray(b.syncDays)) patch.syncDays = (b.syncDays as unknown[]).map(Number).filter((d) => d >= 0 && d <= 6).join(",");
  await saveSettings(patch);
  if (["syncMode", "syncEvery", "syncTime", "syncDays"].some((k) => k in patch)) await rescheduleSync();
  return json(await view());
});
