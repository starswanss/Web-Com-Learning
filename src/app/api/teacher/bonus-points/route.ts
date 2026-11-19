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
  } catch { return null; }
}

/* GET — list all bonus entries (optionally filter by studentId) */
export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const studentId = req.nextUrl.searchParams.get('studentId');
  const snap = studentId
    ? await adminDb.collection('bonusPoints').where('studentId', '==', studentId).get()
    : await adminDb.collection('bonusPoints').where('teacherId', '==', uid).get();

  const entries = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (b.createdAt?._seconds ?? 0) - (a.createdAt?._seconds ?? 0));

  return NextResponse.json(entries);
}

/* POST — award bonus points to a student */
export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { studentId, points, medal, reason, icon } = await req.json();
  if (!studentId || !points || !medal) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const studentSnap = await adminDb.collection('users').doc(studentId).get();
  if (!studentSnap.exists || studentSnap.data()?.role !== 'student') {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  const student = studentSnap.data()!;
  const ref = await adminDb.collection('bonusPoints').add({
    studentId,
    studentName: student.displayName ?? '',
    classId: student.classId ?? '',
    points: Number(points),
    medal,
    icon: icon ?? null,
    reason: reason?.trim() ?? '',
    teacherId: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  invalidateLeaderboards(); // bonus points changed
  return NextResponse.json({ id: ref.id }, { status: 201 });
}

/* DELETE — revoke a bonus entry */
export async function DELETE(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const snap = await adminDb.collection('bonusPoints').doc(id).get();
  if (!snap.exists || snap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await snap.ref.delete();
  invalidateLeaderboards(); // bonus points changed
  return NextResponse.json({ ok: true });
}
