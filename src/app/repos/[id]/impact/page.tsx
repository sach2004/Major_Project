"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileDiff, FlaskConical, History as HistoryIcon, Radar, Sparkles, Trash2, X } from "lucide-react";
import { SymbolSearch, type Hit } from "@/components/SymbolSearch";
import { GraphCanvas } from "@/components/GraphCanvas";
import { Markdown } from "@/components/Markdown";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Badge, ErrorNote, PageHeader, Segmented, Spinner } from "@/components/ui";
import { api, timeAgo, useFetch } from "@/lib/client/api";

const DEPTH_COLORS = ["#e8590c", "#f2913d", "#e9b36b", "#8a93a6", "#a3abba"];

export default function Impact() {
  const { id } = useParams<{ id: string }>();
  const past = useFetch<any[]>(`/api/repos/${id}/impact`);
  const [mode, setMode] = useState<"pick" | "diff">("pick");
  const [targets, setTargets] = useState<Hit[]>([]);
  const [diff, setDiff] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<any>(null);

  async function run(fresh = false) {
    setBusy(true); setErr(null);
    try {
      const r = await api(`/api/repos/${id}/impact`, { method: "POST", json: { targets: targets.map((t) => t.key), diff: mode === "diff" ? diff : undefined, description: desc || undefined, fresh } });
      setRes(r); past.reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function open(aid: string) {
    const r = await api<any>(`/api/repos/${id}/impact?aid=${aid}`);
    setRes({ ...r, targets: r.targets });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function del(aid: string) { await api(`/api/repos/${id}/impact?aid=${aid}`, { method: "DELETE" }); past.reload(); }

  const can = mode === "pick" ? targets.length > 0 || desc.trim().length > 2 : diff.trim().length > 10;
  const r = res?.result;
  const rippleNodes = useMemo(() => (r ? r.graph.nodes.map((n: any) => ({ ...n, size: n.depth === 0 ? 9 : 4 })) : []), [r]);

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader title="Change impact" sub="Pick what you plan to change. The graph shows what depends on it, and Git history shows what usually changes with it." />
      <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
        <div className="space-y-5 self-start">
          <section className="card space-y-4 p-5">
            <Segmented value={mode} onChange={setMode} options={[{ value: "pick", label: "Pick targets" }, { value: "diff", label: "Paste a diff" }]} />
            {mode === "pick" ? (
              <>
                <SymbolSearch repoId={id} onPick={(h) => setTargets((t) => (t.some((x) => x.key === h.key) ? t : [...t, h]))} placeholder="Add a file, class or function" />
                <div className="flex flex-wrap gap-1.5">
                  <AnimatePresence>
                    {targets.map((t) => (
                      <motion.span key={t.key} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="chip max-w-full border-accent/40 text-fg">
                        <span className="truncate">{t.name}</span><button onClick={() => setTargets((x) => x.filter((y) => y.key !== t.key))} aria-label="Remove"><X size={11} /></button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <textarea className="input h-48 font-mono text-[12px]" placeholder={"Paste output of `git diff`…\n\ndiff --git a/src/app.py b/src/app.py\n@@ -10,6 +10,8 @@"} value={diff} onChange={(e) => setDiff(e.target.value)} />
            )}
            <input className="input" placeholder="What are you changing? (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
            {err && <ErrorNote>{err}</ErrorNote>}
            <button className="btn btn-primary w-full" onClick={() => run()} disabled={!can || busy}>{busy ? <Spinner size={14} /> : <Radar size={15} />} {busy ? "Tracing dependencies" : "Analyze impact"}</button>
          </section>
          {past.data && past.data.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold text-fg"><HistoryIcon size={14} className="text-fg-3" /> Earlier analyses</h2>
              <ul>
                {past.data.slice(0, 8).map((a) => (
                  <li key={a.id} className="group flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-panel-2">
                    <button className="min-w-0 flex-1 text-left" onClick={() => open(a.id)}>
                      <p className="truncate text-[13px] text-fg">{a.description || a.targets.map((t: any) => t.label).join(", ")}</p>
                      <p className="text-[11.5px] text-fg-3">{timeAgo(a.createdAt)}</p>
                    </button>
                    <span className={`num text-[13px] ${a.riskScore >= 60 ? "text-bad" : a.riskScore >= 30 ? "text-accent" : "text-info"}`}>{a.riskScore}</span>
                    <button className="opacity-0 group-hover:opacity-100" onClick={() => del(a.id)} aria-label="Delete"><Trash2 size={13} className="text-fg-3 hover:text-bad" /></button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="min-w-0">
          {!r ? (
            <div className="grid min-h-[360px] place-items-center rounded-[14px] border border-dashed border-line-2 px-8 text-center text-fg-2">
              <div><Radar className="mx-auto mb-3 text-fg-3" size={28} /><p className="font-display font-semibold text-2xl text-fg">Nothing analyzed yet</p><p className="mx-auto mt-1 max-w-sm text-[14px]">Add a file or function on the left, or paste a diff, to see the blast radius.</p></div>
            </div>
          ) : (
            <motion.div key={res.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <section className="card flex flex-wrap items-center gap-8 p-6">
                <Gauge score={r.risk.score} level={r.risk.level} />
                <div className="min-w-[220px] flex-1">
                  <p className="text-[13px] text-fg-3">Changing</p>
                  <p className="text-[15px] text-fg">{r.targets.map((t: any) => t.label).slice(0, 4).join(", ")}{r.targets.length > 4 ? ` and ${r.targets.length - 4} more` : ""}</p>
                  <div className="mt-4 flex gap-8">
                    <div><p className="font-display font-semibold text-[1.7rem] leading-none text-fg">{r.impacted.length}</p><p className="text-[12.5px] text-fg-3">components affected</p></div>
                    <div><p className="font-display font-semibold text-[1.7rem] leading-none text-fg">{r.impactedFiles.length}</p><p className="text-[12.5px] text-fg-3">files</p></div>
                    <div><p className="font-display font-semibold text-[1.7rem] leading-none text-fg">{r.tests.length}</p><p className="text-[12.5px] text-fg-3">related tests</p></div>
                  </div>
                </div>
                {res.cached && (
                  <div className="flex w-full items-center gap-2 text-[12.5px] text-fg-3">
                    <Badge tone="info">Reused earlier result, code unchanged</Badge>
                    <button className="hover:text-fg" onClick={() => run(true)} disabled={busy}>Run again</button>
                  </div>
                )}
                <ul className="w-full space-y-1.5 border-t border-line pt-4 text-[13px]">
                  {r.risk.factors.map((f: any) => <li key={f.label} className="flex gap-3"><span className="num w-9 shrink-0 text-accent">+{f.points}</span><span className="text-fg">{f.label}</span><span className="text-fg-3">{f.detail}</span></li>)}
                </ul>
              </section>

              <section className="card p-5">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold text-fg">Dependency ripple</h2>
                  <div className="flex gap-3 text-[12px] text-fg-3">{["changed", "1 hop", "2 hops", "3 hops"].map((l, i) => <span key={l} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: DEPTH_COLORS[i] }} />{l}</span>)}</div>
                </div>
                <GraphCanvas nodes={rippleNodes} links={r.graph.links} height={380} colorOf={(n) => DEPTH_COLORS[Math.min(4, n.depth ?? 0)]} showLabels="auto" />
              </section>

              {res.explanation && (
                <section className="card p-6">
                  <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-fg"><Sparkles size={15} className="text-accent" /> AI assessment</h2>
                  <Markdown>{res.explanation}</Markdown>
                </section>
              )}

              <div className="grid gap-5 md:grid-cols-2">
                <section className="card p-5">
                  <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-fg"><FileDiff size={15} className="text-fg-3" /> Files likely affected</h2>
                  <ul className="space-y-2">
                    {r.impactedFiles.slice(0, 12).map((f: any) => (
                      <li key={f.key} className="text-[13px]">
                        <Link href={`/repos/${id}/explorer?key=${encodeURIComponent(f.key)}`} className="path text-fg hover:text-accent">{f.path}</Link>
                        <span className="ml-2 text-fg-3">{f.depth} hop{f.depth > 1 ? "s" : ""}</span>
                      </li>
                    ))}
                    {!r.impactedFiles.length && <p className="text-[13.5px] text-fg-2">Nothing else depends on this.</p>}
                  </ul>
                </section>
                <section className="card p-5">
                  <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-fg"><HistoryIcon size={15} className="text-fg-3" /> Usually changes together</h2>
                  <ul className="space-y-2">
                    {r.coChange.slice(0, 10).map((c: any) => (
                      <li key={c.key} className="flex items-center gap-2 text-[13px]"><span className="path truncate text-fg">{c.path}</span><Badge className="ml-auto shrink-0">{c.count}× · {Math.round(c.confidence * 100)}%</Badge></li>
                    ))}
                    {!r.coChange.length && <p className="text-[13.5px] text-fg-2">No co-change history for these targets.</p>}
                  </ul>
                  {r.tests.length > 0 && (
                    <>
                      <h3 className="mb-2 mt-5 flex items-center gap-2 text-[13.5px] font-semibold text-fg"><FlaskConical size={14} className="text-fg-3" /> Tests to run</h3>
                      <ul className="space-y-1">{r.tests.slice(0, 8).map((t: any) => <li key={t.key} className="path truncate">{t.path}</li>)}</ul>
                    </>
                  )}
                </section>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function Gauge({ score, level }: { score: number; level: string }) {
  const color = level === "high" ? "var(--bad)" : level === "medium" ? "var(--warn)" : "var(--ok)";
  const R = 62, C = Math.PI * R;
  return (
    <div className="relative h-[108px] w-[170px] shrink-0">
      <svg viewBox="0 0 150 86" className="w-full">
        <path d="M13 75 A62 62 0 0 1 137 75" fill="none" strokeWidth="11" style={{ stroke: "var(--panel-2)" }} strokeLinecap="round" />
        <motion.path d="M13 75 A62 62 0 0 1 137 75" fill="none" style={{ stroke: color }} strokeWidth="11" strokeLinecap="round" strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - score / 100) }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="font-display font-semibold text-[2.4rem] leading-none" style={{ color }}><AnimatedNumber value={score} /></p>
        <p className="text-[12.5px] capitalize text-fg-3">{level} risk</p>
      </div>
    </div>
  );
}
