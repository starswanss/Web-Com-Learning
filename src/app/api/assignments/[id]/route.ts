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
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const snap = await adminDb.collection('assignments').doc(id).get();
  if (!snap.exists || snap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ id, ...snap.data() });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const snap = await adminDb.collection('assignments').doc(id).get();
  if (!snap.exists || snap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const formData = await req.formData();
  const title = formData.get('title') as string;
  const dueDate = formData.get('dueDate') as string;
  const classIds = JSON.parse(formData.get('classIds') as string) as string[];
  const blocksRaw = formData.get('blocks') as string | null;
  const blocks = blocksRaw ? JSON.parse(blocksRaw) : snap.data()?.blocks ?? [];
  const rubric = (formData.get('rubric') as string | null) ?? '';
  const unit = (formData.get('unit') as string | null) ?? '';
  const contentType = (formData.get('contentType') as string | null) ?? snap.data()?.contentType ?? 'worksheet';

  if (!title || !dueDate || !classIds.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  await adminDb.collection('assignments').doc(id).update({
    title,
    dueDate: new Date(dueDate),
    classIds,
    blocks,
    rubric: rubric || null,
    unit: unit || null,
    contentType,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
