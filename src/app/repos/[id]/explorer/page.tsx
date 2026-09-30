"use client";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Layers, X } from "lucide-react";
import { GraphCanvas, type GNodeV } from "@/components/GraphCanvas";
import { NodeDetail } from "@/components/NodeDetail";
import { FileTree, type TreeNode } from "@/components/FileTree";
import { SymbolSearch } from "@/components/SymbolSearch";
import { Segmented, Skeleton, Toggle } from "@/components/ui";
import { colorFor, LANG_COLORS, useFetch } from "@/lib/client/api";

type Level = "module" | "file" | "entity";

export default function Explorer() {
  const { id } = useParams<{ id: string }>();
  const [level, setLevel] = useState<Level>("file");
  const [focus, setFocus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [cochange, setCochange] = useState(false);
  const [colorBy, setColorBy] = useState<"module" | "language">("module");
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key");
    if (k) { setSelected(k); setFocus(k); }
  }, []);

  const url = focus
    ? `/api/repos/${id}/graph?focus=${encodeURIComponent(focus)}&depth=2${cochange ? "&cochange=1" : ""}`
    : `/api/repos/${id}/graph?level=${level}${cochange ? "&cochange=1" : ""}&limit=${moduleFilter ? 1500 : level === "entity" ? 350 : 450}`;
  const graph = useFetch<any>(url);
  const tree = useFetch<TreeNode>(`/api/repos/${id}/tree`);

  const data = useMemo(() => {
    if (!graph.data) return null;
    let nodes: GNodeV[] = graph.data.nodes;
    let links = graph.data.links;
    if (moduleFilter && !focus && level === "file") {
      nodes = nodes.filter((n) => n.group === moduleFilter);
      const ids = new Set(nodes.map((n) => n.id));
      links = links.filter((l: any) => ids.has(l.source) && ids.has(l.target));
    }
    return { nodes, links };
  }, [graph.data, moduleFilter, focus, level]);

  const colorOf = (n: GNodeV) => (colorBy === "language" && n.language ? LANG_COLORS[n.language] ?? "#8c877d" : colorFor(n.group));

  function onGraphSelect(n: GNodeV | null) {
    if (!n) { setSelected(null); return; }
    if (n.kind === "module") { setModuleFilter(n.label); setLevel("file"); setSelected(null); return; }
    setSelected(n.id);
  }
  const pick = (key: string) => { setSelected(key); if (focus) setFocus(key); };

  const legend = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, number>();
    for (const n of data.nodes) { const k = colorBy === "language" ? n.language ?? "other" : n.group; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [data, colorBy]);

  return (
    <div className="flex h-[calc(100vh-56px)] min-h-[600px]">
      <aside className="hidden w-[264px] shrink-0 flex-col border-r border-line bg-panel lg:flex">
        <div className="border-b border-line p-3"><SymbolSearch repoId={id} onPick={(h) => pick(h.key)} /></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {tree.data ? <FileTree root={tree.data} selected={selected} onSelect={pick} /> : <div className="space-y-2 p-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-5" />)}</div>}
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
          {focus ? (
            <div className="flex items-center gap-2 text-[13.5px]">
              <span className="text-fg-2">Neighborhood of</span>
              <span className="chip max-w-[340px] truncate border-accent/40 text-fg">{graph.data?.nodes.find((n: any) => n.id === focus)?.label ?? focus}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setFocus(null)}><X size={13} /> Back to full graph</button>
            </div>
          ) : (
            <>
              <Segmented<Level> value={level} onChange={(v) => { setLevel(v); setModuleFilter(null); }} options={[{ value: "module", label: "Modules" }, { value: "file", label: "Files" }, { value: "entity", label: "Symbols" }]} />
              {moduleFilter && <span className="chip border-accent/40 text-fg">{moduleFilter}<button onClick={() => setModuleFilter(null)} aria-label="Clear module filter"><X size={11} /></button></span>}
            </>
          )}
          <div className="ml-auto flex items-center gap-4">
            {level !== "module" && <Segmented value={colorBy} onChange={setColorBy} options={[{ value: "module", label: "By module" }, { value: "language", label: "By language" }]} />}
            <Toggle checked={cochange} onChange={setCochange} label={<span className="text-[13px]">Co-change links</span>} />
          </div>
        </div>
        <div className="grid-bg relative min-h-0 flex-1">
          {!data ? <div className="p-4"><Skeleton className="h-full min-h-[480px]" /></div> : data.nodes.length === 0 ? (
            <div className="grid h-full place-items-center text-fg-2"><div className="text-center"><Layers className="mx-auto mb-3 text-fg-3" /> Nothing to show at this level.</div></div>
          ) : (
            <FillGraph>{(h) => <GraphCanvas nodes={data.nodes} links={data.links} selected={selected} onSelect={onGraphSelect} colorOf={colorOf} height={h} showLabels={level === "module" ? "always" : "auto"} />}</FillGraph>
          )}
          {data && (
            <div className="pointer-events-none absolute bottom-3 left-4 flex flex-col gap-1 text-[12px] text-fg-2">
              {legend.map(([k, c]) => (
                <span key={k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: colorBy === "language" ? LANG_COLORS[k] ?? "#8c877d" : colorFor(k) }} />{k} <span className="num text-fg-3">{c}</span></span>
              ))}
              {graph.data?.truncated && !moduleFilter && <span className="text-fg-3">Showing the {data.nodes.length} most connected of {graph.data.total}</span>}
            </div>
          )}
          <div className="pointer-events-none absolute bottom-3 right-4 flex gap-3 text-[11.5px] text-fg-3">
            <span className="flex items-center gap-1"><span className="h-px w-4 bg-info" /> imports</span>
            <span className="flex items-center gap-1"><span className="h-px w-4 bg-ok" /> calls</span>
            <span className="flex items-center gap-1"><span className="h-px w-4 bg-accent" /> extends</span>
            {cochange && <span className="flex items-center gap-1"><span className="h-px w-4 border-t border-dashed border-warn" /> co-changed</span>}
          </div>
        </div>
      </section>

      <AnimatePresence>
        {selected && (
          <aside className="w-[400px] shrink-0 border-l border-line bg-panel">
            <NodeDetail repoId={id} nodeKey={selected} onSelect={pick} onFocus={(k) => setFocus(k)} onClose={() => setSelected(null)} />
          </aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function FillGraph({ children }: { children: (h: number) => React.ReactNode }) {
  const [h, setH] = useState(560);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver((e) => setH(Math.max(320, Math.floor(e[0].contentRect.height))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return <div ref={setEl} className="absolute inset-0">{children(h)}</div>;
}
