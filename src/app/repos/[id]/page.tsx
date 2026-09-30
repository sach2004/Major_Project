"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUpRight, CheckCircle2, CircleX, Clock3, SkipForward } from "lucide-react";
import { useRepo } from "@/components/RepoContext";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Markdown } from "@/components/Markdown";
import { GraphCanvas } from "@/components/GraphCanvas";
import { Badge, Dot, Meter, Skeleton } from "@/components/ui";
import { colorFor, LANG_COLORS, timeAgo, useFetch } from "@/lib/client/api";

function Section({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[14.5px] font-semibold text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const More = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="inline-flex items-center gap-1 text-[13px] text-fg-2 hover:text-fg">{children} <ArrowUpRight size={13} /></Link>
);

export default function Overview() {
  const { id } = useParams<{ id: string }>();
  const { repo } = useRepo();
  const ins = useFetch<any>(`/api/repos/${id}/insights`);
  const mod = useFetch<any>(`/api/repos/${id}/graph?level=module`);
  const jobs = useFetch<any>(`/api/repos/${id}/jobs`);
  if (!repo?.stats) return null;
  const st = repo.stats;
  const entities = (Object.values(st.entities || {}) as number[]).reduce((a, b) => a + b, 0);
  const edges = (Object.values(st.edges || {}) as number[]).reduce((a, b) => a + b, 0);
  const langTotal = st.languages.reduce((s, l) => s + l.loc, 0) || 1;
  const health = ins.data?.health as number | undefined;
  const healthTone = health == null ? "var(--fg-3)" : health >= 75 ? "var(--ok)" : health >= 50 ? "var(--warn)" : "var(--bad)";

  const figures = [
    { v: st.files, l: "Files" },
    { v: st.loc, l: "Lines of code" },
    { v: entities, l: "Classes and functions" },
    { v: edges, l: "Relationships" },
    { v: st.commits ?? 0, l: "Commits" },
  ];

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="max-w-3xl">
        <h1 className="font-display text-[2.3rem] font-semibold leading-tight text-fg">{repo.name}</h1>
        <p className="path mt-1 text-fg-3">{repo.url.replace(/^https?:\/\/(www\.)?/, "")}</p>
      </div>

      <div className="card mt-7 grid grid-cols-2 divide-line sm:grid-cols-5 sm:divide-x">
        {figures.map((f, i) => (
          <motion.div key={f.l} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 * i }} className="px-5 py-4">
            <p className="font-display text-[1.7rem] font-semibold leading-none text-fg"><AnimatedNumber value={f.v} /></p>
            <p className="mt-1.5 text-[12.5px] text-fg-3">{f.l}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Section title="Summary" className="lg:col-span-2">
          {repo.summary ? <Markdown>{repo.summary}</Markdown> : (
            <p className="text-[14px] text-fg-2">No AI summary yet. Add a Gemini or OpenAI key in <Link className="text-info underline underline-offset-2" href="/settings">Settings</Link>, then click Sync now.</p>
          )}
        </Section>

        <Section title="Architecture health" action={<More href={`/repos/${id}/insights`}>Report</More>}>
          {health == null ? <Skeleton className="h-36" /> : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[3rem] font-semibold leading-none" style={{ color: healthTone }}><AnimatedNumber value={health} /></span>
                <span className="text-[13px] text-fg-3">out of 100</span>
              </div>
              <ul className="mt-4 space-y-2.5">
                {ins.data.issues.slice(0, 4).map((iss: any) => (
                  <li key={iss.id} className="flex items-start gap-2.5 text-[13.5px]">
                    <span className="mt-[7px]"><Dot tone={iss.severity === "high" ? "bad" : iss.severity === "medium" ? "warn" : "default"} /></span>
                    <span className="line-clamp-2 text-fg-2">{iss.title}</span>
                  </li>
                ))}
                {!ins.data.issues.length && <li className="text-[13.5px] text-fg-2">No structural issues found.</li>}
              </ul>
            </>
          )}
        </Section>

        <Section title="Module map" className="lg:col-span-2" action={<More href={`/repos/${id}/explorer`}>Open explorer</More>}>
          <div className="inset overflow-hidden">
            {mod.data ? (
              mod.data.nodes.length ? <GraphCanvas nodes={mod.data.nodes} links={mod.data.links} height={330} colorOf={(n) => colorFor(n.group)} showLabels="always" /> : <p className="py-16 text-center text-[14px] text-fg-2">No code modules detected.</p>
            ) : <Skeleton className="h-[330px]" />}
          </div>
        </Section>

        <Section title="Languages">
          <div className="space-y-3.5">
            {st.languages.slice(0, 7).map((l) => (
              <div key={l.language}>
                <div className="mb-1.5 flex justify-between text-[13px]">
                  <span className="flex items-center gap-2 capitalize text-fg"><span className="h-2 w-2 rounded-full" style={{ background: LANG_COLORS[l.language] ?? "#888" }} />{l.language}</span>
                  <span className="num text-fg-3">{Math.round((l.loc / langTotal) * 100)}%</span>
                </div>
                <Meter value={l.loc} max={langTotal} color={LANG_COLORS[l.language] ?? "#888"} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="External dependencies" className="lg:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {repo.packages.slice(0, 32).map((p) => <span key={p.name} className="chip font-mono text-[12px]" title={`imported by ${p.count} files`}>{p.name}<span className="num text-fg-3">{p.count}</span></span>)}
            {!repo.packages.length && <p className="text-[13.5px] text-fg-2">None detected.</p>}
          </div>
        </Section>

        <Section title="Analysis runs">
          <ul className="-my-1 divide-y divide-line">
            {(jobs.data?.jobs ?? []).slice(0, 6).map((j: any) => (
              <li key={j.id} className="flex items-center gap-2.5 py-2 text-[13px]">
                {j.status === "completed" ? <CheckCircle2 size={14} className="text-ok" /> : j.status === "failed" ? <CircleX size={14} className="text-bad" /> : j.status === "skipped" ? <SkipForward size={14} className="text-fg-3" /> : <Clock3 size={14} className="text-accent" />}
                <span className="capitalize text-fg">{j.type}</span>
                <Badge>{j.trigger}</Badge>
                <span className="ml-auto text-fg-3">{timeAgo(j.createdAt)}</span>
              </li>
            ))}
          </ul>
          {repo.embeddingModel && <p className="mt-3 border-t border-line pt-3 font-mono text-[11.5px] text-fg-3">{repo.embeddingModel}</p>}
        </Section>
      </div>
    </div>
  );
}
