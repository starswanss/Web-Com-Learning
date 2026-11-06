import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import { gradeHybrid } from '@/lib/gemini';
import { type GradableBlock } from '@/lib/auto-grade';
import { invalidateLeaderboards } from '@/lib/leaderboard-cache';

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

  const content = (sub.content as string) ?? '';
  const answers = sub.answers as Record<string, string | string[]> | null;
  const blocks = assignment.blocks as GradableBlock[] | undefined;
  const hasSomething = content.trim().length > 0 || (!!answers && Object.keys(answers).length > 0);
  if (!hasSomething) {
    return NextResponse.json({ error: 'No gradable content' }, { status: 400 });
  }

  // Other submissions for plagiarism comparison (subjective part only).
  const othersSnap = await adminDb
    .collection('submissions')
    .where('assignmentId', '==', sub.assignmentId)
    .limit(20)
    .get();
  const otherContents = othersSnap.docs
    .filter((d) => d.id !== id)
    .map((d) => (d.data().content as string) ?? '')
    .filter(Boolean);

  let grading;
  try {
    grading = await gradeHybrid(
      assignment.title as string,
      (assignment.description as string) ?? '',
      blocks,
      answers,
      content,
      otherContents,
      assignment.rubric as string | undefined,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[quick-grade] Gemini error:', msg);
    const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
    return NextResponse.json(
      { error: 'AI grading failed', detail: isQuota ? 'โควต้า API หมดชั่วคราว กรุณาลองใหม่ในอีก 1 นาที' : msg },
      { status: isQuota ? 429 : 502 }
    );
  }

  await adminDb.collection('submissions').doc(id).update({
    score: grading.score,
    feedback: grading.feedback,
    plagiarismSuspicion: grading.plagiarismSuspicion,
    status: 'graded',
    gradedAt: FieldValue.serverTimestamp(),
  });

  invalidateLeaderboards(); // score changed
  return NextResponse.json(grading);
}
