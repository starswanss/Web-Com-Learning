import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';

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

// GET /api/teacher/groups?assignmentId=xxx
// Returns all groups + member display names for an assignment
export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const assignmentId = new URL(req.url).searchParams.get('assignmentId');
  if (!assignmentId) return NextResponse.json({ error: 'assignmentId required' }, { status: 400 });

  const assignmentSnap = await adminDb.collection('assignments').doc(assignmentId).get();
  if (!assignmentSnap.exists || assignmentSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const groupsSnap = await adminDb
    .collection('groups')
    .where('assignmentId', '==', assignmentId)
    .where('teacherId', '==', uid)
    .get();

  const groups = groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{
    id: string; name: string; memberIds: string[]; classId: string; assignmentId: string; teacherId: string;
  }>;

  // Collect all unique member UIDs and fetch their profiles
  const allUids = Array.from(new Set(groups.flatMap((g) => g.memberIds)));
  const memberMap = new Map<string, { displayName: string; photoURL?: string }>();

  if (allUids.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < allUids.length; i += 30) chunks.push(allUids.slice(i, i + 30));
    for (const chunk of chunks) {
      const usersSnap = await adminDb.collection('users').where('__name__', 'in', chunk).get();
      usersSnap.docs.forEach((d) => {
        memberMap.set(d.id, { displayName: d.data().displayName, photoURL: d.data().photoURL });
      });
    }
  }

  const result = groups.map((g) => ({
    ...g,
    members: g.memberIds.map((uid) => ({
      uid,
      displayName: memberMap.get(uid)?.displayName ?? uid,
      photoURL: memberMap.get(uid)?.photoURL,
    })),
  }));

  return NextResponse.json(result);
}

// POST /api/teacher/groups
// Body: { assignmentId, name, memberIds }
export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assignmentId, name, memberIds, classId: reqClassId } = await req.json() as {
    assignmentId: string; name: string; memberIds: string[]; classId?: string;
  };

  if (!assignmentId || !name || !Array.isArray(memberIds)) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const assignmentSnap = await adminDb.collection('assignments').doc(assignmentId).get();
  if (!assignmentSnap.exists || assignmentSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const classIds = (assignmentSnap.data()?.classIds as string[]) ?? [];
  // Use provided classId if it belongs to this assignment, otherwise fall back to first class
  const classId = (reqClassId && classIds.includes(reqClassId)) ? reqClassId : (classIds[0] ?? '');

  const docRef = await adminDb.collection('groups').add({
    assignmentId,
    teacherId: uid,
    classId,
    name: name.trim(),
    memberIds,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: docRef.id }, { status: 201 });
}
