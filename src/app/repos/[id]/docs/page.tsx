"use client";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Download, FileText, RefreshCw, Sparkles } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { Badge, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { api, timeAgo, useFetch } from "@/lib/client/api";

interface Doc { id: string; slug: string; title: string; content: string; provider: string | null; updatedAt: string }
interface Plan { slug: string; title: string; kind: string }

export default function Docs() {
  const { id } = useParams<{ id: string }>();
  const q = useFetch<{ plan: Plan[]; docs: Doc[]; llm: boolean }>(`/api/repos/${id}/docs`);
  const [active, setActive] = useState<string>("overview");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [all, setAll] = useState<{ done: number; total: number } | null>(null);

  const docs = useMemo(() => new Map((q.data?.docs ?? []).map((d) => [d.slug, d])), [q.data]);

  const gen = async (slug: string) => {
    setBusy((b) => new Set(b).add(slug)); setErr(null);
    try { await api(`/api/repos/${id}/docs`, { method: "POST", json: { slug } }); await q.reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy((b) => { const n = new Set(b); n.delete(slug); return n; }); }
  };

  async function genAll() {
    const plan = q.data?.plan ?? [];
    setAll({ done: 0, total: plan.length });
    for (let i = 0; i < plan.length; i++) { await gen(plan[i].slug); setAll({ done: i + 1, total: plan.length }); }
    setTimeout(() => setAll(null), 1500);
  }

  // first visit: create the overview automatically so the page is never empty
  useEffect(() => {
    if (q.data && !q.data.docs.length && !busy.size) gen("overview");
  }, [q.data?.plan.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function exportAll() {
    const md = (q.data?.plan ?? []).map((p) => docs.get(p.slug)).filter(Boolean).map((d) => `# ${d!.title}\n\n${d!.content}`).join("\n\n---\n\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = "architecture-docs.md";
    a.click();
  }

  if (!q.data) return <div className="flex items-center gap-2 text-fg-2"><Spinner /> Loading</div>;
  const cur = docs.get(active);
  const curPlan = q.data.plan.find((p) => p.slug === active);

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader title="Documentation" sub="Generated from the knowledge graph, code and Git history." right={
        <>
          <button className="btn btn-sm" onClick={exportAll} disabled={!docs.size}><Download size={13} /> Export Markdown</button>
          <button className="btn btn-primary btn-sm" onClick={genAll} disabled={!!all || busy.size > 0}>{all ? <Spinner size={13} /> : <Sparkles size={13} />} {all ? `Writing ${all.done}/${all.total}` : "Generate all"}</button>
        </>
      } />
      {!q.data.llm && <div className="mb-5 rounded-lg border border-accent/35 bg-accent/10 px-3 py-2 text-[13.5px] text-fg">No API key set, so documents are assembled from graph data only. Add a key in Settings for written explanations.</div>}
      <div className="grid gap-8 lg:grid-cols-[230px_1fr]">
        <nav className="space-y-0.5 self-start lg:sticky lg:top-20">
          {q.data.plan.map((p) => {
            const d = docs.get(p.slug);
            return (
              <button key={p.slug} onClick={() => setActive(p.slug)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px] ${active === p.slug ? "bg-panel-2 text-fg ring-1 ring-line" : "text-fg-2 hover:text-fg"}`}>
                {busy.has(p.slug) ? <Spinner size={13} className="text-accent" /> : d ? <Check size={13} className="text-info" /> : <FileText size={13} className="text-fg-3" />}
                <span className="truncate">{p.title}</span>
              </button>
            );
          })}
        </nav>
        <article className="min-w-0">
          {err && <div className="mb-4"><ErrorNote>{err}</ErrorNote></div>}
          {cur ? (
            <>
              <div className="mb-5 flex items-center gap-3 border-b border-line pb-4">
                <Badge>{cur.provider ? `Written by ${cur.provider}` : "From graph data"}</Badge>
                <span className="text-[12.5px] text-fg-3">Updated {timeAgo(cur.updatedAt)}</span>
                <button className="btn btn-ghost btn-sm ml-auto" onClick={() => gen(active)} disabled={busy.has(active)}><RefreshCw size={13} className={busy.has(active) ? "animate-spin" : ""} /> Regenerate</button>
              </div>
              <Markdown>{cur.content}</Markdown>
            </>
          ) : (
            <div className="grid min-h-[320px] place-items-center rounded-[14px] border border-dashed border-line-2 text-center">
              <div>
                <BookOpen className="mx-auto mb-3 text-fg-3" />
                <p className="font-display font-semibold text-2xl text-fg">{curPlan?.title}</p>
                <button className="btn btn-primary mt-4" onClick={() => gen(active)} disabled={busy.has(active)}>{busy.has(active) ? <Spinner size={14} /> : <Sparkles size={14} />} Write this document</button>
              </div>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
