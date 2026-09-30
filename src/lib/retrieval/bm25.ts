const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "for", "on", "with", "as", "by", "at", "be",
  "this", "that", "are", "was", "from", "how", "what", "where", "which", "who", "does", "do", "can", "i",
  "me", "my", "we", "our", "you", "your", "if", "then", "else", "return", "const", "let", "var", "def",
  "function", "class", "import", "export", "new", "self", "this", "true", "false", "null", "none", "undefined",
  "public", "private", "static", "void", "int", "string", "about", "explain", "show", "tell", "work", "works",
  "code", "file", "files", "repo", "repository", "please", "there", "when", "why", "into", "used", "use",
]);

/** Split identifiers (camelCase, snake_case, paths) into searchable terms. */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  const words = s.match(/[A-Za-z_][A-Za-z0-9_]*|[0-9]+/g) || [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (lower.length >= 2 && !STOP.has(lower)) out.push(lower);
    const parts = w.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/[\s_]+/);
    if (parts.length > 1) for (const p of parts) {
      const pl = p.toLowerCase();
      if (pl.length >= 2 && !STOP.has(pl)) out.push(pl);
    }
  }
  return out;
}

export class BM25 {
  private df = new Map<string, number>();
  private tfs: Map<string, number>[] = [];
  private lens: number[] = [];
  private avg = 0;
  constructor(docs: string[], private k1 = 1.4, private b = 0.72) {
    let total = 0;
    for (const d of docs) {
      const tf = new Map<string, number>();
      const toks = tokenize(d);
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
      this.tfs.push(tf);
      this.lens.push(toks.length);
      total += toks.length;
    }
    this.avg = total / Math.max(1, docs.length);
  }
  search(query: string, k = 20): { idx: number; score: number }[] {
    const q = [...new Set(tokenize(query))];
    if (!q.length) return [];
    const N = this.tfs.length;
    const scores: { idx: number; score: number }[] = [];
    for (let i = 0; i < N; i++) {
      const tf = this.tfs[i];
      let s = 0;
      for (const t of q) {
        const f = tf.get(t);
        if (!f) continue;
        const df = this.df.get(t) || 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        s += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * this.lens[i]) / this.avg));
      }
      if (s > 0) scores.push({ idx: i, score: s });
    }
    return scores.sort((a, b) => b.score - a.score).slice(0, k);
  }
}
