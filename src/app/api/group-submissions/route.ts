import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { FieldValue } from '@/lib/db';

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

// POST /api/group-submissions
// Body (FormData): assignmentId, content?, answers?
// Submits work on behalf of the student's group.
// One submission per group per assignment — returns 409 if already submitted.
export async function POST(req: NextRequest) {
  const student = await getStudentInfo();
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const assignmentId = formData.get('assignmentId') as string;
  const content = (formData.get('content') as string | null) ?? '';
  const answersRaw = formData.get('answers') as string | null;
  const answers = answersRaw ? JSON.parse(answersRaw) : undefined;
  const fileUrl = (formData.get('fileUrl') as string | null) ?? null;

  if (!assignmentId) return NextResponse.json({ error: 'assignmentId required' }, { status: 400 });

  // Verify assignment exists and is open
  const assignmentSnap = await adminDb.collection('assignments').doc(assignmentId).get();
  if (!assignmentSnap.exists) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  const assignment = assignmentSnap.data()!;
  if (assignment.isOpen === false) return NextResponse.json({ error: 'Assignment is closed' }, { status: 403 });

  // Find student's group
  const groupSnap = await adminDb
    .collection('groups')
    .where('assignmentId', '==', assignmentId)
    .where('memberIds', 'array-contains', student.uid)
    .limit(1)
    .get();

  if (groupSnap.empty) return NextResponse.json({ error: 'ยังไม่ได้รับมอบหมายกลุ่ม' }, { status: 400 });

  const groupId = groupSnap.docs[0].id;

  // Check for existing submission (duplicate block)
  const existingSnap = await adminDb
    .collection('groupSubmissions')
    .where('groupId', '==', groupId)
    .where('assignmentId', '==', assignmentId)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    return NextResponse.json({ error: 'กลุ่มส่งงานนี้ไปแล้ว' }, { status: 409 });
  }

  const docRef = await adminDb.collection('groupSubmissions').add({
    groupId,
    assignmentId,
    classId: student.classId,
    submittedBy: student.uid,
    content: content || '',
    ...(answers ? { answers } : {}),
    ...(fileUrl ? { fileUrl } : {}),
    status: 'submitted',
    submittedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: docRef.id }, { status: 201 });
}
