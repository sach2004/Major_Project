export type Lang =
  | "typescript" | "javascript" | "python" | "java" | "kotlin" | "go" | "rust"
  | "c" | "cpp" | "csharp" | "ruby" | "php" | "swift" | "scala" | "dart"
  | "markdown" | "json" | "yaml" | "toml" | "html" | "css" | "sql" | "shell" | "text";

const EXT: Record<string, Lang> = {
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", vue: "javascript", svelte: "javascript",
  py: "python", pyi: "python",
  java: "java", kt: "kotlin", kts: "kotlin", scala: "scala",
  go: "go", rs: "rust",
  c: "c", h: "c", cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", hxx: "cpp",
  cs: "csharp", rb: "ruby", php: "php", swift: "swift", dart: "dart",
  md: "markdown", mdx: "markdown", rst: "markdown",
  json: "json", yml: "yaml", yaml: "yaml", toml: "toml",
  html: "html", htm: "html", css: "css", scss: "css", sass: "css", less: "css",
  sql: "sql", sh: "shell", bash: "shell", zsh: "shell",
  txt: "text",
};

export const CODE_LANGS = new Set<Lang>([
  "typescript", "javascript", "python", "java", "kotlin", "go", "rust", "c", "cpp",
  "csharp", "ruby", "php", "swift", "scala", "dart",
]);

export const BRACE_LANGS = new Set<Lang>([
  "typescript", "javascript", "java", "kotlin", "go", "rust", "c", "cpp", "csharp",
  "php", "swift", "scala", "dart",
]);

const SPECIAL_FILES: Record<string, Lang> = {
  dockerfile: "shell", makefile: "shell", readme: "markdown", license: "text",
};

export const IGNORE_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", ".next", ".nuxt", "coverage", "vendor",
  "__pycache__", ".venv", "venv", "env", ".tox", ".mypy_cache", ".pytest_cache", "target",
  "bin", "obj", ".idea", ".vscode", ".gradle", "Pods", ".turbo", ".cache", "tmp", ".svelte-kit",
  "site-packages", "bower_components", ".terraform", "third_party", "external",
]);

const IGNORE_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Cargo.lock", "go.sum",
  "composer.lock", "Gemfile.lock", "bun.lockb",
]);

export function detectLanguage(path: string): Lang | null {
  const base = path.split("/").pop() || path;
  if (IGNORE_FILES.has(base)) return null;
  if (/\.min\.(js|css)$/.test(base) || /\.(map|snap)$/.test(base)) return null;
  const lower = base.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return SPECIAL_FILES[lower] ?? null;
  const ext = lower.slice(dot + 1);
  if (EXT[ext]) return EXT[ext];
  const stem = lower.slice(0, dot);
  return SPECIAL_FILES[stem] ?? null;
}

export function isTestPath(path: string): boolean {
  return /(^|\/)(__tests__|tests?|spec|specs)\//i.test(path) ||
    /[._-](test|spec)\.[a-z0-9]+$/i.test(path) ||
    /(^|\/)test_[^/]+\.py$/i.test(path) ||
    /_test\.(go|py)$/i.test(path) ||
    /Tests?\.(java|kt|cs|swift)$/.test(path);
}

export const LANG_COLORS: Record<string, string> = {
  typescript: "#5B9BD5", javascript: "#E8C547", python: "#5FA8A0", java: "#D9824B",
  kotlin: "#A77BE0", go: "#56C2D6", rust: "#D98F6B", c: "#8C9BAB", cpp: "#C16C8A",
  csharp: "#7FB069", ruby: "#D65A5A", php: "#8993BE", swift: "#F08A4B", scala: "#C64B4B",
  dart: "#4FB3D9", markdown: "#9AA3AD", json: "#B8A265", yaml: "#B87E65", toml: "#9E7E5A",
  html: "#E0734F", css: "#6A8FD8", sql: "#D4A55A", shell: "#7CB86E", text: "#8A8F96",
};
