import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { DEFAULT_SETTINGS, LevelSettings } from '@/lib/xp';
import { cachedGlobal } from '@/lib/server-cache';
import { trackReads, flushReadsIfDue } from '@/lib/read-tracker';
import { filterByTerm } from '@/lib/term';

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

  const base = adminDb.collection('assignments').where('classIds', 'array-contains', student.classId);
  const assignmentsQuery = subjectId ? base.where('subjectId', '==', subjectId) : base;

  // All independent reads in parallel; level settings + current term come from
  // the shared cache (usually 0 reads).
  const [assignmentsSnap, submissionsSnap, medalsSnap, levelSettings, currentTerm] = await Promise.all([
    assignmentsQuery.get(),
    adminDb.collection('submissions').where('studentId', '==', student.uid).get(),
    adminDb.collection('bonusPoints').where('studentId', '==', student.uid).limit(20).get(),
    cachedGlobal<LevelSettings>('levelSettings/global', 60_000, async () => {
      const s = await adminDb.doc('levelSettings/global').get();
      return s.exists ? { ...DEFAULT_SETTINGS, ...(s.data() as Partial<LevelSettings>) } : DEFAULT_SETTINGS;
    }),
    cachedGlobal<string>('currentTerm/key', 60_000, async () => {
      const s = await adminDb.doc('system/config').get();
      const ct = s.exists ? s.data()?.currentTerm : null;
      return ct?.year && ct?.term ? `${ct.year}/${ct.term}` : '';
    }),
  ]);

  const submissionMap = new Map(
    submissionsSnap.docs.map((d) => [d.data().assignmentId as string, { id: d.id, ...d.data() }]),
  );

  // Students only ever see the CURRENT term's work. Once Admin advances the
  // term, older (and untagged legacy) assignments drop off their dashboard —
  // teachers/admin can still review past terms. No active term set = show all.
  const termDocs = currentTerm
    ? filterByTerm(
        assignmentsSnap.docs.map((d) => ({ _doc: d, academicYear: d.data().academicYear as number | undefined, term: d.data().term as number | undefined })),
        currentTerm,
      ).map((x) => x._doc)
    : assignmentsSnap.docs;

  const assignments = termDocs
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
