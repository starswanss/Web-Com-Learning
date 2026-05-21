import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { calcLevel, DEFAULT_SETTINGS, LevelSettings } from '@/lib/xp';

async function getStudentInfo(): Promise<{ uid: string; classId: string } | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists || snap.data()?.role !== 'student') return null;
    return { uid: decoded.uid, classId: snap.data()?.classId as string };
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const student = await getStudentInfo();
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get('subject');

  const assignmentsSnap = await adminDb
    .collection('assignments')
    .where('classIds', 'array-contains', student.classId)
    .get();

  if (assignmentsSnap.empty) return NextResponse.json([]);

  // filter by subject in JS
  const assignmentIds = assignmentsSnap.docs
    .filter((d) => !subjectId || d.data().subjectId === subjectId)
    .map((d) => d.id);

  if (assignmentIds.length === 0) return NextResponse.json([]);

  const submissionsSnap = await adminDb
    .collection('submissions')
    .where('assignmentId', 'in', assignmentIds.slice(0, 30))
    .where('classId', '==', student.classId)
    .get();

  const studentMap = new Map<string, { scores: number[]; submittedCount: number; isMe: boolean }>();

  submissionsSnap.docs.forEach((d) => {
    const data = d.data();
    const sid = data.studentId as string;
    if (!studentMap.has(sid)) {
      studentMap.set(sid, { scores: [], submittedCount: 0, isMe: sid === student.uid });
    }
    const entry = studentMap.get(sid)!;
    entry.submittedCount += 1;
    if (typeof data.score === 'number') entry.scores.push(data.score);
  });

  /* ── Bonus points ── */
  const studentIds = Array.from(studentMap.keys());
  const bonusMap = new Map<string, { total: number; medalCount: number }>();

  if (studentIds.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < studentIds.length; i += 30) chunks.push(studentIds.slice(i, i + 30));
    for (const chunk of chunks) {
      const bonusSnap = await adminDb.collection('bonusPoints').where('studentId', 'in', chunk).get();
      bonusSnap.docs.forEach((d) => {
        const b = d.data();
        const sid = b.studentId as string;
        if (!bonusMap.has(sid)) bonusMap.set(sid, { total: 0, medalCount: 0 });
        const e = bonusMap.get(sid)!;
        e.total += b.points as number;
        e.medalCount += 1;
      });
    }
  }

  const result = Array.from(studentMap.entries()).map(([sid, s]) => {
    const avgScore = s.scores.length > 0
      ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length)
      : null;
    const bonus = bonusMap.get(sid);
    const bonusPoints = bonus?.total ?? 0;
    const medalCount = bonus?.medalCount ?? 0;
    return {
      studentId: sid,
      avgScore,
      submittedCount: s.submittedCount,
      isMe: s.isMe,
      bonusPoints,
      medalCount,
      totalScore: (avgScore ?? 0) + bonusPoints,
    };
  });

  result.sort((a, b) => b.totalScore - a.totalScore || b.submittedCount - a.submittedCount);

  // Fetch XP + level settings in parallel
  const [settingsSnap, ...userSnaps] = await Promise.all([
    adminDb.doc('levelSettings/global').get(),
    ...result.map((r) => adminDb.collection('users').doc(r.studentId).get()),
  ]);
  const levelSettings: LevelSettings = settingsSnap.exists
    ? { ...DEFAULT_SETTINGS, ...(settingsSnap.data() as Partial<LevelSettings>) }
    : DEFAULT_SETTINGS;
  const xpMap = new Map<string, number>();
  userSnaps.forEach((snap) => {
    if (snap.exists) xpMap.set(snap.id, (snap.data()?.xp as number) ?? 0);
  });

  return NextResponse.json(result.map((s, i) => {
    const lvl = calcLevel(xpMap.get(s.studentId) ?? 0, levelSettings);
    return { ...s, rank: i + 1, level: lvl.level, levelIcon: lvl.icon, levelTitle: lvl.title };
  }));
}
