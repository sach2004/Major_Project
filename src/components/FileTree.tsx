"use client";
import { useState } from "react";
import { ChevronRight, FileCode2, Folder } from "lucide-react";
import { LANG_COLORS } from "@/lib/client/api";

export interface TreeNode { name: string; path: string; key?: string; language?: string; loc: number; churn: number; children?: TreeNode[] }

export function FileTree({ root, selected, onSelect }: { root: TreeNode; selected?: string | null; onSelect: (key: string) => void }) {
  // collapse single-child folders ("src/main/java/...")
  return <div className="text-[13px]">{(root.children ?? []).map((c) => <Node key={c.path} n={c} depth={0} selected={selected} onSelect={onSelect} />)}</div>;
}

function compress(n: TreeNode): TreeNode {
  let cur = n;
  let name = n.name;
  while (cur.children && cur.children.length === 1 && cur.children[0].children) {
    cur = cur.children[0];
    name = `${name}/${cur.name}`;
  }
  return cur === n ? n : { ...cur, name };
}

function Node({ n: raw, depth, selected, onSelect }: { n: TreeNode; depth: number; selected?: string | null; onSelect: (k: string) => void }) {
  const n = raw.children ? compress(raw) : raw;
  const [open, setOpen] = useState(depth < 1);
  if (n.children) {
    return (
      <div>
        <button className="flex w-full items-center gap-1 rounded-md py-[3px] pr-2 text-left text-fg-2 hover:bg-panel-2 hover:text-fg" style={{ paddingLeft: depth * 12 + 4 }} onClick={() => setOpen((o) => !o)}>
          <ChevronRight size={13} className={`shrink-0 text-fg-3 transition-transform ${open ? "rotate-90" : ""}`} />
          <Folder size={13} className="shrink-0 text-fg-3" />
          <span className="truncate">{n.name}</span>
          <span className="num ml-auto pl-2 text-[11px] text-fg-3">{n.loc >= 1000 ? `${(n.loc / 1000).toFixed(1)}k` : n.loc}</span>
        </button>
        {open && n.children.map((c) => <Node key={c.path} n={c} depth={depth + 1} selected={selected} onSelect={onSelect} />)}
      </div>
    );
  }
  const active = selected === n.key;
  return (
    <button onClick={() => n.key && onSelect(n.key)} className={`flex w-full items-center gap-1.5 rounded-md py-[3px] pr-2 text-left ${active ? "bg-accent/10 text-fg" : "text-fg-2 hover:bg-panel-2 hover:text-fg"}`} style={{ paddingLeft: depth * 12 + 21 }}>
      <FileCode2 size={13} className="shrink-0" style={{ color: LANG_COLORS[n.language ?? ""] ?? "#777" }} />
      <span className="truncate">{n.name}</span>
    </button>
  );
}
