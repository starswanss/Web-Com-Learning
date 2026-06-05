import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Approximate per-student Firestore read accounting.
 *
 * API routes report how many documents they read for a given student; counts
 * are buffered in memory and flushed (coalesced per student) to
 * `readStats/{pacificDate}/students/{uid}` only when the buffer is "due". This
 * keeps the write cost low (~tens of writes/student/day) and avoids hot-doc
 * contention by sharding per student.
 *
 * Caveat: serverless instances can freeze between requests, so a small tail of
 * buffered counts may be lost — the figures are a close estimate, not exact
 * billing. The authoritative project-wide total stays the Cloud Monitoring
 * widget (which reflects real billed reads).
 */

type BufferKey = string; // `${date}|${uid}`

const buffer = new Map<BufferKey, number>();
let lastFlush = Date.now();

const FLUSH_AGE_MS = 20_000;   // flush at least this often while active
const FLUSH_ENTRIES = 25;      // or once this many students are buffered

/** Pacific calendar date (YYYY-MM-DD) — matches the Firestore quota reset. */
export function pacificDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d); // en-CA gives YYYY-MM-DD
}

/** Record `n` document reads attributed to `uid`. Cheap — just buffers. */
export function trackReads(uid: string | null | undefined, n: number): void {
  if (!uid || n <= 0) return;
  const key = `${pacificDate()}|${uid}`;
  buffer.set(key, (buffer.get(key) ?? 0) + n);
}

/**
 * Flush buffered counts if the buffer is old or large enough. Call (awaited) at
 * the end of an instrumented route; most calls are no-ops, so latency is only
 * paid occasionally.
 */
export async function flushReadsIfDue(): Promise<void> {
  if (buffer.size === 0) return;
  if (buffer.size < FLUSH_ENTRIES && Date.now() - lastFlush < FLUSH_AGE_MS) return;
  await flushReads();
}

async function flushReads(): Promise<void> {
  const entries = [...buffer.entries()];
  buffer.clear();
  lastFlush = Date.now();

  try {
    const batch = adminDb.batch();
    for (const [key, n] of entries) {
      const [date, uid] = key.split('|');
      const ref = adminDb.doc(`readStats/${date}/students/${uid}`);
      batch.set(
        ref,
        { uid, date, reads: FieldValue.increment(n), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    await batch.commit();
  } catch {
    // Re-buffer on failure so the counts aren't lost on the next attempt.
    for (const [key, n] of entries) buffer.set(key, (buffer.get(key) ?? 0) + n);
  }
}
