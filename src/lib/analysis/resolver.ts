import type { Lang } from "./languages";

export type Resolution = { files: string[]; external: string | null };

const NODE_BUILTINS = new Set([
  "fs", "path", "os", "http", "https", "crypto", "url", "util", "events", "stream", "child_process",
  "zlib", "net", "tls", "dns", "buffer", "assert", "readline", "worker_threads", "cluster", "querystring",
  "timers", "vm", "perf_hooks", "process",
]);

const JS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte", ".d.ts"];

function normalize(p: string): string {
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

function join(a: string, b: string): string {
  return normalize(a ? `${a}/${b}` : b);
}

export class Resolver {
  private files: Set<string>;
  private byBase = new Map<string, string[]>();
  private byDir = new Map<string, string[]>();
  private srcRoots: string[];
  private aliases: { prefix: string; targets: string[] }[] = [];

  constructor(paths: string[], tsconfig?: { baseUrl?: string; paths?: Record<string, string[]> } | null) {
    this.files = new Set(paths);
    for (const p of paths) {
      const base = p.split("/").pop()!.toLowerCase();
      const arr = this.byBase.get(base);
      if (arr) arr.push(p); else this.byBase.set(base, [p]);
      const d = dirname(p);
      const da = this.byDir.get(d);
      if (da) da.push(p); else this.byDir.set(d, [p]);
    }
    const roots = new Set<string>([""]);
    for (const cand of ["src", "lib", "app", "source", "pkg", "packages"]) {
      if (paths.some((p) => p.startsWith(cand + "/"))) roots.add(cand);
    }
    this.srcRoots = [...roots];
    const baseUrl = normalize(tsconfig?.baseUrl || "");
    if (tsconfig?.paths) {
      for (const [k, v] of Object.entries(tsconfig.paths)) {
        this.aliases.push({
          prefix: k.replace(/\*$/, ""),
          targets: v.map((t) => join(baseUrl, t.replace(/\*$/, ""))),
        });
      }
    }
    this.aliases.push({ prefix: "@/", targets: ["src/", ""] }, { prefix: "~/", targets: ["src/", ""] });
    if (baseUrl) this.srcRoots.unshift(baseUrl);
  }

  private has(p: string) {
    return this.files.has(p);
  }

  private tryExts(base: string, exts: string[]): string | null {
    if (this.has(base)) return base;
    for (const e of exts) if (this.has(base + e)) return base + e;
    // TS ESM style: './x.js' -> './x.ts'
    const m = base.match(/^(.*)\.(js|jsx|mjs|cjs)$/);
    if (m) for (const e of [".ts", ".tsx", ".mts", ".cts"]) if (this.has(m[1] + e)) return m[1] + e;
    for (const e of exts) if (this.has(`${base}/index${e}`)) return `${base}/index${e}`;
    return null;
  }

  /** find files whose path ends with suffix (segment-aligned) */
  suffix(suffixPath: string, limit = 3): string[] {
    const sp = normalize(suffixPath);
    if (!sp) return [];
    const base = sp.split("/").pop()!.toLowerCase();
    const cands = this.byBase.get(base) || [];
    const lower = sp.toLowerCase();
    return cands.filter((c) => {
      const cl = c.toLowerCase();
      return cl === lower || cl.endsWith("/" + lower);
    }).slice(0, limit);
  }

  private dirSuffix(dirPath: string): string | null {
    const dp = normalize(dirPath).toLowerCase();
    if (!dp) return null;
    let best: string | null = null;
    for (const d of this.byDir.keys()) {
      const dl = d.toLowerCase();
      if (dl === dp || dl.endsWith("/" + dp) || dp.endsWith("/" + dl) && dl.includes("/")) {
        if (!best || d.length > best.length) best = d;
      }
    }
    return best;
  }

  private dirFiles(d: string, filter: (p: string) => boolean, limit = 8): string[] {
    return (this.byDir.get(d) || []).filter(filter).slice(0, limit);
  }

  resolve(from: string, lang: Lang, spec: string, names: string[] = []): Resolution {
    const fromDir = dirname(from);
    const r = (files: string[], external: string | null = null): Resolution => ({ files: [...new Set(files)].filter((f) => f !== from), external });

    switch (lang) {
      case "typescript":
      case "javascript": {
        if (spec.startsWith(".")) {
          const hit = this.tryExts(join(fromDir, spec), JS_EXTS);
          return r(hit ? [hit] : []);
        }
        if (spec.startsWith("/")) {
          const hit = this.tryExts(normalize(spec), JS_EXTS);
          return r(hit ? [hit] : []);
        }
        for (const a of this.aliases) {
          if (spec.startsWith(a.prefix)) {
            const rest = spec.slice(a.prefix.length);
            for (const t of a.targets) {
              const hit = this.tryExts(join(t, rest), JS_EXTS);
              if (hit) return r([hit]);
            }
          }
        }
        for (const root of this.srcRoots) {
          if (!root) continue;
          const hit = this.tryExts(join(root, spec), JS_EXTS);
          if (hit) return r([hit]);
        }
        let pkg = spec.replace(/^node:/, "");
        pkg = pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("/")[0];
        if (NODE_BUILTINS.has(pkg)) pkg = `node:${pkg}`;
        return r([], pkg);
      }
      case "python": {
        const dots = spec.match(/^\.*/)![0].length;
        const mod = spec.slice(dots);
        const tryMod = (baseDir: string, m: string): string | null => {
          const p = join(baseDir, m.replace(/\./g, "/"));
          if (this.has(p + ".py")) return p + ".py";
          if (this.has(p + ".pyi")) return p + ".pyi";
          if (this.has(p + "/__init__.py")) return p + "/__init__.py";
          return null;
        };
        if (dots > 0) {
          let base = fromDir;
          for (let i = 1; i < dots; i++) base = dirname(base);
          const out: string[] = [];
          const hit = mod ? tryMod(base, mod) : null;
          if (hit) out.push(hit);
          for (const n of names) {
            const sub = tryMod(base, mod ? `${mod}.${n}` : n);
            if (sub) out.push(sub);
          }
          if (!out.length && !mod) {
            const init = join(base, "__init__.py");
            if (this.has(init)) out.push(init);
          }
          return r(out);
        }
        const out: string[] = [];
        for (const root of this.srcRoots) {
          const hit = tryMod(root, mod);
          if (hit) { out.push(hit); break; }
        }
        if (!out.length) {
          // package relative to the file's own top-level dir (e.g. project/app/x.py importing app.y)
          const segs = fromDir.split("/");
          for (let i = segs.length; i > 0 && !out.length; i--) {
            const hit = tryMod(segs.slice(0, i).join("/"), mod);
            if (hit) out.push(hit);
          }
        }
        for (const n of names) {
          for (const root of this.srcRoots) {
            const sub = tryMod(root, `${mod}.${n}`);
            if (sub) { out.push(sub); break; }
          }
        }
        if (out.length) return r(out);
        return r([], mod.split(".")[0]);
      }
      case "java":
      case "kotlin":
      case "scala": {
        const clean = spec.replace(/\{.*\}$/, "").replace(/\.$/, "");
        if (clean.endsWith("*")) {
          const d = this.dirSuffix(clean.replace(/\.\*$/, "").replace(/\./g, "/"));
          if (d) return r(this.dirFiles(d, (p) => /\.(java|kt|scala)$/.test(p)));
          return r([], clean.split(".").slice(0, 2).join("."));
        }
        const segs = clean.split(".");
        for (let i = segs.length; i >= 2; i--) {
          const path = segs.slice(0, i).join("/");
          for (const ext of [".java", ".kt", ".scala"]) {
            const hit = this.suffix(path + ext, 1);
            if (hit.length) return r(hit);
          }
        }
        return r([], segs.slice(0, 2).join("."));
      }
      case "csharp": {
        const d = this.dirSuffix(spec.split(".").slice(1).join("/")) || this.dirSuffix(spec.replace(/\./g, "/"));
        if (d) return r(this.dirFiles(d, (p) => p.endsWith(".cs"), 6));
        return r([], spec.split(".").slice(0, 2).join("."));
      }
      case "go": {
        const segs = spec.split("/");
        for (let i = 0; i < segs.length; i++) {
          const tail = segs.slice(i).join("/");
          if (!tail) continue;
          const d = [...this.byDir.keys()].find((k) => k === tail || k.endsWith("/" + tail));
          if (d !== undefined && (i > 0 || this.byDir.has(tail))) {
            return r(this.dirFiles(d, (p) => p.endsWith(".go") && !p.endsWith("_test.go")));
          }
        }
        return r([], spec.includes(".") ? segs.slice(0, 3).join("/") : `std:${segs[0]}`);
      }
      case "rust": {
        if (spec.startsWith("mod:")) {
          const name = spec.slice(4);
          const stem = /(^|\/)(main|lib|mod)\.rs$/.test(from) ? fromDir : join(fromDir, from.split("/").pop()!.replace(/\.rs$/, ""));
          const hit = this.tryExts(join(stem, name), [".rs"]) || (this.has(join(stem, `${name}/mod.rs`)) ? join(stem, `${name}/mod.rs`) : null);
          return r(hit ? [hit] : []);
        }
        const segs = spec.replace(/\{.*$/, "").split("::").filter(Boolean);
        let base: string | null = null;
        if (segs[0] === "crate") {
          const srcIdx = from.lastIndexOf("src/");
          base = srcIdx >= 0 ? from.slice(0, srcIdx + 3) : "src";
          segs.shift();
        } else if (segs[0] === "super" || segs[0] === "self") {
          base = segs[0] === "super" ? dirname(fromDir) : fromDir;
          segs.shift();
        }
        if (base !== null) {
          for (let i = segs.length; i >= 1; i--) {
            const p = join(base, segs.slice(0, i).join("/"));
            if (this.has(p + ".rs")) return r([p + ".rs"]);
            if (this.has(p + "/mod.rs")) return r([p + "/mod.rs"]);
          }
          return r([]);
        }
        return r([], segs[0] || spec);
      }
      case "c":
      case "cpp": {
        const sys = spec.startsWith("<");
        const s = sys ? spec.slice(1) : spec;
        if (!sys) {
          const rel = join(fromDir, s);
          if (this.has(rel)) return r([rel]);
        }
        const hit = this.suffix(s, 1);
        if (hit.length) return r(hit);
        return r([], s.split("/")[0].replace(/\.(h|hpp)$/, ""));
      }
      case "ruby": {
        if (spec.startsWith(".")) {
          const hit = this.tryExts(join(fromDir, spec), [".rb"]);
          return r(hit ? [hit] : []);
        }
        const hit = this.suffix(spec.endsWith(".rb") ? spec : spec + ".rb", 1);
        if (hit.length) return r(hit);
        return r([], spec.split("/")[0]);
      }
      case "php": {
        if (spec.includes("\\")) {
          const segs = spec.split("\\").filter(Boolean);
          for (let i = 0; i < segs.length - 1; i++) {
            const hit = this.suffix(segs.slice(i).join("/") + ".php", 1);
            if (hit.length) return r(hit);
          }
          return r([], segs.slice(0, 2).join("\\"));
        }
        const hit = this.has(join(fromDir, spec)) ? [join(fromDir, spec)] : this.suffix(spec, 1);
        return r(hit);
      }
      case "dart": {
        if (spec.startsWith("dart:")) return r([], spec);
        if (spec.startsWith("package:")) {
          const rest = spec.slice(8).split("/").slice(1).join("/");
          const hit = this.suffix("lib/" + rest, 1);
          if (hit.length) return r(hit);
          return r([], spec.slice(8).split("/")[0]);
        }
        const rel = join(fromDir, spec);
        return r(this.has(rel) ? [rel] : []);
      }
      case "swift":
        return r([], spec.split(".")[0]);
      default:
        return r([]);
    }
  }
}
