import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
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
  // subjectId → its rooms. Assignments are subject-wide, so "who should submit"
  // is every student in the assignment's SUBJECT — not the rooms frozen on the
  // assignment doc (often an old odd/even split that misses current students).
  const subjectClassIds = new Map<string, string[]>();
  subjectsSnap.docs.forEach(d => subjectClassIds.set(d.id, (d.data().classIds as string[]) ?? []));

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
      subjectId: (d.data().subjectId as string | null) ?? null,
    }));

  const targetAssignments = assignmentId
    ? allAssignments.filter(a => a.id === assignmentId)
    : allAssignments;

  if (targetAssignments.length === 0) return [];

  // Roster = every student across the teacher's subjects' rooms (loaded once).
  const rosterClassIds = Array.from(new Set(Array.from(subjectClassIds.values()).flat()));
  const students = (await getStudentsInClasses(rosterClassIds)).map(s => ({
    uid: s.uid,
    name: s.displayName,
    classId: s.classId,
  }));

  // Who submitted each assignment — from the precomputed stats docs (a few
  // small reads + one count() per assignment) instead of scanning every
  // submission. The set self-heals when it drifts from the real count.
  const assignmentIds = targetAssignments.map(a => a.id);
  const { sets: submittedMap } = await getSubmitterSets(assignmentIds);

  // (students come from the shared cache → not counted here)

  const stats: AssignmentStat[] = targetAssignments.map(a => {
    // Students expected to submit = everyone in the assignment's SUBJECT.
    const rooms = new Set(subjectClassIds.get(a.subjectId ?? '') ?? []);
    const classStudents = students.filter(s => rooms.has(s.classId));
    const submittedSet = submittedMap.get(a.id) ?? new Set<string>();
    // Count only students currently in the subject — a submitter who has since
    // left shouldn't inflate the count. Guarantees submitted + notSubmitted ===
    // totalStudents.
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
