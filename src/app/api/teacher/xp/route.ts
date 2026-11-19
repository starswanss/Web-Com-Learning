import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { FieldValue } from '@/lib/db';
import { cookies } from 'next/headers';
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
  } catch { return null; }
}

export async function PATCH(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { studentUid, action, amount } = await req.json() as {
    studentUid: string;
    action: 'reset' | 'add';
    amount?: number;
  };

  if (!studentUid || !action) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const studentDoc = await adminDb.collection('users').doc(studentUid).get();
  if (!studentDoc.exists || studentDoc.data()?.role !== 'student') {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  if (action === 'reset') {
    await adminDb.collection('users').doc(studentUid).update({
      xp: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
    invalidateLeaderboards(); // xp changed
    return NextResponse.json({ ok: true, newXp: 0 });
  }

  if (action === 'add') {
    const addAmount = typeof amount === 'number' ? Math.round(amount) : 0;
    if (addAmount === 0) return NextResponse.json({ error: 'Amount required' }, { status: 400 });
    const currentXp = (studentDoc.data()?.xp as number) ?? 0;
    const newXp = Math.max(0, currentXp + addAmount);
    await adminDb.collection('users').doc(studentUid).update({
      xp: newXp,
      updatedAt: FieldValue.serverTimestamp(),
    });
    invalidateLeaderboards(); // xp changed
    return NextResponse.json({ ok: true, newXp });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
