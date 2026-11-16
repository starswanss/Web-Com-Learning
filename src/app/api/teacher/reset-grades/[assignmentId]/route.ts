import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from '@/lib/db';
import { calcXpGain } from '@/lib/xp';
import { invalidateLeaderboards } from '@/lib/leaderboard-cache';

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

/**
 * Reset grading for an assignment: graded/reviewed submissions go back to
 * "submitted" (awaiting grading) so the teacher can grade again. Scores,
 * feedback and per-question marks are cleared, and each student's XP is rolled
 * back from the score-based award (score*10) to the base submit XP. Optionally
 * limited to one room via `classId`; the submission itself stays, so the
 * student is still counted as having submitted.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assignmentId } = await params;
  const { classId } = (await req.json().catch(() => ({}))) as { classId?: string | null };

  const assignmentSnap = await adminDb.collection('assignments').doc(assignmentId).get();
  if (!assignmentSnap.exists || assignmentSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Read all submissions for this assignment, then filter in memory (avoids a
  // composite index for assignmentId + status).
  const snap = await adminDb.collection('submissions').where('assignmentId', '==', assignmentId).get();
  const targets = snap.docs.filter((d) => {
    const data = d.data();
    const graded = data.status === 'graded' || data.status === 'reviewed';
    const roomOk = !classId || data.classId === classId;
    return graded && roomOk;
  });

  if (targets.length === 0) return NextResponse.json({ reset: 0 });

  const baseXp = calcXpGain(null); // XP a plain submit is worth (10)

  const CHUNK = 200; // each target = up to 2 writes (submission + user xp)
  let batch = adminDb.batch();
  let ops = 0;
  let reset = 0;
  const flush = async () => { if (ops > 0) { await batch.commit(); batch = adminDb.batch(); ops = 0; } };

  for (const d of targets) {
    const data = d.data();
    const studentUid = data.studentId as string | undefined;
    const prevXp = (data.xpAwarded as number) ?? 0;

    batch.update(d.ref, {
      status: 'submitted',
      score: null,
      feedback: null,
      plagiarismSuspicion: 0,
      gradedAt: null,
      reviewedAt: null,
      questionComments: FieldValue.delete(),
      questionScores: FieldValue.delete(),
      attitudeScore: FieldValue.delete(),
      xpAwarded: baseXp,
    });
    ops++;

    const xpDelta = baseXp - prevXp;
    if (studentUid && xpDelta !== 0) {
      batch.update(adminDb.collection('users').doc(studentUid), { xp: FieldValue.increment(xpDelta) });
      ops++;
    }
    reset++;
    if (ops >= CHUNK) await flush();
  }
  await flush();

  invalidateLeaderboards(); // scores + xp changed
  return NextResponse.json({ reset, classId: classId ?? null });
}
