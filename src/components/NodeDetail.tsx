"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Crosshair, GitCommitHorizontal, RefreshCw, Sparkles, X } from "lucide-react";
import { api, timeAgo, useFetch } from "@/lib/client/api";
import { Markdown } from "./Markdown";
import { CodeBlock } from "./CodeBlock";
import { Badge, ErrorNote, Skeleton, Spinner } from "./ui";

const REL_LABELS: [string, string][] = [
  ["containedIn", "Defined in"], ["contains", "Contains"], ["calls", "Calls"], ["calledBy", "Called by"],
  ["extends", "Extends / implements"], ["extendedBy", "Extended by"], ["imports", "Imports"], ["importedBy", "Imported by"], ["coChanged", "Changes together with"],
];

export function NodeDetail({ repoId, nodeKey, onSelect, onFocus, onClose }: { repoId: string; nodeKey: string; onSelect: (key: string) => void; onFocus?: (key: string) => void; onClose: () => void }) {
  const q = useFetch<any>(`/api/repos/${repoId}/node?key=${encodeURIComponent(nodeKey)}`);
  const [explain, setExplain] = useState<{ busy?: boolean; text?: string; error?: string }>({});
  const [tab, setTab] = useState<"about" | "source" | "history">("about");

  useEffect(() => { setExplain({}); setTab("about"); }, [nodeKey]);
  const d = q.data;

  async function runExplain(refresh = false) {
    setExplain({ busy: true });
    try {
      const r = await api<{ text: string }>(`/api/repos/${repoId}/explain`, { method: "POST", json: { key: nodeKey, refresh } });
      setExplain({ text: r.text });
    } catch (e) { setExplain({ error: e instanceof Error ? e.message : String(e) }); }
  }

  const summary = explain.text ?? d?.summary;
  return (
    <motion.div key={nodeKey} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }} className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-line p-4">
        <div className="min-w-0 flex-1">
          {d ? (
            <>
              <div className="flex items-center gap-2"><Badge tone={d.kind === "file" ? "info" : d.kind === "package" ? "default" : "ok"}>{d.node.type ?? d.kind}</Badge>{d.node.module && <span className="truncate text-[12px] text-fg-3">{d.node.module}</span>}</div>
              <p className="mt-1.5 break-all text-[15.5px] font-medium leading-snug text-fg">{d.node.name}</p>
              {d.node.path && d.kind !== "file" && <p className="path mt-0.5 break-all">{d.node.path}:{d.node.startLine}</p>}
            </>
          ) : <Skeleton className="h-10 w-3/4" />}
        </div>
        <button className="btn btn-ghost btn-sm px-1.5" onClick={onClose} aria-label="Close"><X size={15} /></button>
      </div>
      {q.error && <div className="p-4"><ErrorNote>{q.error}</ErrorNote></div>}
      {d && (
        <>
          {d.kind !== "package" && (
            <div className="grid grid-cols-4 gap-2 border-b border-line px-4 py-3 text-[12px]">
              <M v={d.node.loc} l="lines" /><M v={d.node.fanIn} l="fan-in" /><M v={d.node.fanOut} l="fan-out" /><M v={d.node.commitCount ?? 0} l="commits" />
            </div>
          )}
          <div className="flex items-center gap-1 px-3 pt-3">
            {(["about", "source", "history"] as const).filter((t) => d.kind !== "package" || t === "about").map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-md px-2.5 py-1 text-[13px] capitalize ${tab === t ? "bg-panel-2 text-fg" : "text-fg-2 hover:text-fg"}`}>{t}</button>
            ))}
            {onFocus && <button className="btn btn-ghost btn-sm ml-auto" onClick={() => onFocus(nodeKey)} title="Show only this node's neighborhood"><Crosshair size={13} /> Neighborhood</button>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "about" && (
              <div className="space-y-5">
                {d.kind !== "package" && (
                  <div>
                    {summary ? (
                      <div className="inset p-3.5">
                        <Markdown className="text-[13.5px]">{summary}</Markdown>
                        <button className="mt-2 inline-flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg" onClick={() => runExplain(true)} disabled={explain.busy}><RefreshCw size={11} /> Regenerate</button>
                      </div>
                    ) : (
                      <button className="btn w-full" onClick={() => runExplain()} disabled={explain.busy}>
                        {explain.busy ? <Spinner size={14} /> : <Sparkles size={14} className="text-accent" />} {explain.busy ? "Reading the code" : "Explain this with AI"}
                      </button>
                    )}
                    {explain.busy && summary && <div className="mt-2 flex items-center gap-2 text-[12.5px] text-fg-2"><Spinner size={12} /> Regenerating</div>}
                    {explain.error && <div className="mt-2"><ErrorNote>{explain.error}</ErrorNote></div>}
                  </div>
                )}
                {d.signature && <CodeBlock code={d.signature} language={d.node.language} showLines={false} />}
                {d.meta?.externalDeps?.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[12.5px] text-fg-3">External packages</p>
                    <div className="flex flex-wrap gap-1">{d.meta.externalDeps.map((p: string) => <span key={p} className="chip">{p}</span>)}</div>
                  </div>
                )}
                {REL_LABELS.map(([k, label]) => d.relations[k]?.length ? <Rel key={k} label={label} items={d.relations[k]} onSelect={onSelect} /> : null)}
              </div>
            )}
            {tab === "source" && (d.source ? <CodeBlock code={d.source.text} language={d.node.language} startLine={d.source.startLine} maxHeight={640} /> : <p className="text-[13.5px] text-fg-2">Source not available on disk.</p>)}
            {tab === "history" && (
              <ul className="space-y-2.5">
                {d.commits.map((c: any) => (
                  <li key={c.sha} className="flex gap-2.5 text-[13px]">
                    <GitCommitHorizontal size={14} className="mt-0.5 shrink-0 text-fg-3" />
                    <div className="min-w-0">
                      <p className="text-fg">{c.message}</p>
                      <p className="text-[12px] text-fg-3">{c.author}, {timeAgo(c.date)} <span className="text-ok">+{c.additions}</span> <span className="text-bad">−{c.deletions}</span></p>
                    </div>
                  </li>
                ))}
                {!d.commits.length && <p className="text-[13.5px] text-fg-2">No commits recorded for this file.</p>}
              </ul>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}

function M({ v, l }: { v: number; l: string }) {
  return <div><p className="num text-[15px] text-fg">{v ?? 0}</p><p className="text-fg-3">{l}</p></div>;
}

function Rel({ label, items, onSelect }: { label: string; items: any[]; onSelect: (k: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 6);
  return (
    <div>
      <p className="mb-1 text-[12.5px] text-fg-3">{label} <span className="num">({items.length})</span></p>
      <ul>
        {shown.map((it) => (
          <li key={it.key}>
            <button onClick={() => it.kind !== "package" && onSelect(it.key)} className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-panel-2" disabled={it.kind === "package"}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${it.kind === "file" ? "bg-info" : it.kind === "package" ? "bg-fg-3" : "bg-ok"}`} />
              <span className="min-w-0 flex-1 truncate text-fg-2 group-hover:text-fg">{it.name}</span>
              {it.kind !== "package" && <ChevronRight size={13} className="text-fg-3 opacity-0 group-hover:opacity-100" />}
            </button>
          </li>
        ))}
      </ul>
      {items.length > 6 && <button className="mt-0.5 px-1.5 text-[12px] text-info" onClick={() => setAll((a) => !a)}>{all ? "Show less" : `Show all ${items.length}`}</button>}
    </div>
  );
}
