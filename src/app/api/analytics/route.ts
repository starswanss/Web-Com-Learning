import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { cachedGlobal } from '@/lib/server-cache';
import { submissionInTerm } from '@/lib/term';
import { getLiveSubjectIds, inLiveSubject } from '@/lib/assignment-access';

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

  const params = new URL(req.url).searchParams;
  const term = params.get('term');
  const subjectId = params.get('subject');
  const result = await cachedGlobal(
    `analytics:${teacherUid}:${subjectId ?? 'all'}:${term ?? 'all'}`,
    STATS_TTL,
    () => computeAnalytics(teacherUid, term, subjectId),
  );
  return NextResponse.json(result);
}

async function computeAnalytics(teacherUid: string, term: string | null, subjectId: string | null) {
  const base = adminDb.collection('assignments').where('teacherId', '==', teacherUid);
  const [assignmentsSnap, liveSubjects] = await Promise.all([
    subjectId ? base.where('subjectId', '==', subjectId).get() : base.get(),
    getLiveSubjectIds(),
  ]);

  // Only real work: a subject that still exists, and never ใบความรู้.
  const allDocs = assignmentsSnap.docs.filter(
    (d) => inLiveSubject(d.data(), liveSubjects) && d.data().contentType !== 'knowledge',
  );
  if (allDocs.length === 0) {
    return { classStats: [], assignmentStats: [], totalSubmissions: 0, scoreDistribution: [], weeklyTrend: [] };
  }
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

  // Averages and the histogram use graded work only — an ungraded submission
  // has no score yet, and counting it as 0 dragged every average down.
  const perClass: Record<string, { submitted: number; totalScore: number; count: number }> = {};
  const perAssignment: Record<string, { submitted: number; totalScore: number; count: number }> = {};
  const scores: number[] = [];

  for (const sub of allSubmissions) {
    const classId = sub.classId as string;
    const assignmentId = sub.assignmentId as string;
    const score = typeof sub.score === 'number' ? (sub.score as number) : null;

    perClass[classId] ??= { submitted: 0, totalScore: 0, count: 0 };
    perAssignment[assignmentId] ??= { submitted: 0, totalScore: 0, count: 0 };
    perClass[classId].submitted += 1;
    perAssignment[assignmentId].submitted += 1;
    if (score !== null) {
      perClass[classId].totalScore += score;
      perClass[classId].count += 1;
      perAssignment[assignmentId].totalScore += score;
      perAssignment[assignmentId].count += 1;
      scores.push(score);
    }
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
      avgScore: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
    }));

  // Score distribution histogram: buckets 0-9, 10-19, …, 90-100
  const scoreDistribution = Array.from({ length: 10 }, (_, i) => ({
    label: i < 9 ? `${i * 10}–${i * 10 + 9}` : '90–100',
    count: 0,
  }));
  for (const score of scores) {
    const bucket = Math.min(Math.max(Math.floor(score / 10), 0), 9);
    scoreDistribution[bucket].count++;
  }

  // Weekly submission trend (last 8 weeks)
  const now = Date.now();
  const weekMs = 7 * 24 * 3600 * 1000;
  const weeklyTrend = Array.from({ length: 8 }, (_, i) => ({
    label: i === 7 ? 'สัปดาห์นี้' : `${7 - i} สัปดาห์ก่อน`,
    count: 0,
  }));
  for (const sub of allSubmissions) {
    const ts = ((sub as any).submittedAt?._seconds ?? 0) * 1000;
    const weeksAgo = Math.floor((now - ts) / weekMs);
    if (weeksAgo >= 0 && weeksAgo < 8) weeklyTrend[7 - weeksAgo].count++;
  }

  return { classStats, assignmentStats, totalSubmissions: allSubmissions.length, scoreDistribution, weeklyTrend };
}
