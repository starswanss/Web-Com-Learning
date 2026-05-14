import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import { gradeSubmission, answersToText } from '@/lib/gemini';

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

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const subSnap = await adminDb.collection('submissions').doc(id).get();
  if (!subSnap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sub = subSnap.data()!;
  const assignmentSnap = await adminDb.collection('assignments').doc(sub.assignmentId).get();
  if (!assignmentSnap.exists || assignmentSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const assignment = assignmentSnap.data()!;

  // Build gradable text from content or block answers
  const content = (sub.content as string) ?? '';
  const answers = sub.answers as Record<string, string | string[]> | null;
  const gradableContent = content.trim()
    ? content
    : answers && assignment.blocks
    ? answersToText(
        assignment.blocks as Array<{ id: string; type: string; question?: string }>,
        answers
      )
    : '';

  if (!gradableContent) {
    return NextResponse.json({ error: 'No gradable content' }, { status: 400 });
  }

  // Get other submissions for plagiarism comparison
  const othersSnap = await adminDb
    .collection('submissions')
    .where('assignmentId', '==', sub.assignmentId)
    .limit(20)
    .get();
  const otherContents = othersSnap.docs
    .filter((d) => d.id !== id)
    .map((d) => (d.data().content as string) ?? '')
    .filter(Boolean);

  const grading = await gradeSubmission(
    assignment.title as string,
    assignment.description as string,
    gradableContent,
    otherContents,
    assignment.rubric as string | undefined
  );

  await adminDb.collection('submissions').doc(id).update({
    score: grading.score,
    feedback: grading.feedback,
    plagiarismSuspicion: grading.plagiarismSuspicion,
    status: 'graded',
    gradedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(grading);
}
