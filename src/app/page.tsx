"use client";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { AlertTriangle, ArrowUpRight, BookOpenText, CalendarClock, GitCommitHorizontal, KeyRound, MessageSquareText, Network, Radar, ScanSearch, Zap } from "lucide-react";
import { AddRepo } from "@/components/AddRepo";
import { HeroGraph } from "@/components/HeroGraph";
import { SiteNav } from "@/components/SiteNav";
import { Footer } from "@/components/Footer";
import { LanguageMarquee } from "@/components/Marquee";
import { JobProgress } from "@/components/JobProgress";
import { ScheduleSummary, SyncSchedule, UpdateAllButton } from "@/components/SyncControls";
import { DrawLine, ease, Reveal, RevealWords, Spotlight, Tilt, TypeOut } from "@/components/motion";
import { Badge, Skeleton } from "@/components/ui";
import { fmt, LANG_COLORS, timeAgo, useFetch } from "@/lib/client/api";

interface RepoRow {
  id: string; name: string; url: string; isLocal: boolean; branch: string | null; status: string; error: string | null;
  lastSyncedAt: string | null; lastAnalyzedAt: string | null; syncEnabled: boolean; running: boolean;
  stats: { files: number; loc: number; codeFiles: number; commits?: number; entities: Record<string, number>; languages: { language: string; loc: number }[] } | null;
  latestJob: any;
}

const STEPS = [
  { t: "Clone and parse", d: "Every file is read and split into classes, functions and imports across 15 languages." },
  { t: "Build the graph", d: "Imports, calls and inheritance become edges in a knowledge graph you can explore." },
  { t: "Read the history", d: "Commits reveal hotspots, owners and the files that always change together." },
  { t: "Answer and predict", d: "Questions get cited answers; proposed changes get a blast radius and a risk score." },
];

export default function Home() {
  const repos = useFetch<RepoRow[]>("/api/repos", { interval: (d) => (d?.some((r) => r.running || r.status === "analyzing") ? 2000 : 15000) });
  const sys = useFetch<{ git: boolean; llm: boolean }>("/api/system");
  const hasRepos = !!repos.data?.length;

  return (
    <div className="min-h-screen">
      <SiteNav />

      <section
        className="relative -mt-[74px] overflow-hidden border-b border-line pt-[74px]"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
          e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
        }}
      >
        <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_70%_35%,black_25%,transparent_72%)]" />
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(460px circle at var(--mx, -999px) var(--my, -999px), color-mix(in srgb, var(--accent) 9%, transparent), transparent 70%)" }} />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-6 pb-16 pt-14 lg:grid-cols-[1fr_1.05fr] lg:pb-24 lg:pt-20">
          <div>
            <motion.a href="#updates" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}
              className="group mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-panel py-1 pl-1 pr-3 text-[13px] text-fg-2 shadow-sm hover:text-fg">
              <span className="rounded-full bg-fg px-2 py-0.5 text-[11.5px] font-medium text-bg">New</span>
              Pick the exact time repositories update
              <ArrowUpRight size={13} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </motion.a>
            <h1 className="font-display text-[2.9rem] font-semibold leading-[1.02] text-fg sm:text-[4rem]">
              <RevealWords text="Understand any codebase before you change it." />
            </h1>
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.7, ease }}
              className="mt-5 max-w-[33rem] text-[17px] leading-relaxed text-fg-2">
              Point it at a Git repository. It maps files, functions and commits into a knowledge graph, answers questions with cited code, and shows what breaks before you ship.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.7, ease }} className="mt-8 max-w-[36rem]">
              <AddRepo onAdded={repos.reload} />
            </motion.div>
            {sys.data && (!sys.data.llm || !sys.data.git) && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mt-5 max-w-[36rem] space-y-2">
                {!sys.data.llm && (
                  <Link href="/settings" className="flex items-center gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-[13.5px] text-fg hover:border-warn/50">
                    <KeyRound size={15} className="shrink-0 text-warn" />
                    <span>Add a Gemini or OpenAI key to turn on chat, explanations and written docs.</span>
                    <ArrowUpRight size={14} className="ml-auto shrink-0 text-fg-3" />
                  </Link>
                )}
                {!sys.data.git && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-2.5 text-[13.5px] text-fg">
                    <AlertTriangle size={15} className="shrink-0 text-bad" /> Git isn&apos;t installed. Run <code className="path text-fg">xcode-select --install</code>, then reload.
                  </div>
                )}
              </motion.div>
            )}
          </div>
          <motion.div initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.25, duration: 0.9, ease }} className="relative">
            <Tilt max={5}><HeroGraph /></Tilt>
            <motion.div className="card absolute -right-3 -top-5 hidden items-center gap-2 px-3 py-2 text-[12.5px] text-fg-2 sm:flex"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: [0, -6, 0] }} transition={{ opacity: { delay: 1.4 }, y: { delay: 1.4, duration: 4, repeat: Infinity, ease: "easeInOut" } }}>
              <span className="live-dot" /> Synced 2 min ago
            </motion.div>
          </motion.div>
        </div>
        <LanguageMarquee />
      </section>

      <section id="repositories" className="mx-auto max-w-[1200px] scroll-mt-20 px-6 py-16">
        <Reveal>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-[1.9rem] font-semibold text-fg">Your repositories</h2>
              <div className="mt-1.5">{hasRepos ? <ScheduleSummary /> : <p className="text-[14.5px] text-fg-2">Nothing analyzed yet. Paste a repository above to start.</p>}</div>
            </div>
            {hasRepos && (
              <div className="flex items-center gap-2">
                <a href="#updates" className="btn btn-sm btn-ghost"><CalendarClock size={14} /> Schedule</a>
                <UpdateAllButton onDone={repos.reload} />
              </div>
            )}
          </div>
        </Reveal>
        {repos.loading && !repos.data ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}</div>
        ) : hasRepos ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {repos.data!.map((r, i) => <RepoCard key={r.id} r={r} i={i} />)}
          </div>
        ) : (
          <Reveal><div className="rounded-2xl border border-dashed border-line-2 px-6 py-12 text-center text-[14px] text-fg-3">Your analyzed repositories will appear here.</div></Reveal>
        )}
      </section>

      <section id="how" className="scroll-mt-20 border-y border-line bg-panel">
        <div className="mx-auto max-w-[1200px] px-6 py-20">
          <Reveal><h2 className="font-display text-[1.9rem] font-semibold text-fg">How it works</h2></Reveal>
          <div className="relative mt-10">
          <div aria-hidden className="pointer-events-none absolute left-4 top-4 hidden lg:block" style={{ right: "calc((100% - 7.5rem) / 4 - 1rem)" }}>
            <DrawLine delay={0.2} />
          </div>
          <ol className="relative grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <motion.li key={s.t} className="relative" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ delay: 0.15 + i * 0.12, duration: 0.6, ease }}>
                <motion.span initial={{ scale: 0.4 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.12, type: "spring", stiffness: 400, damping: 18 }}
                  className="relative grid h-8 w-8 place-items-center rounded-full border border-line-2 bg-panel font-mono text-[13px] font-medium text-fg">{i + 1}</motion.span>
                <p className="mt-5 text-[16px] font-semibold text-fg">{s.t}</p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-fg-2">{s.d}</p>
              </motion.li>
            ))}
          </ol>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-[1200px] scroll-mt-20 space-y-24 px-6 py-24">
        <Feature icon={<MessageSquareText size={18} />} title="Ask questions, get answers with sources"
          body="Graph traversal and semantic search find the right code first, then the model answers from it. Every answer links back to the exact files and lines it used."
          visual={<ChatVisual />} />
        <Feature flip icon={<Radar size={18} />} title="See the blast radius of a change"
          body="Pick a function or paste a diff. Dependencies are traced three hops out, Git history adds files that usually change together, and the result is scored for risk with the tests you should run."
          visual={<RiskVisual />} />
        <Feature icon={<Network size={18} />} title="Explore the architecture, then document it"
          body="Move from modules to files to individual functions in an interactive graph. Generate an architecture overview, a dependency guide and per-module docs, and export them as Markdown."
          visual={<ModulesVisual />} />
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { i: <ScanSearch size={17} />, t: "Health report", d: "Circular dependencies, oversized files, hotspots, single-owner code and unused functions." },
            { i: <GitCommitHorizontal size={17} />, t: "History analytics", d: "Weekly activity, contributors, churn and the full commit log with changed files." },
            { i: <BookOpenText size={17} />, t: "Markdown export", d: "Every generated document downloads as one Markdown file for your wiki or README." },
          ].map((x, i) => (
            <Reveal key={x.t} delay={i * 0.08}>
              <Spotlight className="card h-full p-5">
                <motion.span whileHover={{ rotate: -8, scale: 1.08 }} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel-2 text-fg">{x.i}</motion.span>
                <p className="mt-4 text-[15px] font-semibold text-fg">{x.t}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-fg-2">{x.d}</p>
              </Spotlight>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="updates" className="scroll-mt-20 border-t border-line bg-panel">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-6 py-20 lg:grid-cols-[1fr_1.1fr]">
          <Reveal>
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel-2 text-fg"><CalendarClock size={18} /></span>
            <h2 className="mt-5 font-display text-[1.9rem] font-semibold leading-tight text-fg">Updates on your schedule, or right now</h2>
            <p className="mt-3 max-w-md text-[15.5px] leading-relaxed text-fg-2">Choose when repositories pull new commits: every day at a set time, on chosen weekdays, or on a repeating interval. Unchanged repositories are skipped in seconds.</p>
            <ul className="mt-6 space-y-3 text-[14.5px] text-fg-2">
              <li className="flex gap-3"><Zap size={16} className="mt-0.5 shrink-0 text-accent" /> Update now updates every repository at once, or a single one from its page.</li>
              <li className="flex gap-3"><CalendarClock size={16} className="mt-0.5 shrink-0 text-accent" /> Turn auto-sync off per repository from its sidebar.</li>
            </ul>
            <div className="mt-7"><UpdateAllButton size="md" onDone={repos.reload} /></div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="card p-6"><SyncSchedule /></div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Feature({ icon, title, body, visual, flip = false }: { icon: React.ReactNode; title: string; body: string; visual: React.ReactNode; flip?: boolean }) {
  return (
    <div className={`grid items-center gap-12 lg:grid-cols-2 ${flip ? "lg:[&>*:first-child]:order-2" : ""}`}>
      <Reveal className="max-w-[30rem]">
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel text-fg">{icon}</span>
        <h3 className="mt-5 font-display text-[1.8rem] font-semibold leading-tight text-fg">{title}</h3>
        <p className="mt-3 text-[15.5px] leading-relaxed text-fg-2">{body}</p>
      </Reveal>
      <Reveal delay={0.12}><Tilt max={3}>{visual}</Tilt></Reveal>
    </div>
  );
}

function ChatVisual() {
  return (
    <div className="card p-5">
      <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, ease }}
        className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-fg px-4 py-2.5 text-[13.5px] text-bg">Where do we validate the session token?</motion.div>
      <p className="mt-4 min-h-[66px] text-[13.5px] leading-relaxed text-fg-2">
        <TypeOut text="Tokens are checked in verifySession(), which the auth middleware calls on every request before routing. Expired tokens are refreshed by rotateToken()." speed={14} />
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {["auth/session.ts:42", "http/middleware.ts:18", "auth/tokens.ts:77"].map((s, i) => (
          <motion.span key={s} className="chip font-mono text-[11.5px]" initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 2.4 + i * 0.12 }}>{s}</motion.span>
        ))}
      </div>
    </div>
  );
}

function Bar({ pct, color, delay }: { pct: number; color: string; delay: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <span ref={ref} className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2">
      <motion.span className="block h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: inView ? `${pct}%` : 0 }} transition={{ delay, duration: 0.9, ease }} />
    </span>
  );
}

function RiskVisual() {
  const rows = [["http/middleware.ts", 1, "calls"], ["routes/login.ts", 1, "imports"], ["routes/account.ts", 2, "imports"], ["billing/checkout.ts", 2, "calls"]] as const;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-6 border-b border-line p-5">
        <div>
          <p className="font-display text-[2.6rem] font-semibold leading-none text-accent">64</p>
          <p className="mt-1 text-[12.5px] text-fg-3">risk score</p>
        </div>
        <div className="flex-1 space-y-2 text-[12.5px]">
          {([["Blast radius", 26], ["Centrality", 17], ["Change frequency", 12], ["Test coverage", 6]] as const).map(([l, v], i) => (
            <div key={l} className="flex items-center gap-2">
              <span className="w-28 text-fg-2">{l}</span>
              <Bar pct={(v / 35) * 100} color="var(--accent)" delay={0.1 + i * 0.1} />
              <span className="num w-6 text-right text-fg">+{v}</span>
            </div>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-line">
        {rows.map(([p, d, rel], i) => (
          <motion.li key={p} className="flex items-center gap-3 px-5 py-2.5 text-[13px]" initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.08 }}>
            <span className="path text-fg">{p}</span>
            <span className="ml-auto text-fg-3">{rel}</span>
            <Badge tone={d === 1 ? "accent" : "default"}>{d} hop{d > 1 ? "s" : ""}</Badge>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function ModulesVisual() {
  const mods = [["src/auth", 34, 0.21], ["src/http", 28, 0.46], ["src/routes", 41, 0.83], ["src/billing", 19, 0.62], ["src/db", 12, 0.08]] as const;
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between text-[12.5px] text-fg-3"><span>Module</span><span>Instability</span></div>
      <ul className="space-y-3">
        {mods.map(([m, f, ins], i) => (
          <li key={m} className="flex items-center gap-3 text-[13px]">
            <span className="path w-28 text-fg">{m}</span>
            <span className="w-14 text-fg-3">{f} files</span>
            <Bar pct={ins * 100} color="var(--info)" delay={i * 0.08} />
            <span className="num w-9 text-right text-fg-2">{ins.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RepoCard({ r, i }: { r: RepoRow; i: number }) {
  const langs = r.stats?.languages?.slice(0, 5) ?? [];
  const total = langs.reduce((s, l) => s + l.loc, 0) || 1;
  const ents = r.stats ? (Object.values(r.stats.entities || {}) as number[]).reduce((a, b) => a + b, 0) : 0;
  const busy = r.running || r.status === "analyzing";
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.5, ease }} whileHover={{ y: -3 }}>
      <Spotlight className="card h-full">
        <Link href={`/repos/${r.id}`} className="group flex h-full flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[16px] font-semibold text-fg">{r.name}</p>
              <p className="path mt-0.5 truncate text-fg-3">{r.url.replace(/^https?:\/\/(www\.)?/, "")}</p>
            </div>
            {busy ? <Badge tone="accent">Analyzing</Badge> : r.status === "error" ? <Badge tone="bad">Failed</Badge> : <Badge tone="ok">Ready</Badge>}
          </div>
          <div className="mt-5 flex-1">
            {busy && r.latestJob ? (
              <JobProgress job={r.latestJob} compact />
            ) : r.status === "error" ? (
              <p className="line-clamp-3 text-[13px] text-bad">{r.error}</p>
            ) : (
              <>
                <div className="flex h-1.5 overflow-hidden rounded-full bg-panel-2">
                  {langs.map((l, j) => (
                    <motion.div key={l.language} initial={{ width: 0 }} whileInView={{ width: `${(l.loc / total) * 100}%` }} viewport={{ once: true }} transition={{ delay: 0.2 + j * 0.05, duration: 0.7, ease }}
                      style={{ background: LANG_COLORS[l.language] ?? "#888" }} title={l.language} />
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {[[fmt(r.stats?.files), "files"], [fmt(r.stats?.loc), "lines"], [fmt(ents), "symbols"], [fmt(r.stats?.commits), "commits"]].map(([v, l]) => (
                    <div key={l}><p className="num text-[15px] font-semibold text-fg">{v}</p><p className="text-[12px] text-fg-3">{l}</p></div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="mt-5 flex items-center gap-2 border-t border-line pt-3 text-[12.5px] text-fg-3">
            <span>Synced {timeAgo(r.lastSyncedAt ?? r.lastAnalyzedAt)}</span>
            {!r.syncEnabled && <Badge>Auto-sync off</Badge>}
            <ArrowUpRight size={15} className="ml-auto transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
          </div>
        </Link>
      </Spotlight>
    </motion.div>
  );
}
