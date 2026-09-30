import { LANG_COLORS } from "@/lib/client/api";

const LANGS = ["TypeScript", "JavaScript", "Python", "Go", "Rust", "Java", "Kotlin", "C#", "C++", "C", "Ruby", "PHP", "Swift", "Scala", "Dart"];
const key = (l: string) => ({ "C#": "csharp", "C++": "cpp" } as Record<string, string>)[l] ?? l.toLowerCase();

export function LanguageMarquee() {
  const row = [...LANGS, ...LANGS];
  return (
    <div className="marquee-wrap fade-x overflow-hidden py-5">
      <div className="marquee">
        {row.map((l, i) => (
          <span key={i} className="mr-3 inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-[13px] text-fg-2">
            <span className="h-2 w-2 rounded-full" style={{ background: LANG_COLORS[key(l)] ?? "#888" }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
