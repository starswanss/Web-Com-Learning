import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { getLiveSubjectIds, inLiveSubject } from '@/lib/assignment-access';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = await adminAuth.verifySessionCookie(session, false);
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!userSnap.exists || userSnap.data()?.role !== 'student') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const student = userSnap.data()!;
    const subjectParam = req.nextUrl.searchParams.get('subject');

    const [assignmentsSnap, submissionsSnap, liveSubjects] = await Promise.all([
      adminDb.collection('assignments').where('classIds', 'array-contains', student.classId).get(),
      adminDb.collection('submissions').where('studentId', '==', decoded.uid).get(),
      getLiveSubjectIds(),
    ]);

    const submissions = submissionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Record<string, unknown>[];
    const submissionMap = new Map(submissions.map((s) => [s.assignmentId as string, s]));

    // filter by subject in JS to avoid composite index
    const allDocs = assignmentsSnap.docs
      .filter((d) => inLiveSubject(d.data(), liveSubjects))
      .filter((d) => !subjectParam || d.data().subjectId === subjectParam)
      .map((d) => {
        const a = { id: d.id, ...d.data() } as Record<string, unknown>;
        const sub = submissionMap.get(d.id);
        return {
          id: d.id,
          title: a.title as string,
          unit: (a.unit as string | undefined) ?? null,
          dueDate: a.dueDate as { _seconds: number } | undefined,
          submission: sub
            ? {
                status: sub.status as string,
                score: sub.score as number | undefined,
                feedback: sub.feedback as string | undefined,
                submittedAt: sub.submittedAt as { _seconds: number } | undefined,
                tabSwitchCount: sub.tabSwitchCount as number | undefined,
              }
            : null,
        };
      });

    /* ── Stats ── */
    const scoredSubs = allDocs.filter((a) => typeof a.submission?.score === 'number');
    const avgScore =
      scoredSubs.length > 0
        ? Math.round(scoredSubs.reduce((sum, a) => sum + a.submission!.score!, 0) / scoredSubs.length)
        : null;

    /* ── Badges ── */
    const badges: { id: string; icon: string; label: string; desc: string }[] = [];

    const total = allDocs.length;
    const submittedCount = allDocs.filter((a) => a.submission).length;
    if (total > 0 && submittedCount === total) {
      badges.push({ id: 'full_submit', icon: '🏆', label: 'ส่งงานครบ', desc: 'ส่งงานครบทุกชิ้น' });
    }
    if (avgScore !== null && avgScore >= 80) {
      badges.push({ id: 'high_score', icon: '⭐', label: 'คะแนนดีเด่น', desc: `คะแนนเฉลี่ย ${avgScore}/100` });
    }
    const earlyCount = allDocs.filter((a) => {
      if (!a.submission?.submittedAt || !a.dueDate) return false;
      return a.submission.submittedAt._seconds < a.dueDate._seconds;
    }).length;
    if (earlyCount >= 3) {
      badges.push({ id: 'early_bird', icon: '⚡', label: 'ส่งก่อนกำหนด', desc: `ส่งก่อนกำหนด ${earlyCount} ชิ้น` });
    }
    const noTabSwitch = allDocs
      .filter((a) => a.submission)
      .every((a) => !a.submission!.tabSwitchCount);
    if (submittedCount > 0 && noTabSwitch) {
      badges.push({ id: 'honest', icon: '🧘', label: 'ซื่อสัตย์', desc: 'ไม่มี tab switch เลย' });
    }
    const noLate = allDocs
      .filter((a) => a.submission && a.dueDate)
      .every((a) => a.submission!.submittedAt && a.submission!.submittedAt._seconds <= a.dueDate!._seconds);
    if (submittedCount > 0 && noLate) {
      badges.push({ id: 'no_late', icon: '🔥', label: 'ไม่เคยช้า', desc: 'ส่งงานทันทุกครั้ง' });
    }

    return NextResponse.json({
      student: {
        uid: decoded.uid,
        displayName: student.displayName,
        classId: student.classId,
      },
      stats: {
        total,
        submitted: submittedCount,
        graded: scoredSubs.length,
        avgScore,
      },
      badges,
      assignments: allDocs,
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
