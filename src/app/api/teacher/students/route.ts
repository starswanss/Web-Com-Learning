import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';

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

  // Get teacher's assignments (filtered by subject if provided)
  const base = adminDb.collection('assignments').where('teacherId', '==', uid);
  const assignmentsSnap = subjectId
    ? await base.where('subjectId', '==', subjectId).get()
    : await base.get();

  if (assignmentsSnap.empty) return NextResponse.json([]);

  const assignmentIds = assignmentsSnap.docs.map((d) => d.id);

  // Collect all classIds covered by these assignments
  const allClassIds = new Set<string>();
  assignmentsSnap.docs.forEach((d) => {
    const cids = d.data().classIds as string[] | undefined;
    if (cids) cids.forEach((c) => allClassIds.add(c));
  });

  // Count assignments per classId
  const assignmentsPerClass = new Map<string, number>();
  assignmentsSnap.docs.forEach((d) => {
    const cids = d.data().classIds as string[] | undefined;
    if (!cids) return;
    cids.forEach((c) => assignmentsPerClass.set(c, (assignmentsPerClass.get(c) ?? 0) + 1));
  });

  // Get all submissions for these assignments (Firestore 'in' supports up to 30)
  const submissionsSnap = await adminDb
    .collection('submissions')
    .where('assignmentId', 'in', assignmentIds.slice(0, 30))
    .get();

  // Aggregate by student
  const studentMap = new Map<string, {
    studentId: string;
    studentName: string;
    classId: string;
    scores: number[];
    submittedCount: number;
    tabSwitchTotal: number;
  }>();

  submissionsSnap.docs.forEach((d) => {
    const data = d.data();
    const sid = data.studentId as string;
    if (!studentMap.has(sid)) {
      studentMap.set(sid, {
        studentId: sid,
        studentName: data.studentName as string,
        classId: data.classId as string,
        scores: [],
        submittedCount: 0,
        tabSwitchTotal: 0,
      });
    }
    const entry = studentMap.get(sid)!;
    entry.submittedCount += 1;
    if (typeof data.score === 'number') entry.scores.push(data.score);
    if (typeof data.tabSwitchCount === 'number') entry.tabSwitchTotal += data.tabSwitchCount;
  });

  const result = Array.from(studentMap.values()).map((s) => {
    const totalForClass = assignmentsPerClass.get(s.classId) ?? assignmentIds.length;
    const avgScore = s.scores.length > 0
      ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length)
      : null;
    return {
      studentId: s.studentId,
      studentName: s.studentName,
      classId: s.classId,
      submittedCount: s.submittedCount,
      totalAssignments: totalForClass,
      avgScore,
      tabSwitchTotal: s.tabSwitchTotal,
      scores: s.scores,
    };
  });

  // Sort by classId then studentName
  result.sort((a, b) => a.classId.localeCompare(b.classId) || a.studentName.localeCompare(b.studentName));

  return NextResponse.json(result);
}
