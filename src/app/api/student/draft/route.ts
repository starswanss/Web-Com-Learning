import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import { trackReads, flushReadsIfDue } from '@/lib/read-tracker';

/**
 * Server-side backup of a student's in-progress (unsubmitted) answers, keyed by
 * student + assignment. localStorage already keeps an instant local copy; this
 * lets the draft follow the student to another device (e.g. a different lab
 * computer). Writes are throttled on the client, so this stays cheap.
 */
async function getStudentUid(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists || snap.data()?.role !== 'student') return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

const draftId = (uid: string, assignmentId: string) => `${uid}__${assignmentId}`;

// GET ?assignmentId= → the saved draft, or null.
export async function GET(req: NextRequest) {
  const uid = await getStudentUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const assignmentId = new URL(req.url).searchParams.get('assignmentId');
  if (!assignmentId) return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 });

  const snap = await adminDb.collection('drafts').doc(draftId(uid, assignmentId)).get();
  trackReads(uid, 1);
  await flushReadsIfDue();
  if (!snap.exists) return NextResponse.json(null);
  const d = snap.data()!;
  return NextResponse.json({ answers: d.answers ?? null, content: (d.content as string) ?? '' });
}

// PUT { assignmentId, answers, content } → upsert the draft (1 write).
export async function PUT(req: NextRequest) {
  const uid = await getStudentUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assignmentId, answers, content } = await req.json().catch(() => ({}));
  if (!assignmentId) return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 });

  await adminDb.collection('drafts').doc(draftId(uid, assignmentId)).set({
    studentId: uid,
    assignmentId,
    answers: answers ?? null,
    content: typeof content === 'string' ? content.slice(0, 20_000) : '',
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return NextResponse.json({ ok: true });
}

// DELETE ?assignmentId= → drop the draft (after a successful submit).
export async function DELETE(req: NextRequest) {
  const uid = await getStudentUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const assignmentId = new URL(req.url).searchParams.get('assignmentId');
  if (!assignmentId) return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 });
  await adminDb.collection('drafts').doc(draftId(uid, assignmentId)).delete().catch(() => {});
  return NextResponse.json({ ok: true });
}
