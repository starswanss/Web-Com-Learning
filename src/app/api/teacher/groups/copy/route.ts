import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from '@/lib/db';

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

// GET /api/teacher/groups/copy?assignmentId=CURRENT
// Lists this teacher's other assignments that already have groups (candidate
// sources to copy from), with a group count and title.
export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const currentId = new URL(req.url).searchParams.get('assignmentId');

  const groupsSnap = await adminDb.collection('groups').where('teacherId', '==', uid).get();

  const countByAssignment = new Map<string, number>();
  groupsSnap.docs.forEach((d) => {
    const aid = d.data().assignmentId as string;
    if (!aid || aid === currentId) return;
    countByAssignment.set(aid, (countByAssignment.get(aid) ?? 0) + 1);
  });

  const ids = [...countByAssignment.keys()];
  if (ids.length === 0) return NextResponse.json([]);

  // Resolve assignment titles (chunked __name__ in, max 30).
  const titleMap = new Map<string, { title: string; classIds: string[] }>();
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snap = await adminDb.collection('assignments').where('__name__', 'in', chunk).get();
    snap.docs.forEach((d) => {
      if (d.data().teacherId !== uid) return;
      titleMap.set(d.id, {
        title: (d.data().title as string) ?? '(ไม่มีชื่อ)',
        classIds: (d.data().classIds as string[]) ?? [],
      });
    });
  }

  const sources = ids
    .filter((id) => titleMap.has(id))
    .map((id) => ({
      assignmentId: id,
      title: titleMap.get(id)!.title,
      classIds: titleMap.get(id)!.classIds,
      groupCount: countByAssignment.get(id) ?? 0,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'th'));

  return NextResponse.json(sources);
}

// POST /api/teacher/groups/copy
// Body: { assignmentId (target), sourceAssignmentId, clearExisting? }
// Copies groups (name + members) from the source assignment into the target.
// Only groups whose classId belongs to the target assignment are copied.
export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assignmentId, sourceAssignmentId, clearExisting } = await req.json() as {
    assignmentId: string; sourceAssignmentId: string; clearExisting?: boolean;
  };
  if (!assignmentId || !sourceAssignmentId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  if (assignmentId === sourceAssignmentId) {
    return NextResponse.json({ error: 'Source and target are the same' }, { status: 400 });
  }

  // Verify the teacher owns the target assignment.
  const targetSnap = await adminDb.collection('assignments').doc(assignmentId).get();
  if (!targetSnap.exists || targetSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const targetClassIds = (targetSnap.data()?.classIds as string[]) ?? [];

  // Fetch source groups (must belong to this teacher).
  const sourceSnap = await adminDb
    .collection('groups')
    .where('assignmentId', '==', sourceAssignmentId)
    .where('teacherId', '==', uid)
    .get();

  if (sourceSnap.empty) {
    return NextResponse.json({ error: 'No groups in source assignment' }, { status: 404 });
  }

  const batch = adminDb.batch();

  // Optionally clear the target's existing groups first.
  let cleared = 0;
  if (clearExisting) {
    const existingSnap = await adminDb
      .collection('groups')
      .where('assignmentId', '==', assignmentId)
      .where('teacherId', '==', uid)
      .get();
    existingSnap.docs.forEach((d) => { batch.delete(d.ref); cleared++; });
  }

  let copied = 0;
  let skipped = 0;
  sourceSnap.docs.forEach((d) => {
    const g = d.data();
    const classId = g.classId as string;
    // Only copy groups whose class is part of the target assignment.
    if (targetClassIds.length > 0 && classId && !targetClassIds.includes(classId)) {
      skipped++;
      return;
    }
    batch.set(adminDb.collection('groups').doc(), {
      assignmentId,
      teacherId: uid,
      classId: classId ?? (targetClassIds[0] ?? ''),
      name: (g.name as string) ?? 'กลุ่ม',
      memberIds: (g.memberIds as string[]) ?? [],
      createdAt: FieldValue.serverTimestamp(),
    });
    copied++;
  });

  if (copied === 0) {
    return NextResponse.json({ error: 'No matching groups to copy (ห้องเรียนไม่ตรงกับใบงานนี้)', copied: 0, skipped }, { status: 400 });
  }

  await batch.commit();
  return NextResponse.json({ copied, skipped, cleared });
}
