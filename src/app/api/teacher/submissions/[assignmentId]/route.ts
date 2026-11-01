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
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assignmentId } = await params;
  // ?all=1 → include submissions from students who have since been wiped on a
  // term/year reset or deleted (their work is kept as history). Default view
  // shows only currently-enrolled students.
  const includeInactive = new URL(req.url).searchParams.get('all') === '1';

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

  // Default: only currently-enrolled submitters. With ?all=1: everyone, but
  // flag the inactive ones and keep their frozen name/class as history.
  const submissions = submissionsRaw
    .filter((s) => includeInactive || (s.studentId && liveInfo.has(s.studentId)))
    .map((s) => {
      const info = s.studentId ? liveInfo.get(s.studentId) : undefined;
      return info
        ? { ...s, classId: info.classId, studentName: s.studentName || info.displayName, studentEmail: info.email, active: true }
        : { ...s, active: false };
    });

  // Count submissions per class (from the filtered list, so counts match rows).
  const submittedPerClass = new Map<string, number>();
  submissions.forEach((s) => {
    const cid = s.classId ?? '';
    if (cid) submittedPerClass.set(cid, (submittedPerClass.get(cid) ?? 0) + 1);
  });

  // Rooms are driven by where students ACTUALLY are now, not the assignment's
  // original classIds: an assignment is subject-wide, so the roster is every
  // room in its subject. (The old classIds often point at rooms no current
  // student is in, which showed empty "ส่ง 0 คน" chips and hid the real room.)
  let rosterClassIds = classIds;
  let subjectRead = 0;
  const subjectId = assignmentData.subjectId as string | undefined;
  if (subjectId) {
    const subjSnap = await adminDb.collection('subjects').doc(subjectId).get();
    subjectRead = 1;
    const sc = (subjSnap.exists ? (subjSnap.data()?.classIds as string[]) : []) ?? [];
    if (sc.length) rosterClassIds = sc;
  }

  // Enrolled students per class — from the shared cached roster.
  const totalPerClass = new Map<string, number>();
  for (const st of await getStudentsInClasses(rosterClassIds)) {
    totalPerClass.set(st.classId, (totalPerClass.get(st.classId) ?? 0) + 1);
  }

  // Show a chip for every room that has an enrolled student OR a submission,
  // sorted by room number (ม.3/9 before ม.3/10).
  const roomNum = (c: string) => { const m = c.match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : 999; };
  const rooms = new Set<string>();
  totalPerClass.forEach((n, c) => { if (n > 0) rooms.add(c); });
  submittedPerClass.forEach((_, c) => { if (c) rooms.add(c); });
  const classStats = Array.from(rooms)
    .sort((a, b) => roomNum(a) - roomNum(b) || a.localeCompare(b, 'th'))
    .map((cid) => ({
      classId: cid,
      submitted: submittedPerClass.get(cid) ?? 0,
      total: totalPerClass.get(cid) ?? 0,
    }));

  // assignment + submissions + submitter user docs + optional subject
  // (roster totals are cached).
  trackReads(uid, 2 + submissionsSnap.size + userReads + subjectRead);
  await flushReadsIfDue();

  return NextResponse.json({
    assignment: { id: assignmentId, ...assignmentData },
    submissions,
    classStats,
  });
}
