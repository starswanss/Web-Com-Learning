import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
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

export async function GET() {
  const snap = await adminDb.collection('system').doc('config').get();
  const logoUrl = snap.exists ? (snap.data()?.logoUrl ?? null) : null;
  return NextResponse.json({ logoUrl });
}

export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { logoUrl } = await req.json();
  await adminDb.collection('system').doc('config').set(
    { logoUrl: logoUrl ?? null, logoUpdatedBy: uid, logoUpdatedAt: new Date() },
    { merge: true }
  );
  return NextResponse.json({ ok: true });
}
