import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { cachedGlobal } from '@/lib/server-cache';
import { filterByTerm } from '@/lib/term';

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

export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get('subject');
  const term = searchParams.get('term');

  const result = await cachedGlobal(
    `gradebook:${uid}:${subjectId ?? 'all'}:${term ?? 'all'}`,
    STATS_TTL,
    () => computeGradebook(uid, subjectId, term),
  );
  return NextResponse.json(result);
}

async function computeGradebook(uid: string, subjectId: string | null, term: string | null) {
  // 1. Get all assignments for this teacher
  const assignmentsSnap = await adminDb
    .collection('assignments')
    .where('teacherId', '==', uid)
    .get();

  let assignments = assignmentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{
    id: string;
    title: string;
    subjectId?: string;
    classIds: string[];
    contentType?: string;
    academicYear?: number | null;
    term?: number | null;
    createdAt?: { _seconds?: number; seconds?: number };
  }>;

  // Only show ใบงาน (worksheet) and แบบทดสอบ (quiz)
  assignments = assignments.filter((a) =>
    ['worksheet', 'quiz'].includes(a.contentType ?? 'worksheet')
  );

  if (subjectId) {
    assignments = assignments.filter((a) => a.subjectId === subjectId);
  }
  assignments = filterByTerm(assignments, term);

  if (assignments.length === 0) {
    return { assignments: [], students: [] };
  }

  // Sort by creation date ascending (oldest → newest = left → right)
  assignments.sort((a, b) => {
    const aT = a.createdAt?._seconds ?? a.createdAt?.seconds ?? 0;
    const bT = b.createdAt?._seconds ?? b.createdAt?.seconds ?? 0;
    return aT - bT;
  });

  // 2. Collect all classIds across assignments
  const allClassIds = Array.from(
    new Set(assignments.flatMap((a) => a.classIds ?? []))
  );

  // 3. Fetch students in those classes (chunked by 10 for Firestore 'in' limit)
  const CHUNK = 10;
  const studentMap = new Map<string, { uid: string; displayName: string; email: string; classId: string }>();

  for (let i = 0; i < allClassIds.length; i += CHUNK) {
    const chunk = allClassIds.slice(i, i + CHUNK);
    const usersSnap = await adminDb
      .collection('users')
      .where('classId', 'in', chunk)
      .where('role', '==', 'student')
      .get();
    usersSnap.docs.forEach((d) => {
      const data = d.data();
      studentMap.set(d.id, {
        uid: d.id,
        displayName: (data.displayName as string) ?? '',
        email: (data.email as string) ?? '',
        classId: data.classId as string,
      });
    });
  }

  // 4. Fetch submissions for all assignments (chunked by 30)
  const assignmentIds = assignments.map((a) => a.id);
  // submissionsIndex: studentId -> assignmentId -> { submissionId, score, status }
  const submissionsIndex = new Map<
    string,
    Map<string, { submissionId: string; score: number | null; status: string }>
  >();

  for (let i = 0; i < assignmentIds.length; i += 30) {
    const chunk = assignmentIds.slice(i, i + 30);
    const subsSnap = await adminDb
      .collection('submissions')
      .where('assignmentId', 'in', chunk)
      .get();
    subsSnap.docs.forEach((d) => {
      const data = d.data();
      const sid = data.studentId as string;
      const aid = data.assignmentId as string;
      if (!submissionsIndex.has(sid)) submissionsIndex.set(sid, new Map());
      submissionsIndex.get(sid)!.set(aid, {
        submissionId: d.id,
        score: data.score as number | null,
        status: data.status as string,
      });
    });
  }

  // 5. Build student rows
  const students = Array.from(studentMap.values()).map((s) => ({
    ...s,
    submissions: Object.fromEntries(submissionsIndex.get(s.uid)?.entries() ?? []),
  }));

  students.sort((a, b) => {
    const classCmp = a.classId.localeCompare(b.classId);
    if (classCmp !== 0) return classCmp;
    return a.displayName.localeCompare(b.displayName, 'th');
  });

  return {
    assignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      classIds: a.classIds,
    })),
    students,
  };
}
