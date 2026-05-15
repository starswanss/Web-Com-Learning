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

export async function GET() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const snap = await adminDb
    .collection('questionBank')
    .where('teacherId', '==', uid)
    .get();

  const questions = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (b.createdAt?._seconds ?? 0) - (a.createdAt?._seconds ?? 0));

  return NextResponse.json(questions);
}

export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { type, question, options, tags } = await req.json();
  if (!type || !question?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const ref = await adminDb.collection('questionBank').add({
    type,
    question: question.trim(),
    options: options ?? [],
    tags: tags ?? [],
    teacherId: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: ref.id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const snap = await adminDb.collection('questionBank').doc(id).get();
  if (!snap.exists || snap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await snap.ref.delete();
  return NextResponse.json({ ok: true });
}
