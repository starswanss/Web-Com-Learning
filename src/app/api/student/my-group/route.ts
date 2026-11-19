import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';

async function getStudentInfo(): Promise<{ uid: string; classId: string } | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists || snap.data()?.role !== 'student') return null;
    return { uid: decoded.uid, classId: snap.data()?.classId as string };
  } catch { return null; }
}

// GET /api/student/my-group?assignmentId=xxx
// Returns the group this student belongs to for a given assignment,
// including member display names and current group submission status.
export async function GET(req: NextRequest) {
  const student = await getStudentInfo();
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const assignmentId = new URL(req.url).searchParams.get('assignmentId');
  if (!assignmentId) return NextResponse.json({ error: 'assignmentId required' }, { status: 400 });

  // Find group where this student is a member
  const groupsSnap = await adminDb
    .collection('groups')
    .where('assignmentId', '==', assignmentId)
    .where('memberIds', 'array-contains', student.uid)
    .limit(1)
    .get();

  if (groupsSnap.empty) {
    return NextResponse.json(null);
  }

  const groupDoc = groupsSnap.docs[0];
  const group = { id: groupDoc.id, ...groupDoc.data() } as {
    id: string; name: string; memberIds: string[]; classId: string; assignmentId: string;
  };

  // Fetch member display names
  const memberSnaps = await Promise.all(
    group.memberIds.map((uid) => adminDb.collection('users').doc(uid).get())
  );
  const members = memberSnaps
    .filter((s) => s.exists)
    .map((s) => ({ uid: s.id, displayName: s.data()!.displayName as string, photoURL: s.data()!.photoURL as string | undefined }));

  // Fetch this group's submission (if any)
  const subSnap = await adminDb
    .collection('groupSubmissions')
    .where('groupId', '==', group.id)
    .where('assignmentId', '==', assignmentId)
    .limit(1)
    .get();

  const submission = subSnap.empty ? null : { id: subSnap.docs[0].id, ...subSnap.docs[0].data() };

  return NextResponse.json({ group: { ...group, members }, submission });
}
