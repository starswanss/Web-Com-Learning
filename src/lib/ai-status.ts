/**
 * Tracks whether AI grading has hit its provider's DAILY quota, so the teacher
 * dashboard can show "หมดโควตาวันนี้" and, once the quota rolls over, "กลับมา
 * ใช้ได้แล้ว". Free tiers (Groq ~200k tokens/day, OpenRouter 50-1000 req/day)
 * reset on the UTC day boundary.
 *
 * We only WRITE on the rare daily-limit event — never per grade — so this adds
 * no meaningful Firestore cost. State is otherwise derived from the timestamp.
 */
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from '@/lib/db';

const DOC = 'system/aiStatus';
const RESET_WINDOW_MS = 36 * 60 * 60 * 1000; // stop showing "reset" after ~1.5 days

/** First 00:00 UTC strictly after t — when a daily quota is expected to reset. */
function nextUtcMidnight(t: Date): Date {
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1, 0, 0, 0));
}

/** True when the error looks like a DAILY cap (per-day), not a per-minute throttle. */
export function isDailyLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /per day|tokens per day|requests per day|TPD|RPD|daily|per-day/i.test(msg);
}

/** Record that AI grading hit its daily quota (best-effort; failures ignored). */
export async function markAiExhausted(): Promise<void> {
  try {
    let provider = 'groq';
    try {
      const cfg = await adminDb.doc('system/aiConfig').get();
      provider = (cfg.exists ? (cfg.data()?.provider as string) : undefined) ?? 'groq';
    } catch { /* keep default */ }
    await adminDb.doc(DOC).set(
      { exhaustedAt: FieldValue.serverTimestamp(), provider },
      { merge: true },
    );
  } catch { /* status is best-effort */ }
}

/** Call from a grading route's catch when a rate-limit error occurs. */
export async function noteAiError(err: unknown): Promise<void> {
  if (isDailyLimit(err)) await markAiExhausted();
}

export interface AiStatus {
  state: 'ok' | 'exhausted' | 'reset';
  provider?: string;
  resetAt?: string;   // ISO — when the quota resets (for 'exhausted')
  exhaustedAt?: string;
}

/**
 * Current AI grading availability, derived from the last daily-limit event:
 *  - ok        → no recent daily cap; grade freely
 *  - exhausted → hit the daily cap today; resets at resetAt
 *  - reset     → the cap has rolled over since; AI is usable again
 */
export async function getAiStatus(): Promise<AiStatus> {
  try {
    const snap = await adminDb.doc(DOC).get();
    const ex = (snap.exists ? snap.data()?.exhaustedAt : undefined) as
      | { toDate?: () => Date } | undefined;
    const exAt = ex?.toDate?.();
    if (!exAt) return { state: 'ok' };

    const provider = (snap.data()?.provider as string) ?? undefined;
    const reset = nextUtcMidnight(exAt);
    const now = Date.now();

    if (now < reset.getTime()) {
      return { state: 'exhausted', provider, resetAt: reset.toISOString(), exhaustedAt: exAt.toISOString() };
    }
    // Quota has rolled over. Surface "กลับมาใช้ได้แล้ว" for a window, then quiet.
    if (now - exAt.getTime() < RESET_WINDOW_MS) {
      return { state: 'reset', provider, exhaustedAt: exAt.toISOString() };
    }
    return { state: 'ok' };
  } catch {
    return { state: 'ok' };
  }
}
