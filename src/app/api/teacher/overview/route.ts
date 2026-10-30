import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
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

  const assignmentIds = assignmentsSnap.docs.map((d) => d.id);

  // Firestore 'in' limit is 30 — chunk and merge
  const countMap = new Map<string, { submitted: number; graded: number; reviewed: number }>();
  const CHUNK = 30;
  for (let i = 0; i < assignmentIds.length; i += CHUNK) {
    const chunk = assignmentIds.slice(i, i + CHUNK);
    const snap = await adminDb
      .collection('submissions')
      .where('assignmentId', 'in', chunk)
      .get();
    snap.docs.forEach((d) => {
      const data = d.data();
      const aId = data.assignmentId as string;
      if (!countMap.has(aId)) countMap.set(aId, { submitted: 0, graded: 0, reviewed: 0 });
      const c = countMap.get(aId)!;
      if (data.status === 'submitted') c.submitted++;
      else if (data.status === 'graded') c.graded++;
      else if (data.status === 'reviewed') c.reviewed++;
    });
  }

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
