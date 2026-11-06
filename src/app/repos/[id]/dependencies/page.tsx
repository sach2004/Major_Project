"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, FileCode2, Network, Package } from "lucide-react";
import { FileTree, type TreeNode } from "@/components/FileTree";
import { GraphCanvas } from "@/components/GraphCanvas";
import { Badge, Empty, PageHeader, Skeleton } from "@/components/ui";
import { LANG_COLORS, useFetch } from "@/lib/client/api";

interface Ref { key: string; kind: string; name: string; path?: string }

const ease = [0.16, 1, 0.3, 1] as const;

/** Phase 1 – File Dependency View: what a file imports, what imports it, and its import neighbourhood. */
export default function Dependencies() {
  const { id } = useParams<{ id: string }>();
  const tree = useFetch<TreeNode>(`/api/repos/${id}/tree`);
  const files = useFetch<any>(`/api/repos/${id}/graph?level=file&limit=450`);
  const [selected, setSelected] = useState<string | null>(null);

  const top = useMemo(() => ((files.data?.nodes ?? []) as any[]).slice().sort((a, b) => (b.fanIn ?? 0) - (a.fanIn ?? 0)).slice(0, 8), [files.data]);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key");
    if (k && k.startsWith("f:")) setSelected(k);
  }, []);
  useEffect(() => { if (!selected && top.length) setSelected(top[0].id); }, [top, selected]);

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="File dependencies" sub="Pick a file to see what it imports, what depends on it, and its place in the import graph." />
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="card self-start p-2 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
          {top.length > 0 && (
            <div className="mb-2 border-b border-line px-2 pb-3 pt-1">
              <p className="mb-1.5 text-[12px] font-medium text-fg-3">Most imported</p>
              {top.map((n) => (
                <button key={n.id} onClick={() => setSelected(n.id)} className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] ${selected === n.id ? "bg-panel-2 text-fg" : "text-fg-2 hover:bg-panel-2 hover:text-fg"}`}>
                  <span className="min-w-0 flex-1 truncate">{n.label}</span>
                  <span className="num text-[11.5px] text-fg-3">{n.fanIn}</span>
                </button>
              ))}
            </div>
          )}
          {tree.data ? <FileTree root={tree.data} selected={selected} onSelect={setSelected} /> : <div className="space-y-2 p-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5" />)}</div>}
        </aside>
        <div className="min-w-0">
          {selected ? <FileDeps key={selected} repoId={id} fileKey={selected} onSelect={setSelected} /> : files.data ? (
            <Empty icon={<FileCode2 size={18} />} title="No code files">This repository has no analysable source files.</Empty>
          ) : <Skeleton className="h-[480px]" />}
        </div>
      </div>
    </div>
  );
}

function FileDeps({ repoId, fileKey, onSelect }: { repoId: string; fileKey: string; onSelect: (k: string) => void }) {
  const node = useFetch<any>(`/api/repos/${repoId}/node?key=${encodeURIComponent(fileKey)}`);
  const ego = useFetch<any>(`/api/repos/${repoId}/graph?focus=${encodeURIComponent(fileKey)}&depth=1`);
  const d = node.data;

  const graph = useMemo(() => {
    if (!ego.data) return null;
    const links = (ego.data.links as any[]).filter((l) => l.type === "IMPORTS");
    const ids = new Set<string>([fileKey]);
    for (const l of links) { ids.add(l.source); ids.add(l.target); }
    const nodes = (ego.data.nodes as any[]).filter((n) => ids.has(n.id) && (n.kind === "file" || n.kind === "package"));
    return { nodes, links };
  }, [ego.data, fileKey]);

  if (node.error) return <Empty title="File not found">{node.error}</Empty>;
  if (!d) return <Skeleton className="h-[480px]" />;

  const imports: Ref[] = (d.relations.imports ?? []).filter((r: Ref) => r.kind === "file");
  const pkgs: string[] = d.meta?.externalDeps ?? [];
  const importedBy: Ref[] = (d.relations.importedBy ?? []).filter((r: Ref) => r.kind === "file");

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }} className="space-y-5">
      <section className="card flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[12.5px] text-fg-3">
            <span className="h-2 w-2 rounded-full" style={{ background: LANG_COLORS[d.node.language] ?? "#888" }} />
            <span className="capitalize">{d.node.language}</span>{d.node.module && <span>in {d.node.module}</span>}
          </p>
          <p className="path mt-1 break-all text-[14px] text-fg">{d.node.name}</p>
        </div>
        {[[d.node.loc, "lines"], [imports.length + pkgs.length, "imports"], [importedBy.length, "used by"]].map(([v, l]) => (
          <div key={l as string}><p className="num font-display text-[1.6rem] font-semibold leading-none text-fg">{v as number}</p><p className="mt-1 text-[12px] text-fg-3">{l}</p></div>
        ))}
        <Link href={`/repos/${repoId}/explorer?key=${encodeURIComponent(fileKey)}`} className="btn btn-sm"><Network size={13} /> Open in explorer</Link>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[14.5px] font-semibold text-fg"><ArrowUpRight size={15} className="text-fg-3" /> Imports <span className="num font-normal text-fg-3">({imports.length + pkgs.length})</span></h2>
          <ul className="mt-3 space-y-0.5">
            {imports.map((r) => <FileRow key={r.key} r={r} onSelect={onSelect} />)}
          </ul>
          {pkgs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
              {pkgs.map((p) => <span key={p} className="chip font-mono text-[11.5px]"><Package size={11} /> {p}</span>)}
            </div>
          )}
          {!imports.length && !pkgs.length && <p className="mt-3 text-[13.5px] text-fg-2">This file imports nothing.</p>}
        </section>
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[14.5px] font-semibold text-fg"><ArrowDownLeft size={15} className="text-fg-3" /> Imported by <span className="num font-normal text-fg-3">({importedBy.length})</span></h2>
          <ul className="mt-3 space-y-0.5">
            {importedBy.map((r) => <FileRow key={r.key} r={r} onSelect={onSelect} />)}
          </ul>
          {!importedBy.length && <p className="mt-3 text-[13.5px] text-fg-2">No other file imports this one.</p>}
        </section>
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14.5px] font-semibold text-fg">Import graph</h2>
          <div className="flex gap-3 text-[12px] text-fg-3">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" /> this file</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-info" /> files</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm border border-fg-3" /> packages</span>
          </div>
        </div>
        <div className="inset overflow-hidden">
          {graph ? (
            graph.links.length ? (
              <GraphCanvas nodes={graph.nodes} links={graph.links} selected={fileKey} height={380} showLabels="always"
                colorOf={(n) => (n.id === fileKey ? "#e8590c" : n.kind === "package" ? "#8a93a6" : "#3b6fd9")}
                onSelect={(n) => n && n.kind === "file" && onSelect(n.id)} />
            ) : <p className="py-16 text-center text-[14px] text-fg-2">No import relationships for this file.</p>
          ) : <Skeleton className="h-[380px]" />}
        </div>
      </section>
    </motion.div>
  );
}

function FileRow({ r, onSelect }: { r: Ref; onSelect: (k: string) => void }) {
  const parts = (r.path ?? r.name).split("/");
  const name = parts.pop();
  return (
    <li>
      <button onClick={() => onSelect(r.key)} className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-panel-2">
        <FileCode2 size={13} className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1 truncate text-[13px]"><span className="text-fg-3">{parts.length ? parts.join("/") + "/" : ""}</span><span className="text-fg">{name}</span></span>
        <Badge className="opacity-0 group-hover:opacity-100">View</Badge>
      </button>
    </li>
  );
}
