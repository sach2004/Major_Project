"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Badge, Empty, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { useFetch } from "@/lib/client/api";

const CAT: Record<string, string> = {
  cycle: "Circular dependency", "module-cycle": "Module cycle", "god-file": "Oversized file", hotspot: "Change hotspot",
  "dead-code": "Unused code", orphan: "Unreferenced file", "bus-factor": "Single-author risk", "large-function": "Long function",
};

export default function Insights() {
  const { id } = useParams<{ id: string }>();
  const q = useFetch<any>(`/api/repos/${id}/insights`);
  const [sev, setSev] = useState<"all" | "high" | "medium" | "low">("all");
  const [cat, setCat] = useState<string>("all");
  const d = q.data;
  const shown = useMemo(() => (d?.issues ?? []).filter((i: any) => (sev === "all" || i.severity === sev) && (cat === "all" || i.category === cat)), [d, sev, cat]);
  if (!d) return <div className="mx-auto max-w-[1000px]"><PageHeader title="Architecture health" /><Skeleton className="h-64" /></div>;
  const color = d.health >= 75 ? "var(--ok)" : d.health >= 50 ? "var(--warn)" : "var(--bad)";
  const cats = Object.entries(d.counts as Record<string, number>).filter(([, n]) => n > 0);

  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader title="Architecture health" sub="Structural issues found by analyzing dependencies, call relationships and Git history." />
      <div className="flex flex-wrap items-end gap-x-12 gap-y-4 border-b border-line pb-8">
        <div>
          <p className="font-display font-semibold text-[3.6rem] leading-none" style={{ color }}><AnimatedNumber value={d.health} /></p>
          <p className="mt-1 text-[13px] text-fg-3">health score out of 100</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {cats.map(([k, n]) => (
            <button key={k} onClick={() => setCat(cat === k ? "all" : k)} className={`text-left ${cat === k ? "opacity-100" : cat === "all" ? "opacity-100" : "opacity-50"}`}>
              <p className="font-display font-semibold text-[1.6rem] leading-none text-fg">{n}</p>
              <p className="text-[12.5px] text-fg-3">{CAT[k] ?? k}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-display font-semibold text-[1.35rem] text-fg">Findings <span className="text-fg-3">({shown.length})</span></h2>
        <Segmented value={sev} onChange={setSev} options={[{ value: "all", label: "All" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} />
      </div>

      {!shown.length ? <Empty title="Nothing found">No issues match this filter.</Empty> : (
        <ul className="mt-4 space-y-2.5">
          {shown.slice(0, 120).map((i: any, n: number) => (
            <motion.li key={i.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.4, n * 0.02) }} className="card p-4">
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i.severity === "high" ? "bg-bad" : i.severity === "medium" ? "bg-accent" : "bg-info"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-[14.5px] font-medium text-fg">{i.title}</p><Badge>{CAT[i.category] ?? i.category}</Badge></div>
                  <p className="mt-1 text-[13.5px] text-fg-2">{i.detail}</p>
                  {i.keys?.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {i.keys.slice(0, 6).map((k: string) => (
                        <Link key={k} href={`/repos/${id}/explorer?key=${encodeURIComponent(k)}`} className="chip max-w-[320px] hover:border-accent/50 hover:text-fg"><span className="truncate">{k.replace(/^[fep]:/, "").replace(/#.*$/, "")}</span></Link>
                      ))}
                      {i.keys.length > 6 && <span className="chip">+{i.keys.length - 6}</span>}
                    </div>
                  )}
                </div>
              </div>
            </motion.li>
          ))}
        </ul>
      )}

      <section className="mt-12">
        <h2 className="mb-3 font-display font-semibold text-[1.35rem] text-fg">Modules</h2>
        <div className="overflow-x-auto rounded-[14px] border border-line">
          <table className="w-full text-[13.5px]">
            <thead className="bg-panel text-left text-fg-3"><tr><th className="px-4 py-2.5 font-medium">Module</th><th className="px-3 font-medium">Files</th><th className="px-3 font-medium">Lines</th><th className="px-3 font-medium">Depended on by</th><th className="px-3 font-medium">Depends on</th><th className="px-3 font-medium">Instability</th></tr></thead>
            <tbody className="divide-y divide-line">
              {d.modules.slice(0, 20).map((m: any) => (
                <tr key={m.name} className="text-fg-2"><td className="path px-4 py-2 text-fg">{m.name}</td><td className="num px-3">{m.files}</td><td className="num px-3">{m.loc.toLocaleString()}</td><td className="num px-3">{m.fanIn}</td><td className="num px-3">{m.fanOut}</td>
                  <td className="px-3"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-info" style={{ width: `${m.instability * 100}%` }} /></div><span className="num text-[12px] text-fg-3">{m.instability.toFixed(2)}</span></div></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12.5px] text-fg-3">Instability near 0 means many things depend on the module (hard to change); near 1 means it mostly depends on others.</p>
      </section>
    </div>
  );
}
