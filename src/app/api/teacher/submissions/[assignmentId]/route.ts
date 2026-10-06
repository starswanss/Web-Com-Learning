import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { trackReads, flushReadsIfDue } from '@/lib/read-tracker';

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assignmentId } = await params;

  const [assignmentSnap, submissionsSnap] = await Promise.all([
    adminDb.collection('assignments').doc(assignmentId).get(),
    adminDb.collection('submissions').where('assignmentId', '==', assignmentId).get(),
  ]);

  if (!assignmentSnap.exists || assignmentSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const assignmentData = assignmentSnap.data()!;
  const classIds: string[] = assignmentData.classIds ?? [];
  const submissions = submissionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown> & { studentId?: string; classId?: string; studentEmail?: string }>;
  const emailByUid = new Map<string, string>();

  // Count submissions per class
  const submittedPerClass = new Map<string, number>();
  submissions.forEach((s) => {
    const cid = (s as { classId?: string }).classId ?? '';
    if (cid) submittedPerClass.set(cid, (submittedPerClass.get(cid) ?? 0) + 1);
  });

  // Get total enrolled students per class from users collection
  const totalPerClass = new Map<string, number>();
  const CHUNK = 10;
  for (let i = 0; i < classIds.length; i += CHUNK) {
    const chunk = classIds.slice(i, i + CHUNK);
    const usersSnap = await adminDb
      .collection('users')
      .where('classId', 'in', chunk)
      .where('role', '==', 'student')
      .get();
    usersSnap.docs.forEach((d) => {
      const cid = d.data().classId as string;
      totalPerClass.set(cid, (totalPerClass.get(cid) ?? 0) + 1);
      const email = d.data().email as string | undefined;
      if (email) emailByUid.set(d.id, email);
    });
  }

  // Attach each submitter's email (for PDF export: รหัสประจำตัว = ส่วนหน้าอีเมล)
  submissions.forEach((s) => { if (s.studentId) s.studentEmail = emailByUid.get(s.studentId) ?? ''; });

  const classStats = classIds.map((cid) => ({
    classId: cid,
    submitted: submittedPerClass.get(cid) ?? 0,
    total: totalPerClass.get(cid) ?? 0,
  }));

  // 1 user + assignment + submissions + class-student counts
  const studentCountReads = Array.from(totalPerClass.values()).reduce((a, b) => a + b, 0);
  trackReads(uid, 2 + submissionsSnap.size + studentCountReads);
  await flushReadsIfDue();

  return NextResponse.json({
    assignment: { id: assignmentId, ...assignmentData },
    submissions,
    classStats,
  });
}
