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

/* GET — list milestones for teacher (filtered by subjectId) */
export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subjectId = req.nextUrl.searchParams.get('subject');
  const base = adminDb.collection('milestones').where('teacherId', '==', uid);
  const q = subjectId ? base.where('subjectId', '==', subjectId) : base;
  const snap = await q.get();
  const milestones = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  return NextResponse.json(milestones);
}

/* POST — create a milestone */
export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, description, icon, order, subjectId, requiredAssignmentIds } = await req.json();
  if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 });

  const ref = await adminDb.collection('milestones').add({
    title: title.trim(),
    description: description?.trim() ?? '',
    icon: icon ?? '🎯',
    order: typeof order === 'number' ? order : 0,
    subjectId: subjectId ?? null,
    teacherId: uid,
    requiredAssignmentIds: Array.isArray(requiredAssignmentIds) ? requiredAssignmentIds : [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ id: ref.id }, { status: 201 });
}

/* PATCH — update a milestone */
export async function PATCH(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, title, description, icon, order, requiredAssignmentIds } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const doc = await adminDb.collection('milestones').doc(id).get();
  if (!doc.exists || doc.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description.trim();
  if (icon !== undefined) updates.icon = icon;
  if (typeof order === 'number') updates.order = order;
  if (Array.isArray(requiredAssignmentIds)) updates.requiredAssignmentIds = requiredAssignmentIds;

  await adminDb.collection('milestones').doc(id).update(updates);
  return NextResponse.json({ ok: true });
}

/* DELETE — remove a milestone */
export async function DELETE(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const doc = await adminDb.collection('milestones').doc(id).get();
  if (!doc.exists || doc.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await adminDb.collection('milestones').doc(id).delete();
  return NextResponse.json({ ok: true });
}
