import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { trackReads, flushReadsIfDue } from '@/lib/read-tracker';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [decoded, { id }] = await Promise.all([
      adminAuth.verifySessionCookie(session, false),
      params,
    ]);

    const [userSnap, assignmentSnap] = await Promise.all([
      adminDb.collection('users').doc(decoded.uid).get(),
      adminDb.collection('assignments').doc(id).get(),
    ]);

    // 2 doc reads (user + assignment).
    trackReads(decoded.uid, 2);
    await flushReadsIfDue();

    if (!userSnap.exists || !assignmentSnap.exists) {
      return NextResponse.json(null);
    }

    const classId = userSnap.data()!.classId as string;
    const assignment = assignmentSnap.data()!;

    if (!(assignment.classIds as string[]).includes(classId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ id, ...assignment });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
