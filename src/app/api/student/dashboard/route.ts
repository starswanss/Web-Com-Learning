import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { DEFAULT_SETTINGS, LevelSettings } from '@/lib/xp';
import { cachedGlobal } from '@/lib/server-cache';
import { trackReads, flushReadsIfDue } from '@/lib/read-tracker';

/**
 * Combined student dashboard payload in ONE round-trip: profile xp, the
 * assignment list (with each submission merged), recent medals, and the global
 * level settings. Replaces 3-4 separate client fetches — one serverless
 * invocation, one network trip, one chance of a cold start instead of several.
 */

async function getStudent(): Promise<{ uid: string; classId: string; xp: number } | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists || snap.data()?.role !== 'student') return null;
    const data = snap.data()!;
    return { uid: decoded.uid, classId: data.classId as string, xp: (data.xp as number) ?? 0 };
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const student = await getStudent();
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subjectId = new URL(req.url).searchParams.get('subject');

  // Visibility is by SUBJECT: a student who belongs to a subject sees EVERY
  // assignment in it (work is subject-wide, not targeted per room). We only fall
  // back to class-based visibility when no subject is chosen, or when the chosen
  // subject does not actually include the student's class (stale / not entitled).
  let assignmentsQuery = adminDb
    .collection('assignments')
    .where('classIds', 'array-contains', student.classId) as FirebaseFirestore.Query;
  if (subjectId) {
    const subjDoc = await adminDb.collection('subjects').doc(subjectId).get();
    const subjClasses = (subjDoc.exists ? (subjDoc.data()?.classIds as string[]) : []) ?? [];
    if (subjClasses.includes(student.classId)) {
      assignmentsQuery = adminDb.collection('assignments').where('subjectId', '==', subjectId);
    }
  }

  // All independent reads in parallel; level settings comes from the shared
  // cache (usually 0 reads). Assignments belong to the subject and stay visible
  // across terms/years — they are NOT filtered by term for students.
  const [assignmentsSnap, submissionsSnap, medalsSnap, levelSettings] = await Promise.all([
    assignmentsQuery.get(),
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

  const assignments = assignmentsSnap.docs
    .map((d) => ({ id: d.id, ...d.data(), submission: submissionMap.get(d.id) ?? null }))
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

  // 1 user doc + assignments + submissions + medals (level settings cached).
  trackReads(student.uid, 1 + assignmentsSnap.size + submissionsSnap.size + medalsSnap.size);
  await flushReadsIfDue();

  return NextResponse.json({ xp: student.xp, assignments, medals, levelSettings });
}
