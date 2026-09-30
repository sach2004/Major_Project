"use client";
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export function getTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch {}
  window.dispatchEvent(new CustomEvent("themechange", { detail: t }));
}

/** Switch theme with a circular reveal from the click point (View Transitions), or a colour fade as fallback. */
export function setTheme(t: Theme, origin?: { x: number; y: number }) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduce) {
    const html = document.documentElement;
    html.classList.add("theme-fade");
    apply(t);
    setTimeout(() => html.classList.remove("theme-fade"), 400);
    return;
  }
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const vt = doc.startViewTransition(() => apply(t));
  vt.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 700, easing: "cubic-bezier(.65,0,.35,1)", pseudoElement: "::view-transition-new(root)" },
    );
  }).catch(() => {});
}

export function useTheme(): [Theme, (t: Theme, origin?: { x: number; y: number }) => void] {
  const [t, setT] = useState<Theme>("light");
  useEffect(() => {
    setT(getTheme());
    const h = () => setT(getTheme());
    window.addEventListener("themechange", h);
    return () => window.removeEventListener("themechange", h);
  }, []);
  return [t, (v, origin) => setTheme(v, origin)];
}

export function cssVar(name: string, fallback = "#888"): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
