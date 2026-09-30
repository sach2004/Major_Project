"use client";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpenText, ChevronDown, ChevronRight, GitBranch, History, LayoutDashboard, MessageSquareText, Network, Radar, RefreshCw, ScanSearch, Settings, Trash2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { JobProgress } from "@/components/JobProgress";
import { RepoCtx, type RepoDetail } from "@/components/RepoContext";
import { Badge, Spinner, Toggle } from "@/components/ui";
import { api, clearFetchCache, timeAgo, useFetch } from "@/lib/client/api";

const NAV = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/explorer", label: "Architecture", icon: Network },
  { href: "/chat", label: "Ask the code", icon: MessageSquareText },
  { href: "/impact", label: "Change impact", icon: Radar },
  { href: "/history", label: "History", icon: History },
  { href: "/docs", label: "Documentation", icon: BookOpenText },
  { href: "/insights", label: "Health", icon: ScanSearch },
];

export default function RepoLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const q = useFetch<RepoDetail>(`/api/repos/${id}`, { interval: (d) => (d?.running || d?.status === "analyzing" ? 1500 : 20000) });
  const repo = q.data;
  const base = `/repos/${id}`;
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const wasRunning = useRef(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!repo) return;
    if (wasRunning.current && !repo.running) setVersion((v) => v + 1);
    wasRunning.current = repo.running;
  }, [repo?.running]); // eslint-disable-line react-hooks/exhaustive-deps

  async function trigger(mode: "sync" | "analyze") {
    setBusy(true); setMenu(false);
    try { await api(`/api/repos/${id}/sync`, { method: "POST", json: { mode } }); await q.reload(); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm(`Remove ${repo?.name} and all of its analysis?`)) return;
    await api(`/api/repos/${id}`, { method: "DELETE" });
    clearFetchCache("/api/repos");
    router.push("/");
  }
  async function toggleSync(v: boolean) {
    await api(`/api/repos/${id}`, { method: "PATCH", json: { syncEnabled: v } });
    q.reload();
  }

  if (q.error && !repo) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <p className="font-display text-3xl font-semibold">Repository not found</p>
          <p className="mt-2 text-fg-2">{q.error}</p>
          <Link href="/" className="btn mt-6">Back to repositories</Link>
        </div>
      </div>
    );
  }

  const ready = !!repo?.lastAnalyzedAt;
  const current = NAV.find((n) => (n.href ? pathname.startsWith(base + n.href) : pathname === base)) ?? NAV[0];
  const fullBleed = current.href === "/explorer";

  return (
    <RepoCtx.Provider value={{ repo: repo ?? null, reload: q.reload, ready }}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-panel md:flex">
          <div className="flex h-14 items-center border-b border-line px-4"><Logo small /></div>
          <div className="px-3 pt-4">
            <div className="rounded-xl border border-line bg-panel-2 px-3 py-2.5">
              <p className="truncate text-[14px] font-semibold text-fg" title={repo?.name}>{repo?.name ?? "Loading"}</p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[11.5px] text-fg-3">
                <GitBranch size={11} /> {repo?.branch ?? "default"}{repo?.headSha ? ` ${repo.headSha.slice(0, 7)}` : ""}
              </p>
            </div>
          </div>
          <nav className="mt-4 flex flex-col gap-0.5 px-3">
            {NAV.map((n) => {
              const active = n === current;
              const Icon = n.icon;
              return (
                <Link key={n.label} href={base + n.href} className={`relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] transition-colors ${active ? "font-medium text-fg" : "text-fg-2 hover:bg-panel-2 hover:text-fg"}`}>
                  {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-panel-2" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  {active && <motion.span layoutId="nav-bar" className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent" />}
                  <Icon size={16} className="relative" />
                  <span className="relative">{n.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-3 border-t border-line p-4">
            {repo && <Toggle checked={repo.syncEnabled} onChange={toggleSync} label={<span className="text-[13px]">Auto-sync</span>} />}
            <p className="text-[12px] text-fg-3">Last synced {timeAgo(repo?.lastSyncedAt ?? repo?.lastAnalyzedAt)}</p>
            <Link href="/settings#updates" className="block text-[12px] text-fg-2 hover:text-fg">Change update schedule</Link>
            <div className="flex items-center gap-1">
              <Link href="/settings" className="btn btn-ghost btn-sm -ml-2"><Settings size={14} /> Settings</Link>
              <ThemeToggle className="ml-auto" />
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-6 backdrop-blur-md">
            <div className="md:hidden"><Logo small /></div>
            <nav className="hidden min-w-0 items-center gap-1.5 text-[13.5px] md:flex">
              <Link href="/" className="text-fg-3 hover:text-fg">Repositories</Link>
              <ChevronRight size={13} className="text-fg-3" />
              <span className="truncate text-fg-2">{repo?.name}</span>
              <ChevronRight size={13} className="text-fg-3" />
              <span className="font-medium text-fg">{current.label}</span>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              {repo?.running ? <Badge tone="accent"><Spinner size={11} /> {repo.latestJob?.type === "sync" ? "Syncing" : "Analyzing"}</Badge>
                : repo?.status === "error" ? <Badge tone="bad">Last run failed</Badge>
                : repo ? <Badge tone="ok">Up to date</Badge> : null}
              <div className="relative">
                <div className="flex">
                  <button className="btn btn-sm rounded-r-none" onClick={() => trigger("sync")} disabled={busy || repo?.running}><RefreshCw size={13} className={repo?.running ? "animate-spin" : ""} /> Update now</button>
                  <button className="btn btn-sm rounded-l-none border-l-0 px-2" onClick={() => setMenu((m) => !m)} aria-label="More actions"><ChevronDown size={14} /></button>
                </div>
                <AnimatePresence>
                  {menu && (
                    <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
                      className="card absolute right-0 top-10 z-30 w-60 p-1.5" onMouseLeave={() => setMenu(false)}>
                      <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13.5px] text-fg hover:bg-panel-2" onClick={() => trigger("analyze")} disabled={repo?.running}><RefreshCw size={14} /> Re-analyze from scratch</button>
                      <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13.5px] text-bad hover:bg-bad/10" onClick={remove}><Trash2 size={14} /> Remove repository</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto border-b border-line px-4 py-2 md:hidden">
            {NAV.map((n) => <Link key={n.label} href={base + n.href} className={`chip shrink-0 ${n === current ? "border-fg text-fg" : ""}`}>{n.label}</Link>)}
          </div>

          {repo?.running && repo.latestJob && ready && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="border-b border-line bg-panel px-6 py-3">
              <JobProgress job={repo.latestJob} compact />
            </motion.div>
          )}

          <main className={fullBleed && ready ? "min-h-0 flex-1" : "flex-1 px-6 py-8 lg:px-10"}>
            {!repo ? (
              <div className="flex items-center gap-2 text-fg-2"><Spinner /> Loading repository</div>
            ) : !ready ? (
              <FirstRun repo={repo} onRetry={() => trigger("analyze")} />
            ) : (
              <div key={version} className={fullBleed ? "h-full" : ""}>{children}</div>
            )}
          </main>
        </div>
      </div>
    </RepoCtx.Provider>
  );
}

function FirstRun({ repo, onRetry }: { repo: RepoDetail; onRetry: () => void }) {
  if (repo.status === "error" && !repo.running) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="font-display text-3xl font-semibold text-fg">Analysis failed</p>
        <p className="mx-auto mt-3 max-w-md text-[14px] text-bad">{repo.error}</p>
        <button className="btn btn-primary mt-6" onClick={onRetry}><RefreshCw size={14} /> Try again</button>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl py-14">
      <h1 className="font-display text-[2.2rem] font-semibold leading-tight text-fg">Analyzing {repo.name}</h1>
      <p className="mt-2 text-[15px] text-fg-2">Cloning, parsing every file, reading the Git history and building the knowledge graph. Small repositories take under a minute, and you can leave this page and come back.</p>
      {repo.latestJob && <div className="card mt-8 p-5"><JobProgress job={repo.latestJob} /></div>}
    </div>
  );
}
