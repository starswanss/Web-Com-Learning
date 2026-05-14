import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';

async function getStudentSession() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    if (data.role !== 'student' || !data.classId) return null;
    return { uid: decoded.uid, classId: data.classId as string };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const student = await getStudentSession();
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subjectId = new URL(req.url).searchParams.get('subject');

  const base = adminDb.collection('assignments').where('classIds', 'array-contains', student.classId);
  const filtered = subjectId ? base.where('subjectId', '==', subjectId) : base;

  const [assignmentsSnap, submissionsSnap] = await Promise.all([
    filtered.get(),
    adminDb.collection('submissions').where('studentId', '==', student.uid).get(),
  ]);

  const submissionMap = new Map(
    submissionsSnap.docs.map((d) => [d.data().assignmentId as string, { id: d.id, ...d.data() }])
  );

  const assignments = assignmentsSnap.docs
    .map((d) => ({ id: d.id, ...d.data(), submission: submissionMap.get(d.id) ?? null }))
    .sort((a, b) => {
      const ta = (a as Record<string, unknown> & { dueDate?: { _seconds?: number } }).dueDate?._seconds ?? 0;
      const tb = (b as Record<string, unknown> & { dueDate?: { _seconds?: number } }).dueDate?._seconds ?? 0;
      return tb - ta;
    });

  return NextResponse.json(assignments);
}
