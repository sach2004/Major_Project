"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data as T;
}

const swr = new Map<string, unknown>();

/** Drop cached responses (e.g. after deleting a repository). */
export function clearFetchCache(prefix = "") {
  for (const k of [...swr.keys()]) if (k.startsWith(prefix)) swr.delete(k);
}

/**
 * Fetch JSON with stale-while-revalidate caching and optional polling.
 * Revisiting a page shows the last response instantly, then refreshes it in the background.
 * `interval` may be a function of the latest data.
 */
export function useFetch<T = any>(url: string | null, opts: { interval?: number | ((d: T | null) => number | 0) } = {}) {
  const [data, setDataState] = useState<T | null>(() => (url && swr.has(url) ? (swr.get(url) as T) : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url && !swr.has(url));
  const dataRef = useRef<T | null>(data);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const setData = useCallback((d: T | null) => {
    dataRef.current = d;
    if (url) { if (d == null) swr.delete(url); else swr.set(url, d); }
    setDataState(d);
  }, [url]);

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const d = await api<T>(url);
      dataRef.current = d;
      swr.set(url, d);
      setDataState(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const cachedValue = swr.has(url) ? (swr.get(url) as T) : null;
    dataRef.current = cachedValue;
    setDataState(cachedValue);
    setLoading(cachedValue == null);
    const tick = async () => {
      await load();
      if (!alive) return;
      const iv = optsRef.current.interval;
      const ms = typeof iv === "function" ? iv(dataRef.current) : iv;
      if (ms && ms > 0) t = setTimeout(tick, ms);
    };
    tick();
    return () => { alive = false; if (t) clearTimeout(t); };
  }, [url, load]);

  return { data, error, loading, reload: load, setData };
}

export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return "never";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 31) return `${days} d ago`;
  const mo = Math.round(days / 30);
  if (mo < 12) return `${mo} mo ago`;
  return `${Math.round(mo / 12)} y ago`;
}

export const fmt = (n: number | null | undefined) => (n == null ? "–" : n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : n.toLocaleString());

const PALETTE = ["#3b6fd9", "#e8590c", "#0f9d6b", "#8b5cf6", "#d4a106", "#0e9bb0", "#d6457a", "#6b8e23", "#c2410c", "#4f7cac", "#9c6b3f", "#2a9d8f"];
export function colorFor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const LANG_COLORS: Record<string, string> = {
  typescript: "#3178c6", javascript: "#d4a106", python: "#3572a5", java: "#b07219", kotlin: "#7f52ff", go: "#00a7c7",
  rust: "#c2410c", c: "#6b7b8c", cpp: "#d6457a", csharp: "#178600", ruby: "#cc342d", php: "#6c78c4", swift: "#f05138",
  scala: "#c22d40", dart: "#0e9bb0", markdown: "#6b7385", json: "#8a8f98", yaml: "#9a8a3a", html: "#e34c26", css: "#663399",
  shell: "#4d9a38", sql: "#c98404", toml: "#9c6b3f", text: "#8a93a6",
};
