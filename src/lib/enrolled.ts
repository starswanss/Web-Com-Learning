import { adminDb } from '@/lib/firebase/admin';

/**
 * From a set of student uids, return only those who are CURRENTLY enrolled:
 * the live user doc still exists, is a student, and has a classId. Students
 * wiped on a term/year reset keep their submissions as history, but their old
 * ungraded work must not be re-graded — otherwise a "ตรวจ AI" of 20 live
 * submissions also burns AI calls on 100+ ghost submissions from past terms.
 *
 * Mirrors the live-roster filter in GET /api/teacher/submissions/[assignmentId].
 */
export async function getEnrolledStudentIds(studentIds: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(studentIds.filter((v): v is string => !!v)));
  const enrolled = new Set<string>();
  const CHUNK = 30; // Firestore 'in' query cap
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const snap = await adminDb.collection('users').where('__name__', 'in', chunk).get();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.role === 'student' && (data.classId as string)) enrolled.add(d.id);
    });
  }
  return enrolled;
}
