"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { GitBranch, Github } from "lucide-react";
import { api } from "@/lib/client/api";
import { ErrorNote, Spinner } from "./ui";

const EXAMPLES = ["pallets/flask", "expressjs/express", "gin-gonic/gin", "spring-projects/spring-petclinic"];

export function AddRepo({ onAdded, size = "lg" }: { onAdded?: () => void; size?: "lg" | "md" }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [showBranch, setShowBranch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(value = url) {
    if (!value.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ id: string }>("/api/repos", { method: "POST", json: { url: value.trim(), branch: branch.trim() || undefined } });
      onAdded?.();
      router.push(`/repos/${r.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const lg = size === "lg";
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className={`card flex items-center gap-2 p-1.5 ${lg ? "pl-4" : "pl-3"} focus-within:border-info`}>
        <Github size={lg ? 18 : 16} className="shrink-0 text-fg-3" />
        <input
          className={`min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-3 ${lg ? "h-11 text-[15px]" : "h-9 text-sm"}`}
          placeholder="owner/repo, a Git URL, or /path/to/folder"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
          aria-label="Repository"
        />
        <button className={`btn btn-primary ${lg ? "h-11 px-5" : ""}`} disabled={busy || !url.trim()}>
          {busy && <Spinner size={15} />}
          {busy ? "Starting" : "Analyze"}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px] text-fg-3">
        <span className="mr-1">Try</span>
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="chip font-mono text-[12px]" onClick={() => { setUrl(ex); submit(ex); }} disabled={busy}>{ex}</button>
        ))}
        <button type="button" className="ml-auto inline-flex items-center gap-1 text-fg-2 hover:text-fg" onClick={() => setShowBranch((s) => !s)}>
          <GitBranch size={13} /> {showBranch ? "Use default branch" : "Choose branch"}
        </button>
      </div>
      <AnimatePresence>
        {showBranch && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <input className="input mt-3 max-w-xs font-mono text-[13px]" placeholder="main" value={branch} onChange={(e) => setBranch(e.target.value)} />
          </motion.div>
        )}
      </AnimatePresence>
      {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
    </div>
  );
}
