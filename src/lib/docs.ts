import { prisma } from "./db";
import { loadGraph, type GNode } from "./graph";
import { getInsights } from "./insights";
import { moduleOf } from "./modules";
import { complete, hasLLM } from "./llm";
import { CODE_LANGS, type Lang } from "./analysis/languages";

export interface DocPlanItem { slug: string; title: string; kind: string }

const SYSTEM = "You are a staff engineer writing internal developer documentation. Be concrete and factual: only describe components, files and relationships present in the provided context. Use GitHub-flavoured markdown with short sections, tables where useful, and inline code for identifiers and paths. Do not wrap the whole answer in a code fence.";

export async function docPlan(repoId: string): Promise<DocPlanItem[]> {
  const g = await loadGraph(repoId);
  const mods = new Map<string, number>();
  for (const f of g.files) if (CODE_LANGS.has(f.language as Lang)) mods.set(moduleOf(f.path!), (mods.get(moduleOf(f.path!)) || 0) + (f.loc || 0));
  const top = [...mods.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([m]) => m);
  return [
    { slug: "overview", title: "Architecture Overview", kind: "overview" },
    { slug: "dependencies", title: "Dependency Guide", kind: "dependencies" },
    { slug: "health", title: "Architecture Health Report", kind: "insights" },
    ...top.map((m) => ({ slug: `module:${m}`, title: `Module · ${m}`, kind: "module" })),
  ];
}

function entLine(n: GNode) {
  return `- \`${n.qualifiedName ?? n.name}\` (${n.type}, ${n.path}:${n.startLine}, fan-in ${n.fanIn})`;
}

async function readSnippet(repoId: string, key: string, maxLines = 40): Promise<string> {
  const e = await prisma.codeEntity.findFirst({ where: { repoId, key }, select: { chunks: { select: { content: true }, take: 1 } } });
  const c = e?.chunks[0]?.content ?? "";
  return c.split("\n").slice(0, maxLines).join("\n");
}

export async function generateDoc(repoId: string, slug: string): Promise<{ slug: string; title: string; content: string; provider: string | null }> {
  const repo = await prisma.repository.findUniqueOrThrow({ where: { id: repoId } });
  const g = await loadGraph(repoId);
  const plan = await docPlan(repoId);
  const item = plan.find((p) => p.slug === slug) ?? (slug.startsWith("module:") ? { slug, title: `Module · ${slug.slice(7)}`, kind: "module" } : null);
  if (!item) throw new Error(`Unknown document: ${slug}`);
  const llm = await hasLLM();
  const stats = repo.stats ? JSON.parse(repo.stats) : {};
  const packages: { name: string; count: number }[] = repo.packages ? JSON.parse(repo.packages) : [];
  const insights = await getInsights(repoId);
  let content = "";
  let provider: string | null = null;

  const moduleTable = () =>
    `| Module | Files | LOC | Depends on (edges) | Used by (edges) | Instability |\n|---|---:|---:|---:|---:|---:|\n` +
    insights.modules.slice(0, 25).map((m) => `| \`${m.name}\` | ${m.files} | ${m.loc} | ${m.fanOut} | ${m.fanIn} | ${m.instability} |`).join("\n");

  const central = g.files.filter((f) => CODE_LANGS.has(f.language as Lang)).sort((a, b) => b.fanIn - a.fanIn).slice(0, 12);
  const keyEntities = g.entities.filter((e) => e.type !== "method").sort((a, b) => b.fanIn - a.fanIn).slice(0, 20);

  if (item.kind === "overview") {
    const readme = await prisma.file.findFirst({ where: { repoId, path: { in: ["README.md", "readme.md", "README.rst", "Readme.md"] } }, select: { id: true } });
    const readmeText = readme ? (await prisma.codeChunk.findMany({ where: { fileId: readme.id }, orderBy: { chunkIndex: "asc" }, take: 3, select: { content: true } })).map((c) => c.content).join("\n").slice(0, 3000) : "";
    const ctx = `Repository: ${repo.name}
Stats: ${stats.files} files, ${stats.loc} LOC, entities ${JSON.stringify(stats.entities)}
Languages: ${(stats.languages || []).slice(0, 6).map((l: { language: string; files: number }) => `${l.language} (${l.files})`).join(", ")}
Modules:
${insights.modules.slice(0, 15).map((m) => `- ${m.name}: ${m.files} files, ${m.loc} LOC, fan-in ${m.fanIn}, fan-out ${m.fanOut}`).join("\n")}
Module dependencies (source -> target: import count):
${[...insights.moduleEdges].sort((a, b) => b.weight - a.weight).slice(0, 30).map((e) => `- ${e.source} -> ${e.target}: ${e.weight}`).join("\n")}
Most depended-on files:
${central.map((f) => `- ${f.path} (fan-in ${f.fanIn})`).join("\n")}
Key entities:
${keyEntities.map(entLine).join("\n")}
External packages: ${packages.slice(0, 30).map((p) => p.name).join(", ")}
README:
${readmeText || "(none)"}`;
    if (llm) {
      const r = await complete({ system: SYSTEM, prompt: `${ctx}\n\nWrite an "Architecture Overview" document with sections: Purpose, High-level Architecture (describe layers and include a mermaid \`graph TD\` diagram of the main modules), Key Modules (table: module, responsibility, key files), Core Data & Control Flow, Technology Stack, Entry Points, Where to Start Reading.` });
      content = r.text; provider = r.provider;
    } else {
      content = `# ${repo.name} — Architecture Overview\n\n${repo.summary ?? ""}\n\n## Modules\n\n${moduleTable()}\n\n## Most depended-on files\n\n${central.map((f) => `- \`${f.path}\` — imported by ${f.fanIn} files`).join("\n")}\n\n## Key entities\n\n${keyEntities.map(entLine).join("\n")}\n\n## Technology\n\n${(stats.languages || []).map((l: { language: string; files: number; loc: number }) => `- ${l.language}: ${l.files} files, ${l.loc} LOC`).join("\n")}\n`;
    }
  } else if (item.kind === "dependencies") {
    const extTable = `| Package | Imported by (files) |\n|---|---:|\n${packages.slice(0, 40).map((p) => `| \`${p.name}\` | ${p.count} |`).join("\n")}`;
    const edgeList = [...insights.moduleEdges].sort((a, b) => b.weight - a.weight).slice(0, 40).map((e) => `| \`${e.source}\` | \`${e.target}\` | ${e.weight} |`).join("\n");
    const base = `## Internal module dependencies\n\n| From | To | Imports |\n|---|---|---:|\n${edgeList || "| – | – | 0 |"}\n\n## Module stability\n\nInstability = fan-out / (fan-in + fan-out). Values near 0 are stable foundations; values near 1 are volatile leaf modules.\n\n${moduleTable()}\n\n## External packages\n\n${extTable}\n`;
    if (llm) {
      const r = await complete({ system: SYSTEM, prompt: `Repository ${repo.name}. Dependency data:\n${base}\n\nWrite a short "How the pieces depend on each other" narrative (2-4 paragraphs) explaining the dependency direction between modules, which modules are foundational vs. leaf, notable external libraries and what they are used for, and any risky dependency patterns. Output only the narrative markdown.` });
      content = `# Dependency Guide\n\n${r.text.trim()}\n\n${base}`; provider = r.provider;
    } else content = `# Dependency Guide\n\n${base}`;
  } else if (item.kind === "insights") {
    const list = insights.issues.slice(0, 40).map((i) => `- **${i.severity.toUpperCase()}** · ${i.title} — ${i.detail}`).join("\n");
    const base = `**Health score: ${insights.health}/100**\n\n| Category | Findings |\n|---|---:|\n${Object.entries(insights.counts).map(([k, v]) => `| ${k} | ${v} |`).join("\n")}\n\n## Findings\n\n${list || "No issues detected."}\n`;
    if (llm) {
      const r = await complete({ system: SYSTEM, prompt: `Repository ${repo.name}. Static-analysis findings:\n${base}\n\nWrite a prioritised "Recommendations" section (numbered, max 8 items) explaining why each matters and a concrete first step. Output only that section in markdown with a "## Recommendations" heading.` });
      content = `# Architecture Health Report\n\n${base}\n${r.text.trim()}\n`; provider = r.provider;
    } else content = `# Architecture Health Report\n\n${base}`;
  } else {
    const mod = slug.slice(7);
    const files = g.files.filter((f) => moduleOf(f.path!) === mod);
    const fileKeys = new Set(files.map((f) => f.key));
    const ents = g.entities.filter((e) => fileKeys.has(e.fileKey!)).sort((a, b) => b.fanIn - a.fanIn);
    const deps = insights.moduleEdges.filter((e) => e.source === mod).sort((a, b) => b.weight - a.weight);
    const users = insights.moduleEdges.filter((e) => e.target === mod).sort((a, b) => b.weight - a.weight);
    const ext = new Map<string, number>();
    for (const f of files) for (const e of g.out.get(f.key) || []) if (e.to.startsWith("p:")) ext.set(e.to.slice(2), (ext.get(e.to.slice(2)) || 0) + 1);
    const snippets: string[] = [];
    for (const e of ents.slice(0, 4)) snippets.push(`// ${e.path}:${e.startLine} ${e.qualifiedName}\n${await readSnippet(repoId, e.key, 35)}`);
    const ctx = `Module: ${mod} (${files.length} files, ${files.reduce((s, f) => s + (f.loc || 0), 0)} LOC)
Files:
${files.slice(0, 40).map((f) => `- ${f.path} (${f.loc} LOC, fan-in ${f.fanIn}, fan-out ${f.fanOut})`).join("\n")}
Key entities:
${ents.slice(0, 25).map(entLine).join("\n")}
Depends on modules: ${deps.map((d) => `${d.target} (${d.weight})`).join(", ") || "none"}
Used by modules: ${users.map((d) => `${d.source} (${d.weight})`).join(", ") || "none"}
External packages: ${[...ext.keys()].slice(0, 20).join(", ") || "none"}
Representative code:
${snippets.join("\n\n")}`;
    if (llm) {
      const r = await complete({ system: SYSTEM, prompt: `${ctx}\n\nWrite documentation for this module with sections: Responsibility, Key Components (table: component, kind, role), How It Works, Dependencies (internal and external, and who depends on it), Extension Points & Gotchas.` });
      content = `# Module: \`${mod}\`\n\n${r.text.trim()}`; provider = r.provider;
    } else {
      content = `# Module: \`${mod}\`\n\n## Files\n\n${files.slice(0, 60).map((f) => `- \`${f.path}\` — ${f.loc} LOC`).join("\n")}\n\n## Key entities\n\n${ents.slice(0, 30).map(entLine).join("\n")}\n\n## Depends on\n\n${deps.map((d) => `- \`${d.target}\` (${d.weight} imports)`).join("\n") || "- none"}\n\n## Used by\n\n${users.map((d) => `- \`${d.source}\` (${d.weight} imports)`).join("\n") || "- none"}\n\n## External packages\n\n${[...ext.keys()].map((p) => `- \`${p}\``).join("\n") || "- none"}\n`;
    }
  }

  content = content.replace(/^```(?:markdown|md)?\s*\n([\s\S]*)\n```\s*$/i, "$1");
  await prisma.document.upsert({
    where: { repoId_slug: { repoId, slug } },
    create: { repoId, slug, title: item.title, kind: item.kind, content, provider },
    update: { title: item.title, kind: item.kind, content, provider },
  });
  return { slug, title: item.title, content, provider };
}
