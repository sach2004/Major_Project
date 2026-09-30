const g = globalThis as unknown as { __repoCache?: Map<string, { stamp: number; value: Promise<unknown> }> };
const store: Map<string, { stamp: number; value: Promise<unknown> }> = g.__repoCache ?? new Map();
g.__repoCache = store;

/**
 * Per-repo memo cache keyed by the repo's analysis stamp. Concurrent callers share one
 * in-flight load, and a failed load is evicted so the next call retries.
 */
export async function cached<T>(repoId: string, name: string, stamp: number, loader: () => Promise<T>): Promise<T> {
  const k = `${repoId}::${name}`;
  const hit = store.get(k);
  if (hit && hit.stamp === stamp) return hit.value as Promise<T>;
  const value = loader();
  store.set(k, { stamp, value });
  value.catch(() => { if (store.get(k)?.value === value) store.delete(k); });
  return value;
}

export function invalidateRepoCaches(repoId: string) {
  for (const k of [...store.keys()]) if (k.startsWith(`${repoId}::`)) store.delete(k);
}
