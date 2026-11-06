/**
 * Release switch (default only).
 *
 * Phase 1 (always on): Repository Overview, Architecture Explorer / Knowledge Graph, File Dependency View.
 * Phase 2 (behind this flag): Ask the Code, Change Impact, Git History, AI Explanations,
 * Documentation, Architecture Health and the Phase 2 controls inside Phase 1 pages.
 *
 * The live value is stored in the database and toggled from a hidden control on the
 * Settings page. This is only the default used before it has ever been toggled.
 */
export const PHASE_2_LOCKED_DEFAULT = true;
export const PHASE_2_SETTING_KEY = "phase2Locked";

export type Phase2Feature = "chat" | "impact" | "history" | "docs" | "insights" | "explain";

export const PHASE_2_FEATURES: Record<Phase2Feature, { title: string; description: string }> = {
  chat: { title: "Ask the Code", description: "Ask questions about the repository and get answers that cite the exact files and lines." },
  impact: { title: "Change Impact Analysis", description: "See which files, functions and tests a change will affect, with a risk score." },
  history: { title: "Git History Analytics", description: "Commit activity, contributors, churn and files that usually change together." },
  docs: { title: "Generated Documentation", description: "Architecture overview, dependency guide and per-module documentation." },
  insights: { title: "Architecture Health", description: "Circular dependencies, oversized files, hotspots and unused code." },
  explain: { title: "AI Explanations", description: "Plain-language explanations of any file or function." },
};
