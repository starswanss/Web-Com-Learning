import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { uploadAssignmentFile } from '@/lib/google-drive';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import { sendLineNotify, getLineNotifyToken } from '@/lib/line-notify';

async function getTeacherUid(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'teacher') return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subjectId = new URL(req.url).searchParams.get('subject');
  const base = adminDb.collection('assignments').where('teacherId', '==', uid);
  const filtered = subjectId ? base.where('subjectId', '==', subjectId) : base;
  const snap = await filtered.get();
  const assignments = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (b.createdAt?._seconds ?? 0) - (a.createdAt?._seconds ?? 0));
  return NextResponse.json(assignments);
}

export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const title = formData.get('title') as string;
  const description = formData.get('description') as string;
  const dueDate = formData.get('dueDate') as string;
  const classIds = JSON.parse(formData.get('classIds') as string) as string[];
  const file = formData.get('file') as File | null;
  const blocksRaw = formData.get('blocks') as string | null;
  const blocks = blocksRaw ? JSON.parse(blocksRaw) : [];
  const rubric = (formData.get('rubric') as string | null) ?? '';
  const subjectId = (formData.get('subjectId') as string | null) ?? '';
  const unit = (formData.get('unit') as string | null) ?? '';
  const contentType = (formData.get('contentType') as string | null) ?? 'worksheet';
  const timeLimitRaw = formData.get('timeLimit') as string | null;
  const timeLimit = timeLimitRaw ? parseInt(timeLimitRaw, 10) : null;
  const quizPhase = (formData.get('quizPhase') as string | null) ?? null;
  const pairedQuizId = (formData.get('pairedQuizId') as string | null) ?? null;
  // dueDate is required only for worksheet; quiz/knowledge can omit it
  const dueDateRequired = contentType === 'worksheet';

  if (!title || (dueDateRequired && !dueDate) || !classIds.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  let driveFileId: string | undefined;
  let driveWebViewLink: string | undefined;

  if (file) {
    // Upload once — all classes share the same file link
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadAssignmentFile(classIds[0], buffer, file.type, file.name);
    driveFileId = result.fileId;
    driveWebViewLink = result.webViewLink;
  }

  const docRef = await adminDb.collection('assignments').add({
    title,
    description,
    dueDate: dueDate ? new Date(dueDate) : null,
    classIds,
    teacherId: uid,
    driveFileId: driveFileId ?? null,
    driveWebViewLink: driveWebViewLink ?? null,
    blocks,
    rubric: rubric || null,
    subjectId: subjectId || null,
    unit: unit || null,
    contentType: contentType || 'worksheet',
    timeLimit: timeLimit ?? null,
    isOpen: contentType === 'quiz' ? false : true,
    quizPhase: quizPhase || null,
    pairedQuizId: pairedQuizId || null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Best-effort LINE Notify
  const lineToken = await getLineNotifyToken(adminDb);
  if (lineToken) {
    const typeLabel = contentType === 'quiz' ? 'แบบทดสอบ' : contentType === 'knowledge' ? 'ใบความรู้' : 'ใบงาน';
    const classList = classIds.join(', ');
    const due = dueDate ? ` (กำหนดส่ง: ${new Date(dueDate).toLocaleDateString('th-TH')})` : '';
    sendLineNotify(lineToken, `\n📚 มอบหมาย${typeLabel}ใหม่\nชื่อ: ${title}\nห้อง: ${classList}${due}`);
  }

  return NextResponse.json({ id: docRef.id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const doc = await adminDb.collection('assignments').doc(id).get();
  if (!doc.exists || doc.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await adminDb.collection('assignments').doc(id).delete();
  return NextResponse.json({ status: 'ok' });
}
