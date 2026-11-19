import { adminDb } from '@/lib/db/admin';
import { FieldValue } from '@/lib/db';

/**
 * Precomputed submission stats per assignment, kept in `assignmentStats/{id}`:
 *   submitterIds: string[]   // distinct studentIds that have a submission
 *
 * This lets the teacher dashboard compute "ส่งแล้ว / ยังไม่ส่ง + รายชื่อ" from a
 * handful of small docs instead of scanning the whole submissions collection
 * (~thousands of docs) on every load. It is maintained incrementally on the few
 * paths that create/remove a submission, and self-heals: getSubmitterSets()
 * verifies each stored set against a cheap count() of the real submissions and
 * rebuilds only when they disagree, so a missed update can never go stale for
 * long.
 */
const COL = 'assignmentStats';

/** A student now has a submission for this assignment. */
export function addSubmitter(assignmentId: string, studentId: string) {
  return adminDb.collection(COL).doc(assignmentId).set(
    { submitterIds: FieldValue.arrayUnion(studentId), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

/** A student's submission was removed. */
export function removeSubmitter(assignmentId: string, studentId: string) {
  return adminDb.collection(COL).doc(assignmentId).set(
    { submitterIds: FieldValue.arrayRemove(studentId), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

/** Add several submitters at once (e.g. bulk-score creating submissions). */
export function addSubmitters(assignmentId: string, studentIds: string[]) {
  if (studentIds.length === 0) return Promise.resolve();
  return adminDb.collection(COL).doc(assignmentId).set(
    { submitterIds: FieldValue.arrayUnion(...studentIds), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

/** Drop the stats doc when its assignment is deleted. */
export function deleteAssignmentStats(assignmentId: string) {
  return adminDb.collection(COL).doc(assignmentId).delete().catch(() => {});
}

/**
 * Submitter studentId sets for many assignments. Reads the small stats docs and
 * verifies each against a count() of the real submissions; mismatched or missing
 * ones are rebuilt by a one-time scan and rewritten. Returns the sets plus the
 * number of database reads performed.
 */
export async function getSubmitterSets(
  assignmentIds: string[],
): Promise<{ sets: Map<string, Set<string>>; reads: number }> {
  const sets = new Map<string, Set<string>>();
  if (assignmentIds.length === 0) return { sets, reads: 0 };

  const subs = adminDb.collection('submissions');
  const statsRefs = assignmentIds.map((id) => adminDb.collection(COL).doc(id));

  const [snaps, counts] = await Promise.all([
    adminDb.getAll(...statsRefs),
    Promise.all(assignmentIds.map((id) => subs.where('assignmentId', '==', id).count().get())),
  ]);
  // getAll stats docs + one count() aggregation per assignment.
  let reads = snaps.length + assignmentIds.length;

  const toRebuild: string[] = [];
  snaps.forEach((snap, i) => {
    const aid = assignmentIds[i];
    const stored = snap.exists && Array.isArray(snap.data()?.submitterIds)
      ? (snap.data()!.submitterIds as string[])
      : null;
    const realCount = counts[i].data().count;
    if (stored && stored.length === realCount) {
      sets.set(aid, new Set(stored));
    } else {
      toRebuild.push(aid);
    }
  });

  for (const aid of toRebuild) {
    const snap = await subs.where('assignmentId', '==', aid).get();
    reads += snap.size;
    const ids = Array.from(new Set(snap.docs.map((d) => d.data().studentId as string).filter(Boolean)));
    sets.set(aid, new Set(ids));
    adminDb.collection(COL).doc(aid).set(
      { submitterIds: ids, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    ).catch(() => {});
  }

  return { sets, reads };
}
