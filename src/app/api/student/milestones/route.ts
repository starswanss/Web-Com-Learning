import type { Query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { trackReads, flushReadsIfDue } from '@/lib/read-tracker';

async function getStudentProfile(): Promise<{ uid: string; classId: string; subjectId?: string } | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    return { uid: decoded.uid, classId: data.classId ?? '', subjectId: data.subjectId };
  } catch { return null; }
}

/* GET — milestones with per-student completion status */
export async function GET(req: NextRequest) {
  const profile = await getStudentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subjectId = req.nextUrl.searchParams.get('subject');

  // Fetch milestones for this subject
  let q = adminDb.collection('milestones') as Query;
  if (subjectId) q = q.where('subjectId', '==', subjectId);
  const milestonesSnap = await q.get();
  const milestones = milestonesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

  if (milestones.length === 0) {
    trackReads(profile.uid, 1 + milestonesSnap.size); // user + milestones
    await flushReadsIfDue();
    return NextResponse.json([]);
  }

  // Collect all required assignment ids across all milestones
  const allIds = [...new Set(
    milestones.flatMap((m: any) => m.requiredAssignmentIds ?? [])
  )];

  // Fetch student submissions for those assignments
  let completedSet = new Set<string>();
  let subReads = 0;
  if (allIds.length > 0) {
    const subsSnap = await adminDb
      .collection('submissions')
      .where('studentId', '==', profile.uid)
      .get();
    completedSet = new Set(subsSnap.docs.map(d => d.data().assignmentId as string));
    subReads = subsSnap.size;
  }

  // 1 user doc + milestones + submissions
  trackReads(profile.uid, 1 + milestonesSnap.size + subReads);
  await flushReadsIfDue();

  // Attach progress to each milestone
  const result = milestones.map((m: any) => {
    const required: string[] = m.requiredAssignmentIds ?? [];
    const completedCount = required.filter(id => completedSet.has(id)).length;
    return {
      ...m,
      completedCount,
      totalRequired: required.length,
      isComplete: required.length === 0 || completedCount >= required.length,
    };
  });

  return NextResponse.json(result);
}
