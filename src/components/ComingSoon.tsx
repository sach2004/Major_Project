"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { PHASE_2_FEATURES, type Phase2Feature } from "@/lib/features";

export function PhaseBadge({ className = "" }: { className?: string }) {
  return <span className={`inline-flex items-center rounded-md border border-line bg-panel-2 px-1.5 py-px text-[10.5px] font-medium text-fg-3 ${className}`}>Phase 2</span>;
}

/** Full-page placeholder shown when a Phase 2 page is opened while the flag is off. */
export function ComingSoon({ feature, backHref }: { feature: Phase2Feature; backHref: string }) {
  const f = PHASE_2_FEATURES[feature];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto flex max-w-lg flex-col items-center py-20 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl border border-line bg-panel text-fg-2"><Sparkles size={20} /></span>
      <span className="mt-5 inline-flex items-center rounded-full border border-line bg-panel px-3 py-1 text-[12px] font-medium text-fg-2">Coming in Phase 2</span>
      <h1 className="mt-4 font-display text-[2rem] font-semibold leading-tight text-fg">{f.title}</h1>
      <p className="mt-2 text-[15px] text-fg-2">{f.description}</p>
      <Link href={backHref} className="btn btn-primary mt-7">Back to Overview</Link>
    </motion.div>
  );
}
