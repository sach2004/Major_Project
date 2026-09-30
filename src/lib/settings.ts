import { prisma } from "./db";

export type ProviderPref = "auto" | "openai" | "gemini";

export interface AppSettings {
  openaiKey: string | null;
  geminiKey: string | null;
  githubToken: string | null;
  preferred: ProviderPref;
  openaiModel: string | null;
  geminiModel: string | null;
  syncEnabled: boolean;
  syncMode: SyncMode;
  syncEvery: number;
  syncTime: string;
  syncDays: number[];
}

export type SyncMode = "off" | "interval" | "daily" | "weekly";

const KEYS = ["openaiKey", "geminiKey", "githubToken", "preferred", "openaiModel", "geminiModel", "syncEnabled", "syncMode", "syncEvery", "syncTime", "syncDays"] as const;
type Key = (typeof KEYS)[number];

let cache: { at: number; val: AppSettings } | null = null;

const clean = (v: string | undefined | null) => (v && v.trim() ? v.trim() : null);

export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < 5000) return cache.val;
  let rows: { key: string; value: string }[] = [];
  try {
    rows = await prisma.setting.findMany();
  } catch {
    rows = [];
  }
  const db = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Record<Key, string>>;
  const val: AppSettings = {
    // .env wins over the in-app settings page
    openaiKey: clean(process.env.OPENAI_API_KEY) ?? clean(db.openaiKey),
    geminiKey: clean(process.env.GEMINI_API_KEY) ?? clean(process.env.GOOGLE_API_KEY) ?? clean(db.geminiKey),
    githubToken: clean(process.env.GITHUB_TOKEN) ?? clean(db.githubToken),
    preferred: ((clean(process.env.LLM_PROVIDER) ?? clean(db.preferred)) as ProviderPref) || "auto",
    openaiModel: clean(process.env.OPENAI_MODEL) ?? clean(db.openaiModel),
    geminiModel: clean(process.env.GEMINI_MODEL) ?? clean(db.geminiModel),
    syncEnabled: true,
    syncMode: "daily",
    syncEvery: 60,
    syncTime: "09:00",
    syncDays: [1, 2, 3, 4, 5],
  };
  const mode = clean(db.syncMode) as SyncMode | null;
  val.syncMode = mode && ["off", "interval", "daily", "weekly"].includes(mode) ? mode : db.syncEnabled === "false" ? "off" : "daily";
  const every = parseInt(db.syncEvery ?? "", 10);
  if ([15, 30, 60, 120, 180, 360, 720].includes(every)) val.syncEvery = every;
  if (db.syncTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(db.syncTime)) val.syncTime = db.syncTime;
  if (db.syncDays) {
    const days = db.syncDays.split(",").map((d) => parseInt(d, 10)).filter((d) => d >= 0 && d <= 6);
    if (days.length) val.syncDays = [...new Set(days)].sort();
  }
  val.syncEnabled = val.syncMode !== "off";
  cache = { at: Date.now(), val };
  return val;
}

export function invalidateSettings() {
  cache = null;
}

export async function saveSettings(patch: Partial<Record<Key, string | boolean | null>>) {
  for (const k of KEYS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v === null || v === "") await prisma.setting.deleteMany({ where: { key: k } });
    else await prisma.setting.upsert({ where: { key: k }, create: { key: k, value: String(v) }, update: { value: String(v) } });
  }
  invalidateSettings();
}

export function envSource() {
  return {
    openaiKey: !!clean(process.env.OPENAI_API_KEY),
    geminiKey: !!(clean(process.env.GEMINI_API_KEY) ?? clean(process.env.GOOGLE_API_KEY)),
    githubToken: !!clean(process.env.GITHUB_TOKEN),
  };
}

export function mask(v: string | null): string | null {
  if (!v) return null;
  return v.length <= 8 ? "••••" : `${v.slice(0, 4)}••••${v.slice(-4)}`;
}
