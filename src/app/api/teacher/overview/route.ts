import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { cachedGlobal } from '@/lib/server-cache';

const STATS_TTL = 120_000; // 2 min; invalidated on submit/grade

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

export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get('subject');

  const result = await cachedGlobal(
    `overview:${uid}:${subjectId ?? 'all'}`,
    STATS_TTL,
    () => computeOverview(uid, subjectId),
  );
  return NextResponse.json(result);
}

async function computeOverview(uid: string, subjectId: string | null) {
  const base = adminDb.collection('assignments').where('teacherId', '==', uid);
  // Avoid orderBy to eliminate composite index requirement — sort in JS below
  const assignmentsSnap = subjectId
    ? await base.where('subjectId', '==', subjectId).get()
    : await base.get();

  if (assignmentsSnap.empty) return [];

  // Count per assignment/status with Firestore count() aggregation: each query
  // is billed as ~1 read regardless of how many submissions match, so this is a
  // few dozen reads instead of scanning the whole submissions collection.
  // Knowledge sheets are never submitted, so skip them.
  const subs = adminDb.collection('submissions');
  const STATUSES = ['submitted', 'graded', 'reviewed'] as const;
  const countableIds = assignmentsSnap.docs
    .filter((d) => d.data().contentType !== 'knowledge')
    .map((d) => d.id);

  const countMap = new Map<string, { submitted: number; graded: number; reviewed: number }>();
  countableIds.forEach((id) => countMap.set(id, { submitted: 0, graded: 0, reviewed: 0 }));

  const results = await Promise.all(
    countableIds.flatMap((aid) =>
      STATUSES.map((st) =>
        subs.where('assignmentId', '==', aid).where('status', '==', st).count().get()
          .then((r) => ({ aid, st, n: r.data().count })),
      ),
    ),
  );
  results.forEach(({ aid, st, n }) => { countMap.get(aid)![st] = n; });

  const result = assignmentsSnap.docs.map((d) => {
    const data = d.data();
    // Knowledge sheets are read-only — never show submission counts, even if a
    // few stray "accidental" submissions still exist in the data.
    const counts = data.contentType === 'knowledge'
      ? { submitted: 0, graded: 0, reviewed: 0 }
      : countMap.get(d.id) ?? { submitted: 0, graded: 0, reviewed: 0 };
    return {
      id: d.id,
      title: data.title,
      contentType: data.contentType ?? 'worksheet',
      academicYear: (data.academicYear as number) ?? null,
      term: (data.term as number) ?? null,
      unit: data.unit ?? null,
      dueDate: data.dueDate ?? null,
      classIds: data.classIds ?? [],
      driveWebViewLink: data.driveWebViewLink ?? null,
      createdAt: (data.createdAt?.toMillis?.() ?? 0) as number,
      submittedCount: counts.submitted,
      gradedCount: counts.graded,
      reviewedCount: counts.reviewed,
      totalSubmissions: counts.submitted + counts.graded + counts.reviewed,
    };
  });

  result.sort((a, b) => b.createdAt - a.createdAt);

  return result;
}
