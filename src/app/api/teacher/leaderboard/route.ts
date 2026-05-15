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
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get('subject');
  const classFilter = searchParams.get('classId');

  const base = adminDb.collection('assignments').where('teacherId', '==', uid);
  const assignmentsSnap = subjectId
    ? await base.where('subjectId', '==', subjectId).get()
    : await base.get();

  if (assignmentsSnap.empty) return NextResponse.json([]);

  const assignmentIds = assignmentsSnap.docs.map((d) => d.id);

  const submissionsSnap = await adminDb
    .collection('submissions')
    .where('assignmentId', 'in', assignmentIds.slice(0, 30))
    .get();

  const studentMap = new Map<string, {
    studentId: string; studentName: string; classId: string;
    scores: number[]; submittedCount: number;
  }>();

  submissionsSnap.docs.forEach((d) => {
    const data = d.data();
    const sid = data.studentId as string;
    const cid = data.classId as string;
    if (classFilter && cid !== classFilter) return;
    if (!studentMap.has(sid)) {
      studentMap.set(sid, { studentId: sid, studentName: data.studentName as string, classId: cid, scores: [], submittedCount: 0 });
    }
    const entry = studentMap.get(sid)!;
    entry.submittedCount += 1;
    if (typeof data.score === 'number') entry.scores.push(data.score);
  });

  /* ── Bonus points ── */
  const studentIds = Array.from(studentMap.keys());
  const bonusMap = new Map<string, { total: number; medals: { icon: string; reason: string }[] }>();

  if (studentIds.length > 0) {
    // Firestore "in" supports up to 30 items
    const chunks: string[][] = [];
    for (let i = 0; i < studentIds.length; i += 30) chunks.push(studentIds.slice(i, i + 30));

    for (const chunk of chunks) {
      const bonusSnap = await adminDb.collection('bonusPoints').where('studentId', 'in', chunk).get();
      bonusSnap.docs.forEach((d) => {
        const b = d.data();
        const sid = b.studentId as string;
        if (!bonusMap.has(sid)) bonusMap.set(sid, { total: 0, medals: [] });
        const entry = bonusMap.get(sid)!;
        entry.total += b.points as number;
        const MEDAL_ICON: Record<string, string> = { gold: '⭐', silver: '🥈', diamond: '💎', special: '🎖' };
        entry.medals.push({ icon: MEDAL_ICON[b.medal as string] ?? '🏅', reason: b.reason as string ?? '' });
      });
    }
  }

  const result = Array.from(studentMap.values()).map((s) => {
    const avgScore = s.scores.length > 0
      ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length)
      : null;
    const bonus = bonusMap.get(s.studentId);
    const bonusPoints = bonus?.total ?? 0;
    const totalScore = (avgScore ?? 0) + bonusPoints;
    return {
      studentId: s.studentId,
      studentName: s.studentName,
      classId: s.classId,
      submittedCount: s.submittedCount,
      avgScore,
      bonusPoints,
      medals: bonus?.medals ?? [],
      totalScore,
    };
  });

  result.sort((a, b) => b.totalScore - a.totalScore || b.submittedCount - a.submittedCount);

  return NextResponse.json(result.map((s, i) => ({ ...s, rank: i + 1 })));
}
