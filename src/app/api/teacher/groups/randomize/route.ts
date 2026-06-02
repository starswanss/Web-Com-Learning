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

// POST /api/teacher/groups/randomize
// Body: { assignmentId, groupCount, clearExisting? }
// Randomizes students per class — students from different classes are never mixed
export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assignmentId, groupCount, clearExisting = true } = await req.json() as {
    assignmentId: string; groupCount: number; clearExisting?: boolean;
  };

  if (!assignmentId || !groupCount || groupCount < 1) {
    return NextResponse.json({ error: 'assignmentId and groupCount required' }, { status: 400 });
  }

  const assignmentSnap = await adminDb.collection('assignments').doc(assignmentId).get();
  if (!assignmentSnap.exists || assignmentSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const classIds = (assignmentSnap.data()?.classIds as string[]) ?? [];
  if (classIds.length === 0) return NextResponse.json({ error: 'No classes' }, { status: 400 });

  const batch = adminDb.batch();

  if (clearExisting) {
    const existingSnap = await adminDb
      .collection('groups')
      .where('assignmentId', '==', assignmentId)
      .where('teacherId', '==', uid)
      .get();
    existingSnap.docs.forEach((d) => batch.delete(d.ref));
  }

  const created: Array<{ id: string; name: string; memberIds: string[]; classId: string }> = [];
  const multiClass = classIds.length > 1;

  // Randomize per class so students are never mixed across classes
  for (const classId of classIds) {
    const studentsSnap = await adminDb
      .collection('users')
      .where('classId', '==', classId)
      .where('role', '==', 'student')
      .get();

    const studentIds = studentsSnap.docs.map((d) => d.id);

    // Fisher-Yates shuffle
    for (let i = studentIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [studentIds[i], studentIds[j]] = [studentIds[j], studentIds[i]];
    }

    const actualCount = Math.min(groupCount, studentIds.length);
    if (actualCount === 0) continue;

    const groupBuckets: string[][] = Array.from({ length: actualCount }, () => []);
    studentIds.forEach((sid, i) => groupBuckets[i % actualCount].push(sid));

    groupBuckets.forEach((memberIds, i) => {
      const ref = adminDb.collection('groups').doc();
      // Prefix group name with class when assignment spans multiple classes
      const name = multiClass ? `${classId} กลุ่ม ${i + 1}` : `กลุ่ม ${i + 1}`;
      batch.set(ref, {
        assignmentId,
        teacherId: uid,
        classId,
        name,
        memberIds,
        createdAt: FieldValue.serverTimestamp(),
      });
      created.push({ id: ref.id, name, memberIds, classId });
    });
  }

  await batch.commit();
  return NextResponse.json({ groups: created });
}
