import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { cachedGlobal } from '@/lib/server-cache';
import { getActiveTerm } from '@/lib/current-term';
import { getAllStudents } from '@/lib/students-cache';
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
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get('subject');
  const term = searchParams.get('term') ?? ''; // 'YYYY/N', or '' = ทุกเทอม
  const result = await cachedGlobal(
    `overview:${uid}:${subjectId ?? 'all'}:${term}`,
    STATS_TTL,
    () => computeOverview(uid, subjectId, term),
  );
  return NextResponse.json(result);
}

/**
 * Worksheets are a permanent library reused every term, so they carry no term.
 * The term lives on each submission (stamped at submit time): every worksheet
 * is listed, and only submissions in the selected term are counted.
 */
async function computeOverview(uid: string, subjectId: string | null, term: string) {
  const base = adminDb.collection('assignments').where('teacherId', '==', uid);
  const assignmentsSnap = subjectId
    ? await base.where('subjectId', '==', subjectId).get()
    : await base.get();
  if (assignmentsSnap.empty) return { activeTerm: null, assignments: [] };

  // Knowledge sheets are read-only — never count submissions for them, even if
  // a few stray "accidental" submissions still exist in the data.
  const countableIds = assignmentsSnap.docs
    .filter((d) => d.data().contentType !== 'knowledge')
    .map((d) => d.id);
  const countMap = new Map<string, { submitted: number; graded: number; reviewed: number }>();
  countableIds.forEach((id) => countMap.set(id, { submitted: 0, graded: 0, reviewed: 0 }));

  const chunks: string[][] = [];
  for (let i = 0; i < countableIds.length; i += 30) chunks.push(countableIds.slice(i, i + 30));
  const subSnaps = await Promise.all(
    chunks.map((c) => adminDb.collection('submissions').where('assignmentId', 'in', c).get()),
  );
  const submittersBy = new Map<string, Set<string>>();
  subSnaps.flatMap((snap) => snap.docs).forEach((d) => {
    const s = d.data();
    if (!submissionInTerm(s as TermItem, term)) return;
    const aid = s.assignmentId as string;
    if (!submittersBy.has(aid)) submittersBy.set(aid, new Set());
    submittersBy.get(aid)!.add(s.studentId as string);
    const c = countMap.get(s.assignmentId as string);
    const st = s.status as 'submitted' | 'graded' | 'reviewed';
    if (c && st in c) c[st] += 1;
  });

  // "ส่งแล้ว X / Y คน": Y is the students enrolled in the subject now, which
  // only describes the active term — earlier terms show X alone.
  const active = await getActiveTerm();
  const activeKey = `${active.academicYear}/${active.term}`;
  // X counts enrolled students who submitted, matching the submission-stats page.
  const enrolledBySubject = new Map<string, Set<string>>();
  if (term === activeKey) {
    for (const st of await getAllStudents()) {
      if (!st.subjectId) continue;
      if (!enrolledBySubject.has(st.subjectId)) enrolledBySubject.set(st.subjectId, new Set());
      enrolledBySubject.get(st.subjectId)!.add(st.uid);
    }
  }

  const assignments = assignmentsSnap.docs.map((d) => {
    const data = d.data();
    const counts = countMap.get(d.id) ?? { submitted: 0, graded: 0, reviewed: 0 };
    const isKnowledge = data.contentType === 'knowledge';
    return {
      id: d.id,
      title: data.title,
      contentType: data.contentType ?? 'worksheet',
      isOpen: data.isOpen !== false,
      unit: data.unit ?? null,
      dueDate: data.dueDate ?? null,
      classIds: data.classIds ?? [],
      driveWebViewLink: data.driveWebViewLink ?? null,
      createdAt: (data.createdAt?.toMillis?.() ?? 0) as number,
      submittedCount: counts.submitted,
      gradedCount: counts.graded,
      reviewedCount: counts.reviewed,
      totalSubmissions: counts.submitted + counts.graded + counts.reviewed,
      ...(() => {
        const roster = isKnowledge ? undefined : enrolledBySubject.get(data.subjectId as string);
        if (!roster) return { enrolled: null, enrolledSubmitted: null };
        const subs = submittersBy.get(d.id) ?? new Set<string>();
        return { enrolled: roster.size, enrolledSubmitted: [...subs].filter((u) => roster.has(u)).length };
      })(),
    };
  });
  assignments.sort((a, b) => b.createdAt - a.createdAt);
  return { activeTerm: activeKey, assignments };
}
