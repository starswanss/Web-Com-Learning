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

export async function GET() {
  const snap = await adminDb.collection('system').doc('timetable').get();
  if (!snap.exists) return NextResponse.json({ cells: {} });
  return NextResponse.json(snap.data());
}

export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { cells } = await req.json();
  await adminDb.collection('system').doc('timetable').set({ cells, updatedBy: uid, updatedAt: new Date() }, { merge: false });
  return NextResponse.json({ ok: true });
}
