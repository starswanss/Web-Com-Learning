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

  const snap = await adminDb.collection('quests')
    .where('teacherId', '==', uid)
    .orderBy('createdAt', 'desc')
    .get();

  return NextResponse.json(
    snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
    }))
  );
}

export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    title: string; description?: string; xpReward: number;
    icon?: string; resetType?: string; classIds: string[];
  };

  if (!body.title?.trim() || !body.xpReward) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const ref = await adminDb.collection('quests').add({
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
    xpReward: Math.max(1, Math.min(1000, Number(body.xpReward))),
    icon: body.icon ?? '⭐',
    resetType: body.resetType === 'once' ? 'once' : 'daily',
    classIds: body.classIds ?? [],
    teacherId: uid,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: ref.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, unknown> & { id: string };
  if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const ref = adminDb.collection('quests').doc(body.id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: _id, teacherId: _t, createdAt: _c, ...updates } = body;
  await ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const ref = adminDb.collection('quests').doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
