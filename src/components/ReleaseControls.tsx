"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api, clearFetchCache, useFetch } from "@/lib/client/api";
import { PHASE_2_FEATURES, type Phase2Feature } from "@/lib/features";
import type { FeatureLocks } from "@/lib/client/features";
import { Spinner, Toggle } from "./ui";

/**
 * Hidden owner control. Click the Settings heading 5 times quickly to reveal it.
 * Each toggle ON = that feature is locked ("Coming soon"); OFF = usable.
 */
export function useSecretTap(times = 5, windowMs = 2000) {
  const [open, setOpen] = useState(false);
  const taps = useRef<number[]>([]);
  const tap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < windowMs), now];
    if (taps.current.length >= times) { taps.current = []; setOpen((o) => !o); }
  };
  return { open, tap };
}

export function ReleaseControls({ open }: { open: boolean }) {
  const q = useFetch<{ locks: FeatureLocks }>(open ? "/api/features" : null);
  const [busy, setBusy] = useState<string | null>(null);

  async function send(payload: { feature?: Phase2Feature; all?: boolean; locked: boolean }, tag: string) {
    setBusy(tag);
    try {
      const r = await api<{ locks: FeatureLocks }>("/api/features", { method: "POST", json: payload });
      clearFetchCache("/api/features");
      q.setData(r);
    } finally { setBusy(null); }
  }

  const locks = q.data?.locks;
  return (
    <AnimatePresence>
      {open && (
        <motion.section initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
          <div className="card mb-5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold text-fg">Lock features</p>
                <p className="text-[12.5px] text-fg-3">On: shown as Coming Soon. Off: usable. Refresh pages after changing.</p>
              </div>
              <div className="flex gap-1.5">
                <button className="btn btn-sm" disabled={!!busy} onClick={() => send({ all: true, locked: true }, "all")}>Lock all</button>
                <button className="btn btn-sm" disabled={!!busy} onClick={() => send({ all: true, locked: false }, "all")}>Unlock all</button>
              </div>
            </div>
            {locks ? (
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {(Object.keys(PHASE_2_FEATURES) as Phase2Feature[]).map((f) => (
                  <li key={f} className="flex items-center justify-between py-2.5">
                    <span className="text-[13.5px] text-fg">{PHASE_2_FEATURES[f].title}</span>
                    <span className="flex items-center gap-2">
                      {(busy === f || busy === "all") && <Spinner size={12} />}
                      <Toggle checked={locks[f]} onChange={(v) => !busy && send({ feature: f, locked: v }, f)} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : <div className="mt-3 flex items-center gap-2 text-[13px] text-fg-2"><Spinner size={13} /> Loading</div>}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
