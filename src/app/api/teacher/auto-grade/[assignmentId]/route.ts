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

interface Block {
  id: string;
  type: string;
  options?: string[];
  correctIndex?: number;
  correctIndexes?: number[];
  items?: string[];
}

function scoreSubmission(blocks: Block[], answers: Record<string, string | string[]>): {
  score: number;
  gradable: number;
  correct: number;
} {
  const gradableBlocks = blocks.filter((b) =>
    (b.type === 'multiple-choice' && typeof b.correctIndex === 'number') ||
    (b.type === 'checkbox' && Array.isArray(b.correctIndexes) && b.correctIndexes.length > 0) ||
    (b.type === 'ordering' && Array.isArray(b.items) && b.items.length > 0)
  );

  if (gradableBlocks.length === 0) return { score: 0, gradable: 0, correct: 0 };

  let correct = 0;

  for (const block of gradableBlocks) {
    const answer = answers[block.id];

    if (block.type === 'multiple-choice' && typeof block.correctIndex === 'number') {
      const correctOption = block.options?.[block.correctIndex];
      if (correctOption !== undefined && answer === correctOption) correct++;

    } else if (block.type === 'checkbox' && Array.isArray(block.correctIndexes)) {
      const correctSet = new Set(
        block.correctIndexes.map((i) => block.options?.[i]).filter(Boolean)
      );
      const studentSet = new Set(Array.isArray(answer) ? answer : []);
      const matches =
        correctSet.size === studentSet.size &&
        [...correctSet].every((v) => studentSet.has(v as string));
      if (matches) correct++;

    } else if (block.type === 'ordering' && Array.isArray(block.items)) {
      const studentOrder = Array.isArray(answer) ? answer : [];
      const matches =
        studentOrder.length === block.items.length &&
        block.items.every((item, i) => item === studentOrder[i]);
      if (matches) correct++;
    }
  }

  const score = Math.round((correct / gradableBlocks.length) * 100);
  return { score, gradable: gradableBlocks.length, correct };
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
    adminDb.collection('submissions')
      .where('assignmentId', '==', assignmentId)
      .where('status', '==', 'submitted')
      .get(),
  ]);

  if (!assignmentSnap.exists || assignmentSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const blocks: Block[] = (assignmentSnap.data()?.blocks ?? []) as Block[];
  const gradableBlocks = blocks.filter((b) =>
    (b.type === 'multiple-choice' && typeof b.correctIndex === 'number') ||
    (b.type === 'checkbox' && Array.isArray(b.correctIndexes) && b.correctIndexes.length > 0) ||
    (b.type === 'ordering' && Array.isArray(b.items) && b.items.length > 0)
  );

  if (gradableBlocks.length === 0) {
    return NextResponse.json({ error: 'ไม่มีข้อที่กำหนดเฉลยไว้ (ต้องตั้งเฉลยในแบบทดสอบก่อน)' }, { status: 400 });
  }

  let graded = 0;
  let errors = 0;

  await Promise.all(
    submissionsSnap.docs.map(async (doc) => {
      try {
        const answers = (doc.data().answers ?? {}) as Record<string, string | string[]>;
        const { score, correct, gradable } = scoreSubmission(blocks, answers);
        const feedback = `ตรวจโดยระบบเฉลยอัตโนมัติ: ตอบถูก ${correct}/${gradable} ข้อ (${score} คะแนน)`;
        await doc.ref.update({
          score,
          feedback,
          plagiarismSuspicion: 0,
          status: 'reviewed',
          gradedAt: FieldValue.serverTimestamp(),
          autoGraded: true,
        });
        graded++;
      } catch {
        errors++;
      }
    })
  );

  return NextResponse.json({ graded, errors, skipped: 0 });
}
