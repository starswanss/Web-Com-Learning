import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { cachedGlobal } from '@/lib/server-cache';
import { submissionInTerm } from '@/lib/term';

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
  const teacherUid = await getTeacherUid();
  if (!teacherUid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const term = new URL(req.url).searchParams.get('term');
  const result = await cachedGlobal(`analytics:${teacherUid}:${term ?? 'all'}`, STATS_TTL, () => computeAnalytics(teacherUid, term));
  return NextResponse.json(result);
}

async function computeAnalytics(teacherUid: string, term: string | null) {
  const assignmentsSnap = await adminDb
    .collection('assignments')
    .where('teacherId', '==', teacherUid)
    .get();

  if (assignmentsSnap.empty) return { perClass: {}, assignments: [] };

  const allDocs = assignmentsSnap.docs;
  const assignmentIds = allDocs.map((d) => d.id);
  const assignmentTitles = Object.fromEntries(
    allDocs.map((d) => [d.id, d.data().title as string])
  );

  // Worksheets are reused across terms; aggregate only the submissions that
  // belong to the chosen term (the term lives on the submission now).
  const allSubmissions: Record<string, unknown>[] = [];
  for (let i = 0; i < assignmentIds.length; i += 30) {
    const chunk = assignmentIds.slice(i, i + 30);
    const snap = await adminDb
      .collection('submissions')
      .where('assignmentId', 'in', chunk)
      .get();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (!submissionInTerm(data as { academicYear?: number | null; term?: number | null }, term)) return;
      allSubmissions.push({ id: d.id, ...data });
    });
  }
  if (allSubmissions.length === 0) {
    return { classStats: [], assignmentStats: [], totalSubmissions: 0, scoreDistribution: [], weeklyTrend: [] };
  }

  const perClass: Record<string, { submitted: number; totalScore: number; count: number }> = {};
  const perAssignment: Record<string, { submitted: number; avgScore: number }> = {};

  for (const sub of allSubmissions) {
    const classId = sub.classId as string;
    const assignmentId = sub.assignmentId as string;
    const score = (sub.score as number) ?? 0;

    if (!perClass[classId]) perClass[classId] = { submitted: 0, totalScore: 0, count: 0 };
    perClass[classId].submitted += 1;
    perClass[classId].totalScore += score;
    perClass[classId].count += 1;

    if (!perAssignment[assignmentId]) perAssignment[assignmentId] = { submitted: 0, avgScore: 0 };
    perAssignment[assignmentId].submitted += 1;
    perAssignment[assignmentId].avgScore =
      (perAssignment[assignmentId].avgScore * (perAssignment[assignmentId].submitted - 1) + score) /
      perAssignment[assignmentId].submitted;
  }

  const classStats = Object.entries(perClass)
    .sort(([a], [b]) => {
      const na = parseInt(a.replace(/\D/g, ''));
      const nb = parseInt(b.replace(/\D/g, ''));
      return na - nb;
    })
    .map(([classId, data]) => ({
      classId,
      submitted: data.submitted,
      avgScore: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
    }));

  const currentAssignmentIds = new Set(assignmentIds);
  const assignmentStats = Object.entries(perAssignment)
    .filter(([id]) => currentAssignmentIds.has(id))
    .map(([id, data]) => ({
      id,
      title: assignmentTitles[id] ?? id,
      submitted: data.submitted,
      avgScore: Math.round(data.avgScore),
    }));

  // Score distribution histogram: buckets 0-9, 10-19, …, 90-100
  const scoreDistribution = Array.from({ length: 10 }, (_, i) => ({
    label: i < 9 ? `${i * 10}–${i * 10 + 9}` : '90–100',
    count: 0,
  }));
  for (const sub of allSubmissions) {
    const score = (sub.score as number) ?? 0;
    const bucket = Math.min(Math.floor(score / 10), 9);
    scoreDistribution[bucket].count++;
  }

  // Weekly submission trend (last 8 weeks)
  const now = Date.now();
  const weekMs = 7 * 24 * 3600 * 1000;
  const weeklyTrend = Array.from({ length: 8 }, (_, i) => ({
    week: `W-${7 - i}`,
    count: 0,
  }));
  for (const sub of allSubmissions) {
    const ts = ((sub as any).submittedAt?._seconds ?? 0) * 1000;
    const weeksAgo = Math.floor((now - ts) / weekMs);
    if (weeksAgo >= 0 && weeksAgo < 8) weeklyTrend[7 - weeksAgo].count++;
  }

  return { classStats, assignmentStats, totalSubmissions: allSubmissions.length, scoreDistribution, weeklyTrend };
}
