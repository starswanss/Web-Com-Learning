import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
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

/**
 * Remove the due date from the teacher's existing assignments (keeps the
 * assignments — only clears dueDate so no date/time shows anywhere). New
 * assignments already have no due date.
 */
export async function POST() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const snap = await adminDb.collection('assignments').where('teacherId', '==', uid).get();
  const withDue = snap.docs.filter((d) => d.data().dueDate != null);

  const CHUNK = 400;
  let cleared = 0;
  for (let i = 0; i < withDue.length; i += CHUNK) {
    const batch = adminDb.batch();
    withDue.slice(i, i + CHUNK).forEach((d) => { batch.update(d.ref, { dueDate: null }); cleared++; });
    await batch.commit();
  }

  invalidateLeaderboards();
  return NextResponse.json({ cleared });
}
