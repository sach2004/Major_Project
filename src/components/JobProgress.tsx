"use client";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

export const STAGES = [
  { id: "fetch", label: "Fetch" },
  { id: "analyze", label: "Parse" },
  { id: "history", label: "History" },
  { id: "store", label: "Graph" },
  { id: "embed", label: "Embed" },
  { id: "summary", label: "Summarize" },
];

export interface Job { id: string; type: string; trigger: string; status: string; stage: string | null; progress: number; message: string | null; error: string | null; createdAt: string; startedAt?: string | null; completedAt?: string | null }

export function JobProgress({ job, compact = false }: { job: Job; compact?: boolean }) {
  const idx = Math.max(0, STAGES.findIndex((s) => s.id === job.stage));
  const done = job.status === "completed" || job.stage === "done";
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {STAGES.map((s, i) => {
          const state = done || i < idx ? "done" : i === idx ? "active" : "todo";
          return (
            <div key={s.id} className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="relative h-1.5 overflow-hidden rounded-full bg-panel-2 ring-1 ring-line">
                {state === "done" && <div className="absolute inset-0 bg-ok" />}
                {state === "active" && <motion.div className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-accent" animate={{ x: ["-100%", "220%"] }} transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }} />}
              </div>
              {!compact && (
                <span className={`flex items-center gap-1 truncate text-[12px] font-medium ${state === "active" ? "text-accent" : state === "done" ? "text-fg" : "text-fg-3"}`}>
                  {state === "done" && <Check size={11} strokeWidth={3} />}
                  {s.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className={`flex items-center justify-between gap-3 ${compact ? "mt-2" : "mt-3"}`}>
        <p className="truncate text-[13px] text-fg-2">{job.message || "Working"}</p>
        <span className="num text-[13px] font-medium text-fg">{job.progress}%</span>
      </div>
    </div>
  );
}
