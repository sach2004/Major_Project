"use client";
import { createContext, useContext } from "react";

export interface RepoDetail {
  id: string; name: string; url: string; isLocal: boolean; branch: string | null; headSha: string | null; status: string; error: string | null;
  syncEnabled: boolean; lastSyncedAt: string | null; lastAnalyzedAt: string | null; summary: string | null; embeddingModel: string | null;
  stats: { files: number; codeFiles: number; loc: number; commits?: number; entities: Record<string, number>; languages: { language: string; files: number; loc: number }[]; edges: Record<string, number>; skippedFiles: number } | null;
  packages: { name: string; count: number }[];
  running: boolean; latestJob: any; counts: { developers: number; queries: number; impacts: number; docs: number };
}

export const RepoCtx = createContext<{ repo: RepoDetail | null; reload: () => void; ready: boolean }>({ repo: null, reload: () => {}, ready: false });
export const useRepo = () => useContext(RepoCtx);
