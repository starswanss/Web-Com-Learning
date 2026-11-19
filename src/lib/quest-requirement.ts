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
  return (await studentSubmissions(uid)).thisTerm;
}

/**
 * The student's submitted assignment ids: `thisTerm` (active term only) and
 * `ever` (any term). A worksheet in `ever` but not `thisTerm` was done in an
 * earlier term and can't be submitted again, so its quest can never be met.
 */
export async function studentSubmissions(uid: string): Promise<{ thisTerm: Set<string>; ever: Set<string> }> {
  const [{ academicYear, term }, snap] = await Promise.all([
    getActiveTerm(),
    adminDb.collection('submissions').where('studentId', '==', uid).get(),
  ]);
  const key = `${academicYear}/${term}`;
  const subs = snap.docs.map((d) => d.data());
  return {
    thisTerm: new Set(subs.filter((s) => submissionInTerm(s as TermItem, key)).map((s) => s.assignmentId as string)),
    ever: new Set(subs.map((s) => s.assignmentId as string)),
  };
}
