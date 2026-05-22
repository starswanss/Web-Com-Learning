import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import { gradeSubmissionsBatch, gradeSubmission, answersToText } from '@/lib/gemini';

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

  // Only grade submissions that are still pending (submitted = waiting for review)
  // Skip 'graded' (AI already done) and 'reviewed' (teacher finalized)
  const toGrade = allDocs.filter((d) => d.data().status === 'submitted');

  // Build gradable items — convert block answers to text where needed
  const gradableItems: Array<{ id: string; content: string }> = [];
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
    if (gradableContent) gradableItems.push({ id: doc.id, content: gradableContent });
  }

  let graded = 0;
  let errors = 0;

  const CHUNK_SIZE = 5;
  for (let i = 0; i < gradableItems.length; i += CHUNK_SIZE) {
    const chunk = gradableItems.slice(i, i + CHUNK_SIZE);
    let batchOk = false;

    try {
      const results = await gradeSubmissionsBatch(
        assignment.title as string,
        assignment.description as string,
        chunk,
        assignment.rubric as string | undefined
      );
      await Promise.all(
        results.map((r) =>
          adminDb.collection('submissions').doc(r.id).update({
            score: r.score,
            feedback: r.feedback,
            plagiarismSuspicion: r.plagiarismSuspicion,
            status: 'graded',
            gradedAt: FieldValue.serverTimestamp(),
          })
        )
      );
      graded += results.length;
      batchOk = true;
    } catch (err) {
      console.error('[batch-grade] chunk batch failed, falling back to per-student:', err instanceof Error ? err.message : err);
    }

    // Fallback: grade individually if batch failed
    if (!batchOk) {
      for (const item of chunk) {
        try {
          const r = await gradeSubmission(
            assignment.title as string,
            assignment.description as string,
            item.content,
            [],
            assignment.rubric as string | undefined
          );
          await adminDb.collection('submissions').doc(item.id).update({
            score: r.score,
            feedback: r.feedback,
            plagiarismSuspicion: r.plagiarismSuspicion,
            status: 'graded',
            gradedAt: FieldValue.serverTimestamp(),
          });
          graded += 1;
        } catch (indivErr) {
          console.error('[batch-grade] individual fallback failed:', item.id, indivErr instanceof Error ? indivErr.message : indivErr);
          errors += 1;
        }
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }

    if (i + CHUNK_SIZE < gradableItems.length) {
      await new Promise((r) => setTimeout(r, 8_000));
    }
  }

  return NextResponse.json({ graded, errors, skipped: allDocs.length - toGrade.length });
}
