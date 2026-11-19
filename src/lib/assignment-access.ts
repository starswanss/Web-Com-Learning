import type { DocumentData } from '@/lib/db';
import { adminDb } from '@/lib/db/admin';
import { cachedGlobal, invalidateGlobal } from '@/lib/server-cache';

const LIVE_SUBJECTS_KEY = 'live-subject-ids';

/**
 * IDs of the subjects that currently exist. Cached 60 s; the subjects API calls
 * `invalidateLiveSubjects()` whenever a subject is created or deleted.
 */
export async function getLiveSubjectIds(): Promise<Set<string>> {
  return cachedGlobal(LIVE_SUBJECTS_KEY, 60_000, async () => {
    const snap = await adminDb.collection('subjects').get();
    return new Set(snap.docs.map((d) => d.id));
  });
}

export function invalidateLiveSubjects(): void {
  invalidateGlobal(LIVE_SUBJECTS_KEY);
}

/**
 * Deleting a subject leaves its assignments behind, and early test work was
 * created with no subject at all. Teachers only browse work by subject, so
 * these orphans can no longer be seen or removed from the teacher side. Every
 * student/parent/guest view must therefore show only work whose subject still
 * exists.
 */
export function inLiveSubject(assignment: DocumentData, live: Set<string>): boolean {
  const subjectId = assignment.subjectId;
  return typeof subjectId === 'string' && live.has(subjectId);
}

/**
 * A student may access an assignment when it belongs to a subject that still
 * exists AND their class is in the assignment's own `classIds`, or — since
 * visibility is subject-wide — in the `classIds` of the assignment's subject.
 * This mirrors what the student dashboard shows, so a student can always open
 * and submit any assignment listed for their subject, even one originally
 * targeted at a subset of rooms.
 */
export async function studentCanAccessAssignment(
  classId: string | undefined,
  assignment: DocumentData,
): Promise<{ entitled: boolean }> {
  if (!classId) return { entitled: false };
  if (!inLiveSubject(assignment, await getLiveSubjectIds())) return { entitled: false };
  const classIds = (assignment.classIds as string[]) ?? [];
  if (classIds.includes(classId)) return { entitled: true };
  const subjSnap = await adminDb.collection('subjects').doc(assignment.subjectId as string).get();
  const subjClasses = (subjSnap.exists ? (subjSnap.data()?.classIds as string[]) : []) ?? [];
  return { entitled: subjClasses.includes(classId) };
}
