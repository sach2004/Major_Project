"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

type N = { id: string; x: number; y: number; label: string; depth: number | null };

const NODES: N[] = [
  { id: "session", x: 250, y: 190, label: "auth/session.ts", depth: 0 },
  { id: "middleware", x: 120, y: 110, label: "http/middleware.ts", depth: 1 },
  { id: "login", x: 390, y: 105, label: "routes/login.ts", depth: 1 },
  { id: "tokens", x: 395, y: 275, label: "auth/tokens.ts", depth: 1 },
  { id: "router", x: 95, y: 245, label: "http/router.ts", depth: 2 },
  { id: "account", x: 505, y: 185, label: "routes/account.ts", depth: 2 },
  { id: "billing", x: 250, y: 330, label: "billing/checkout.ts", depth: 2 },
  { id: "test", x: 500, y: 330, label: "session.test.ts", depth: 2 },
  { id: "db", x: 250, y: 55, label: "db/client.ts", depth: null },
  { id: "config", x: 60, y: 350, label: "config.ts", depth: null },
  { id: "logger", x: 520, y: 50, label: "lib/logger.ts", depth: null },
];

const EDGES: [string, string][] = [
  ["middleware", "session"], ["login", "session"], ["tokens", "session"],
  ["router", "middleware"], ["account", "login"], ["billing", "tokens"], ["test", "tokens"],
  ["session", "db"], ["login", "logger"], ["router", "config"], ["account", "logger"], ["billing", "config"],
];

const pos = Object.fromEntries(NODES.map((n) => [n.id, n]));

export function HeroGraph() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (reduce) { setPhase(3); return; }
    const seq = [1400, 900, 900, 3800];
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      setPhase((p) => (p + 1) % 4);
      i = (i + 1) % seq.length;
      t = setTimeout(step, seq[i]);
    };
    t = setTimeout(step, seq[0]);
    return () => clearTimeout(t);
  }, [reduce]);

  const lit = (d: number | null) => d !== null && phase > 0 && d < phase;
  const edgeLit = (a: string, b: string) => {
    const da = pos[a].depth, db = pos[b].depth;
    return da !== null && db !== null && lit(da) && lit(db);
  };

  return (
    <div className="card relative overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-line-2" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-2" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-2" />
        <span className="ml-3 font-mono text-[11.5px] text-fg-3">acme/web-platform</span>
        <span className="ml-auto text-[11.5px] text-fg-3">Change impact</span>
      </div>
      <div className="grid-bg relative">
        <svg viewBox="0 0 580 390" className="block h-auto w-full" role="img" aria-label="Knowledge graph highlighting the files affected by changing auth/session.ts">
          {EDGES.map(([a, b], i) => {
            const A = pos[a], B = pos[b];
            const on = edgeLit(a, b);
            return (
              <motion.line
                key={a + b}
                x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ delay: 0.35 + i * 0.05, duration: 0.6 }}
                style={{ stroke: on ? "var(--accent)" : "var(--line-2)", strokeWidth: on ? 1.8 : 1.1, transition: "stroke .35s, stroke-width .35s" }}
              />
            );
          })}
          {NODES.map((n, i) => {
            const on = lit(n.depth);
            const center = n.depth === 0;
            const r = center ? 9 : 6;
            return (
              <motion.g key={n.id} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.04, duration: 0.4 }} style={{ transformOrigin: `${n.x}px ${n.y}px` }}>
                {center && on && !reduce && (
                  <motion.circle cx={n.x} cy={n.y} r={r} fill="none" strokeWidth={1.5} style={{ stroke: "var(--accent)" }}
                    initial={{ r, opacity: 0.8 }} animate={{ r: r + 26, opacity: 0 }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }} />
                )}
                <circle cx={n.x} cy={n.y} r={r}
                  style={{ fill: on && center ? "var(--accent)" : "var(--panel)", stroke: on ? "var(--accent)" : "var(--fg-3)", strokeWidth: on ? 2 : 1.4, transition: "fill .3s, stroke .3s" }} />
                <text x={n.x} y={n.y + r + 15} textAnchor="middle" fontSize="11" style={{ fontFamily: "var(--font-mono)", fill: on ? "var(--fg)" : "var(--fg-3)", transition: "fill .3s" }}>
                  {n.label}
                </text>
              </motion.g>
            );
          })}
        </svg>

        <motion.div
          className="card absolute bottom-4 left-4 w-[220px] p-3.5 text-[12.5px]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 10 }}
          transition={{ duration: 0.35 }}
        >
          <p className="font-mono text-[11.5px] text-fg-3">auth/session.ts</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-[1.75rem] font-semibold leading-none text-accent">64</span>
            <span className="text-fg-2">high risk</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5 text-fg-2">
            <div><p className="num font-semibold text-fg">7</p><p className="text-[11px] text-fg-3">files</p></div>
            <div><p className="num font-semibold text-fg">2</p><p className="text-[11px] text-fg-3">hops</p></div>
            <div><p className="num font-semibold text-fg">1</p><p className="text-[11px] text-fg-3">test</p></div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
