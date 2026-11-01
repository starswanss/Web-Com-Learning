import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { trackReads, flushReadsIfDue } from '@/lib/read-tracker';
import { getStudentsInClasses } from '@/lib/students-cache';

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
  const submissionsRaw = submissionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<
    Record<string, unknown> & { studentId?: string; studentName?: string; classId?: string; studentEmail?: string }
  >;

  // Keep only submissions from CURRENTLY-ENROLLED students: the live user doc
  // must still exist, be a student, and have a classId. Students wiped on a
  // term/year reset (or deleted) keep their submissions as history, but must
  // not linger on the grading list. Use the live class/name/email too, not the
  // values frozen on the old submission.
  const submitterIds = Array.from(
    new Set(submissionsRaw.map((s) => s.studentId).filter((v): v is string => !!v)),
  );
  const liveInfo = new Map<string, { classId: string; displayName: string; email: string }>();
  const CHUNK = 30;
  let userReads = 0;
  for (let i = 0; i < submitterIds.length; i += CHUNK) {
    const chunk = submitterIds.slice(i, i + CHUNK);
    const usersSnap = await adminDb.collection('users').where('__name__', 'in', chunk).get();
    userReads += usersSnap.size;
    usersSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.role !== 'student') return;
      const classId = (data.classId as string) ?? '';
      if (!classId) return; // wiped / unassigned
      liveInfo.set(d.id, { classId, displayName: (data.displayName as string) ?? '', email: (data.email as string) ?? '' });
    });
  }

  const submissions = submissionsRaw
    .filter((s) => s.studentId && liveInfo.has(s.studentId))
    .map((s) => {
      const info = liveInfo.get(s.studentId!)!;
      return { ...s, classId: info.classId, studentName: s.studentName || info.displayName, studentEmail: info.email };
    });

  // Count submissions per class (from the filtered list, so counts match rows).
  const submittedPerClass = new Map<string, number>();
  submissions.forEach((s) => {
    const cid = s.classId ?? '';
    if (cid) submittedPerClass.set(cid, (submittedPerClass.get(cid) ?? 0) + 1);
  });

  // Total enrolled students per class — from the shared cached roster
  // (no per-request student reads).
  const totalPerClass = new Map<string, number>();
  for (const st of await getStudentsInClasses(classIds)) {
    totalPerClass.set(st.classId, (totalPerClass.get(st.classId) ?? 0) + 1);
  }

  const classStats = classIds.map((cid) => ({
    classId: cid,
    submitted: submittedPerClass.get(cid) ?? 0,
    total: totalPerClass.get(cid) ?? 0,
  }));

  // assignment + submissions + submitter user docs (roster totals are cached).
  trackReads(uid, 2 + submissionsSnap.size + userReads);
  await flushReadsIfDue();

  return NextResponse.json({
    assignment: { id: assignmentId, ...assignmentData },
    submissions,
    classStats,
  });
}
