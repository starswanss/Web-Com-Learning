import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { trackReads, flushReadsIfDue } from '@/lib/read-tracker';
import { studentCanAccessAssignment } from '@/lib/assignment-access';

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

    if (!userSnap.exists || !assignmentSnap.exists) {
      trackReads(decoded.uid, 2);
      await flushReadsIfDue();
      return NextResponse.json(null);
    }

    const classId = userSnap.data()!.classId as string;
    const assignment = assignmentSnap.data()!;

    // Subject-wide entitlement — matches the dashboard, so an assignment the
    // student can see listed is one they can actually open. (The old
    // classIds-only check 403'd subject-wide assignments, so the page loaded
    // with no blocks — "no questions".)
    const { entitled, reads } = await studentCanAccessAssignment(classId, assignment);

    // 2 doc reads (user + assignment) + an optional subject read.
    trackReads(decoded.uid, 2 + reads);
    await flushReadsIfDue();

    if (!entitled) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ id, ...assignment });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
