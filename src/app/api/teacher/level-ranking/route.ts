import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { calcLevel, DEFAULT_SETTINGS, LevelSettings } from '@/lib/xp';
import { cachedGlobal } from '@/lib/server-cache';

const LR_TTL = 300_000; // 5 min; invalidated on grade/bonus/quest-claim (xp)

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

// GET /api/teacher/level-ranking?subject=xxx
// When subject is provided, only show students who have submissions
// for assignments in that subject (XP is still global).
export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subjectId = new URL(req.url).searchParams.get('subject');

  const result = await cachedGlobal(
    `level-ranking:${uid}:${subjectId ?? 'all'}`,
    LR_TTL,
    () => computeLevelRanking(uid, subjectId),
  );
  return NextResponse.json(result);
}

async function computeLevelRanking(uid: string, subjectId: string | null) {
  const [studentsSnap, settingsSnap] = await Promise.all([
    adminDb.collection('users').where('role', '==', 'student').get(),
    adminDb.doc('levelSettings/global').get(),
  ]);

  const settings: LevelSettings = settingsSnap.exists
    ? { ...DEFAULT_SETTINGS, ...settingsSnap.data() }
    : DEFAULT_SETTINGS;

  // When a subject is selected, filter to only students who have submitted
  // at least one assignment for that subject under this teacher.
  let allowedStudentIds: Set<string> | null = null;

  if (subjectId) {
    const assignmentsSnap = await adminDb
      .collection('assignments')
      .where('teacherId', '==', uid)
      .where('subjectId', '==', subjectId)
      .get();

    const assignmentIds = assignmentsSnap.docs.map((d) => d.id);

    if (assignmentIds.length === 0) return [];

    const idSet = new Set<string>();
    const chunks: string[][] = [];
    for (let i = 0; i < assignmentIds.length; i += 30) chunks.push(assignmentIds.slice(i, i + 30));

    for (const chunk of chunks) {
      const subsSnap = await adminDb
        .collection('submissions')
        .where('assignmentId', 'in', chunk)
        .get();
      subsSnap.docs.forEach((d) => idSet.add(d.data().studentId as string));
    }

    allowedStudentIds = idSet;
    if (allowedStudentIds.size === 0) return [];
  }

  const students = studentsSnap.docs
    .filter((d) => !allowedStudentIds || allowedStudentIds.has(d.id))
    .map((d) => {
      const data = d.data();
      const xp = (data.xp as number) ?? 0;
      const info = calcLevel(xp, settings);
      return {
        uid: d.id,
        displayName: (data.displayName as string) ?? '',
        classId: (data.classId as string) ?? '',
        xp,
        level: info.level,
        icon: info.icon,
        title: info.title,
        currentXp: info.currentXp,
        nextLevelXp: info.nextLevelXp,
        progress: info.progress,
      };
    });

  students.sort((a, b) => b.xp - a.xp || a.displayName.localeCompare(b.displayName, 'th'));

  return students.slice(0, 50);
}
