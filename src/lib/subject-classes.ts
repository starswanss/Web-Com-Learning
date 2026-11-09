import { adminDb } from '@/lib/firebase/admin';
import { cachedGlobal } from '@/lib/server-cache';

/**
 * A teacher's subjects → their rooms (classIds). Assignments are subject-wide:
 * a student can open and submit any worksheet in their subject regardless of the
 * rooms frozen on the assignment doc (which are often an old odd/even split).
 * So teacher views must build their student roster from the SUBJECT's rooms, not
 * from assignment.classIds — otherwise current students (who sit in different
 * rooms than the old worksheets targeted) are missed entirely.
 *
 * Cached 2 min and keyed per teacher. Subjects change rarely.
 */
export async function getSubjectClassMap(uid: string): Promise<Map<string, string[]>> {
  return cachedGlobal(`subject-classes:${uid}`, 120_000, async () => {
    const snap = await adminDb.collection('subjects').where('teacherId', '==', uid).get();
    const m = new Map<string, string[]>();
    snap.docs.forEach((d) => m.set(d.id, (d.data().classIds as string[]) ?? []));
    return m;
  });
}

/**
 * Rooms to roster for a teacher view: a single subject's rooms when one is
 * selected, otherwise the union across all the teacher's subjects.
 */
export async function getRosterClassIds(uid: string, subjectId: string | null): Promise<string[]> {
  const map = await getSubjectClassMap(uid);
  if (subjectId) return map.get(subjectId) ?? [];
  return Array.from(new Set(Array.from(map.values()).flat()));
}
