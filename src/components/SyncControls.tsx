"use client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Check, Clock, RefreshCw, Repeat } from "lucide-react";
import { api, timeAgo, useFetch } from "@/lib/client/api";
import { ErrorNote, Segmented, Spinner } from "./ui";

type Mode = "off" | "interval" | "daily" | "weekly";
interface Sched { expr: string | null; label: string; source: "settings" | "env"; next: string | null }
interface SettingsView { syncMode: Mode; syncEvery: number; syncTime: string; syncDays: number[]; schedule: Sched }
interface SyncAll { running: boolean; total: number; done: number; current: string | null; finishedAt: string | null }

const EVERY = [15, 30, 60, 120, 180, 360, 720];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const everyLabel = (m: number) => (m < 60 ? `${m} min` : m === 60 ? "1 hour" : `${m / 60} hours`);

function fmtNext(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `today at ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString([], { weekday: "long" })} at ${time}`;
}

/** Full schedule editor: off / every N / daily at time / on chosen weekdays at time. */
export function SyncSchedule({ onSaved }: { onSaved?: () => void }) {
  const q = useFetch<SettingsView>("/api/settings");
  const [mode, setMode] = useState<Mode>("daily");
  const [every, setEvery] = useState(60);
  const [time, setTime] = useState("09:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) return;
    setMode(q.data.syncMode); setEvery(q.data.syncEvery); setTime(q.data.syncTime); setDays(q.data.syncDays);
  }, [q.data]);

  const dirty = useMemo(() => !!q.data && (q.data.syncMode !== mode || q.data.syncEvery !== every || q.data.syncTime !== time || q.data.syncDays.join() !== days.join()), [q.data, mode, every, time, days]);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const d = await api<SettingsView>("/api/settings", { method: "POST", json: { syncMode: mode, syncEvery: every, syncTime: time, syncDays: days } });
      q.setData(d); setSaved(true); onSaved?.();
      setTimeout(() => setSaved(false), 2200);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  if (!q.data) return <div className="flex items-center gap-2 text-[14px] text-fg-2"><Spinner size={14} /> Loading schedule</div>;
  const envLocked = q.data.schedule.source === "env";

  return (
    <div className="space-y-5">
      <Segmented<Mode> id="sync-mode" value={mode} onChange={(v) => { setMode(v); setSaved(false); }} options={[
        { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "interval", label: "Repeat" }, { value: "off", label: "Off" },
      ]} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {mode === "off" && <p className="text-[14px] text-fg-2">Repositories only update when you click Update now.</p>}
          {mode === "interval" && (
            <div>
              <p className="mb-2 flex items-center gap-2 text-[13px] font-medium text-fg"><Repeat size={14} className="text-fg-3" /> Check for new commits every</p>
              <div className="flex flex-wrap gap-1.5">
                {EVERY.map((m) => (
                  <button key={m} onClick={() => setEvery(m)} className={`chip h-8 px-3 text-[13px] ${every === m ? "border-fg bg-fg text-bg" : ""}`}>{everyLabel(m)}</button>
                ))}
              </div>
            </div>
          )}
          {(mode === "daily" || mode === "weekly") && (
            <div className="space-y-4">
              {mode === "weekly" && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-[13px] font-medium text-fg"><CalendarClock size={14} className="text-fg-3" /> On these days</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((d, i) => {
                      const on = days.includes(i);
                      return (
                        <motion.button key={d} whileTap={{ scale: 0.92 }} onClick={() => setDays((x) => (on ? (x.length > 1 ? x.filter((y) => y !== i) : x) : [...x, i].sort()))}
                          className={`h-9 w-12 rounded-lg border text-[13px] font-medium transition-colors ${on ? "border-fg bg-fg text-bg" : "border-line bg-panel text-fg-2 hover:border-line-2"}`}>{d}</motion.button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <p className="mb-2 flex items-center gap-2 text-[13px] font-medium text-fg"><Clock size={14} className="text-fg-3" /> At</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="time" className="input w-36 font-mono" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
                  {["07:00", "09:00", "13:00", "18:00", "23:00"].map((t) => (
                    <button key={t} onClick={() => setTime(t)} className={`chip h-8 font-mono ${time === t ? "border-fg text-fg" : ""}`}>{t}</button>
                  ))}
                </div>
                <p className="mt-2 text-[12.5px] text-fg-3">Uses this computer&apos;s clock. The app must be running at that time.</p>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <div className="min-w-0 flex-1 text-[13.5px]">
          <p className="text-fg">{q.data.schedule.label}</p>
          {q.data.schedule.next && <p className="text-fg-3">Next update {fmtNext(q.data.schedule.next)}</p>}
          {envLocked && <p className="text-warn">SYNC_CRON in .env overrides this. Remove it to use the schedule above.</p>}
        </div>
        <AnimatePresence>{saved && <motion.span initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1 text-[13px] text-ok"><Check size={14} /> Saved</motion.span>}</AnimatePresence>
        <button className="btn btn-primary" onClick={save} disabled={busy || !dirty}>{busy && <Spinner size={14} />} Save schedule</button>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}
    </div>
  );
}

/** "Update all now" with live progress. */
export function UpdateAllButton({ onDone, size = "sm" }: { onDone?: () => void; size?: "sm" | "md" }) {
  const q = useFetch<{ syncAll: SyncAll }>("/api/system", { interval: (d) => (d?.syncAll?.running ? 1500 : 0) });
  const [kick, setKick] = useState(false);
  const running = !!q.data?.syncAll?.running || kick;
  const s = q.data?.syncAll;
  const [wasRunning, setWas] = useState(false);

  useEffect(() => {
    if (s?.running) setWas(true);
    else if (wasRunning) { setWas(false); onDone?.(); }
  }, [s?.running]); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    setKick(true);
    try { await api("/api/sync-all", { method: "POST" }); await q.reload(); } finally { setKick(false); }
  }

  return (
    <button className={`btn ${size === "sm" ? "btn-sm" : ""} relative overflow-hidden`} onClick={go} disabled={running}>
      {running && s && s.total > 0 && (
        <motion.span className="absolute inset-y-0 left-0 bg-accent/15" initial={{ width: 0 }} animate={{ width: `${(s.done / s.total) * 100}%` }} transition={{ duration: 0.4 }} />
      )}
      <RefreshCw size={13} className={`relative ${running ? "animate-spin" : ""}`} />
      <span className="relative">{running ? (s && s.total ? `Updating ${Math.min(s.done + 1, s.total)} of ${s.total}` : "Updating") : "Update all now"}</span>
    </button>
  );
}

export function ScheduleSummary() {
  const q = useFetch<{ cron: { label: string; next: string | null; enabled: boolean; last: string | null } }>("/api/system", { interval: 60000 });
  if (!q.data) return null;
  const c = q.data.cron;
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-fg-2">
      {c.enabled ? <span className="live-dot" /> : <span className="h-2 w-2 rounded-full bg-fg-3" />}
      {c.enabled ? `${c.label}${c.next ? `, next ${fmtNext(c.next)}` : ""}` : "Automatic updates off"}
      {c.last && <span className="text-fg-3">(last ran {timeAgo(c.last)})</span>}
    </span>
  );
}
