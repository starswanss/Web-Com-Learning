import { NextResponse } from 'next/server';
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

export async function GET() {
  const teacherUid = await getTeacherUid();
  if (!teacherUid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const assignmentsSnap = await adminDb
    .collection('assignments')
    .where('teacherId', '==', teacherUid)
    .get();

  if (assignmentsSnap.empty) return NextResponse.json({ perClass: {}, assignments: [] });

  const assignmentIds = assignmentsSnap.docs.map((d) => d.id);
  const assignmentTitles = Object.fromEntries(
    assignmentsSnap.docs.map((d) => [d.id, d.data().title as string])
  );

  const allSubmissions: Record<string, unknown>[] = [];
  for (let i = 0; i < assignmentIds.length; i += 30) {
    const chunk = assignmentIds.slice(i, i + 30);
    const snap = await adminDb
      .collection('submissions')
      .where('assignmentId', 'in', chunk)
      .get();
    snap.docs.forEach((d) => allSubmissions.push({ id: d.id, ...d.data() }));
  }

  const perClass: Record<string, { submitted: number; totalScore: number; count: number }> = {};
  const perAssignment: Record<string, { submitted: number; avgScore: number }> = {};

  for (const sub of allSubmissions) {
    const classId = sub.classId as string;
    const assignmentId = sub.assignmentId as string;
    const score = (sub.score as number) ?? 0;

    if (!perClass[classId]) perClass[classId] = { submitted: 0, totalScore: 0, count: 0 };
    perClass[classId].submitted += 1;
    perClass[classId].totalScore += score;
    perClass[classId].count += 1;

    if (!perAssignment[assignmentId]) perAssignment[assignmentId] = { submitted: 0, avgScore: 0 };
    perAssignment[assignmentId].submitted += 1;
    perAssignment[assignmentId].avgScore =
      (perAssignment[assignmentId].avgScore * (perAssignment[assignmentId].submitted - 1) + score) /
      perAssignment[assignmentId].submitted;
  }

  const classStats = Object.entries(perClass)
    .sort(([a], [b]) => {
      const na = parseInt(a.replace(/\D/g, ''));
      const nb = parseInt(b.replace(/\D/g, ''));
      return na - nb;
    })
    .map(([classId, data]) => ({
      classId,
      submitted: data.submitted,
      avgScore: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
    }));

  const assignmentStats = Object.entries(perAssignment).map(([id, data]) => ({
    id,
    title: assignmentTitles[id] ?? id,
    submitted: data.submitted,
    avgScore: Math.round(data.avgScore),
  }));

  return NextResponse.json({ classStats, assignmentStats, totalSubmissions: allSubmissions.length });
}
