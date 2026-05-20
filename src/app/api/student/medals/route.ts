import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';

async function getStudentUid(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    return decoded.uid;
  } catch { return null; }
}

export async function GET() {
  const uid = await getStudentUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const snap = await adminDb.collection('bonusPoints')
    .where('studentId', '==', uid)
    .limit(20)
    .get();

  const medals = snap.docs
    .sort((a, b) => (b.data().createdAt?._seconds ?? 0) - (a.data().createdAt?._seconds ?? 0))
    .map(d => {
    const data = d.data();
    return {
      id: d.id,
      medal: data.medal as string,
      icon: data.icon as string | undefined,
      points: data.points as number,
      reason: data.reason as string,
      createdAt: data.createdAt?._seconds ?? null,
    };
  });

  return NextResponse.json(medals);
}
