"use client";
import ForceGraph2D from "react-force-graph-2d";
import { useEffect, useMemo, useRef, useState } from "react";
import { cssVar, useTheme } from "@/lib/client/theme";

export interface GNodeV { id: string; label: string; kind: string; group: string; size?: number; color?: string; [k: string]: any }
export interface GLinkV { source: string; target: string; type: string; weight?: number }

export interface GraphProps {
  nodes: GNodeV[];
  links: GLinkV[];
  selected?: string | null;
  onSelect?: (n: GNodeV | null) => void;
  colorOf: (n: GNodeV) => string;
  height?: number;
  showLabels?: "auto" | "always";
  linkColor?: (type: string) => string;
}

const idOf = (v: any) => (typeof v === "object" && v ? v.id : v);

function rgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export default function GraphInner({ nodes, links, selected, onSelect, colorOf, height = 560, showLabels = "auto", linkColor }: GraphProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<any>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<string | null>(null);
  const fitted = useRef(false);

  // force-graph mutates its input, so hand it fresh copies whenever the data changes
  const data = useMemo(() => {
    fitted.current = false;
    const ids = new Set(nodes.map((n) => n.id));
    return {
      nodes: nodes.map((n) => ({ ...n })),
      links: links.filter((l) => ids.has(l.source) && ids.has(l.target)).map((l) => ({ ...l })),
    };
  }, [nodes, links]);

  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      (m.get(l.source) ?? m.set(l.source, new Set()).get(l.source)!).add(l.target);
      (m.get(l.target) ?? m.set(l.target, new Set()).get(l.target)!).add(l.source);
    }
    return m;
  }, [links]);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(200, Math.floor(e[0].contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    const n = data.nodes.length;
    g.d3Force("charge")?.strength(n > 300 ? -40 : n > 120 ? -70 : -140);
    g.d3Force("link")?.distance(n > 300 ? 30 : 55);
    g.d3ReheatSimulation?.();
  }, [data]);

  useEffect(() => {
    if (!selected || !fg.current) return;
    const node: any = data.nodes.find((n) => n.id === selected);
    if (node && Number.isFinite(node.x)) {
      fg.current.centerAt(node.x, node.y, 600);
    }
  }, [selected, data]);

  const [theme] = useTheme();
  const pal = useMemo(() => ({
    fg: cssVar("--fg", "#0e1422"), fg2: cssVar("--fg-2", "#4b5467"), fg3: cssVar("--fg-3", "#8a93a6"),
    panel: cssVar("--panel", "#ffffff"), line: cssVar("--line-2", "#cbd1da"),
    info: cssVar("--info", "#2f5fd0"), accent: cssVar("--accent", "#e8590c"), warn: cssVar("--warn", "#c98404"),
  }), [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = hover ?? selected ?? null;
  const near = focus ? adj.get(focus) ?? new Set<string>() : null;
  const lc = linkColor ?? ((t: string) => (t === "CALLS" ? pal.info : t === "EXTENDS" ? pal.accent : t === "CO_CHANGED" ? pal.warn : pal.fg3));

  return (
    <div ref={wrap} className="relative w-full overflow-hidden rounded-[10px]" style={{ height }}>
      <ForceGraph2D
        ref={fg}
        graphData={data}
        width={w}
        height={height}
        backgroundColor="rgba(0,0,0,0)"
        nodeId="id"
        cooldownTicks={140}
        warmupTicks={data.nodes.length > 300 ? 40 : 10}
        d3VelocityDecay={0.32}
        onEngineStop={() => {
          if (!fitted.current && fg.current) {
            fitted.current = true;
            fg.current.zoomToFit(500, 50);
          }
        }}
        nodeRelSize={4}
        nodeVal={(n: any) => n.size ?? 2}
        nodeLabel={(n: any) => `${n.label}${n.path && n.path !== n.label ? `\n${n.path}` : ""}`}
        onNodeHover={(n: any) => setHover(n ? n.id : null)}
        onNodeClick={(n: any) => onSelect?.(n)}
        onBackgroundClick={() => onSelect?.(null)}
        linkColor={(l: any) => {
          const s = idOf(l.source), t = idOf(l.target);
          const on = focus && (s === focus || t === focus);
          const base = lc(l.type);
          return focus ? (on ? base : rgba(pal.fg3, 0.12)) : rgba(base, 0.45);
        }}
        linkWidth={(l: any) => (focus && (idOf(l.source) === focus || idOf(l.target) === focus) ? 1.6 : 0.6)}
        linkDirectionalArrowLength={data.nodes.length > 400 ? 0 : 3}
        linkDirectionalArrowRelPos={0.92}
        linkLineDash={(l: any) => (l.type === "CO_CHANGED" ? [2, 3] : null)}
        linkDirectionalParticles={(l: any) => (focus && (idOf(l.source) === focus || idOf(l.target) === focus) ? 2 : 0)}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleColor={(l: any) => lc(l.type)}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
          const r = Math.sqrt(Math.max(0.5, node.size ?? 2)) * 4;
          const dim = focus && node.id !== focus && !near?.has(node.id);
          const color = node.color ?? colorOf(node);
          ctx.globalAlpha = dim ? 0.18 : 1;
          ctx.beginPath();
          if (node.kind === "package") {
            ctx.rect(node.x - r * 0.8, node.y - r * 0.8, r * 1.6, r * 1.6);
          } else if (node.kind === "module") {
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          } else {
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          }
          ctx.fillStyle = node.kind === "package" ? pal.panel : color;
          ctx.fill();
          ctx.strokeStyle = node.kind === "package" ? color : pal.panel;
          ctx.lineWidth = 1.2 / scale;
          ctx.stroke();
          if (node.id === selected) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 3.5 / scale + 1.5, 0, 2 * Math.PI);
            ctx.strokeStyle = pal.fg;
            ctx.lineWidth = 1.5 / scale;
            ctx.stroke();
          }
          const show = showLabels === "always" || node.id === focus || near?.has(node.id) || scale > 2.2 || (scale > 1.1 && (node.size ?? 0) > 6);
          if (show && !dim) {
            const fs = Math.max(10 / scale, 2.4);
            ctx.font = `${node.id === focus ? 600 : 500} ${fs}px "IBM Plex Sans", ui-sans-serif, system-ui`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            const text = node.label.length > 38 ? "…" + node.label.slice(-36) : node.label;
            ctx.fillStyle = rgba(pal.panel, 0.85);
            const tw = ctx.measureText(text).width;
            ctx.fillRect(node.x - tw / 2 - 2 / scale, node.y + r + 2 / scale, tw + 4 / scale, fs + 2 / scale);
            ctx.fillStyle = node.id === focus ? pal.fg : pal.fg2;
            ctx.fillText(text, node.x, node.y + r + 3 / scale);
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          const r = Math.sqrt(Math.max(0.5, node.size ?? 2)) * 4 + 2;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fill();
        }}
      />
    </div>
  );
}
