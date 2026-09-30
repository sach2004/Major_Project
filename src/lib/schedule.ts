import type { AppSettings } from "./settings";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ScheduleInfo {
  expr: string | null;
  label: string;
  source: "settings" | "env";
}

function hm(time: string): [number, number] {
  const [h, m] = time.split(":").map((x) => parseInt(x, 10));
  return [Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0];
}

function fmtTime(time: string): string {
  const [h, m] = hm(time);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function scheduleFor(s: AppSettings): ScheduleInfo {
  const env = process.env.SYNC_CRON?.trim();
  if (env) return { expr: env, label: `Custom schedule from .env (${env})`, source: "env" };
  if (s.syncMode === "off") return { expr: null, label: "Automatic updates are off", source: "settings" };
  if (s.syncMode === "interval") {
    const n = s.syncEvery;
    if (n < 60) return { expr: `*/${n} * * * *`, label: `Every ${n} minutes`, source: "settings" };
    const h = Math.round(n / 60);
    return { expr: h === 1 ? "0 * * * *" : `0 */${h} * * *`, label: h === 1 ? "Every hour" : `Every ${h} hours`, source: "settings" };
  }
  const [h, m] = hm(s.syncTime);
  if (s.syncMode === "weekly") {
    const days = s.syncDays.length ? s.syncDays : [1];
    const names = days.length === 7 ? "every day" : days.join(",") === "1,2,3,4,5" ? "weekdays" : days.map((d) => DAY_NAMES[d]).join(", ");
    return { expr: `${m} ${h} * * ${days.join(",")}`, label: `${names[0].toUpperCase()}${names.slice(1)} at ${fmtTime(s.syncTime)}`, source: "settings" };
  }
  return { expr: `${m} ${h} * * *`, label: `Every day at ${fmtTime(s.syncTime)}`, source: "settings" };
}
