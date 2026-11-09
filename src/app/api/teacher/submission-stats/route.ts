import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { trackReads, flushReadsIfDue } from '@/lib/read-tracker';
import { cachedGlobal } from '@/lib/server-cache';
import { getStudentsInClasses } from '@/lib/students-cache';
import { getSubmitterSets } from '@/lib/assignment-stats';

const STATS_TTL = 120_000; // 2 min; invalidated on submit/grade

async function getTeacherUid(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists || snap.data()?.role !== 'teacher') return null;
    return decoded.uid;
  } catch { return null; }
}

export interface AssignmentStat {
  assignmentId: string;
  title: string;
  totalStudents: number;
  submitted: number;
  notSubmitted: number;
  notSubmittedNames: Array<{ uid: string; name: string; classId: string }>;
}

export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const subjectId = url.searchParams.get('subject');
  const assignmentId = url.searchParams.get('assignmentId');
  const term = url.searchParams.get('term');

  const stats = await cachedGlobal(
    `submission-stats:${uid}:${subjectId ?? 'all'}:${assignmentId ?? 'all'}:${term ?? 'all'}`,
    STATS_TTL,
    () => computeStats(uid, subjectId, assignmentId, term),
  );
  return NextResponse.json(stats);
}

async function computeStats(uid: string, subjectId: string | null, assignmentId: string | null, _term: string | null): Promise<AssignmentStat[]> {
  // Fetch active subjects for this teacher to filter out orphaned assignments
  const subjectsSnap = await adminDb.collection('subjects').where('teacherId', '==', uid).get();
  const activeSubjectIds = new Set(subjectsSnap.docs.map(d => d.id));

  // Fetch assignments by teacher
  let assignmentsQuery = adminDb.collection('assignments').where('teacherId', '==', uid);
  if (subjectId) {
    assignmentsQuery = assignmentsQuery.where('subjectId', '==', subjectId) as typeof assignmentsQuery;
  }

  const assignmentsSnap = await assignmentsQuery.get();
  // Worksheets are a permanent library (reused each term) and the "who hasn't
  // submitted" check is always against the CURRENT roster (getStudentsInClasses
  // below), so we don't hide assignments by term here — wiped past-term students
  // are already off the roster.
  const allAssignments = assignmentsSnap.docs
    .filter(d => {
      const data = d.data();
      const sid = data.subjectId as string | null;
      // Only include assignments whose subjectId exists in active subjects,
      // and skip ใบความรู้ (knowledge) — students never submit those.
      const ct = (data.contentType as string) ?? 'worksheet';
      if (!(sid && activeSubjectIds.has(sid) && ct !== 'knowledge')) return false;
      return true;
    })
    .map(d => ({
      id: d.id,
      title: (d.data().title as string) ?? '',
      classIds: (d.data().classIds as string[]) ?? [],
    }));

  const targetAssignments = assignmentId
    ? allAssignments.filter(a => a.id === assignmentId)
    : allAssignments;

  if (targetAssignments.length === 0) return [];

  // Collect all unique classIds
  const allClassIds = [...new Set(targetAssignments.flatMap(a => a.classIds))];

  // Students across all classes — from the shared cached roster (no per-call read)
  const students = (await getStudentsInClasses(allClassIds)).map(s => ({
    uid: s.uid,
    name: s.displayName,
    classId: s.classId,
  }));

  // Who submitted each assignment — from the precomputed stats docs (a few
  // small reads + one count() per assignment) instead of scanning every
  // submission. The set self-heals when it drifts from the real count.
  const assignmentIds = targetAssignments.map(a => a.id);
  const { sets: submittedMap, reads: statReads } = await getSubmitterSets(assignmentIds);

  // 1 user doc + subjects + assignments + precomputed stats
  // (students come from the shared cache → not counted here)
  trackReads(uid, 1 + subjectsSnap.size + assignmentsSnap.size + statReads);
  await flushReadsIfDue();

  const stats: AssignmentStat[] = targetAssignments.map(a => {
    const classStudents = students.filter(s => a.classIds.includes(s.classId));
    const submittedSet = submittedMap.get(a.id) ?? new Set<string>();
    // Count only students who are actually IN this assignment's classes — a
    // submitter who has since changed class shouldn't inflate the count. This
    // guarantees submitted + notSubmitted === totalStudents.
    const submittedInClass = classStudents.filter(s => submittedSet.has(s.uid));
    const notSubmitted = classStudents.filter(s => !submittedSet.has(s.uid));
    return {
      assignmentId: a.id,
      title: a.title,
      totalStudents: classStudents.length,
      submitted: submittedInClass.length,
      notSubmitted: notSubmitted.length,
      notSubmittedNames: notSubmitted.map(s => ({ uid: s.uid, name: s.name, classId: s.classId })),
    };
  });

  return stats;
}
