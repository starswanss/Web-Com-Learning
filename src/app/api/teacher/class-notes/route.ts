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

// GET /api/teacher/class-notes — returns all notes for this teacher
export async function GET() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const snap = await adminDb
    .collection('classNotes')
    .where('teacherId', '==', uid)
    .get();

  const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json(notes);
}

// POST /api/teacher/class-notes — upsert a note for a class
export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { classId, week, topic, note } = await req.json() as {
    classId: string;
    week: number;
    topic: string;
    note: string;
  };

  if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 });

  const docId = `${uid}_${classId}`;
  await adminDb.collection('classNotes').doc(docId).set({
    teacherId: uid,
    classId,
    week: week ?? 1,
    topic: topic ?? '',
    note: note ?? '',
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return NextResponse.json({ ok: true });
}
