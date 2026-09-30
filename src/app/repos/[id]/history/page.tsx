"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, FilePlus2, FileX2, Pencil } from "lucide-react";
import { PageHeader, Skeleton, Meter, Empty } from "@/components/ui";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { colorFor, timeAgo, useFetch } from "@/lib/client/api";

interface Week { week: string; commits: number; additions: number; deletions: number }

export default function History() {
  const { id } = useParams<{ id: string }>();
  const q = useFetch<any>(`/api/repos/${id}/history`);
  const [open, setOpen] = useState<string | null>(null);
  const d = q.data;
  if (!d) return <div className="mx-auto max-w-[1100px]"><PageHeader title="History" /><Skeleton className="h-64" /></div>;
  if (!d.totals.commits) return <div className="mx-auto max-w-[1100px]"><PageHeader title="History" /><Empty title="No Git history found">This folder has no commits, or it isn&apos;t a Git repository.</Empty></div>;
  const maxChurn = Math.max(1, ...d.churn.map((c: any) => c.churn));
  const maxCommits = Math.max(1, ...d.contributors.map((c: any) => c.commits));

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader title="History" sub={`${new Date(d.totals.firstCommit).toLocaleDateString()} to ${new Date(d.totals.lastCommit).toLocaleDateString()}`} />
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
        {[["commits", d.totals.commits], ["contributors", d.totals.contributors], ["lines added", d.totals.additions], ["lines removed", d.totals.deletions]].map(([l, v]) => (
          <div key={l as string}><p className="font-display font-semibold text-[1.9rem] leading-none text-fg"><AnimatedNumber value={v as number} /></p><p className="mt-1 text-[13px] text-fg-3">{l}</p></div>
        ))}
      </div>

      <section className="card mt-8 p-5">
        <h2 className="text-[15px] font-semibold text-fg">Weekly activity</h2>
        <ActivityChart weeks={d.activity} />
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-[15px] font-semibold text-fg">Most changed files</h2>
          <ul className="mt-3 space-y-3">
            {d.churn.slice(0, 10).map((f: any) => (
              <li key={f.key}>
                <Link href={`/repos/${id}/explorer?key=${encodeURIComponent(f.key)}`} className="block">
                  <div className="flex justify-between gap-3 text-[13px]"><span className="path truncate text-fg hover:text-accent">{f.path}</span><span className="num shrink-0 text-fg-3">{f.commitCount} commits, {f.authors} authors</span></div>
                  <Meter value={f.churn} max={maxChurn} color="var(--bad)" className="mt-1.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="text-[15px] font-semibold text-fg">Contributors</h2>
          <ul className="mt-3 space-y-3">
            {d.contributors.slice(0, 10).map((c: any) => (
              <li key={c.email + c.name}>
                <div className="flex items-center gap-2.5 text-[13px]">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-bg" style={{ background: colorFor(c.name) }}>{c.name.slice(0, 1).toUpperCase()}</span>
                  <span className="truncate text-fg">{c.name}</span>
                  <span className="num ml-auto text-fg-3">{c.commits} commits</span>
                </div>
                <Meter value={c.commits} max={maxCommits} color={colorFor(c.name)} className="ml-[34px] mt-1.5" />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-5">
        <h2 className="mb-3 font-display font-semibold text-[1.35rem] text-fg">Recent commits</h2>
        <ul className="divide-y divide-line border-y border-line">
          {d.commits.map((c: any) => (
            <li key={c.sha}>
              <button className="flex w-full items-center gap-4 py-3 text-left" onClick={() => setOpen(open === c.sha ? null : c.sha)}>
                <code className="path w-[58px] shrink-0 text-accent">{c.sha.slice(0, 7)}</code>
                <span className="min-w-0 flex-1 truncate text-[14px] text-fg">{c.message.split("\n")[0]}</span>
                <span className="hidden shrink-0 text-[12.5px] text-fg-3 sm:block">{c.author}</span>
                <span className="w-20 shrink-0 text-right text-[12.5px] text-fg-3">{timeAgo(c.date)}</span>
                <span className="num hidden w-24 shrink-0 text-right text-[12.5px] sm:block"><span className="text-ok">+{c.additions}</span> <span className="text-bad">−{c.deletions}</span></span>
                <ChevronDown size={14} className={`shrink-0 text-fg-3 transition-transform ${open === c.sha ? "rotate-180" : ""}`} />
              </button>
              {open === c.sha && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden pb-3 pl-[74px]">
                  {c.files ? <ul className="space-y-1">{c.files.slice(0, 25).map((f: any) => (
                    <li key={f.path} className="flex items-center gap-2 text-[12.5px]">
                      {f.changeType === "A" ? <FilePlus2 size={12} className="text-ok" /> : f.changeType === "D" ? <FileX2 size={12} className="text-bad" /> : <Pencil size={12} className="text-info" />}
                      <span className="path truncate">{f.path}</span><span className="num ml-auto text-fg-3">+{f.additions} −{f.deletions}</span>
                    </li>))}</ul> : <p className="text-[12.5px] text-fg-3">{c.filesChanged} files changed.</p>}
                </motion.div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ActivityChart({ weeks }: { weeks: Week[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = 190, P = { l: 34, r: 8, t: 10, b: 24 };
  const { bars, max, ticks } = useMemo(() => {
    const max = Math.max(1, ...weeks.map((w) => w.commits));
    const bw = (W - P.l - P.r) / Math.max(1, weeks.length);
    const bars = weeks.map((w, i) => ({ ...w, x: P.l + i * bw, w: Math.max(1, bw - 1), h: (w.commits / max) * (H - P.t - P.b) }));
    const step = Math.max(1, Math.ceil(weeks.length / 8));
    const ticks = weeks.map((w, i) => ({ i, label: new Date(w.week).toLocaleDateString(undefined, { month: "short", year: "2-digit" }) })).filter((t) => t.i % step === 0);
    return { bars, max, ticks };
  }, [weeks]);
  const h = hover != null ? bars[hover] : null;
  return (
    <div className="relative mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}><line x1={P.l} x2={W - P.r} y1={H - P.b - f * (H - P.t - P.b)} y2={H - P.b - f * (H - P.t - P.b)} strokeDasharray="2 4" style={{ stroke: "var(--line)" }} /><text x={P.l - 6} y={H - P.b - f * (H - P.t - P.b) + 4} textAnchor="end" fontSize="11" style={{ fill: "var(--fg-3)" }}>{Math.round(max * f)}</text></g>
        ))}
        {bars.map((b, i) => (
          <motion.rect key={b.week} x={b.x} width={b.w} rx={1.5} style={{ fill: hover === i ? "var(--accent)" : "var(--info)" }} opacity={hover == null || hover === i ? 1 : 0.55}
            initial={{ y: H - P.b, height: 0 }} animate={{ y: H - P.b - b.h, height: b.h }} transition={{ delay: Math.min(0.6, i * 0.004), duration: 0.5, ease: [0.16, 1, 0.3, 1] }} onMouseEnter={() => setHover(i)} />
        ))}
        {bars.map((b, i) => <rect key={"h" + i} x={b.x} width={b.w + 1} y={0} height={H - P.b} fill="transparent" onMouseEnter={() => setHover(i)} />)}
        {ticks.map((t) => <text key={t.i} x={bars[t.i].x} y={H - 6} fontSize="11" style={{ fill: "var(--fg-3)" }}>{t.label}</text>)}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-line-2 bg-panel-2 px-2.5 py-1.5 text-[12px] shadow-xl" style={{ left: `clamp(0%, ${(h.x / W) * 100}%, 80%)` }}>
          <p className="text-fg">Week of {new Date(h.week).toLocaleDateString()}</p>
          <p className="text-fg-2">{h.commits} commits, <span className="text-ok">+{h.additions}</span> <span className="text-bad">−{h.deletions}</span></p>
        </div>
      )}
    </div>
  );
}
