import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { getAiStatus } from '@/lib/ai-status';

async function isTeacher(): Promise<boolean> {
  try {
    const session = (await cookies()).get('__session')?.value;
    if (!session) return false;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    return snap.exists && snap.data()?.role === 'teacher';
  } catch {
    return false;
  }
}

export async function GET() {
  if (!(await isTeacher())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await getAiStatus());
}
