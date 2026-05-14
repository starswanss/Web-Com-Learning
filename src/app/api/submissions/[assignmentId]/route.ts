import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const { assignmentId } = await params;

    const snap = await adminDb
      .collection('submissions')
      .where('assignmentId', '==', assignmentId)
      .where('studentId', '==', decoded.uid)
      .limit(1)
      .get();

    if (snap.empty) return NextResponse.json(null);
    return NextResponse.json({ id: snap.docs[0].id, ...snap.docs[0].data() });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
