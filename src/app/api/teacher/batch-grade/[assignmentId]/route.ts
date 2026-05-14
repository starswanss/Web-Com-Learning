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
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assignmentId } = await params;

  const [assignmentSnap, submissionsSnap] = await Promise.all([
    adminDb.collection('assignments').doc(assignmentId).get(),
    adminDb.collection('submissions').where('assignmentId', '==', assignmentId).get(),
  ]);

  if (!assignmentSnap.exists || assignmentSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const assignment = assignmentSnap.data()!;
  const allDocs = submissionsSnap.docs;

  // Only grade submissions that haven't been teacher-reviewed yet
  const toGrade = allDocs.filter((d) => d.data().status !== 'reviewed');

  // Collect all content for plagiarism comparison
  const allContents = allDocs
    .map((d) => (d.data().content as string) ?? '')
    .filter(Boolean);

  let graded = 0;
  let errors = 0;

  // Sequential to avoid Gemini rate limits
  for (const doc of toGrade) {
    const sub = doc.data();
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

    if (!gradableContent) continue;

    try {
      const otherContents = allContents.filter((c) => c !== content);
      const result = await gradeSubmission(
        assignment.title as string,
        assignment.description as string,
        gradableContent,
        otherContents,
        assignment.rubric as string | undefined
      );

      await adminDb.collection('submissions').doc(doc.id).update({
        score: result.score,
        feedback: result.feedback,
        plagiarismSuspicion: result.plagiarismSuspicion,
        status: 'graded',
        gradedAt: FieldValue.serverTimestamp(),
      });
      graded++;
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ graded, errors, skipped: allDocs.length - toGrade.length });
}
