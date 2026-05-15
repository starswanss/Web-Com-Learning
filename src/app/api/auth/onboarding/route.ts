import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = await adminAuth.verifySessionCookie(session, false);
    const { classId, subjectId } = await req.json();
    if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 });

    const userRef = adminDb.collection('users').doc(decoded.uid);
    await userRef.update({
      classId,
      subjectId: subjectId ?? null,
      onboardingComplete: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const snap = await userRef.get();
    const data = snap.data()!;
    return NextResponse.json({
      ...data,
      uid: decoded.uid,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: new Date(),
    });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
