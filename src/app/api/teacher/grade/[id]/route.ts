import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { FieldValue } from '@/lib/db';
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { score, feedback, questionComments, questionScores, attitudeScore } = await req.json();

  if (typeof score !== 'number' || score < 0 || score > 100) {
    return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
  }

  // Per-question KPA scores: map blockId → number (clamped ≥ 0).
  let cleanScores: Record<string, number> | undefined;
  if (questionScores && typeof questionScores === 'object') {
    cleanScores = {};
    for (const [k, v] of Object.entries(questionScores as Record<string, unknown>)) {
      const n = Number(v);
      if (isFinite(n) && n >= 0) cleanScores[k] = Math.round(n * 100) / 100;
    }
  }
  const attScore = typeof attitudeScore === 'number' && attitudeScore >= 0 ? Math.round(attitudeScore * 100) / 100 : undefined;

  // Per-question comments: map of blockId → comment. Keep only non-empty string
  // values and cap length so a bad payload can't bloat the document.
  let cleanComments: Record<string, string> | undefined;
  if (questionComments && typeof questionComments === 'object') {
    cleanComments = {};
    for (const [k, v] of Object.entries(questionComments as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) cleanComments[k] = v.slice(0, 1000);
    }
  }

  const subSnap = await adminDb.collection('submissions').doc(id).get();
  if (!subSnap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sub = subSnap.data()!;

  const assignmentSnap = await adminDb
    .collection('assignments')
    .doc(sub.assignmentId)
    .get();

  if (!assignmentSnap.exists || assignmentSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // XP: score * 10, adjusted for any previously awarded XP
  const previousXpAwarded = (sub.xpAwarded as number) ?? 0;
  const newXpAwarded = score * 10;
  const xpDelta = newXpAwarded - previousXpAwarded;
  const studentUid = sub.studentId as string;

  const batch = adminDb.batch();

  batch.update(adminDb.collection('submissions').doc(id), {
    score,
    feedback,
    status: 'reviewed',
    reviewedAt: FieldValue.serverTimestamp(),
    xpAwarded: newXpAwarded,
    ...(cleanComments !== undefined ? { questionComments: cleanComments } : {}),
    ...(cleanScores !== undefined ? { questionScores: cleanScores } : {}),
    ...(attScore !== undefined ? { attitudeScore: attScore } : {}),
  });

  if (xpDelta !== 0 && studentUid) {
    batch.update(adminDb.collection('users').doc(studentUid), {
      xp: FieldValue.increment(xpDelta),
    });
  }

  await batch.commit();
  invalidateLeaderboards(); // score + xp changed

  return NextResponse.json({ ok: true, xpAwarded: newXpAwarded, xpDelta });
}
