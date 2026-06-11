/**
 * Best-effort in-memory sliding-window rate limiter.
 *
 * Guards write endpoints (submit, claim) against rapid-fire abuse / accidental
 * double taps. NOTE: state is per serverless instance, so a burst spread across
 * instances isn't fully capped — pair with the route's own duplicate checks for
 * correctness. This only throttles obvious hammering.
 */

const hits = new Map<string, number[]>();

/** Returns true if the action is allowed, false if the limit is exceeded. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);

  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      const live = v.filter((t) => now - t < windowMs);
      if (live.length === 0) hits.delete(k); else hits.set(k, live);
    }
  }
  return true;
}
