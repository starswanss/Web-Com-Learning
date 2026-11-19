import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { getLiveSubjectIds, studentSubjectId } from '@/lib/assignment-access';

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

  // Only the subject the student enrolled in.
  const subjectId = studentSubjectId(
    { subjectId: profile.subjectId },
    req.nextUrl.searchParams.get('subject'),
    await getLiveSubjectIds(),
  );
  if (!subjectId) return NextResponse.json([]);

  // Milestones are judged only against work that is in the system now: the
  // subject's live assignments. Requirements pointing at deleted work are
  // dropped, so a milestone can't get stuck at "1/2" forever.
  const [milestonesSnap, assignmentsSnap, subsSnap] = await Promise.all([
    adminDb.collection('milestones').where('subjectId', '==', subjectId).get(),
    adminDb.collection('assignments').where('subjectId', '==', subjectId).get(),
    adminDb.collection('submissions').where('studentId', '==', profile.uid).get(),
  ]);
  const isOpen = new Map(assignmentsSnap.docs.map((d) => [d.id, d.data().isOpen !== false]));
  const submitted = new Set(subsSnap.docs.map((d) => d.data().assignmentId as string));

  const result = milestonesSnap.docs
    .map((d) => {
      const m = d.data();
      const required = ((m.requiredAssignmentIds as string[]) ?? []).filter((id) => isOpen.has(id));
      const completedCount = required.filter((id) => submitted.has(id)).length;
      return {
        id: d.id,
        title: m.title as string,
        description: (m.description as string) ?? '',
        icon: (m.icon as string) ?? '🎯',
        order: (m.order as number) ?? 0,
        requiredAssignmentIds: required,
        completedCount,
        totalRequired: required.length,
        isComplete: required.length > 0 && completedCount >= required.length,
        // Every required piece is still locked and untouched → not started yet.
        notOpenYet: required.every((id) => !isOpen.get(id) && !submitted.has(id)),
      };
    })
    // A milestone with no work left in the system, or whose work the teacher
    // hasn't opened yet, isn't shown.
    .filter((m) => m.totalRequired > 0 && !m.notOpenYet)
    .map(({ notOpenYet: _hidden, ...m }) => { void _hidden; return m; })
    .sort((a, b) => a.order - b.order);

  return NextResponse.json(result);
}
