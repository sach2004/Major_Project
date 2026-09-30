import type { ParsedEntity } from "./parser";

export interface RawChunk {
  entityIndex: number | null;
  startLine: number;
  endLine: number;
  content: string;
}

const WINDOW = 60;
const OVERLAP = 8;
const MAX_ENTITY = 120;
const MAX_CHARS = 4000;

function windows(lines: string[], start: number, end: number, entityIndex: number | null, out: RawChunk[]) {
  // start/end are 1-based inclusive
  for (let s = start; s <= end; s += WINDOW - OVERLAP) {
    const e = Math.min(end, s + WINDOW - 1);
    const content = lines.slice(s - 1, e).join("\n");
    if (content.trim().length > 20) out.push({ entityIndex, startLine: s, endLine: e, content: content.slice(0, MAX_CHARS) });
    if (e >= end) break;
  }
}

/** Entity-aligned chunking: top-level entities become chunks, gaps become module chunks. */
export function chunkFile(content: string, entities: ParsedEntity[]): RawChunk[] {
  const lines = content.split("\n");
  const out: RawChunk[] = [];
  const top = entities
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.parentIndex === null)
    .sort((a, b) => a.e.startLine - b.e.startLine);

  if (!top.length) {
    windows(lines, 1, lines.length, null, out);
    return out;
  }
  let cursor = 1;
  for (const { e, i } of top) {
    if (e.startLine < cursor) continue;
    if (e.startLine - cursor > 3) windows(lines, cursor, e.startLine - 1, null, out);
    const len = e.endLine - e.startLine + 1;
    if (len <= MAX_ENTITY) {
      const text = lines.slice(e.startLine - 1, e.endLine).join("\n");
      out.push({ entityIndex: i, startLine: e.startLine, endLine: e.endLine, content: text.slice(0, MAX_CHARS) });
    } else {
      // big class: chunk each child entity, fill the rest with windows
      const kids = entities
        .map((k, ki) => ({ k, ki }))
        .filter(({ k }) => k.parentIndex === i)
        .sort((a, b) => a.k.startLine - b.k.startLine);
      let c2 = e.startLine;
      for (const { k, ki } of kids) {
        if (k.startLine < c2) continue;
        if (k.startLine - c2 > 3) windows(lines, c2, k.startLine - 1, i, out);
        const klen = k.endLine - k.startLine + 1;
        if (klen <= MAX_ENTITY) {
          out.push({ entityIndex: ki, startLine: k.startLine, endLine: k.endLine, content: lines.slice(k.startLine - 1, k.endLine).join("\n").slice(0, MAX_CHARS) });
        } else windows(lines, k.startLine, k.endLine, ki, out);
        c2 = k.endLine + 1;
      }
      if (e.endLine - c2 > 3) windows(lines, c2, e.endLine, i, out);
    }
    cursor = e.endLine + 1;
  }
  if (lines.length - cursor > 3) windows(lines, cursor, lines.length, null, out);
  return out;
}
