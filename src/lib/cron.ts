/** Minimal 5-field cron (minute hour day-of-month month day-of-week). Supports * , - / */
type Field = Set<number>;

function parseField(expr: string, min: number, max: number): Field {
  const out = new Set<number>();
  for (const part of expr.split(",")) {
    const [range, stepStr] = part.split("/");
    const step = stepStr ? parseInt(stepStr, 10) : 1;
    if (!Number.isFinite(step) || step <= 0) throw new Error(`bad step in ${expr}`);
    let lo = min, hi = max;
    if (range !== "*") {
      const [a, b] = range.split("-").map((x) => parseInt(x, 10));
      if (!Number.isFinite(a)) throw new Error(`bad value in ${expr}`);
      lo = a; hi = Number.isFinite(b) ? b : stepStr ? max : a;
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`out of range in ${expr}`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export interface CronSpec { m: Field; h: Field; dom: Field; mon: Field; dow: Field }

export function parseCron(expr: string): CronSpec {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) throw new Error("cron needs 5 fields");
  const dow = parseField(f[4], 0, 7);
  if (dow.has(7)) dow.add(0);
  return { m: parseField(f[0], 0, 59), h: parseField(f[1], 0, 23), dom: parseField(f[2], 1, 31), mon: parseField(f[3], 1, 12), dow };
}

export function validCron(expr: string): boolean {
  try { parseCron(expr); return true; } catch { return false; }
}

export function matches(spec: CronSpec, d: Date): boolean {
  return spec.m.has(d.getMinutes()) && spec.h.has(d.getHours()) && spec.dom.has(d.getDate()) && spec.mon.has(d.getMonth() + 1) && spec.dow.has(d.getDay());
}

/** Fires fn at every matching minute. Returns a stop function. */
export function schedule(expr: string, fn: () => void): () => void {
  const spec = parseCron(expr);
  let lastKey = "";
  const tick = () => {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    if (key !== lastKey && matches(spec, now)) {
      lastKey = key;
      try { fn(); } catch (e) { console.error("[cron]", e); }
    }
  };
  const t = setInterval(tick, 20_000);
  if (typeof t === "object" && t && "unref" in t) (t as { unref: () => void }).unref();
  return () => clearInterval(t);
}

export function nextRun(expr: string, from = new Date()): Date | null {
  try {
    const spec = parseCron(expr);
    const d = new Date(from.getTime());
    d.setSeconds(0, 0);
    for (let i = 0; i < 60 * 24 * 8; i++) {
      d.setMinutes(d.getMinutes() + 1);
      if (matches(spec, d)) return d;
    }
  } catch { /* ignore */ }
  return null;
}
