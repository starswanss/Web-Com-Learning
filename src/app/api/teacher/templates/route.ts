import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
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
  } catch {
    return null;
  }
}

export async function GET() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const snap = await adminDb
    .collection('templates')
    .where('teacherId', '==', uid)
    .orderBy('createdAt', 'desc')
    .get();

  const templates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, contentType, unit, blocks, rubric } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const docRef = await adminDb.collection('templates').add({
    name: name.trim(),
    contentType: contentType ?? 'worksheet',
    unit: unit ?? null,
    blocks: blocks ?? [],
    rubric: rubric ?? null,
    teacherId: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: docRef.id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const doc = await adminDb.collection('templates').doc(id).get();
  if (!doc.exists || doc.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await doc.ref.delete();
  return NextResponse.json({ ok: true });
}
