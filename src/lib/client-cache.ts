'use client';

/**
 * Tiny client-side GET cache. Next.js App Router does in-place (SPA) navigation,
 * so this module-level Map survives route changes within a session — revisiting
 * a page within the TTL serves the cached body and fires NO network request,
 * which means ZERO Firestore reads for that revisit. A full reload (F5) clears it.
 *
 * Use only for GETs whose brief staleness is harmless; call `invalidate()` after
 * a mutation (e.g. submitting work) so the next read is fresh.
 */

type Entry = { ts: number; data: unknown };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export async function cachedFetch<T>(url: string, ttlMs = 45_000): Promise<T> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.ts < ttlMs) return hit.data as T;

  // Coalesce concurrent calls for the same URL into one request.
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;

  const p = fetch(url)
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      cache.set(url, { ts: Date.now(), data });
      return data;
    })
    .finally(() => inflight.delete(url));

  inflight.set(url, p);
  return p as Promise<T>;
}

/** Drop cached entries. With no arg clears all; with a prefix clears matching URLs. */
export function invalidate(prefix?: string): void {
  if (!prefix) { cache.clear(); return; }
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
}
