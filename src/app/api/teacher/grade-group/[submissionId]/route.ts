import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
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
  } catch { return null; }
}

// PATCH /api/teacher/grade-group/[submissionId]
// Body: { score, feedback }
// Grades a group submission and awards XP to every member of the group.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { submissionId } = await params;
  const { score, feedback } = await req.json() as { score: number; feedback?: string };

  if (typeof score !== 'number' || score < 0 || score > 100) {
    return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
  }

  const subSnap = await adminDb.collection('groupSubmissions').doc(submissionId).get();
  if (!subSnap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sub = subSnap.data()!;

  // Verify teacher owns the assignment
  const assignmentSnap = await adminDb.collection('assignments').doc(sub.assignmentId as string).get();
  if (!assignmentSnap.exists || assignmentSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch group to get all member UIDs
  const groupSnap = await adminDb.collection('groups').doc(sub.groupId as string).get();
  if (!groupSnap.exists) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  const memberIds = (groupSnap.data()!.memberIds as string[]) ?? [];

  const previousXp = (sub.xpAwarded as number) ?? 0;
  const newXp = score * 10;
  const xpDelta = newXp - previousXp;

  const batch = adminDb.batch();

  // Update group submission
  batch.update(adminDb.collection('groupSubmissions').doc(submissionId), {
    score,
    feedback: feedback ?? '',
    status: 'reviewed',
    xpAwarded: newXp,
    reviewedAt: FieldValue.serverTimestamp(),
  });

  // Award XP to every group member
  if (xpDelta !== 0) {
    for (const memberId of memberIds) {
      batch.update(adminDb.collection('users').doc(memberId), {
        xp: FieldValue.increment(xpDelta),
      });
    }
  }

  await batch.commit();
  invalidateLeaderboards(); // score + xp for all members

  return NextResponse.json({ ok: true, xpAwarded: newXp, xpDelta, memberCount: memberIds.length });
}
