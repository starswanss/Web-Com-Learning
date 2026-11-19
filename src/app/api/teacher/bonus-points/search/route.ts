import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';

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

/* GET /api/teacher/bonus-points/search?email= — find student by email */
export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = req.nextUrl.searchParams.get('email')?.toLowerCase().trim();
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

  const snap = await adminDb
    .collection('users')
    .where('role', '==', 'student')
    .where('email', '==', email)
    .get();

  if (snap.empty) {
    /* fallback: try displayName partial search isn't possible in Firestore,
       but we can also try a broader search and filter in JS */
    const allSnap = await adminDb.collection('users').where('role', '==', 'student').get();
    const match = allSnap.docs.find((d) =>
      (d.data().email as string | undefined)?.toLowerCase().includes(email) ||
      (d.data().displayName as string | undefined)?.toLowerCase().includes(email)
    );
    if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const d = match.data();
    return NextResponse.json({
      studentId: match.id,
      displayName: d.displayName ?? '',
      email: d.email ?? '',
      classId: d.classId ?? '',
    });
  }

  const d = snap.docs[0].data();
  return NextResponse.json({
    studentId: snap.docs[0].id,
    displayName: d.displayName ?? '',
    email: d.email ?? '',
    classId: d.classId ?? '',
  });
}
