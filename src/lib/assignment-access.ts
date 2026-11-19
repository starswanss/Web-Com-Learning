import type { DocumentData } from '@/lib/db';
import { adminDb } from '@/lib/db/admin';

/**
 * A student may access an assignment when their class is in the assignment's
 * own `classIds`, OR — since visibility is subject-wide — in the `classIds` of
 * the assignment's subject. This mirrors what the student dashboard shows, so a
 * student can always open and submit any assignment listed for their subject,
 * even one originally targeted at a subset of rooms.
 *
 * Returns the entitlement plus how many extra database reads it cost (0 when
 * the fast `classIds` path matched, 1 when the subject doc had to be fetched)
 * so callers can keep their read-tracking accurate.
 */
export async function studentCanAccessAssignment(
  classId: string | undefined,
  assignment: DocumentData,
): Promise<{ entitled: boolean; reads: number }> {
  if (!classId) return { entitled: false, reads: 0 };
  const classIds = (assignment.classIds as string[]) ?? [];
  if (classIds.includes(classId)) return { entitled: true, reads: 0 };
  if (assignment.subjectId) {
    const subjSnap = await adminDb.collection('subjects').doc(assignment.subjectId as string).get();
    const subjClasses = (subjSnap.exists ? (subjSnap.data()?.classIds as string[]) : []) ?? [];
    return { entitled: subjClasses.includes(classId), reads: 1 };
  }
  return { entitled: false, reads: 0 };
}
