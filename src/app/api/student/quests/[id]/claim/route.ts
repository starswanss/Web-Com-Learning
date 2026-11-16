import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from '@/lib/db';
import { invalidateLeaderboards } from '@/lib/leaderboard-cache';
import { rateLimit } from '@/lib/rate-limit';

async function getStudent() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    if (data.role !== 'student') return null;
    return { uid: decoded.uid, classId: data.classId as string };
  } catch { return null; }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const student = await getStudent();
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!rateLimit(`claim:${student.uid}`, 20, 60_000)) {
    return NextResponse.json({ error: 'รับเควสบ่อยเกินไป กรุณารอสักครู่' }, { status: 429 });
  }

  const { id: questId } = await params;

  const questSnap = await adminDb.collection('quests').doc(questId).get();
  if (!questSnap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const quest = questSnap.data()!;
  if (!quest.isActive) return NextResponse.json({ error: 'Quest inactive' }, { status: 403 });
  const questClassIds = (quest.classIds ?? []) as string[];
  // classIds empty = visible to all; otherwise must match
  if (questClassIds.length > 0 && !questClassIds.includes(student.classId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const today = new Date().toISOString().split('T')[0];

  let existingQuery = adminDb.collection('questClaims')
    .where('questId', '==', questId)
    .where('studentId', '==', student.uid);

  if (quest.resetType === 'daily') {
    existingQuery = existingQuery.where('claimDate', '==', today) as typeof existingQuery;
  }

  const existingSnap = await existingQuery.limit(1).get();
  if (!existingSnap.empty) {
    return NextResponse.json({ error: 'Already claimed' }, { status: 409 });
  }

  const xpReward = quest.xpReward as number;

  await Promise.all([
    adminDb.collection('questClaims').add({
      questId,
      studentId: student.uid,
      classId: student.classId,
      xpAwarded: xpReward,
      claimDate: today,
      claimedAt: FieldValue.serverTimestamp(),
    }),
    adminDb.collection('users').doc(student.uid).update({
      xp: FieldValue.increment(xpReward),
    }),
  ]);

  invalidateLeaderboards(); // xp changed → level ranking
  return NextResponse.json({ xpAwarded: xpReward });
}
