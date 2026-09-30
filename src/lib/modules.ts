const ROOTS = new Set(["src", "lib", "app", "packages", "pkg", "internal", "cmd", "source", "apps", "modules", "services", "components"]);

/** Architectural module for a path: first meaningful directory (1–2 segments deep). */
export function moduleOf(path: string): string {
  const segs = path.split("/");
  if (segs.length === 1) return "(root)";
  if (ROOTS.has(segs[0]) && segs.length > 2) return `${segs[0]}/${segs[1]}`;
  return segs[0];
}
