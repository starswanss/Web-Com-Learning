import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
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

    const classId = (userSnap.data()!.classId ?? '') as string;

    if (!classId) {
      // Student has no classId set — onboarding incomplete or data missing
      return NextResponse.json({ error: 'no_class', subjects: [] }, { status: 200 });
    }

    const snap = await adminDb
      .collection('subjects')
      .where('classIds', 'array-contains', classId)
      .get();

    const subjects = snap.docs.map((d) => ({
      id: d.id,
      name: d.data().name as string,
      classIds: (d.data().classIds ?? []) as string[],
    }));


    return NextResponse.json({ classId, subjects });
  } catch (err) {
    console.error('[subjects/student]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
