import { adminDb } from '@/lib/db/admin';
import { getActiveTerm } from '@/lib/current-term';
import { submissionInTerm, type TermItem } from '@/lib/term';

/**
 * Assignment ids this student has submitted in the active term.
 *
 * A quest tied to a worksheet (`requiredAssignmentId`) can be claimed only once
 * the student has submitted that worksheet THIS term — so last term's work
 * (untagged or another term) can't be cashed in for XP again.
 */
export async function submittedThisTerm(uid: string): Promise<Set<string>> {
  const [{ academicYear, term }, snap] = await Promise.all([
    getActiveTerm(),
    adminDb.collection('submissions').where('studentId', '==', uid).get(),
  ]);
  const key = `${academicYear}/${term}`;
  return new Set(
    snap.docs
      .map((d) => d.data())
      .filter((s) => submissionInTerm(s as TermItem, key))
      .map((s) => s.assignmentId as string),
  );
}
