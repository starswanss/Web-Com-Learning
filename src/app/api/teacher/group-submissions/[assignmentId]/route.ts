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

// GET /api/teacher/group-submissions/[assignmentId]
// Returns all groups + their submission status for a given assignment.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assignmentId } = await params;

  const assignmentSnap = await adminDb.collection('assignments').doc(assignmentId).get();
  if (!assignmentSnap.exists || assignmentSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch all groups and all submissions in parallel
  const [groupsSnap, subsSnap] = await Promise.all([
    adminDb.collection('groups').where('assignmentId', '==', assignmentId).where('teacherId', '==', uid).get(),
    adminDb.collection('groupSubmissions').where('assignmentId', '==', assignmentId).get(),
  ]);

  const submissionByGroup = new Map<string, Record<string, unknown>>();
  subsSnap.docs.forEach((d) => {
    submissionByGroup.set(d.data().groupId as string, { id: d.id, ...d.data() });
  });

  // Collect all member UIDs for name lookup
  const groups = groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{
    id: string; name: string; memberIds: string[]; classId: string;
  }>;
  const allUids = Array.from(new Set(groups.flatMap((g) => g.memberIds)));
  const memberMap = new Map<string, string>();

  if (allUids.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < allUids.length; i += 30) chunks.push(allUids.slice(i, i + 30));
    for (const chunk of chunks) {
      const usersSnap = await adminDb.collection('users').where('__name__', 'in', chunk).get();
      usersSnap.docs.forEach((d) => memberMap.set(d.id, d.data().displayName as string));
    }
  }

  const result = groups.map((g) => ({
    ...g,
    memberNames: g.memberIds.map((uid) => memberMap.get(uid) ?? uid),
    submission: submissionByGroup.get(g.id) ?? null,
  }));

  return NextResponse.json({ assignment: { id: assignmentId, ...assignmentSnap.data() }, groups: result });
}
