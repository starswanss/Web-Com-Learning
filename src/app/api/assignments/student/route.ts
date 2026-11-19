import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { getLiveSubjectIds, inLiveSubject, studentSubjectId } from '@/lib/assignment-access';

async function getStudentUid(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const uid = await getStudentUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userSnap = await adminDb.collection('users').doc(uid).get();
  if (!userSnap.exists || userSnap.data()?.role !== 'student') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only the subject the student enrolled in — the same list as the dashboard.
  const liveSubjects = await getLiveSubjectIds();
  const subjectId = studentSubjectId(userSnap.data()!, new URL(req.url).searchParams.get('subject'), liveSubjects);
  if (!subjectId) return NextResponse.json([]);

  const [assignmentsSnap, submissionsSnap] = await Promise.all([
    adminDb.collection('assignments').where('subjectId', '==', subjectId).get(),
    adminDb.collection('submissions').where('studentId', '==', uid).get(),
  ]);

  const submissionMap = new Map(
    submissionsSnap.docs.map((d) => [d.data().assignmentId as string, { id: d.id, ...d.data() }])
  );

  const assignments = assignmentsSnap.docs
    .filter((d) => inLiveSubject(d.data(), liveSubjects))
    .map((d) => ({ id: d.id, ...d.data(), submission: submissionMap.get(d.id) ?? null }))
    // Locked work stays hidden until unlocked, as on the dashboard.
    .filter((a) => (a as { isOpen?: boolean | null }).isOpen !== false || a.submission)
    .sort((a, b) => {
      const ta = (a as Record<string, unknown> & { dueDate?: { _seconds?: number } }).dueDate?._seconds ?? 0;
      const tb = (b as Record<string, unknown> & { dueDate?: { _seconds?: number } }).dueDate?._seconds ?? 0;
      return tb - ta;
    });

  return NextResponse.json(assignments);
}
