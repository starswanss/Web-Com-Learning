import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { cachedGlobal } from '@/lib/server-cache';
import { submissionInTerm } from '@/lib/term';

const LB_TTL = 300_000; // 5 min; invalidated on grade/bonus/submit

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
  const term = searchParams.get('term');

  const result = await cachedGlobal(
    `teacher-leaderboard:${uid}:${subjectId ?? 'all'}:${classFilter ?? 'all'}:${term ?? 'all'}`,
    LB_TTL,
    () => computeLeaderboard(uid, subjectId, classFilter, term),
  );
  return NextResponse.json(result);
}

async function computeLeaderboard(uid: string, subjectId: string | null, classFilter: string | null, term: string | null) {
  const base = adminDb.collection('assignments').where('teacherId', '==', uid);
  const assignmentsSnap = subjectId
    ? await base.where('subjectId', '==', subjectId).get()
    : await base.get();

  if (assignmentsSnap.empty) return [];

  // Worksheets are reused across terms, so we rank by each student's SUBMISSIONS
  // in the chosen term (not by hiding assignments). Chunk the 'in' query by 30.
  const assignmentIds = assignmentsSnap.docs.map((d) => d.id);
  if (assignmentIds.length === 0) return [];

  const studentMap = new Map<string, {
    studentId: string; studentName: string; classId: string;
    scores: number[]; submittedCount: number;
  }>();

  for (let i = 0; i < assignmentIds.length; i += 30) {
    const chunk = assignmentIds.slice(i, i + 30);
    const submissionsSnap = await adminDb
      .collection('submissions')
      .where('assignmentId', 'in', chunk)
      .get();
    submissionsSnap.docs.forEach((d) => {
      const data = d.data();
      if (!submissionInTerm(data as { academicYear?: number | null; term?: number | null }, term)) return;
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
  }

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
    // Sum of scores from graded work (ผลรวมคะแนนงานที่ตรวจแล้ว) — the ranking metric.
    const sumScore = s.scores.reduce((a, b) => a + b, 0);
    const avgScore = s.scores.length > 0 ? Math.round(sumScore / s.scores.length) : null;
    const bonus = bonusMap.get(s.studentId);
    const bonusPoints = bonus?.total ?? 0;
    const totalScore = sumScore + bonusPoints;
    return {
      studentId: s.studentId,
      studentName: s.studentName,
      classId: s.classId,
      submittedCount: s.submittedCount,
      avgScore,
      sumScore,
      bonusPoints,
      medals: bonus?.medals ?? [],
      totalScore,
    };
  });

  result.sort((a, b) => b.totalScore - a.totalScore || b.submittedCount - a.submittedCount);

  return result.map((s, i) => ({ ...s, rank: i + 1 }));
}
