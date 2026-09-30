"use client";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/client/api";

export interface Hit { key: string; kind: string; name: string; type?: string; path?: string; line?: number; fanIn: number }

export function SymbolSearch({ repoId, onPick, placeholder = "Search files, classes, functions", autoFocus = false }: { repoId: string; onPick: (h: Hit) => void; placeholder?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(() => {
      api<Hit[]>(`/api/repos/${repoId}/search?q=${encodeURIComponent(q.trim())}`).then((h) => { setHits(h); setIdx(0); setOpen(true); }).catch(() => {});
    }, 140);
    return () => clearTimeout(t);
  }, [q, repoId]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pick = (h: Hit) => { onPick(h); setQ(""); setOpen(false); };

  return (
    <div ref={box} className="relative">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
      <input className="input h-9 pl-8 text-[13px]" placeholder={placeholder} value={q} autoFocus={autoFocus} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(hits.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
          else if (e.key === "Enter" && hits[idx]) { e.preventDefault(); pick(hits[idx]); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {open && hits.length > 0 && (
        <ul className="card absolute inset-x-0 top-11 z-40 max-h-80 overflow-auto p-1 shadow-2xl shadow-black/50">
          {hits.map((h, i) => (
            <li key={h.key}>
              <button onMouseEnter={() => setIdx(i)} onClick={() => pick(h)} className={`flex w-full flex-col rounded-md px-2.5 py-1.5 text-left ${i === idx ? "bg-panel-2" : ""}`}>
                <span className="flex items-center gap-2 text-[13px] text-fg"><span className={`h-1.5 w-1.5 rounded-full ${h.kind === "file" ? "bg-info" : "bg-ok"}`} /><span className="truncate">{h.name}</span><span className="ml-auto shrink-0 text-[11.5px] text-fg-3">{h.type}</span></span>
                {h.kind !== "file" && <span className="path truncate pl-3.5 text-[11.5px]">{h.path}:{h.line}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
