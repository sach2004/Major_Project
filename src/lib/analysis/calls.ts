const KEYWORDS = new Set([
  "if", "for", "while", "switch", "catch", "return", "function", "typeof", "sizeof", "await", "yield",
  "new", "super", "this", "self", "print", "println", "printf", "len", "range", "str", "int", "float",
  "list", "dict", "set", "tuple", "bool", "isinstance", "console", "require", "import", "assert",
  "elif", "with", "lambda", "not", "and", "or", "in", "is", "fn", "match", "loop", "defer", "go",
  "make", "append", "panic", "delete", "void", "var", "let", "const", "def", "class", "struct",
  "Some", "Ok", "Err", "None", "vec", "format", "String", "Object", "Array", "Promise", "Error",
  "Map", "Set", "Math", "JSON", "Number", "Boolean", "Symbol", "parseInt", "parseFloat", "setTimeout",
  "setInterval", "clearTimeout", "then", "catch", "finally", "push", "pop", "map", "filter", "reduce",
  "forEach", "join", "split", "slice", "splice", "keys", "values", "entries", "get", "has", "add",
  "toString", "log", "error", "warn", "info", "debug", "includes", "indexOf", "replace", "trim",
  "length", "concat", "sort", "find", "some", "every", "resolve", "reject", "emit", "on", "off",
  "append", "extend", "items", "update", "copy", "pop", "insert", "remove", "open", "close", "read",
  "write", "exists", "min", "max", "abs", "round", "sum", "any", "all", "zip", "enumerate", "sorted",
  "reversed", "getattr", "setattr", "hasattr", "super", "type", "id", "hash", "iter", "next",
]);

export interface CallRef { name: string; count: number; isNew: boolean }

/** Collect identifiers used as calls in masked code. */
export function extractCalls(maskedBody: string, selfName?: string): CallRef[] {
  const counts = new Map<string, CallRef>();
  const re = /(\bnew\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^<>()]*>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(maskedBody))) {
    const name = m[2];
    if (name === selfName) continue;
    if (KEYWORDS.has(name) || name.length < 2) continue;
    const prev = counts.get(name);
    if (prev) prev.count++;
    else counts.set(name, { name, count: 1, isNew: !!m[1] });
  }
  return [...counts.values()];
}

/**
 * Non-call references to known symbols: JSX components (<Foo />), callbacks passed by
 * value (onClick={handle}, .then(fn), setTimeout(tick)) and constructor references.
 * Property accesses (obj.name) and object keys ({ name: … }) are ignored.
 */
export function extractRefs(maskedBody: string, known: Set<string>, selfName?: string): string[] {
  const out = new Set<string>();
  const re = /[A-Za-z_$][\w$]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(maskedBody))) {
    const name = m[0];
    if (name === selfName || !known.has(name) || out.has(name)) continue;
    const before = maskedBody[m.index - 1];
    if (before === "." && maskedBody[m.index - 2] !== ".") continue;
    let j = m.index + name.length;
    while (maskedBody[j] === " " || maskedBody[j] === "\t") j++;
    if (maskedBody[j] === "(") continue; // real calls are handled by extractCalls
    if (maskedBody[j] === ":" && maskedBody[j + 1] !== ":" && before !== "?") continue; // object key / type annotation
    out.add(name);
  }
  return [...out];
}
