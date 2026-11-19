import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { cachedGlobal } from '@/lib/server-cache';
import { getAllStudents } from '@/lib/students-cache';
import { getActiveTerm } from '@/lib/current-term';
import { submissionInTerm, type TermItem } from '@/lib/term';

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
  /** A past term: today's roster says nothing about who should have submitted
   *  then, so only the submitted count is meaningful. */
  pastTerm: boolean;
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

async function computeStats(uid: string, subjectId: string | null, assignmentId: string | null, term: string | null): Promise<AssignmentStat[]> {
  const subjectsSnap = await adminDb.collection('subjects').where('teacherId', '==', uid).get();
  const activeSubjectIds = new Set(subjectsSnap.docs.map(d => d.id));

  let assignmentsQuery = adminDb.collection('assignments').where('teacherId', '==', uid);
  if (subjectId) {
    assignmentsQuery = assignmentsQuery.where('subjectId', '==', subjectId) as typeof assignmentsQuery;
  }
  const assignmentsSnap = await assignmentsQuery.get();

  // Only work in a subject that still exists, and never ใบความรู้ (nothing to submit).
  const allAssignments = assignmentsSnap.docs
    .filter(d => {
      const data = d.data();
      const sid = data.subjectId as string | null;
      const ct = (data.contentType as string) ?? 'worksheet';
      return !!sid && activeSubjectIds.has(sid) && ct !== 'knowledge';
    })
    .map(d => ({
      id: d.id,
      title: (d.data().title as string) ?? '',
      subjectId: d.data().subjectId as string,
      isOpen: d.data().isOpen !== false,
    }));
  const targetAssignments = assignmentId
    ? allAssignments.filter(a => a.id === assignmentId)
    : allAssignments;
  if (targetAssignments.length === 0) return [];

  // Worksheets are reused every term and carry no term; the term lives on each
  // submission. Who submitted = submissions made in the selected term.
  const termKey = term ?? '';
  const submittedMap = new Map<string, Set<string>>();
  const ids = targetAssignments.map(a => a.id);
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await adminDb.collection('submissions').where('assignmentId', 'in', ids.slice(i, i + 30)).get();
    snap.docs.forEach(d => {
      const sub = d.data();
      if (!submissionInTerm(sub as TermItem, termKey)) return;
      const aid = sub.assignmentId as string;
      if (!submittedMap.has(aid)) submittedMap.set(aid, new Set());
      submittedMap.get(aid)!.add(sub.studentId as string);
    });
  }

  // Expected submitters = students enrolled in the assignment's subject now.
  // Both subjects share every room, so the roster goes by enrolment, not room.
  // That roster only describes the active term (and ทุกเทอม); for an earlier
  // term report the submitted count alone.
  const active = await getActiveTerm();
  const pastTerm = termKey !== '' && termKey !== `${active.academicYear}/${active.term}`;
  const students = await getAllStudents();

  return targetAssignments
    .map(a => {
      const submittedSet = submittedMap.get(a.id) ?? new Set<string>();
      if (pastTerm) {
        return {
          assignmentId: a.id, title: a.title, isOpen: a.isOpen,
          totalStudents: submittedSet.size, submitted: submittedSet.size,
          notSubmitted: 0, notSubmittedNames: [], pastTerm: true,
        };
      }
      const enrolled = students.filter(s => s.subjectId === a.subjectId);
      const notSubmitted = enrolled.filter(s => !submittedSet.has(s.uid));
      return {
        assignmentId: a.id, title: a.title, isOpen: a.isOpen,
        totalStudents: enrolled.length,
        submitted: enrolled.length - notSubmitted.length,
        notSubmitted: notSubmitted.length,
        notSubmittedNames: notSubmitted.map(s => ({ uid: s.uid, name: s.displayName, classId: s.classId })),
        pastTerm: false,
      };
    })
    // Locked work nobody submitted in this term can't be submitted yet (or was
    // last term's) — listing it as "ค้าง" everyone would be noise.
    .filter(st => st.isOpen || st.submitted > 0)
    .map(({ isOpen: _open, ...st }) => { void _open; return st; });
}
