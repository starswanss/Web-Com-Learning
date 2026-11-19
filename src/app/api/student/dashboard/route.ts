import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { DEFAULT_SETTINGS, LevelSettings } from '@/lib/xp';
import { cachedGlobal } from '@/lib/server-cache';
import { getLiveSubjectIds, inLiveSubject, studentSubjectId } from '@/lib/assignment-access';
import type { DocumentData } from '@/lib/db';

/**
 * Combined student dashboard payload in ONE round-trip: profile xp, the
 * assignment list (with each submission merged), recent medals, and the global
 * level settings. Replaces 3-4 separate client fetches — one serverless
 * invocation, one network trip, one chance of a cold start instead of several.
 */

async function getStudent(): Promise<{ uid: string; classId: string; xp: number; data: DocumentData } | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists || snap.data()?.role !== 'student') return null;
    const data = snap.data()!;
    return { uid: decoded.uid, classId: data.classId as string, xp: (data.xp as number) ?? 0, data };
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const student = await getStudent();
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // A student sees only the subject they enrolled in at onboarding — every
  // assignment in it (work is subject-wide, not targeted per room). Both
  // subjects are open to every room, so a class-based list would mix them.
  const liveSubjects = await getLiveSubjectIds();
  const subjectId = studentSubjectId(student.data, new URL(req.url).searchParams.get('subject'), liveSubjects);

  // All independent reads in parallel; level settings comes from the shared
  // cache (usually 0 reads). Assignments belong to the subject and stay visible
  // across terms/years — they are NOT filtered by term for students.
  const [assignmentsSnap, subjectSnap, submissionsSnap, medalsSnap, levelSettings] = await Promise.all([
    subjectId ? adminDb.collection('assignments').where('subjectId', '==', subjectId).get() : null,
    subjectId ? adminDb.collection('subjects').doc(subjectId).get() : null,
    adminDb.collection('submissions').where('studentId', '==', student.uid).get(),
    adminDb.collection('bonusPoints').where('studentId', '==', student.uid).limit(20).get(),
    cachedGlobal<LevelSettings>('levelSettings/global', 60_000, async () => {
      const s = await adminDb.doc('levelSettings/global').get();
      return s.exists ? { ...DEFAULT_SETTINGS, ...(s.data() as Partial<LevelSettings>) } : DEFAULT_SETTINGS;
    }),
  ]);

  const submissionMap = new Map(
    submissionsSnap.docs.map((d) => [d.data().assignmentId as string, { id: d.id, ...d.data() }]),
  );

  const assignments = (assignmentsSnap?.docs ?? [])
    .filter((d) => inLiveSubject(d.data(), liveSubjects))
    .map((d) => ({ id: d.id, ...d.data(), submission: submissionMap.get(d.id) ?? null }))
    // Work the teacher has locked (isOpen === false) stays hidden until it is
    // unlocked. Work the student already submitted stays, so scores don't vanish.
    .filter((a) => (a as { isOpen?: boolean | null }).isOpen !== false || a.submission)
    .sort((a, b) => {
      const ta = (a as Record<string, unknown> & { dueDate?: { _seconds?: number } }).dueDate?._seconds ?? 0;
      const tb = (b as Record<string, unknown> & { dueDate?: { _seconds?: number } }).dueDate?._seconds ?? 0;
      return tb - ta;
    });

  const medals = medalsSnap.docs
    .sort((a, b) => (b.data().createdAt?._seconds ?? 0) - (a.data().createdAt?._seconds ?? 0))
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        medal: data.medal as string,
        icon: data.icon as string | undefined,
        points: data.points as number,
        reason: data.reason as string,
        createdAt: data.createdAt?._seconds ?? null,
      };
    });

  const subject = subjectId && subjectSnap?.exists
    ? { id: subjectId, name: (subjectSnap.data()?.name as string) ?? '' }
    : null;

  return NextResponse.json({ xp: student.xp, subject, assignments, medals, levelSettings });
}
