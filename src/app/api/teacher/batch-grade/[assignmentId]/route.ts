import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import { gradeHybrid } from '@/lib/gemini';
import { type GradableBlock } from '@/lib/auto-grade';
import { invalidateLeaderboards } from '@/lib/leaderboard-cache';
import { getEnrolledStudentIds } from '@/lib/enrolled';
import { noteAiError } from '@/lib/ai-status';

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

// Grading many submissions in one request blows past the platform's function
// timeout (a 504). We grade a bounded slice per call and report what's left so
// the client can keep calling until everything is done.
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assignmentId } = await params;
  const body = await req.json().catch(() => ({}));
  // Small default: one chunk per request keeps each call well inside the
  // function timeout, even when a batch falls back to per-student grading.
  const limit = Math.min(Math.max(Number(body?.limit) || 5, 1), 20);

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
  const pendingDocs = allDocs.filter((d) => d.data().status === 'submitted');

  // ...and only from CURRENTLY-ENROLLED students, matching what the grading
  // page shows. Without this, "ตรวจ AI" of 20 live submissions also burns AI
  // calls on ghost submissions left over from past terms (the 100++ the
  // teacher saw). Students wiped on a reset keep their work as history only.
  const enrolled = await getEnrolledStudentIds(
    pendingDocs.map((d) => d.data().studentId as string),
  );
  const toGrade = pendingDocs.filter((d) => {
    const sid = d.data().studentId as string | undefined;
    return !!sid && enrolled.has(sid);
  });

  const blocks = assignment.blocks as GradableBlock[] | undefined;

  // Pending items with their raw answers/content (hybrid grader needs the
  // structured answers so it can score objective questions against the key).
  const items: Array<{ id: string; answers: Record<string, string | string[]> | null; content: string }> = [];
  for (const doc of toGrade) {
    const sub = doc.data();
    const content = (sub.content as string) ?? '';
    const answers = (sub.answers as Record<string, string | string[]> | null) ?? null;
    const hasSomething = content.trim().length > 0 || (!!answers && Object.keys(answers).length > 0);
    if (hasSomething) items.push({ id: doc.id, answers, content });
  }

  let graded = 0;
  let errors = 0;
  let skippedImage = 0; // image-only submissions the AI can't grade (teacher grades)
  let lastError: string | null = null; // first real error, surfaced to the UI

  // Only take a bounded slice this call — the rest is reported as `remaining`
  // and picked up by the next call from the client.
  const batchItems = items.slice(0, limit);
  const remaining = items.length - batchItems.length;

  // Grade one at a time. Free AI tiers cap TOKENS-per-minute (Groq ~8k) and
  // requests-per-minute (OpenRouter 20), so firing several in parallel just
  // bursts past the limit and triggers 429s all at once. Serial + the per-call
  // 429 backoff (withRetry) lets each submission finish without the teacher
  // re-clicking. The client keeps calling until nothing remains.
  const CONCURRENCY = 1;
  const ROUND_DELAY = 400;  // small gap between submissions

  async function gradeOne(item: typeof items[number]) {
    try {
      const r = await gradeHybrid(
        assignment.title as string,
        (assignment.description as string) ?? '',
        blocks,
        item.answers,
        item.content,
        [],
        assignment.rubric as string | undefined,
      );
      // Image-only worksheet → nothing for the AI. Leave it 'submitted' for the
      // teacher to grade; don't write a 0.
      if (r === null) { skippedImage += 1; return; }
      await adminDb.collection('submissions').doc(item.id).update({
        score: r.score,
        feedback: r.feedback,
        plagiarismSuspicion: r.plagiarismSuspicion,
        status: 'graded',
        gradedAt: FieldValue.serverTimestamp(),
      });
      graded += 1;
    } catch (err) {
      console.error('[batch-grade] grade failed:', item.id, err instanceof Error ? err.message : err);
      if (!lastError) lastError = err instanceof Error ? err.message : String(err);
      await noteAiError(err); // flag the dashboard on a daily-quota error
      errors += 1;
    }
  }

  for (let i = 0; i < batchItems.length; i += CONCURRENCY) {
    const round = batchItems.slice(i, i + CONCURRENCY);
    await Promise.all(round.map(gradeOne));
    if (i + CONCURRENCY < batchItems.length) await new Promise((res) => setTimeout(res, ROUND_DELAY));
  }

  if (graded > 0) invalidateLeaderboards(); // scores changed

  return NextResponse.json({
    graded,
    errors,
    remaining,
    pending: items.length,
    skipped: allDocs.length - toGrade.length,
    skippedImage, // image-only submissions the AI left for the teacher
    errorDetail: lastError,
  });
}
