import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { removeSubmitter } from '@/lib/assignment-stats';
import { invalidateLeaderboards } from '@/lib/leaderboard-cache';

async function getTeacherUid(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists || snap.data()?.role !== 'teacher') return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { submissionId } = await params;

  const submissionSnap = await adminDb.collection('submissions').doc(submissionId).get();
  if (!submissionSnap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const submissionData = submissionSnap.data()!;

  // Verify teacher owns the assignment this submission belongs to
  const assignmentSnap = await adminDb.collection('assignments').doc(submissionData.assignmentId).get();
  if (!assignmentSnap.exists || assignmentSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await submissionSnap.ref.delete();

  // Keep the precomputed submitter set and cached stats in sync.
  await removeSubmitter(submissionData.assignmentId as string, submissionData.studentId as string).catch(() => {});
  invalidateLeaderboards();

  return NextResponse.json({ deleted: true });
}
