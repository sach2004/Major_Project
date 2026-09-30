import { BRACE_LANGS, type Lang } from "./languages";

export type EntityType =
  | "class" | "interface" | "enum" | "struct" | "trait" | "type" | "function" | "method" | "module";

export interface ParsedEntity {
  name: string;
  qualifiedName: string;
  type: EntityType;
  startLine: number; // 1-based inclusive
  endLine: number;
  signature: string;
  parentIndex: number | null;
  exported: boolean;
  bases: string[];
}

export interface ImportRef {
  spec: string;
  names: string[];
  line: number;
}

export interface ParseResult {
  entities: ParsedEntity[];
  imports: ImportRef[];
  masked: string;
}

/* ------------------------------------------------------------------ */
/* Masking: blank out comments & string literals, keep offsets/newlines */
/* ------------------------------------------------------------------ */

const SPACE = 32;
const NL = 10;

export function maskSource(src: string, lang: Lang): string {
  const n = src.length;
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) out[i] = src.charCodeAt(i);
  const blank = (a: number, b: number) => {
    for (let k = a; k < b && k < n; k++) if (out[k] !== NL) out[k] = SPACE;
  };

  const hashComments = lang === "python" || lang === "ruby" || lang === "shell" || lang === "yaml" || lang === "toml" || lang === "php";
  const slashComments = BRACE_LANGS.has(lang) || lang === "css" || lang === "sql";
  const pyTriple = lang === "python";
  const backtick = lang === "javascript" || lang === "typescript" || lang === "go";
  const rustChars = lang === "rust";

  const jsLike = lang === "javascript" || lang === "typescript";
  // a '/' starts a regex when it cannot be a division: after an operator, bracket or keyword
  const regexAllowed = (pos: number): boolean => {
    let k = pos - 1;
    while (k >= 0 && (src[k] === " " || src[k] === "\t")) k--;
    if (k < 0 || src[k] === "\n") return true;
    const p = src[k];
    if ("(,=:[!&|?{};+-*%<>~^".includes(p)) return true;
    const w = /([A-Za-z_$]+)$/.exec(src.slice(Math.max(0, k - 10), k + 1));
    return !!w && ["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "yield", "await"].includes(w[1]);
  };
  // Go raw string: blank everything up to the closing backtick
  const rawString = (start: number): number => {
    const e = src.indexOf("`", start + 1);
    const end = e === -1 ? n : e + 1;
    blank(start, end);
    return end;
  };
  // JS/TS template literal: blank the text but keep `${ expr }` code visible so calls
  // inside interpolations are still seen by the call-graph extractor.
  const template = (start: number): number => {
    let j = start + 1;
    out[start] = SPACE;
    while (j < n) {
      const ch = src[j];
      if (ch === "\\") { if (out[j] !== NL) out[j] = SPACE; j++; if (j < n && out[j] !== NL) out[j] = SPACE; j++; continue; }
      if (ch === "`") { out[j] = SPACE; return j + 1; }
      if (ch === "$" && src[j + 1] === "{") {
        out[j] = SPACE; out[j + 1] = SPACE;
        j += 2;
        let depth = 1;
        while (j < n && depth > 0) {
          const e = src[j];
          if (e === "`") { j = template(j); continue; }
          if (e === '"' || e === "'") {
            let k = j + 1;
            while (k < n && src[k] !== e && src[k] !== "\n") { if (src[k] === "\\") k++; k++; }
            blank(j, k + 1);
            j = k + 1;
            continue;
          }
          if (e === "{") depth++;
          else if (e === "}") { depth--; if (depth === 0) { out[j] = SPACE; j++; break; } }
          j++;
        }
        continue;
      }
      if (out[j] !== NL) out[j] = SPACE;
      j++;
    }
    return n;
  };

  let i = 0;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (slashComments && c === "/" && d === "/") {
      const e = src.indexOf("\n", i);
      const end = e === -1 ? n : e;
      blank(i, end);
      i = end;
      continue;
    }
    if (slashComments && c === "/" && d === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e === -1 ? n : e + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (lang === "sql" && c === "-" && d === "-") {
      const e = src.indexOf("\n", i);
      const end = e === -1 ? n : e;
      blank(i, end);
      i = end;
      continue;
    }
    if (hashComments && c === "#" && !(lang === "php" && d === "[")) {
      const e = src.indexOf("\n", i);
      const end = e === -1 ? n : e;
      blank(i, end);
      i = end;
      continue;
    }
    if (pyTriple && (c === '"' || c === "'") && src[i + 1] === c && src[i + 2] === c) {
      const q = c + c + c;
      const e = src.indexOf(q, i + 3);
      const end = e === -1 ? n : e + 3;
      blank(i, end);
      i = end;
      continue;
    }
    if (jsLike && c === "/" && d !== "/" && d !== "*" && regexAllowed(i)) {
      // regex literal: /[^{]*\}/g — its braces and quotes must not affect parsing
      let j = i + 1;
      let cls = false;
      while (j < n && src[j] !== "\n") {
        const ch = src[j];
        if (ch === "\\") { j += 2; continue; }
        if (ch === "[") cls = true;
        else if (ch === "]") cls = false;
        else if (ch === "/" && !cls) break;
        j++;
      }
      if (j < n && src[j] === "/") {
        blank(i + 1, j);
        i = j + 1;
        continue;
      }
    }
    if (backtick && c === "`") {
      i = lang === "go" ? rawString(i) : template(i);
      continue;
    }
    if (c === '"' || c === "'") {
      if (c === "'" && rustChars) {
        // char literal only: 'a' or '\n' / '\u{..}'
        const isChar = src[i + 2] === "'" || (src[i + 1] === "\\" && /'/.test(src.slice(i + 2, i + 12)));
        if (!isChar) { i++; continue; }
      }
      if (c === "'" && (lang === "markdown" || lang === "text")) { i++; continue; }
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") {
        if (src[j] === "\\") j++;
        j++;
      }
      const end = Math.min(n, j + 1);
      blank(i, end);
      i = end;
      continue;
    }
    i++;
  }
  // convert back to string in chunks (avoid call stack limits)
  let s = "";
  const CH = 8192;
  for (let k = 0; k < n; k += CH) s += String.fromCharCode(...out.subarray(k, Math.min(n, k + CH)));
  return s;
}

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

function lineStarts(s: string): number[] {
  const arr = [0];
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === NL) arr.push(i + 1);
  return arr;
}

function offsetToLine(starts: number[], off: number): number {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= off) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

function matchBrace(m: string, open: number): number {
  let depth = 0;
  for (let i = open; i < m.length; i++) {
    const c = m[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return m.length - 1;
}

/** end of an expression statement: ';' or newline at bracket depth 0 */
function statementEnd(m: string, from: number): number {
  let depth = 0;
  let sawContent = false;
  for (let i = from; i < m.length && i < from + 20000; i++) {
    const c = m[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth < 0) return i - 1;
    } else if (c === ";" && depth === 0) return i;
    else if (c === "\n" && depth === 0 && sawContent) {
      // continue if next non-space char is an operator continuation
      const rest = m.slice(i + 1, i + 60).trimStart();
      if (/^[.?:+\-*/&|]/.test(rest)) continue;
      return i;
    }
    if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") sawContent = true;
  }
  return Math.min(m.length - 1, from + 20000);
}

type BodyResult = { kind: "block"; open: number; close: number } | { kind: "stmt"; end: number } | { kind: "none"; end: number };

/** From a declaration position, find its body. Skips balanced parens. */
function findBody(m: string, pos: number, lang: Lang, allowExprBody: boolean): BodyResult {
  let paren = 0;
  const limit = Math.min(m.length, pos + 3000);
  // TypeScript return types can contain braces: `f(): Promise<{ a: T }> { ... }`
  const typed = lang === "typescript";
  let angle = 0;
  let expectType = false;
  for (let i = pos; i < limit; i++) {
    const c = m[i];
    if (c === "(" || c === "[") paren++;
    else if (c === ")" || c === "]") paren--;
    else if (paren <= 0) {
      if (typed) {
        if (c === "<") { angle++; continue; }
        if (c === ">" && m[i - 1] !== "=") { if (angle > 0) angle--; continue; }
        if (c === ":" || c === "|" || c === "&" || c === ",") { expectType = true; continue; }
        if (c === "{" && (angle > 0 || expectType)) { i = matchBrace(m, i); expectType = false; continue; }
        if (!/\s/.test(c) && !(c === "=" && m[i + 1] === ">")) expectType = false;
      }
      if (c === "{") return { kind: "block", open: i, close: matchBrace(m, i) };
      if (c === ";") return { kind: "none", end: i };
      if (c === "}") return { kind: "none", end: i - 1 };
      if (allowExprBody && c === "=" && m[i + 1] === ">") {
        let j = i + 2;
        while (j < m.length && /\s/.test(m[j])) j++;
        if (m[j] === "{") return { kind: "block", open: j, close: matchBrace(m, j) };
        return { kind: "stmt", end: statementEnd(m, j) };
      }
      if (allowExprBody && (lang === "kotlin" || lang === "scala") && c === "=" && m[i + 1] !== "=" && m[i - 1] !== "!" && m[i - 1] !== "<" && m[i - 1] !== ">") {
        return { kind: "stmt", end: statementEnd(m, i + 1) };
      }
    }
  }
  return { kind: "none", end: pos };
}

const CONTROL = new Set([
  "if", "for", "while", "switch", "catch", "return", "new", "else", "do", "try", "finally",
  "function", "synchronized", "throw", "case", "sizeof", "typeof", "await", "yield", "delete",
  "using", "lock", "foreach", "elif", "when", "match", "loop", "unless", "until", "defer", "go", "select",
  "constructor_", "super", "this", "import", "export", "require", "assert", "print", "println",
]);

interface Cand {
  offset: number;          // match start
  bodyFrom: number;        // where to look for body
  name: string;
  type: EntityType;
  container: boolean;      // class-like container
  emit: boolean;           // produce entity (impl blocks are containers only)
  exported: boolean;
  bases: string[];
  parentHint?: string;     // explicit parent (Go receivers, Rust impl)
  exprBody?: boolean;
  requireBody?: boolean;
}

function splitBases(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .replace(/<[^<>]*>/g, "")
    .replace(/\([^()]*\)/g, "")
    .split(/[,\s]+|\bwith\b|\bimplements\b|\bextends\b/)
    .map((x) => x.trim().replace(/^[:&]+/, ""))
    .filter((x) => /^[A-Za-z_$][\w$.:]*$/.test(x) && !["public", "private", "protected", "virtual", "where"].includes(x))
    .map((x) => x.split(/[.:]+/).pop() as string);
}

function scan(re: RegExp, m: string, fn: (mt: RegExpExecArray) => void) {
  re.lastIndex = 0;
  let mt: RegExpExecArray | null;
  while ((mt = re.exec(m))) {
    fn(mt);
    if (mt[0].length === 0) re.lastIndex++;
  }
}

/* ------------------------------------------------------------------ */
/* Brace languages                                                      */
/* ------------------------------------------------------------------ */

function braceCandidates(lang: Lang, m: string): { containers: Cand[]; funcs: Cand[]; memberRes: RegExp[] } {
  const containers: Cand[] = [];
  const funcs: Cand[] = [];
  const memberRes: RegExp[] = [];
  const at = (mt: RegExpExecArray) => mt.index + (mt[0].length - mt[0].trimStart().length);

  if (lang === "typescript" || lang === "javascript") {
    scan(/^[ \t]*(export\s+)?(default\s+)?(declare\s+)?(abstract\s+)?class\s+([A-Za-z_$][\w$]*)(\s*<[^>{]*>)?(\s+extends\s+([\w$.]+(?:\([^)]*\))?))?(\s+implements\s+([\w$.,\s<>]+))?/gm, m, (mt) => {
      containers.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length, name: mt[5], type: "class", container: true, emit: true, exported: !!mt[1], bases: [...splitBases(mt[8]), ...splitBases(mt[10])] });
    });
    scan(/^[ \t]*(export\s+)?(declare\s+)?interface\s+([A-Za-z_$][\w$]*)(\s*<[^>{]*>)?(\s+extends\s+([\w$.,\s<>]+))?/gm, m, (mt) => {
      containers.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length, name: mt[3], type: "interface", container: true, emit: true, exported: !!mt[1], bases: splitBases(mt[6]) });
    });
    scan(/^[ \t]*(export\s+)?(declare\s+)?(const\s+)?enum\s+([A-Za-z_$][\w$]*)/gm, m, (mt) => {
      containers.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length, name: mt[4], type: "enum", container: true, emit: true, exported: !!mt[1], bases: [] });
    });
    scan(/^[ \t]*(export\s+)?(default\s+)?(declare\s+)?(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*(<[^>(]*>)?\s*\(/gm, m, (mt) => {
      funcs.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length - 1, name: mt[5], type: "function", container: false, emit: true, exported: !!mt[1], bases: [], requireBody: true });
    });
    scan(/^[ \t]*(export\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)\s*(:[^=\n]+)?=\s*(async\s+)?(function\b[^(]*\(|(\([^()]*(\([^()]*\)[^()]*)*\)|[A-Za-z_$][\w$]*)\s*(:\s*[^=\n]+?)?\s*=>)/gm, m, (mt) => {
      funcs.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length - (mt[6].startsWith("function") ? 1 : 2), name: mt[3], type: "function", container: false, emit: true, exported: !!mt[1], bases: [], exprBody: true });
    });
    // members inside class bodies
    memberRes.push(/^[ \t]*(?:(?:public|private|protected|static|async|readonly|override|abstract|declare|get|set)\s+)*\*?\s*(#?[A-Za-z_$][\w$]*)\s*(?:<[^>(]*>)?\s*\(/gm);
    memberRes.push(/^[ \t]*(?:(?:public|private|protected|static|readonly|override)\s+)*(#?[A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:async\s+)?(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=\n]+?)?\s*=>/gm);
  } else if (lang === "java" || lang === "csharp" || lang === "kotlin" || lang === "scala" || lang === "dart" || lang === "swift") {
    scan(/^[ \t]*(?:@[\w.]+(?:\([^)\n]*\))?\s*)*((?:public|private|protected|internal|abstract|final|static|sealed|open|data|partial|inline|value|annotation|fileprivate|case|override|export|readonly|unsafe|new)\s+)*(class|interface|enum\s+class|enum|record|struct|object|trait|protocol|extension|mixin)\s+([A-Za-z_]\w*)([^{\n]*)/gm, m, (mt) => {
      const kw = mt[2];
      const type: EntityType = kw.startsWith("enum") ? "enum" : kw === "interface" || kw === "protocol" ? "interface" : kw === "trait" ? "trait" : kw === "struct" ? "struct" : "class";
      const rest = mt[4] || "";
      let bases: string[] = [];
      const ext = rest.match(/(?:extends|:|implements|with)\s+(.+)$/);
      if (ext) bases = splitBases(ext[1].replace(/\{.*$/, "").replace(/\bwhere\b.*$/, ""));
      const mods = mt[1] || "";
      const exported = lang === "java" || lang === "csharp" ? /public/.test(mods) : !/private|fileprivate/.test(mods);
      containers.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length - rest.length, name: mt[3], type, container: true, emit: true, exported, bases });
    });
    if (lang === "kotlin") {
      scan(/^[ \t]*((?:public|private|protected|internal|override|open|abstract|suspend|inline|operator|infix|tailrec|external|actual|expect)\s+)*fun\s+(?:<[^>]+>\s*)?(?:[\w.<>?]+\.)?([A-Za-z_]\w*)\s*\(/gm, m, (mt) => {
        funcs.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length - 1, name: mt[2], type: "function", container: false, emit: true, exported: !/private/.test(mt[1] || ""), bases: [], exprBody: true });
      });
    } else if (lang === "swift") {
      scan(/^[ \t]*((?:public|private|fileprivate|internal|open|static|class|override|final|mutating|@\w+)\s+)*func\s+([A-Za-z_]\w*)\s*(?:<[^>]+>)?\s*\(/gm, m, (mt) => {
        funcs.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length - 1, name: mt[2], type: "function", container: false, emit: true, exported: !/private/.test(mt[1] || ""), bases: [] });
      });
    } else if (lang === "scala") {
      scan(/^[ \t]*((?:override|private|protected|final|implicit|lazy)\s+)*def\s+([A-Za-z_]\w*)/gm, m, (mt) => {
        funcs.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length, name: mt[2], type: "function", container: false, emit: true, exported: !/private/.test(mt[1] || ""), bases: [], exprBody: true });
      });
    } else {
      // java / c# / dart methods & constructors (must have a return type or be a ctor)
      scan(/^[ \t]*(?:@[\w.]+(?:\([^)\n]*\))?\s*)*((?:public|private|protected|internal|static|final|abstract|synchronized|native|default|override|virtual|async|sealed|extern|unsafe|new|partial|external|factory)\s+)*(?:<[^>\n]+>\s+)?([\w<>\[\],.?]+\s+)?([A-Za-z_]\w*)\s*\(/gm, m, (mt) => {
        const name = mt[3];
        const ret = (mt[2] || "").trim();
        if (CONTROL.has(name) || CONTROL.has(ret)) return;
        if (!ret && !mt[1]) return; // bare call like foo(...)
        if (ret === "return" || ret === "new" || ret === "else" || ret === "throw") return;
        const exported = lang === "dart" ? !name.startsWith("_") : /public/.test(mt[1] || "") || lang === "csharp" && /internal/.test(mt[1] || "");
        funcs.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length - 1, name, type: "function", container: false, emit: true, exported, bases: [], exprBody: lang === "csharp" || lang === "dart", requireBody: false });
      });
    }
  } else if (lang === "go") {
    scan(/^func\s+(\(\s*\w*\s*\*?\s*([A-Za-z_]\w*)[^)]*\)\s*)?([A-Za-z_]\w*)\s*(\[[^\]]*\])?\s*\(/gm, m, (mt) => {
      funcs.push({ offset: mt.index, bodyFrom: mt.index + mt[0].length - 1, name: mt[3], type: mt[2] ? "method" : "function", container: false, emit: true, exported: /^[A-Z]/.test(mt[3]), bases: [], parentHint: mt[2] });
    });
    scan(/^type\s+([A-Za-z_]\w*)\s*(\[[^\]]*\])?\s+(struct|interface)\b/gm, m, (mt) => {
      containers.push({ offset: mt.index, bodyFrom: mt.index + mt[0].length, name: mt[1], type: mt[3] === "struct" ? "struct" : "interface", container: true, emit: true, exported: /^[A-Z]/.test(mt[1]), bases: [] });
    });
  } else if (lang === "rust") {
    scan(/^[ \t]*(pub(?:\([^)]*\))?\s+)?(struct|enum|trait|union)\s+([A-Za-z_]\w*)([^{;\n]*)/gm, m, (mt) => {
      const type: EntityType = mt[2] === "trait" ? "trait" : mt[2] === "enum" ? "enum" : "struct";
      const sup = mt[2] === "trait" && mt[4]?.includes(":") ? splitBases(mt[4].split(":")[1]) : [];
      containers.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length - (mt[4]?.length ?? 0), name: mt[3], type, container: true, emit: true, exported: !!mt[1], bases: sup });
    });
    scan(/^[ \t]*impl(?:\s*<[^>{]*>)?\s+(?:(?:[\w:]+)(?:<[^>{]*>)?\s+for\s+)?([\w:]+)/gm, m, (mt) => {
      const nm = mt[1].split("::").pop() as string;
      containers.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length, name: nm, type: "struct", container: true, emit: false, exported: false, bases: [], parentHint: nm });
    });
    scan(/^[ \t]*(pub(?:\([^)]*\))?\s+)?(?:default\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+([A-Za-z_]\w*)/gm, m, (mt) => {
      funcs.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length, name: mt[2], type: "function", container: false, emit: true, exported: !!mt[1], bases: [] });
    });
  } else if (lang === "c" || lang === "cpp") {
    scan(/^[ \t]*(?:template\s*<[^>]*>\s*)?(class|struct)\s+(?:\w+\s+)?([A-Za-z_]\w*)\s*(?:final\s*)?(:\s*([^{;]+))?\{/gm, m, (mt) => {
      containers.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length - 1, name: mt[2], type: mt[1] === "struct" ? "struct" : "class", container: true, emit: true, exported: true, bases: splitBases(mt[4]) });
    });
    scan(/^[ \t]*(?:template[ \t]*<[^>\n]*>\s*)?(?:(?:static|inline|virtual|extern|constexpr|explicit|friend|unsigned|signed|const|volatile|struct)[ \t]+)*([A-Za-z_][\w:<>, \t*&]*?[ \t*&]+)?(~?[A-Za-z_]\w*(?:::~?[A-Za-z_]\w*)*)[ \t]*\(([^;{}()]*(?:\([^()]*\)[^;{}()]*)*)\)\s*(?:const\s*)?(?:noexcept\s*)?(?:override\s*)?(?:final\s*)?(?:->\s*[\w:<>*&]+\s*)?(?::[^{;]*)?\{/gm, m, (mt) => {
      const full = mt[2];
      const parts = full.split("::");
      const name = parts.pop() as string;
      if (CONTROL.has(name) || CONTROL.has((mt[1] || "").trim())) return;
      const parent = parts.length ? parts[parts.length - 1] : undefined;
      funcs.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length - 1, name, type: parent ? "method" : "function", container: false, emit: true, exported: !/\bstatic\b/.test(mt[0]), bases: [], parentHint: parent, requireBody: true });
    });
  } else if (lang === "php") {
    scan(/^[ \t]*((?:abstract|final|readonly)\s+)*(class|interface|trait|enum)\s+([A-Za-z_]\w*)([^{\n]*)/gm, m, (mt) => {
      const rest = mt[4] || "";
      const bases = splitBases((rest.match(/(?:extends|implements)\s+(.+)$/) || [])[1]);
      const type: EntityType = mt[2] === "interface" ? "interface" : mt[2] === "trait" ? "trait" : mt[2] === "enum" ? "enum" : "class";
      containers.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length - rest.length, name: mt[3], type, container: true, emit: true, exported: true, bases });
    });
    scan(/^[ \t]*((?:public|private|protected|static|abstract|final)\s+)*function\s+&?([A-Za-z_]\w*)\s*\(/gm, m, (mt) => {
      funcs.push({ offset: at(mt), bodyFrom: mt.index + mt[0].length - 1, name: mt[2], type: "function", container: false, emit: true, exported: !/private/.test(mt[1] || ""), bases: [] });
    });
  }
  return { containers, funcs, memberRes };
}

function parseBrace(lang: Lang, src: string, m: string, starts: number[]): ParsedEntity[] {
  const { containers, funcs, memberRes } = braceCandidates(lang, m);

  type Ranged = Cand & { s: number; e: number; hasBody: boolean };
  const withRange = (c: Cand): Ranged => {
    const b = findBody(m, c.bodyFrom, lang, !!c.exprBody);
    if (b.kind === "block") return { ...c, s: c.offset, e: b.close, hasBody: true };
    if (b.kind === "stmt") return { ...c, s: c.offset, e: b.end, hasBody: true };
    return { ...c, s: c.offset, e: Math.max(c.offset, b.end), hasBody: false };
  };

  const cont: Ranged[] = containers.map(withRange).filter((c) => c.hasBody || c.type === "interface" || c.type === "struct" || c.type === "enum");
  // de-dup containers at same offset
  const seen = new Set<number>();
  const conts = cont.filter((c) => (seen.has(c.s) ? false : (seen.add(c.s), true))).sort((a, b) => a.s - b.s);

  const fnCands: Cand[] = [...funcs];
  if (memberRes.length) {
    for (const c of conts) {
      if (c.type !== "class") continue;
      const b = findBody(m, c.bodyFrom, lang, false);
      if (b.kind !== "block") continue;
      const body = m.slice(b.open + 1, b.close);
      for (const re of memberRes) {
        re.lastIndex = 0;
        let mt: RegExpExecArray | null;
        while ((mt = re.exec(body))) {
          const name = mt[1];
          if (!CONTROL.has(name)) {
            const lead = mt[0].length - mt[0].trimStart().length;
            const off = b.open + 1 + mt.index + lead;
            const isArrow = mt[0].includes("=>");
            fnCands.push({ offset: off, bodyFrom: b.open + 1 + mt.index + mt[0].length - (isArrow ? 2 : 1), name: name.replace(/^#/, ""), type: "method", container: false, emit: true, exported: !/private|#/.test(mt[0]), bases: [], exprBody: isArrow });
          }
          if (mt[0].length === 0) re.lastIndex++;
        }
      }
    }
  }

  const fr: Ranged[] = fnCands
    .map(withRange)
    .filter((f) => f.hasBody || (!f.requireBody && (lang === "java" || lang === "csharp" || lang === "kotlin" || lang === "swift" || lang === "scala" || lang === "rust" || lang === "dart" || lang === "php")))
    .sort((a, b) => a.s - b.s || b.e - a.e);

  // drop functions nested inside accepted function bodies; drop duplicates at same offset
  const accepted: Ranged[] = [];
  const seenF = new Set<number>();
  for (const f of fr) {
    if (seenF.has(f.s)) continue;
    const inside = accepted.some((a) => f.s > a.s && f.s <= a.e);
    if (inside) continue;
    // must not start inside a non-class container like an interface body (except members of interfaces for Java-like)
    seenF.add(f.s);
    accepted.push(f);
  }
  // drop containers located inside function bodies (local classes)
  const contAccepted = conts.filter((c) => !accepted.some((a) => c.s > a.s && c.s <= a.e));

  const all: Ranged[] = [...contAccepted, ...accepted].sort((a, b) => a.s - b.s);
  const entities: ParsedEntity[] = [];
  const indexOf = new Map<Ranged, number>();
  const emitted: { r: Ranged; idx: number }[] = [];
  for (const r of all) {
    // innermost enclosing container
    let parent: Ranged | null = null;
    for (const c of contAccepted) {
      if (c !== r && c.s < r.s && r.s <= c.e && (!parent || c.s > parent.s)) parent = c;
    }
    let parentIndex: number | null = null;
    let parentName: string | undefined;
    if (parent) {
      parentName = parent.parentHint || parent.name;
      if (parent.emit && indexOf.has(parent)) parentIndex = indexOf.get(parent)!;
      else if (!parent.emit) {
        const target = emitted.find((x) => x.r.emit && x.r.container && x.r.name === parentName);
        if (target) parentIndex = target.idx;
      }
    } else if (r.parentHint) {
      parentName = r.parentHint;
      const target = emitted.find((x) => x.r.container && x.r.emit && x.r.name === r.parentHint);
      if (target) parentIndex = target.idx;
    }
    if (!r.emit) continue;
    let type = r.type;
    if (!r.container && parentName) type = "method";
    if (!r.container && parent && parent.type === "interface" && lang !== "typescript" && lang !== "javascript") type = "method";
    const startLine = offsetToLine(starts, r.s);
    const endLine = Math.max(startLine, offsetToLine(starts, r.e));
    const sigLine = src.slice(starts[startLine - 1], starts[startLine] ?? src.length).trim();
    const e: ParsedEntity = {
      name: r.name,
      qualifiedName: parentName ? `${parentName}.${r.name}` : r.name,
      type,
      startLine,
      endLine,
      signature: sigLine.slice(0, 220),
      parentIndex,
      exported: r.exported,
      bases: r.bases,
    };
    indexOf.set(r, entities.length);
    emitted.push({ r, idx: entities.length });
    entities.push(e);
  }
  return entities;
}

/* ------------------------------------------------------------------ */
/* Indentation languages                                                */
/* ------------------------------------------------------------------ */

function indentOf(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === " ") n++;
    else if (ch === "\t") n += 4;
    else break;
  }
  return n;
}

function parsePython(src: string, m: string): ParsedEntity[] {
  const srcLines = src.split("\n");
  const lines = m.split("\n");
  const entities: ParsedEntity[] = [];
  const stack: { indent: number; idx: number; kind: "class" | "def" }[] = [];
  const blockEnd = (i: number, ind: number) => {
    let last = i;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim()) continue;
      if (indentOf(l) <= ind) break;
      last = j;
    }
    return last;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const ind = indentOf(l);
    while (stack.length && stack[stack.length - 1].indent >= ind) stack.pop();
    const cm = l.match(/^\s*class\s+([A-Za-z_]\w*)\s*(\(([^)]*)\))?\s*:/);
    const dm = l.match(/^\s*(async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
    if (!cm && !dm) continue;
    const parent = stack.length ? stack[stack.length - 1] : null;
    if (parent && parent.kind === "def") continue; // skip nested defs/classes inside functions
    const end = blockEnd(i, ind) + 1;
    const parentEnt = parent ? entities[parent.idx] : null;
    const name = (cm ? cm[1] : dm![2]) as string;
    const bases = cm ? splitBases((cm[3] || "").replace(/\w+\s*=\s*[\w.]+/g, "")).filter((b) => b !== "object") : [];
    const e: ParsedEntity = {
      name,
      qualifiedName: parentEnt ? `${parentEnt.qualifiedName}.${name}` : name,
      type: cm ? "class" : parentEnt && parentEnt.type === "class" ? "method" : "function",
      startLine: i + 1,
      endLine: end,
      signature: srcLines[i].trim().slice(0, 220),
      parentIndex: parent ? parent.idx : null,
      exported: !name.startsWith("_") || /^__\w+__$/.test(name),
      bases,
    };
    stack.push({ indent: ind, idx: entities.length, kind: cm ? "class" : "def" });
    entities.push(e);
  }
  return entities;
}

function parseRuby(src: string, m: string): ParsedEntity[] {
  const srcLines = src.split("\n");
  const lines = m.split("\n");
  const entities: ParsedEntity[] = [];
  const stack: { indent: number; idx: number; kind: "class" | "def" }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const ind = indentOf(l);
    while (stack.length && stack[stack.length - 1].indent >= ind && !/^\s*end\b/.test(l)) stack.pop();
    const cm = l.match(/^\s*(class|module)\s+([A-Z][\w:]*)(\s*<\s*([\w:]+))?/);
    const dm = l.match(/^\s*def\s+(self\.)?([\w?!=]+)/);
    if (!cm && !dm) continue;
    const parent = stack.length ? stack[stack.length - 1] : null;
    if (parent && parent.kind === "def") continue;
    let end = i;
    if (!/\bend\s*$/.test(l) || cm) {
      const endRe = new RegExp(`^\\s{${ind}}end\\b`);
      for (let j = i + 1; j < lines.length; j++) {
        if (endRe.test(lines[j]) && indentOf(lines[j]) === ind) { end = j; break; }
        end = j;
      }
    }
    const parentEnt = parent ? entities[parent.idx] : null;
    const name = (cm ? cm[2].split("::").pop() : dm![2]) as string;
    entities.push({
      name,
      qualifiedName: parentEnt ? `${parentEnt.qualifiedName}.${name}` : name,
      type: cm ? (cm[1] === "module" ? "module" : "class") : parentEnt ? "method" : "function",
      startLine: i + 1,
      endLine: end + 1,
      signature: srcLines[i].trim().slice(0, 220),
      parentIndex: parent ? parent.idx : null,
      exported: true,
      bases: cm && cm[4] ? [cm[4].split("::").pop() as string] : [],
    });
    stack.push({ indent: ind, idx: entities.length - 1, kind: cm ? "class" : "def" });
  }
  return entities;
}

/* ------------------------------------------------------------------ */
/* Imports                                                              */
/* ------------------------------------------------------------------ */

function parseNames(clause: string): string[] {
  const names: string[] = [];
  const c = clause.replace(/\btype\b/g, " ").trim();
  const braces = c.match(/\{([^}]*)\}/);
  if (braces) {
    for (const part of braces[1].split(",")) {
      const p = part.trim();
      if (!p) continue;
      const [orig] = p.split(/\s+as\s+/);
      names.push(orig.trim());
    }
  }
  const def = c.replace(/\{[^}]*\}/, "").replace(/\*\s+as\s+\w+/, "").split(",")[0].trim();
  if (/^[A-Za-z_$][\w$]*$/.test(def)) names.push("default");
  if (/\*\s+as/.test(c)) names.push("*");
  return names;
}

export function extractImports(lang: Lang, src: string, m: string, starts: number[]): ImportRef[] {
  const out: ImportRef[] = [];
  const ok = (idx: number) => m.charCodeAt(idx) === src.charCodeAt(idx);
  const push = (idx: number, spec: string, names: string[] = []) => {
    if (!ok(idx) || !spec) return;
    out.push({ spec: spec.trim(), names, line: offsetToLine(starts, idx) });
  };
  const run = (re: RegExp, fn: (mt: RegExpExecArray, idx: number) => void) => {
    re.lastIndex = 0;
    let mt: RegExpExecArray | null;
    while ((mt = re.exec(src))) {
      const lead = mt[0].length - mt[0].trimStart().length;
      fn(mt, mt.index + lead);
      if (mt[0].length === 0) re.lastIndex++;
    }
  };

  switch (lang) {
    case "typescript":
    case "javascript":
      run(/(?:^|[;\s])import\s+(?:type\s+)?([^;'"`]*?)\s*from\s*['"]([^'"\n]+)['"]/gm, (mt, idx) => push(src.indexOf("import", idx), mt[2], parseNames(mt[1])));
      run(/(?:^|[;\s])import\s*['"]([^'"\n]+)['"]/gm, (mt, idx) => push(src.indexOf("import", idx), mt[1]));
      run(/(?:^|[;\s])export\s+(?:type\s+)?(\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*['"]([^'"\n]+)['"]/gm, (mt, idx) => push(src.indexOf("export", idx), mt[2], parseNames(mt[1])));
      run(/\b(?:require|import)\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g, (mt, idx) => push(idx, mt[1]));
      break;
    case "python":
      run(/^[ \t]*from\s+(\.*[\w.]*)\s+import\s+(\([^)]*\)|[^\n#]*)/gm, (mt, idx) => {
        const names = mt[2].replace(/[()]/g, "").split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        push(idx, mt[1], names);
      });
      run(/^[ \t]*import\s+([\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*)/gm, (mt, idx) => {
        for (const part of mt[1].split(",")) push(idx, part.trim().split(/\s+as\s+/)[0]);
      });
      break;
    case "java":
    case "kotlin":
    case "scala":
      run(/^[ \t]*import\s+(?:static\s+)?([\w.*{}, ]+?)\s*;?\s*$/gm, (mt, idx) => push(idx, mt[1].replace(/\s+/g, "")));
      break;
    case "csharp":
      run(/^[ \t]*(?:global\s+)?using\s+(?:static\s+)?([\w.]+)\s*;/gm, (mt, idx) => push(idx, mt[1]));
      break;
    case "swift":
      run(/^[ \t]*import\s+(?:class\s+|struct\s+|func\s+)?([\w.]+)/gm, (mt, idx) => push(idx, mt[1]));
      break;
    case "dart":
      run(/^[ \t]*(?:import|export|part)\s+['"]([^'"]+)['"]/gm, (mt, idx) => push(idx, mt[1]));
      break;
    case "go": {
      run(/^import\s+(?:[\w.]+\s+)?"([^"]+)"/gm, (mt, idx) => push(idx, mt[1]));
      run(/^import\s*\(([^)]*)\)/gm, (mt, idx) => {
        if (!ok(idx)) return;
        const inner = mt[1];
        const base = idx + mt[0].indexOf("(") + 1;
        const r = /(?:[\w.]+\s+)?"([^"]+)"/g;
        let x: RegExpExecArray | null;
        while ((x = r.exec(inner))) out.push({ spec: x[1], names: [], line: offsetToLine(starts, base + x.index) });
      });
      break;
    }
    case "rust":
      run(/^[ \t]*(?:pub(?:\([^)]*\))?\s+)?use\s+([^;]+);/gm, (mt, idx) => push(idx, mt[1].replace(/\s+/g, "")));
      run(/^[ \t]*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*;/gm, (mt, idx) => push(idx, `mod:${mt[1]}`));
      break;
    case "c":
    case "cpp":
      run(/^[ \t]*#\s*include\s*([<"])([^>"]+)[>"]/gm, (mt, idx) => push(idx, (mt[1] === "<" ? "<" : "") + mt[2]));
      break;
    case "ruby":
      run(/^[ \t]*(require_relative|require|load)\s*\(?\s*['"]([^'"]+)['"]/gm, (mt, idx) => push(idx, (mt[1] === "require_relative" ? "./" : "") + mt[2]));
      break;
    case "php":
      run(/^[ \t]*use\s+([\w\\]+)(?:\s+as\s+\w+)?\s*;/gm, (mt, idx) => push(idx, mt[1]));
      run(/\b(?:require|include)(?:_once)?\s*\(?\s*(?:__DIR__\s*\.\s*)?['"]([^'"]+)['"]/g, (mt, idx) => push(idx, mt[1].startsWith("/") ? "." + mt[1] : mt[1]));
      break;
  }
  return out;
}

/* ------------------------------------------------------------------ */

export function parseSource(lang: Lang, src: string): ParseResult {
  const masked = maskSource(src, lang);
  const starts = lineStarts(src);
  let entities: ParsedEntity[] = [];
  try {
    if (lang === "python") entities = parsePython(src, masked);
    else if (lang === "ruby") entities = parseRuby(src, masked);
    else if (BRACE_LANGS.has(lang)) entities = parseBrace(lang, src, masked, starts);
  } catch {
    entities = [];
  }
  let imports: ImportRef[] = [];
  try {
    imports = extractImports(lang, src, masked, starts);
  } catch {
    imports = [];
  }
  return { entities, imports, masked };
}
