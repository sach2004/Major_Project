"use client";
import { useFetch } from "./api";
import { PHASE_2_FEATURES, type Phase2Feature } from "@/lib/features";

export type FeatureLocks = Record<Phase2Feature, boolean>;

const ALL_LOCKED = Object.fromEntries(Object.keys(PHASE_2_FEATURES).map((k) => [k, true])) as FeatureLocks;

/** Lock state of every Phase 2 feature (true = locked). Everything counts as locked until loaded. */
export function useFeatureLocks(): FeatureLocks {
  const q = useFetch<{ locks: FeatureLocks }>("/api/features");
  return q.data?.locks ? { ...ALL_LOCKED, ...q.data.locks } : ALL_LOCKED;
}

/** True when this one Phase 2 feature is unlocked. */
export function useFeature(f: Phase2Feature): boolean {
  return !useFeatureLocks()[f];
}

/** True only when every Phase 2 feature is unlocked (used for homepage marketing copy). */
export function usePhase2(): boolean {
  return Object.values(useFeatureLocks()).every((l) => !l);
}
