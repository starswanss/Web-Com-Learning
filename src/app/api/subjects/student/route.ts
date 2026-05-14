import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = await adminAuth.verifySessionCookie(session, false);
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!userSnap.exists || userSnap.data()?.role !== 'student') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const classId = userSnap.data()!.classId as string;
    const snap = await adminDb
      .collection('subjects')
      .where('classIds', 'array-contains', classId)
      .get();

    return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
