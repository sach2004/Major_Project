import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { getSettings } from "../settings";

export type Provider = "openai" | "gemini";

const OPENAI_CHAT = ["gpt-4.1-mini", "gpt-5-mini", "gpt-4o-mini"];
const GEMINI_CHAT = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-flash"];
const OPENAI_EMBED = "text-embedding-3-small";
const GEMINI_EMBED = ["gemini-embedding-001", "text-embedding-004"];
const GEMINI_DIMS = 768;

export interface CompleteOpts {
  system: string;
  prompt: string;
  json?: boolean;
}

export class NoProviderError extends Error {
  constructor() {
    super("No LLM API key configured. Add a Gemini or OpenAI key in Settings.");
  }
}

let openaiClient: { key: string; c: OpenAI } | null = null;
let geminiClient: { key: string; c: GoogleGenAI } | null = null;

function oa(key: string) {
  if (!openaiClient || openaiClient.key !== key) openaiClient = { key, c: new OpenAI({ apiKey: key, maxRetries: 2, timeout: 120_000 }) };
  return openaiClient.c;
}
function gm(key: string) {
  if (!geminiClient || geminiClient.key !== key) geminiClient = { key, c: new GoogleGenAI({ apiKey: key }) };
  return geminiClient.c;
}

export async function providerOrder(): Promise<Provider[]> {
  const s = await getSettings();
  const has: Record<Provider, boolean> = { openai: !!s.openaiKey, gemini: !!s.geminiKey };
  let order: Provider[] = s.preferred === "openai" ? ["openai", "gemini"] : ["gemini", "openai"];
  order = order.filter((p) => has[p]);
  return order;
}

export async function hasLLM(): Promise<boolean> {
  return (await providerOrder()).length > 0;
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}
const isModelMissing = (e: unknown) => /not.?found|404|does not exist|unsupported model|is not supported|model_not_found|invalid model/i.test(errText(e));
const isRateLimit = (e: unknown) => /429|rate.?limit|quota|resource.?exhausted|overloaded|503|unavailable/i.test(errText(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chatModels(p: Provider): Promise<string[]> {
  const s = await getSettings();
  const custom = p === "openai" ? s.openaiModel : s.geminiModel;
  const base = p === "openai" ? OPENAI_CHAT : GEMINI_CHAT;
  return custom ? [custom, ...base.filter((m) => m !== custom)] : base;
}

async function keyFor(p: Provider): Promise<string> {
  const s = await getSettings();
  const k = p === "openai" ? s.openaiKey : s.geminiKey;
  if (!k) throw new Error(`${p} key missing`);
  return k;
}

async function completeWith(p: Provider, model: string, o: CompleteOpts): Promise<string> {
  const key = await keyFor(p);
  if (p === "openai") {
    const r = await oa(key).chat.completions.create({
      model,
      messages: [
        { role: "system", content: o.system },
        { role: "user", content: o.prompt },
      ],
      ...(o.json ? { response_format: { type: "json_object" as const } } : {}),
    });
    return r.choices[0]?.message?.content ?? "";
  }
  const r = await gm(key).models.generateContent({
    model,
    contents: o.prompt,
    config: { systemInstruction: o.system, ...(o.json ? { responseMimeType: "application/json" } : {}) },
  });
  return r.text ?? "";
}

/** Try each configured provider (and model fallbacks) until one succeeds. */
export async function complete(o: CompleteOpts): Promise<{ text: string; provider: Provider; model: string }> {
  const order = await providerOrder();
  if (!order.length) throw new NoProviderError();
  const errors: string[] = [];
  for (const p of order) {
    for (const model of await chatModels(p)) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const text = await completeWith(p, model, o);
          return { text, provider: p, model };
        } catch (e) {
          if (isRateLimit(e) && attempt < 2) { await sleep(1500 * (attempt + 1) ** 2); continue; }
          errors.push(`${p}/${model}: ${errText(e).slice(0, 200)}`);
          break;
        }
      }
      const last = errors[errors.length - 1] || "";
      if (!isModelMissing(last)) break; // auth/network problems: skip remaining models of this provider
    }
  }
  throw new Error(`All LLM providers failed — ${errors.join(" | ")}`);
}

export function parseJSON<T>(text: string): T | null {
  const t = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(t) as T; } catch { /* fallthrough */ }
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s !== -1 && e > s) {
    try { return JSON.parse(t.slice(s, e + 1)) as T; } catch { /* ignore */ }
  }
  return null;
}

export async function completeJSON<T>(o: CompleteOpts): Promise<{ data: T | null; provider: Provider; raw: string }> {
  const r = await complete({ ...o, json: true });
  return { data: parseJSON<T>(r.text), provider: r.provider, raw: r.text };
}

/** Streaming completion. Falls back to the next provider only if nothing was emitted yet. */
export async function* streamText(o: CompleteOpts): AsyncGenerator<{ provider?: Provider; model?: string; delta?: string }> {
  const order = await providerOrder();
  if (!order.length) throw new NoProviderError();
  const errors: string[] = [];
  for (const p of order) {
    const key = await keyFor(p);
    for (const model of await chatModels(p)) {
      let emitted = false;
      try {
        if (p === "openai") {
          const s = await oa(key).chat.completions.create({
            model,
            stream: true,
            messages: [
              { role: "system", content: o.system },
              { role: "user", content: o.prompt },
            ],
          });
          for await (const ch of s) {
            const d = ch.choices?.[0]?.delta?.content;
            if (d) {
              if (!emitted) { emitted = true; yield { provider: p, model }; }
              yield { delta: d };
            }
          }
        } else {
          const s = await gm(key).models.generateContentStream({ model, contents: o.prompt, config: { systemInstruction: o.system } });
          for await (const ch of s) {
            const d = ch.text;
            if (d) {
              if (!emitted) { emitted = true; yield { provider: p, model }; }
              yield { delta: d };
            }
          }
        }
        if (emitted) return;
        errors.push(`${p}/${model}: empty response`);
      } catch (e) {
        if (emitted) {
          yield { delta: `\n\n_(stream interrupted: ${errText(e).slice(0, 160)})_` };
          return;
        }
        errors.push(`${p}/${model}: ${errText(e).slice(0, 200)}`);
        if (!isModelMissing(e)) break;
      }
    }
  }
  throw new Error(`All LLM providers failed — ${errors.join(" | ")}`);
}

/* ------------------------------ embeddings ------------------------------ */

function normalize(v: ArrayLike<number>): Float32Array {
  const out = new Float32Array(v.length);
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

async function embedWith(p: Provider, model: string, texts: string[], task: "doc" | "query"): Promise<Float32Array[]> {
  const key = await keyFor(p);
  if (p === "openai") {
    const r = await oa(key).embeddings.create({ model, input: texts.map((t) => t.slice(0, 8000)) });
    return r.data.sort((a, b) => a.index - b.index).map((d) => normalize(d.embedding));
  }
  const r = await gm(key).models.embedContent({
    model,
    contents: texts.map((t) => t.slice(0, 8000)),
    config: {
      outputDimensionality: GEMINI_DIMS,
      taskType: task === "doc" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
    },
  });
  const embs = r.embeddings ?? [];
  if (embs.length !== texts.length) throw new Error(`Gemini returned ${embs.length} embeddings for ${texts.length} inputs`);
  return embs.map((e) => normalize(e.values ?? []));
}

/** "provider:model" identifier for an embedding space */
export type EmbedSpace = string;

export async function pickEmbedSpace(): Promise<EmbedSpace | null> {
  const order = await providerOrder();
  if (!order.length) return null;
  return order[0] === "openai" ? `openai:${OPENAI_EMBED}` : `gemini:${GEMINI_EMBED[0]}`;
}

export async function spaceAvailable(space: string | null | undefined): Promise<boolean> {
  if (!space) return false;
  const p = space.split(":")[0] as Provider;
  return (await providerOrder()).includes(p);
}

/**
 * Embed a batch in a given space. Batches internally and retries on rate limits.
 * Gemini model fallback is handled by returning the space that actually worked.
 */
export async function embedTexts(texts: string[], space: EmbedSpace, task: "doc" | "query" = "doc", onBatch?: (done: number) => void | Promise<void>): Promise<{ vectors: Float32Array[]; space: EmbedSpace }> {
  let [p, model] = space.split(":") as [Provider, string];
  const batch = p === "openai" ? 96 : 50;
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += batch) {
    const slice = texts.slice(i, i + batch);
    let done = false;
    for (let attempt = 0; attempt < 5 && !done; attempt++) {
      try {
        out.push(...(await embedWith(p, model, slice, task)));
        done = true;
      } catch (e) {
        if (p === "gemini" && isModelMissing(e) && i === 0) {
          const next = GEMINI_EMBED[GEMINI_EMBED.indexOf(model) + 1];
          if (next) { model = next; attempt--; continue; }
        }
        if (isRateLimit(e) && attempt < 4) { await sleep(2000 * (attempt + 1) ** 2); continue; }
        throw e;
      }
    }
    if (onBatch) await onBatch(out.length);
  }
  return { vectors: out, space: `${p}:${model}` };
}

export async function testProvider(p: Provider): Promise<{ ok: boolean; message: string }> {
  try {
    await keyFor(p);
    const models = await chatModels(p);
    let lastErr = "";
    for (const m of models) {
      try {
        const t = await completeWith(p, m, { system: "Reply with the single word: ok", prompt: "ping" });
        return { ok: true, message: `Connected · ${m} replied "${t.trim().slice(0, 20)}"` };
      } catch (e) {
        lastErr = errText(e);
        if (!isModelMissing(e)) break;
      }
    }
    return { ok: false, message: lastErr.slice(0, 300) };
  } catch (e) {
    return { ok: false, message: errText(e).slice(0, 300) };
  }
}
