"use client";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}

type Tone = "default" | "accent" | "info" | "ok" | "warn" | "bad";
const TONES: Record<Tone, string> = {
  default: "border-line text-fg-2 bg-panel-2",
  accent: "border-accent/30 text-accent bg-accent/10",
  info: "border-info/30 text-info bg-info/10",
  ok: "border-ok/30 text-ok bg-ok/10",
  warn: "border-warn/30 text-warn bg-warn/10",
  bad: "border-bad/30 text-bad bg-bad/10",
};

export function Badge({ tone = "default", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-[11.5px] font-medium ${TONES[tone]} ${className}`}>{children}</span>;
}

export function Dot({ tone = "default" }: { tone?: Tone }) {
  const c: Record<Tone, string> = { default: "bg-fg-3", accent: "bg-accent", info: "bg-info", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" };
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${c[tone]}`} />;
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel-2 text-fg-3">{icon}</div>}
      <p className="font-display text-xl font-semibold text-fg">{title}</p>
      {children && <div className="mt-1.5 max-w-md text-sm text-fg-2">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[1.9rem] font-semibold leading-tight text-fg">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-[14.5px] text-fg-2">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, id }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; id?: string }) {
  const lid = `seg-${id ?? options.map((x) => x.value).join("")}`;
  return (
    <div className="inline-flex rounded-[10px] border border-line bg-panel-2 p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={`relative h-7 rounded-lg px-3 text-[13px] font-medium transition-colors ${value === o.value ? "text-fg" : "text-fg-3 hover:text-fg"}`}>
          {value === o.value && <motion.span layoutId={lid} className="absolute inset-0 rounded-lg bg-panel shadow-sm ring-1 ring-line" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2.5 text-sm text-fg-2">
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-ok" : "bg-line-2"}`}>
        <motion.span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow" animate={{ left: checked ? 18 : 2 }} transition={{ type: "spring", stiffness: 600, damping: 35 }} />
      </span>
      {label}
    </button>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{children}</div>;
}

export function Meter({ value, max, color = "var(--info)", className = "" }: { value: number; max: number; color?: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-panel-2 ${className}`}>
      <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }} />
    </div>
  );
}

export function Stat({ value, label, className = "" }: { value: ReactNode; label: string; className?: string }) {
  return (
    <div className={className}>
      <p className="font-display text-[1.65rem] font-semibold leading-none text-fg num">{value}</p>
      <p className="mt-1.5 text-[12.5px] text-fg-3">{label}</p>
    </div>
  );
}
