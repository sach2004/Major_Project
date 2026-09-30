/** Tarjan strongly connected components (iterative). Returns SCCs with size > 1. */
export function stronglyConnected(nodes: string[], adj: Map<string, string[]>): string[][] {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];

  for (const start of nodes) {
    if (idx.has(start)) continue;
    const work: { v: string; i: number }[] = [{ v: start, i: 0 }];
    idx.set(start, index); low.set(start, index); index++;
    stack.push(start); onStack.add(start);
    while (work.length) {
      const top = work[work.length - 1];
      const nbrs = adj.get(top.v) || [];
      if (top.i < nbrs.length) {
        const w = nbrs[top.i++];
        if (!idx.has(w)) {
          idx.set(w, index); low.set(w, index); index++;
          stack.push(w); onStack.add(w);
          work.push({ v: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(top.v, Math.min(low.get(top.v)!, idx.get(w)!));
        }
      } else {
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1].v;
          low.set(parent, Math.min(low.get(parent)!, low.get(top.v)!));
        }
        if (low.get(top.v) === idx.get(top.v)) {
          const comp: string[] = [];
          let w: string;
          do {
            w = stack.pop()!;
            onStack.delete(w);
            comp.push(w);
          } while (w !== top.v);
          if (comp.length > 1) out.push(comp);
        }
      }
    }
  }
  return out;
}

/** Shortest representative cycle inside an SCC via BFS from its first node. */
export function sampleCycle(comp: string[], adj: Map<string, string[]>): string[] {
  const set = new Set(comp);
  const start = comp[0];
  const prev = new Map<string, string>();
  const q = [start];
  const seen = new Set([start]);
  while (q.length) {
    const v = q.shift()!;
    for (const w of adj.get(v) || []) {
      if (!set.has(w)) continue;
      if (w === start) {
        const path = [v];
        let c = v;
        while (prev.has(c)) { c = prev.get(c)!; path.push(c); }
        return path.reverse().concat(start);
      }
      if (!seen.has(w)) { seen.add(w); prev.set(w, v); q.push(w); }
    }
  }
  return comp;
}
