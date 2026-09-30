"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, FileCode2, Network, RotateCcw, Sparkles, Trash2, Zap } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { Badge, Spinner } from "@/components/ui";
import { api, clearFetchCache, useFetch } from "@/lib/client/api";

interface Source { path: string; startLine: number; endLine: number; entity: string | null; key: string; reasons: string[] }
interface Msg { id: string; q: string; a: string; sources: Source[]; facts?: string[]; mode?: string; streaming?: boolean; provider?: string | null; cached?: boolean }

const SUGGESTIONS = [
  "Give me a tour of the architecture: main layers and how they interact",
  "Where is the entry point and what happens at startup?",
  "Which modules are most tightly coupled, and why might that matter?",
  "What would break if I changed the most-imported file?",
];

export default function Chat() {
  const { id } = useParams<{ id: string }>();
  useState(() => clearFetchCache(`/api/repos/${id}/chat`));
  const hist = useFetch<any[]>(`/api/repos/${id}/chat`);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (hist.data && !loaded.current) {
      loaded.current = true;
      setMsgs(hist.data.map((h) => ({ id: h.id, q: h.question, a: h.answer ?? "", sources: h.sources ?? [], provider: h.provider })));
    }
  }, [hist.data]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  async function ask(question: string, fresh = false) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const mid = "tmp-" + Date.now();
    setMsgs((m) => [...m, { id: mid, q, a: "", sources: [], streaming: true }]);
    const patch = (p: Partial<Msg>) => setMsgs((m) => m.map((x) => (x.id === mid ? { ...x, ...p } : x)));
    try {
      const res = await fetch(`/api/repos/${id}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, fresh }) });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
        throw new Error(e.error);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let gotMeta = false;
      let answer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        if (!gotMeta) {
          const nl = buf.indexOf("\n");
          if (nl === -1) continue;
          const meta = JSON.parse(buf.slice(0, nl));
          patch({ sources: meta.sources, facts: meta.facts, mode: meta.mode, cached: !!meta.cached });
          buf = buf.slice(nl + 1);
          gotMeta = true;
        }
        if (gotMeta && buf) { answer += buf; buf = ""; patch({ a: answer }); }
      }
      patch({ streaming: false });
    } catch (e) {
      patch({ a: `**Error:** ${e instanceof Error ? e.message : String(e)}`, streaming: false });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    await api(`/api/repos/${id}/chat`, { method: "DELETE" });
    setMsgs([]);
  }

  const empty = msgs.length === 0;
  return (
    <div className="mx-auto flex h-[calc(100vh-120px)] min-h-[520px] max-w-[860px] flex-col">
      <div className="flex-1 overflow-y-auto pr-1">
        {empty ? (
          <div className="pt-10">
            <h1 className="font-display font-semibold text-[2.2rem] leading-tight text-fg">Ask the code anything.</h1>
            <p className="mt-2 max-w-xl text-fg-2">Answers combine graph traversal with semantic search over the code, so they cite the files they come from.</p>
            <div className="mt-8 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s, i) => (
                <motion.button key={s} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }} onClick={() => ask(s)} className="card p-4 text-left text-[14px] text-fg-2 transition-colors hover:border-accent/40 hover:text-fg">{s}</motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-9 pb-6 pt-2">
            {msgs.map((m) => (
              <div key={m.id}>
                <div className="flex justify-end"><div className="max-w-[80%] rounded-2xl rounded-br-md bg-fg px-4 py-2.5 text-[14.5px] text-bg">{m.q}</div></div>
                <div className="mt-4">
                  {m.streaming && !m.a ? (
                    <div className="flex items-center gap-2 text-[13.5px] text-fg-2"><Spinner size={14} /> Tracing the graph and reading code</div>
                  ) : (
                    <div className={m.streaming ? "caret" : ""}><Markdown>{m.a}</Markdown></div>
                  )}
                  {m.cached && !m.streaming && (
                    <div className="mt-3 flex items-center gap-2 text-[12.5px] text-fg-3">
                      <Badge tone="info"><Zap size={11} /> Instant answer from cache</Badge>
                      <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => ask(m.q, true)} disabled={busy}><RotateCcw size={12} /> Regenerate</button>
                    </div>
                  )}
                  {m.sources.length > 0 && !(m.streaming && !m.a) && (
                    <div className="mt-4">
                      <div className="mb-2 flex items-center gap-2 text-[12.5px] text-fg-3">
                        <FileCode2 size={13} /> Sources {m.mode && m.mode !== "cached" && <Badge tone={m.mode === "hybrid" ? "ok" : "default"}>{m.mode === "hybrid" ? "graph + semantic" : "graph + keyword"}</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {m.sources.slice(0, 8).map((s, i) => (
                          <Link key={i} href={`/repos/${id}/explorer?key=${encodeURIComponent(s.key)}`} className="chip max-w-full hover:border-accent/50 hover:text-fg" title={s.reasons.join(", ")}>
                            <span className="truncate">{s.path.split("/").slice(-2).join("/")}</span><span className="num text-fg-3">:{s.startLine}</span>
                          </Link>
                        ))}
                      </div>
                      {m.facts && m.facts.length > 0 && (
                        <details className="mt-3 text-[12.5px] text-fg-2">
                          <summary className="flex w-fit cursor-pointer items-center gap-1.5 hover:text-fg"><Network size={12} /> Graph facts used ({m.facts.length})</summary>
                          <ul className="mt-2 space-y-1 border-l border-line pl-3">{m.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottom} />
          </div>
        )}
      </div>

      <div className="pt-3">
        <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="card flex items-end gap-2 p-2 pl-4 focus-within:border-accent/60">
          <textarea
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[14.5px] text-fg outline-none placeholder:text-fg-3"
            rows={1}
            placeholder="How does authentication work? Which classes implement the Repository interface?"
            value={input}
            onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(160, e.target.scrollHeight) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
          />
          <button className="btn btn-primary h-10 w-10 shrink-0 p-0" disabled={busy || !input.trim()} aria-label="Send">{busy ? <Spinner size={15} /> : <ArrowUp size={17} />}</button>
        </form>
        <div className="mt-2 flex items-center justify-between px-1 text-[12px] text-fg-3">
          <span className="inline-flex items-center gap-1"><Sparkles size={11} /> Answers are grounded in retrieved code; verify anything critical.</span>
          {!empty && <button onClick={clear} className="inline-flex items-center gap-1 hover:text-fg"><Trash2 size={11} /> Clear conversation</button>}
        </div>
      </div>
    </div>
  );
}
