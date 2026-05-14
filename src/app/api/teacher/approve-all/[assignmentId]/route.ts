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

/** Promote all AI-graded submissions to 'reviewed' using their existing AI scores */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assignmentId } = await params;
  const assignmentSnap = await adminDb.collection('assignments').doc(assignmentId).get();
  if (!assignmentSnap.exists || assignmentSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const snap = await adminDb
    .collection('submissions')
    .where('assignmentId', '==', assignmentId)
    .where('status', '==', 'graded')
    .get();

  if (snap.empty) return NextResponse.json({ approved: 0 });

  const batch = adminDb.batch();
  snap.docs.forEach((doc) => {
    batch.update(doc.ref, {
      status: 'reviewed',
      reviewedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();

  return NextResponse.json({ approved: snap.size });
}
