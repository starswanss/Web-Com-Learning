import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { calcLevel, DEFAULT_SETTINGS, LevelSettings } from '@/lib/xp';
import { cachedGlobal } from '@/lib/server-cache';

// The leaderboard for a (class, subject) is identical for every student in
// that class except the per-viewer `isMe` flag. Computing it scans assignments,
// submissions, all class users and bonus points — so 40 students in a class
// would otherwise repeat that whole scan 40×. Cache the computed rows per
// (class, subject) for a short window and stamp `isMe` per request.
const LB_TTL = 30_000;

interface LbRow {
  studentId: string;
  avgScore: number | null;
  submittedCount: number;
  bonusPoints: number;
  medalCount: number;
  totalScore: number;
  rank: number;
  level: number;
  levelIcon: string;
  levelTitle: string;
}

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

  // Heavy computation is shared by everyone in this class+subject — cache it.
  const cacheKey = `leaderboard:${student.classId}:${subjectId ?? 'all'}`;
  const rows = await cachedGlobal<LbRow[]>(cacheKey, LB_TTL, () =>
    computeLeaderboard(student.classId, subjectId),
  );

  // Stamp the per-viewer flag without recomputing anything.
  return NextResponse.json(rows.map((r) => ({ ...r, isMe: r.studentId === student.uid })));
}

async function computeLeaderboard(classId: string, subjectId: string | null): Promise<LbRow[]> {
  const assignmentsSnap = await adminDb
    .collection('assignments')
    .where('classIds', 'array-contains', classId)
    .get();

  if (assignmentsSnap.empty) return [];

  // filter by subject in JS
  const assignmentIds = assignmentsSnap.docs
    .filter((d) => !subjectId || d.data().subjectId === subjectId)
    .map((d) => d.id);

  if (assignmentIds.length === 0) return [];

  // Read class students once — gives us both the roster AND each student's xp,
  // so no per-student user-doc read is needed later (avoids an N+1 scan).
  const [submissionsSnap, classStudentsSnap] = await Promise.all([
    adminDb
      .collection('submissions')
      .where('assignmentId', 'in', assignmentIds.slice(0, 30))
      .where('classId', '==', classId)
      .get(),
    adminDb.collection('users').where('classId', '==', classId).get(),
  ]);

  const studentMap = new Map<string, { scores: number[]; submittedCount: number }>();

  submissionsSnap.docs.forEach((d) => {
    const data = d.data();
    const sid = data.studentId as string;
    if (!studentMap.has(sid)) studentMap.set(sid, { scores: [], submittedCount: 0 });
    const entry = studentMap.get(sid)!;
    entry.submittedCount += 1;
    if (typeof data.score === 'number') entry.scores.push(data.score);
  });

  // Include all students in the class even if they have no submissions yet,
  // and capture xp from the same snapshot.
  const xpMap = new Map<string, number>();
  classStudentsSnap.docs.forEach((doc) => {
    if (doc.data().role !== 'student') return;
    const sid = doc.id;
    xpMap.set(sid, (doc.data()?.xp as number) ?? 0);
    if (!studentMap.has(sid)) studentMap.set(sid, { scores: [], submittedCount: 0 });
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
      bonusPoints,
      medalCount,
      totalScore: (avgScore ?? 0) + bonusPoints,
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
