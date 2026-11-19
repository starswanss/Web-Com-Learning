import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { FieldValue } from '@/lib/db';

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

/* POST /api/teacher/parent-token — create or refresh token for a student */
export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { studentId } = await req.json();
  if (!studentId) return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });

  const studentSnap = await adminDb.collection('users').doc(studentId).get();
  if (!studentSnap.exists) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const student = studentSnap.data()!;

  /* check if an unexpired token already exists */
  const existing = await adminDb
    .collection('parentTokens')
    .where('studentId', '==', studentId)
    .get();

  const now = Date.now();
  for (const doc of existing.docs) {
    if ((doc.data().expiresAt?.toMillis() ?? 0) > now) {
      return NextResponse.json({ token: doc.id });
    }
    await doc.ref.delete();
  }

  /* generate new 30-day token */
  const token = crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000);

  await adminDb.collection('parentTokens').doc(token).set({
    studentId,
    studentName: student.displayName ?? '',
    classId: student.classId ?? '',
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  });

  return NextResponse.json({ token });
}

/* DELETE /api/teacher/parent-token — revoke a token */
export async function DELETE(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  await adminDb.collection('parentTokens').doc(token).delete();
  return NextResponse.json({ ok: true });
}
