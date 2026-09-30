"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Check, CircleAlert, KeyRound } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { SyncSchedule, UpdateAllButton } from "@/components/SyncControls";
import { Badge, ErrorNote, PageHeader, Segmented, Spinner, Toggle } from "@/components/ui";
import { api, useFetch } from "@/lib/client/api";

interface SettingsView {
  openaiKey: string | null; geminiKey: string | null; githubToken: string | null; preferred: "auto" | "openai" | "gemini";
  openaiModel: string | null; geminiModel: string | null; syncEnabled: boolean; fromEnv: { openaiKey: boolean; geminiKey: boolean; githubToken: boolean };
  active: string[]; cron: string;
}

export default function SettingsPage() {
  const s = useFetch<SettingsView>("/api/settings");
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, { busy?: boolean; ok?: boolean; message?: string }>>({});

  useEffect(() => {
    if (s.data) setForm({ openaiKey: s.data.openaiKey ?? "", geminiKey: s.data.geminiKey ?? "", githubToken: s.data.githubToken ?? "", preferred: s.data.preferred, openaiModel: s.data.openaiModel ?? "", geminiModel: s.data.geminiModel ?? "" });
  }, [s.data]);

  useEffect(() => {
    if (!s.data || !window.location.hash) return;
    const el = document.querySelector(window.location.hash);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }, [!!s.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: any) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  async function save() {
    setSaving(true); setErr(null);
    try {
      const d = await api<SettingsView>("/api/settings", { method: "POST", json: form });
      s.setData(d); setSaved(true);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  async function test(p: "openai" | "gemini") {
    setTests((t) => ({ ...t, [p]: { busy: true } }));
    try {
      await api("/api/settings", { method: "POST", json: form });
      const r = await api<{ ok: boolean; message: string }>("/api/settings/test", { method: "POST", json: { provider: p } });
      setTests((t) => ({ ...t, [p]: r }));
      s.reload();
    } catch (e) { setTests((t) => ({ ...t, [p]: { ok: false, message: e instanceof Error ? e.message : String(e) } })); }
  }

  const d = s.data;
  return (
    <div className="min-h-screen">
    <SiteNav links={false} />
    <main className="mx-auto max-w-[760px] px-6 pb-24 pt-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-[13.5px] text-fg-2 hover:text-fg"><ArrowLeft size={14} /> Back to repositories</Link>
      <PageHeader title="Settings" sub="Keys stay on this machine, in the local database. Values set in .env take precedence." />
      {!d ? <div className="flex items-center gap-2 text-fg-2"><Spinner /> Loading</div> : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <section className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-fg">Language models</h2>
              {d.active.length ? <Badge tone="ok"><Check size={11} /> Using {d.active.join(", then ")}</Badge> : <Badge tone="accent">No key yet</Badge>}
            </div>
            <p className="mt-1 text-[13.5px] text-fg-2">One key is enough. With both, the preferred one is tried first and the other takes over automatically on errors or quota limits.</p>
            <div className="mt-5 space-y-5">
              {(["gemini", "openai"] as const).map((p) => {
                const k = p === "gemini" ? "geminiKey" : "openaiKey";
                const t = tests[p];
                return (
                  <div key={p}>
                    <label className="mb-1.5 flex items-center justify-between text-[13px] text-fg-2">
                      <span className="text-fg">{p === "gemini" ? "Gemini API key" : "OpenAI API key"}</span>
                      <a className="text-info hover:underline" href={p === "gemini" ? "https://aistudio.google.com/apikey" : "https://platform.openai.com/api-keys"} target="_blank" rel="noreferrer">Get a key</a>
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
                        <input className="input pl-9 font-mono text-[13px]" placeholder={p === "gemini" ? "AIza…" : "sk-…"} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} disabled={d.fromEnv[k as "openaiKey"]} />
                      </div>
                      <button className="btn" onClick={() => test(p)} disabled={!form[k] || t?.busy}>{t?.busy ? <Spinner size={14} /> : null} Test</button>
                    </div>
                    {d.fromEnv[k as "openaiKey"] && <p className="mt-1.5 text-[12.5px] text-fg-3">Set in .env</p>}
                    {t && !t.busy && (
                      <p className={`mt-1.5 flex items-start gap-1.5 text-[12.5px] ${t.ok ? "text-info" : "text-bad"}`}>
                        {t.ok ? <Check size={13} className="mt-0.5" /> : <CircleAlert size={13} className="mt-0.5" />} {t.message}
                      </p>
                    )}
                  </div>
                );
              })}
              <div>
                <p className="mb-1.5 text-[13px] text-fg">Try first</p>
                <Segmented value={form.preferred ?? "auto"} onChange={(v) => set("preferred", v)} options={[{ value: "auto", label: "Auto" }, { value: "gemini", label: "Gemini" }, { value: "openai", label: "OpenAI" }]} />
              </div>
              <details className="group">
                <summary className="cursor-pointer text-[13px] text-fg-2 hover:text-fg">Model overrides</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input className="input text-[13px]" placeholder="Gemini model (default gemini-flash-latest)" value={form.geminiModel ?? ""} onChange={(e) => set("geminiModel", e.target.value)} />
                  <input className="input text-[13px]" placeholder="OpenAI model (default gpt-4.1-mini)" value={form.openaiModel ?? ""} onChange={(e) => set("openaiModel", e.target.value)} />
                </div>
              </details>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="text-[15px] font-semibold text-fg">Private repositories</h2>
            <p className="mt-1 text-[13.5px] text-fg-2">Only needed to clone private GitHub repositories.</p>
            <input className="input mt-4 font-mono text-[13px]" placeholder="ghp_…" value={form.githubToken ?? ""} onChange={(e) => set("githubToken", e.target.value)} disabled={d.fromEnv.githubToken} />
          </section>

          {err && <ErrorNote>{err}</ErrorNote>}
          <div className="flex items-center justify-end gap-3">
            {saved && <span className="inline-flex items-center gap-1.5 text-[13px] text-info"><Check size={14} /> Saved</span>}
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null} Save settings</button>
          </div>

          <section id="updates" className="card scroll-mt-24 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold text-fg">Automatic updates</h2>
                <p className="mt-1 text-[13.5px] text-fg-2">When repositories pull new commits and re-index. Unchanged repositories are skipped.</p>
              </div>
              <UpdateAllButton />
            </div>
            <div className="mt-5"><SyncSchedule /></div>
          </section>
        </motion.div>
      )}
    </main>
    </div>
  );
}
