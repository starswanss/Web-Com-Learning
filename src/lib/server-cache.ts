/**
 * Tiny in-memory TTL cache for read-heavy "global" Firestore docs (level
 * settings, logo, etc.) that are identical for every user.
 *
 * On a warm serverless instance this collapses N identical reads within the
 * TTL window down to a single Firestore read — e.g. 400 students opening the
 * dashboard no longer trigger 400 reads of `levelSettings/global`. Each warm
 * instance keeps its own copy; correctness is preserved because the TTL is
 * short and writes simply become visible after at most `ttlMs`.
 *
 * Use ONLY for data that is the same for all callers. Never cache per-user data
 * here (it has no per-user key).
 */

type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();

/**
 * Return the cached value for `key`, or call `loader` (once) and cache its
 * result for `ttlMs`. Concurrent callers within the window share the result.
 */
export async function cachedGlobal<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) return hit.value;

  const value = await loader();
  store.set(key, { value, expires: now + ttlMs });
  return value;
}

/** Drop a cached entry immediately (call after a write so the next read is fresh). */
export function invalidateGlobal(key: string): void {
  store.delete(key);
}
