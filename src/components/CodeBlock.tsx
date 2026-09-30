"use client";
import { Highlight, type PrismTheme } from "prism-react-renderer";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

export const archTheme: PrismTheme = {
  plain: { color: "var(--code-fg)", backgroundColor: "transparent" },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "var(--code-comment)", fontStyle: "italic" } },
    { types: ["keyword", "builtin", "important", "atrule"], style: { color: "var(--code-kw)" } },
    { types: ["string", "char", "attr-value", "regex", "inserted"], style: { color: "var(--code-str)" } },
    { types: ["function", "class-name", "maybe-class-name"], style: { color: "var(--code-fn)" } },
    { types: ["number", "boolean", "constant", "symbol"], style: { color: "var(--code-num)" } },
    { types: ["tag", "selector", "property", "attr-name"], style: { color: "var(--code-tag)" } },
    { types: ["operator", "punctuation"], style: { color: "var(--code-punct)" } },
    { types: ["deleted"], style: { color: "var(--bad)" } },
  ],
};

const SUPPORTED = new Set(["markup", "jsx", "tsx", "swift", "kotlin", "objectivec", "rust", "graphql", "yaml", "go", "cpp", "markdown", "python", "json", "javascript", "typescript", "clike", "c"]);
export function prismLang(lang?: string | null): string {
  const l = (lang || "").toLowerCase();
  const map: Record<string, string> = {
    ts: "tsx", typescript: "tsx", js: "jsx", javascript: "jsx", py: "python", java: "kotlin", scala: "kotlin", dart: "kotlin",
    csharp: "kotlin", cs: "kotlin", kotlin: "kotlin", c: "cpp", h: "cpp", cpp: "cpp", "c++": "cpp", rb: "python", ruby: "python",
    php: "clike", sh: "clike", bash: "clike", shell: "clike", zsh: "clike", yml: "yaml", html: "markup", xml: "markup", sql: "clike",
    diff: "clike", toml: "yaml", css: "clike", scss: "clike",
  };
  const m = map[l] ?? l;
  return SUPPORTED.has(m) ? m : "clike";
}

export function CodeBlock({ code, language, startLine = 1, showLines = true, highlightLines, maxHeight, title }: { code: string; language?: string | null; startLine?: number; showLines?: boolean; highlightLines?: Set<number>; maxHeight?: number; title?: string }) {
  const [copied, setCopied] = useState(false);
  const text = code.replace(/\n$/, "");
  return (
    <div className="group relative overflow-hidden rounded-xl border border-line" style={{ background: "var(--code-bg)" }}>
      {title && <div className="flex items-center justify-between border-b border-line px-3.5 py-2"><span className="path truncate">{title}</span></div>}
      <button
        className="absolute right-2 top-2 z-[2] rounded-md border border-line bg-panel p-1.5 text-fg-3 opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
        onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
        aria-label="Copy code"
        style={title ? { top: 42 } : undefined}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <div className="overflow-auto" style={{ maxHeight }}>
        <Highlight theme={archTheme} code={text} language={prismLang(language)}>
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre className={`${className} min-w-max py-3 text-[12.5px] leading-[1.65]`} style={{ ...style, fontFamily: "var(--font-mono)" }}>
              {tokens.map((line, i) => {
                const n = startLine + i;
                const lp = getLineProps({ line });
                return (
                  <div key={i} {...lp} className={`${lp.className} flex pr-4`} style={{ ...lp.style, background: highlightLines?.has(n) ? "var(--code-hl)" : undefined }}>
                    {showLines && <span className="num w-12 shrink-0 select-none pr-3 text-right" style={{ color: "var(--code-comment)", opacity: 0.7 }}>{n}</span>}
                    <span className={showLines ? "" : "pl-4"}>
                      {line.map((token, k) => <span key={k} {...getTokenProps({ token })} />)}
                    </span>
                  </div>
                );
              })}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}
