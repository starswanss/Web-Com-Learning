import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
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
  const { score, feedback } = await req.json();

  if (typeof score !== 'number' || score < 0 || score > 100) {
    return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
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
