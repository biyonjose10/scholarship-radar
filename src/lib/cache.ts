// Short-lived memory cache for fetched pages and Reader output. On Vercel it lives only
// as long as a warm server instance, so it speeds up repeat runs and saves Tavily credits
// without storing anything about students: keys are URLs and page hashes.
const TTL_MS = 6 * 3600 * 1000;
const MAX_ENTRIES = 200;

const store = new Map<string, { at: number; value: unknown }>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown): void {
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value!);
  store.set(key, { at: Date.now(), value });
}

// Small, fast string hash (FNV-1a) so a changed page never reuses an old reading.
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
