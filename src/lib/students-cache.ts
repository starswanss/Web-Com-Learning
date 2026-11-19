import { adminDb } from '@/lib/db/admin';
import { cachedGlobal } from '@/lib/server-cache';

export interface StudentLite { uid: string; displayName: string; email: string; classId: string; subjectId: string | null }

/**
 * All students, read ONCE and shared (cached 2 min) across every teacher view
 * that needs the roster — gradebook, grades, submissions, submission-stats, etc.
 * Previously each of those re-queried ~400 student docs on every load; now they
 * share a single cached read. Invalidated by invalidateLeaderboards() (which
 * clears the `students:` prefix) on roster/class/xp changes.
 */
export async function getAllStudents(): Promise<StudentLite[]> {
  return cachedGlobal('students:all', 120_000, async () => {
    const snap = await adminDb.collection('users').where('role', '==', 'student').get();
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        displayName: (data.displayName as string) ?? '',
        email: (data.email as string) ?? '',
        classId: (data.classId as string) ?? '',
        subjectId: (data.subjectId as string) ?? null,
      };
    });
  });
}

/** Students in the given classes, from the shared cached roster. */
export async function getStudentsInClasses(classIds: string[]): Promise<StudentLite[]> {
  if (classIds.length === 0) return [];
  const set = new Set(classIds);
  return (await getAllStudents()).filter((s) => set.has(s.classId));
}

/** Count of students per class (for totals) — computed in memory, zero extra reads. */
export async function studentCountByClass(classIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const set = new Set(classIds);
  for (const s of await getAllStudents()) {
    if (set.has(s.classId)) map.set(s.classId, (map.get(s.classId) ?? 0) + 1);
  }
  return map;
}
