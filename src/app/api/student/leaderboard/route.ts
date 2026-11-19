import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { getLiveSubjectIds, studentSubjectId } from '@/lib/assignment-access';
import { cookies } from 'next/headers';
import { calcLevel, DEFAULT_SETTINGS, LevelSettings } from '@/lib/xp';
import { cachedGlobal } from '@/lib/server-cache';

// The leaderboard for a (class, subject) is identical for every student in
// that class except the per-viewer `isMe` flag. Computing it scans assignments,
// submissions, all class users and bonus points — so 40 students in a class
// would otherwise repeat that whole scan 40×. Cache the computed rows per
// (class, subject) for a short window and stamp `isMe` per request.
const LB_TTL = 300_000; // 5 min; invalidated on grade/bonus/submit/quest-claim

interface LbRow {
  studentId: string;
  avgScore: number | null;
  sumScore: number;
  submittedCount: number;
  bonusPoints: number;
  medalCount: number;
  totalScore: number;
  rank: number;
  level: number;
  levelIcon: string;
  levelTitle: string;
}

async function getStudentInfo(): Promise<{ uid: string; classId: string; subjectId?: string } | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists || snap.data()?.role !== 'student') return null;
    return { uid: decoded.uid, classId: snap.data()?.classId as string, subjectId: snap.data()?.subjectId as string | undefined };
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const student = await getStudentInfo();
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const subjectId = studentSubjectId({ subjectId: student.subjectId }, searchParams.get('subject'), await getLiveSubjectIds());
  if (!subjectId) return NextResponse.json([]);

  // Heavy computation is shared by everyone in this class+subject — cache it.
  const cacheKey = `leaderboard:${student.classId}:${subjectId}`;
  const rows = await cachedGlobal<LbRow[]>(cacheKey, LB_TTL, () =>
    computeLeaderboard(student.classId, subjectId),
  );

  // Stamp the per-viewer flag without recomputing anything.
  return NextResponse.json(rows.map((r) => ({ ...r, isMe: r.studentId === student.uid })));
}

async function computeLeaderboard(classId: string, subjectId: string): Promise<LbRow[]> {
  // Rank the room's students in this subject by their work in this subject.
  // Work is subject-wide (not targeted per room), and both subjects share the
  // same rooms, so the roster is narrowed to students enrolled in the subject.
  const [assignmentsSnap, classSubsSnap, classUsersSnap] = await Promise.all([
    adminDb.collection('assignments').where('subjectId', '==', subjectId).get(),
    adminDb.collection('submissions').where('classId', '==', classId).get(),
    adminDb.collection('users').where('classId', '==', classId).get(),
  ]);
  const assignmentIds = new Set(assignmentsSnap.docs.map((d) => d.id));

  const studentMap = new Map<string, { scores: number[]; submittedCount: number }>();
  const xpMap = new Map<string, number>();
  classUsersSnap.docs.forEach((doc) => {
    const u = doc.data();
    if (u.role !== 'student' || u.subjectId !== subjectId) return;
    xpMap.set(doc.id, (u.xp as number) ?? 0);
    studentMap.set(doc.id, { scores: [], submittedCount: 0 });
  });
  if (studentMap.size === 0) return [];

  classSubsSnap.docs.forEach((d) => {
    const data = d.data();
    const entry = studentMap.get(data.studentId as string);
    if (!entry || !assignmentIds.has(data.assignmentId as string)) return;
    entry.submittedCount += 1;
    if (typeof data.score === 'number') entry.scores.push(data.score);
  });

  /* ── Bonus points ── */
  const studentIds = Array.from(studentMap.keys());
  const bonusMap = new Map<string, { total: number; medalCount: number }>();

  if (studentIds.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < studentIds.length; i += 30) chunks.push(studentIds.slice(i, i + 30));
    const bonusSnaps = await Promise.all(
      chunks.map((chunk) => adminDb.collection('bonusPoints').where('studentId', 'in', chunk).get()),
    );
    bonusSnaps.forEach((bonusSnap) => {
      bonusSnap.docs.forEach((d) => {
        const b = d.data();
        const sid = b.studentId as string;
        if (!bonusMap.has(sid)) bonusMap.set(sid, { total: 0, medalCount: 0 });
        const e = bonusMap.get(sid)!;
        e.total += b.points as number;
        e.medalCount += 1;
      });
    });
  }

  const ranked = Array.from(studentMap.entries()).map(([sid, s]) => {
    // Sum of scores from graded work (ผลรวมคะแนนงานที่ตรวจแล้ว) — the ranking metric.
    const sumScore = s.scores.reduce((a, b) => a + b, 0);
    const avgScore = s.scores.length > 0 ? Math.round(sumScore / s.scores.length) : null;
    const bonus = bonusMap.get(sid);
    const bonusPoints = bonus?.total ?? 0;
    const medalCount = bonus?.medalCount ?? 0;
    return {
      studentId: sid,
      avgScore,
      sumScore,
      submittedCount: s.submittedCount,
      bonusPoints,
      medalCount,
      totalScore: sumScore + bonusPoints,
    };
  });

  ranked.sort((a, b) => b.totalScore - a.totalScore || b.submittedCount - a.submittedCount);

  // Level settings is a global doc — served from the shared cache.
  const levelSettings = await cachedGlobal<LevelSettings>('levelSettings/global', 60_000, async () => {
    const settingsSnap = await adminDb.doc('levelSettings/global').get();
    return settingsSnap.exists
      ? { ...DEFAULT_SETTINGS, ...(settingsSnap.data() as Partial<LevelSettings>) }
      : DEFAULT_SETTINGS;
  });

  return ranked.map((s, i) => {
    const lvl = calcLevel(xpMap.get(s.studentId) ?? 0, levelSettings);
    return { ...s, rank: i + 1, level: lvl.level, levelIcon: lvl.icon, levelTitle: lvl.title };
  });
}
