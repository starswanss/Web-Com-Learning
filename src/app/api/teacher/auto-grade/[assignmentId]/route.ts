import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue, WriteBatch } from 'firebase-admin/firestore';
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
  } catch { return null; }
}

interface Block {
  id: string;
  type: string;
  options?: string[];
  correctIndex?: number;
  correctIndexes?: number[];
  items?: string[];
  trueFalseItems?: Array<{ statement: string; correctAnswer: boolean }>;
  leftItems?: string[];
  rightItems?: string[];
  correctPairs?: number[];
  correctAnswers?: string[];
}

function scoreSubmission(blocks: Block[], answers: Record<string, string | string[]>): {
  score: number;
  gradable: number;
} {
  const gradableBlocks = blocks.filter((b) =>
    (b.type === 'multiple-choice' && typeof b.correctIndex === 'number') ||
    (b.type === 'checkbox' && Array.isArray(b.correctIndexes) && b.correctIndexes.length > 0) ||
    (b.type === 'ordering' && Array.isArray(b.items) && b.items.length > 0) ||
    (b.type === 'true-false' && Array.isArray(b.trueFalseItems) && b.trueFalseItems.length > 0) ||
    (b.type === 'matching' && Array.isArray(b.leftItems) && b.leftItems.length > 0) ||
    (b.type === 'fill-blank' && Array.isArray(b.correctAnswers) && b.correctAnswers.length > 0)
  );

  if (gradableBlocks.length === 0) return { score: 0, gradable: 0 };

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

    } else if (block.type === 'true-false' && Array.isArray(block.trueFalseItems)) {
      const items = block.trueFalseItems;
      const studentArr = Array.isArray(answer) ? answer : [];
      let itemCorrect = 0;
      for (let j = 0; j < items.length; j++) {
        const expected = items[j].correctAnswer ? 'true' : 'false';
        if (studentArr[j] === expected) itemCorrect++;
      }
      correct += items.length > 0 ? itemCorrect / items.length : 0;

    } else if (block.type === 'matching' && Array.isArray(block.leftItems) && Array.isArray(block.correctPairs)) {
      const studentArr = Array.isArray(answer) ? answer : [];
      let pairCorrect = 0;
      for (let j = 0; j < block.leftItems.length; j++) {
        const correctRight = block.rightItems?.[block.correctPairs[j] ?? -1];
        if (correctRight !== undefined && studentArr[j] === correctRight) pairCorrect++;
      }
      correct += block.leftItems.length > 0 ? pairCorrect / block.leftItems.length : 0;

    } else if (block.type === 'fill-blank' && Array.isArray(block.correctAnswers)) {
      const studentArr = Array.isArray(answer) ? answer : [];
      let blankCorrect = 0;
      for (let j = 0; j < block.correctAnswers.length; j++) {
        const expected = block.correctAnswers[j]?.trim().toLowerCase();
        const given = (studentArr[j] ?? '').trim().toLowerCase();
        if (expected && given === expected) blankCorrect++;
      }
      correct += block.correctAnswers.length > 0 ? blankCorrect / block.correctAnswers.length : 0;
    }
  }

  const score = Math.round((correct / gradableBlocks.length) * 100);
  return { score, gradable: gradableBlocks.length };
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
    (b.type === 'ordering' && Array.isArray(b.items) && b.items.length > 0) ||
    (b.type === 'true-false' && Array.isArray(b.trueFalseItems) && b.trueFalseItems.length > 0) ||
    (b.type === 'matching' && Array.isArray(b.leftItems) && b.leftItems.length > 0) ||
    (b.type === 'fill-blank' && Array.isArray(b.correctAnswers) && b.correctAnswers.length > 0)
  );

  if (gradableBlocks.length === 0) {
    return NextResponse.json({ error: 'ไม่มีข้อที่กำหนดเฉลยไว้ (ต้องตั้งเฉลยในแบบทดสอบก่อน)' }, { status: 400 });
  }

  let graded = 0;
  let errors = 0;

  const BATCH_LIMIT = 499;
  let batch: WriteBatch = adminDb.batch();
  let opCount = 0;

  async function commitIfNeeded() {
    if (opCount >= BATCH_LIMIT) {
      await batch.commit();
      batch = adminDb.batch();
      opCount = 0;
    }
  }

  for (const doc of submissionsSnap.docs) {
    try {
      const sub = doc.data();
      const answers = (sub.answers ?? {}) as Record<string, string | string[]>;
      const { score, gradable } = scoreSubmission(blocks, answers);
      const feedback = `ตรวจโดยระบบเฉลยอัตโนมัติ: ${score} คะแนน (จาก ${gradable} ข้อที่มีเฉลย)`;
      const previousXp = (sub.xpAwarded as number) ?? 0;
      const newXp = score * 10;
      const xpDelta = newXp - previousXp;

      batch.update(doc.ref, {
        score,
        feedback,
        plagiarismSuspicion: 0,
        status: 'reviewed',
        gradedAt: FieldValue.serverTimestamp(),
        autoGraded: true,
        xpAwarded: newXp,
      });
      opCount++;

      if (xpDelta !== 0 && sub.studentId) {
        await commitIfNeeded();
        batch.update(adminDb.collection('users').doc(sub.studentId as string), {
          xp: FieldValue.increment(xpDelta),
        });
        opCount++;
      }
      graded++;
    } catch {
      errors++;
    }
  }

  if (opCount > 0) await batch.commit();
  if (graded > 0) invalidateLeaderboards(); // scores + xp changed

  return NextResponse.json({ graded, errors, skipped: 0 });
}
