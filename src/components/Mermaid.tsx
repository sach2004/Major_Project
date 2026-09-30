"use client";
import { useEffect, useId, useState } from "react";
import { cssVar, useTheme } from "@/lib/client/theme";

export function Mermaid({ code }: { code: string }) {
  const id = "m" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [theme] = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "strict",
          fontFamily: "IBM Plex Sans, system-ui, sans-serif",
          themeVariables: {
            darkMode: theme === "dark",
            background: cssVar("--panel", "#fff"),
            primaryColor: cssVar("--panel-2", "#eef0f3"),
            primaryTextColor: cssVar("--fg", "#0e1422"),
            primaryBorderColor: cssVar("--line-2", "#cbd1da"),
            lineColor: cssVar("--fg-3", "#8a93a6"),
            secondaryColor: cssVar("--panel", "#fff"),
            tertiaryColor: cssVar("--panel", "#fff"),
            clusterBkg: cssVar("--panel-2", "#eef0f3"),
            clusterBorder: cssVar("--line", "#e2e5ea"),
            fontSize: "13px",
          },
        });
        const { svg } = await mermaid.render(`${id}${theme}`, code.trim());
        if (alive) { setSvg(svg); setFailed(false); }
      } catch {
        if (alive) setFailed(true);
        document.getElementById("d" + id + theme)?.remove();
      }
    })();
    return () => { alive = false; };
  }, [code, id, theme]);
  if (failed) return <pre className="inset overflow-auto p-3 text-[12px] text-fg-2">{code}</pre>;
  if (!svg) return <div className="skeleton h-40 w-full" />;
  return <div className="mermaid-wrap inset flex justify-center overflow-auto p-4" dangerouslySetInnerHTML={{ __html: svg }} />;
}
