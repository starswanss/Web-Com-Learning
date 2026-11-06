import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { gradeDetailed, type DetailedQuestion } from '@/lib/gemini';

export const maxDuration = 60;

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

const QT = ['short-answer', 'long-answer', 'multiple-choice', 'checkbox', 'ordering', 'image-upload', 'true-false', 'matching', 'fill-blank', 'link'];

interface Block {
  id: string; type: string; question?: string;
  scoreMax?: number; scoreKind?: 'K' | 'P';
  options?: string[];
  correctIndex?: number;
  correctIndexes?: number[];
  leftItems?: string[];
  rightItems?: string[];
  correctPairs?: number[];
  correctAnswers?: string[];
  items?: unknown[]; // true-false: {statement, correctAnswer}[] · ordering: string[]
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Objective questions have a stored answer key, so grade them in code (exact /
 * partial credit) instead of asking the AI to guess the right answer blind —
 * that blind-guessing was scoring correct answers as wrong. Returns null for
 * subjective types (short/long answer, link, image) → those still go to the AI.
 */
function autoGrade(b: Block, answer: string | string[] | undefined): { score: number | null; comment: string } | null {
  const max = typeof b.scoreMax === 'number' && b.scoreMax > 0 ? b.scoreMax : null;
  const pts = (frac: number) => (max == null ? null : Math.round(max * Math.max(0, Math.min(1, frac)) * 100) / 100);

  switch (b.type) {
    case 'multiple-choice': {
      if (b.correctIndex == null || !b.options) return null;
      const correct = b.options[b.correctIndex];
      const ok = answer != null && !Array.isArray(answer) && norm(answer) === norm(correct);
      return { score: pts(ok ? 1 : 0), comment: ok ? 'ตอบถูก ✓' : `ตอบผิด (เฉลย: ${correct})` };
    }
    case 'checkbox': {
      if (!b.correctIndexes || !b.options) return null;
      const correctSet = new Set(b.correctIndexes.map((i) => norm(b.options![i])));
      const chosen = (Array.isArray(answer) ? answer : []).map(norm);
      const hit = chosen.filter((c) => correctSet.has(c)).length;
      const wrong = chosen.filter((c) => !correctSet.has(c)).length;
      return { score: pts((hit - wrong) / Math.max(1, correctSet.size)), comment: `เลือกถูก ${hit}/${correctSet.size}${wrong ? ` · เกิน ${wrong}` : ''}` };
    }
    case 'true-false': {
      const items = (b.items as Array<{ correctAnswer?: boolean }> | undefined) ?? [];
      if (items.length === 0) return null;
      const ans = Array.isArray(answer) ? answer : [];
      const ok = items.filter((it, i) => (it.correctAnswer ? ans[i] === 'true' : ans[i] === 'false')).length;
      return { score: pts(ok / items.length), comment: `ถูก ${ok}/${items.length} ข้อย่อย` };
    }
    case 'matching': {
      const left = b.leftItems ?? []; const right = b.rightItems ?? []; const pairs = b.correctPairs ?? [];
      if (left.length === 0 || pairs.length === 0) return null;
      const ans = Array.isArray(answer) ? answer : [];
      const ok = left.filter((_, i) => { const cr = right[pairs[i]]; return cr != null && norm(ans[i]) === norm(cr); }).length;
      return { score: pts(ok / left.length), comment: `จับคู่ถูก ${ok}/${left.length}` };
    }
    case 'fill-blank': {
      const keys = b.correctAnswers ?? [];
      if (keys.length === 0) return null;
      const ans = Array.isArray(answer) ? answer : [];
      const ok = keys.filter((k, i) => norm(ans[i]) === norm(k)).length;
      return { score: pts(ok / keys.length), comment: `เติมถูก ${ok}/${keys.length} ช่อง` };
    }
    case 'ordering': {
      const correct = (b.items as string[] | undefined) ?? [];
      if (correct.length === 0) return null;
      const ans = Array.isArray(answer) ? answer : [];
      const ok = correct.filter((c, i) => norm(ans[i]) === norm(c)).length;
      return { score: pts(ok / correct.length), comment: `เรียงถูก ${ok}/${correct.length} ตำแหน่ง` };
    }
    default:
      return null; // short-answer, long-answer, link, image-upload → AI / teacher
  }
}

/** Readable text of one student's answer for a block (for the AI). */
function answerText(block: Block, answer: string | string[] | undefined): string {
  if (answer === undefined || (Array.isArray(answer) && answer.length === 0)) return '(ไม่ได้ตอบ)';
  if (block.type === 'image-upload') return '(นักเรียนส่งรูปภาพ — AI อ่านรูปไม่ได้)';
  if (Array.isArray(answer)) {
    if (block.type === 'ordering') return answer.map((a, i) => `${i + 1}. ${a}`).join(' → ');
    if (block.type === 'matching') return (block.leftItems ?? []).map((l, i) => `${l} → ${answer[i] ?? '-'}`).join('; ');
    if (block.type === 'true-false') return ((block.items as Array<{ statement: string }>) ?? []).map((it, i) => `${it.statement}: ${answer[i] === 'true' ? 'ถูก' : answer[i] === 'false' ? 'ผิด' : '-'}`).join('; ');
    if (block.type === 'fill-blank') {
      const parts = (block.question ?? '').split('___');
      return parts.map((p, i) => i < parts.length - 1 ? `${p}[${answer[i] ?? '-'}]` : p).join('');
    }
    return answer.join(', ');
  }
  return String(answer);
}

/**
 * AI grading "รายข้อ": fills per-question teacher comments AND per-question KPA
 * scores. Separate from the overall AI grading (quick/batch), which is unchanged.
 * Persists questionComments + questionScores on the submission and returns them.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const blocks = (assignment.blocks as Block[] | undefined) ?? [];
  const answers = (sub.answers as Record<string, string | string[]> | null) ?? {};

  const qBlocks = blocks.filter((b) => QT.includes(b.type));
  if (qBlocks.length === 0) {
    return NextResponse.json({ error: 'ไม่มีข้อคำถามที่จะตรวจ' }, { status: 400 });
  }

  const questionComments: Record<string, string> = {};
  const questionScores: Record<string, number> = {};

  // Objective questions → graded in code against the stored key; subjective
  // ones → collected for the AI.
  const aiQuestions: DetailedQuestion[] = [];
  for (const b of qBlocks) {
    const auto = autoGrade(b, answers[b.id]);
    if (auto) {
      questionComments[b.id] = auto.comment;
      if (auto.score != null) questionScores[b.id] = auto.score;
    } else {
      aiQuestions.push({
        id: b.id,
        question: b.question ?? '',
        answer: answerText(b, answers[b.id]),
        scoreMax: typeof b.scoreMax === 'number' && b.scoreMax > 0 ? b.scoreMax : undefined,
        scoreKind: b.scoreKind,
      });
    }
  }

  if (aiQuestions.length > 0) {
    let results;
    try {
      results = await gradeDetailed(
        assignment.title as string,
        (assignment.description as string) ?? '',
        aiQuestions,
        assignment.rubric as string | undefined,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('rate_limit');
      return NextResponse.json(
        { error: 'AI grading failed', detail: isQuota ? 'โควต้า AI หมดชั่วคราว กรุณาลองใหม่ใน 1 นาที' : msg },
        { status: isQuota ? 429 : 502 },
      );
    }
    for (const r of results) {
      if (r.comment && r.comment.trim()) questionComments[r.id] = r.comment.trim();
      if (typeof r.score === 'number') questionScores[r.id] = r.score;
    }
  }

  // Merge into existing (don't wipe anything the teacher already set elsewhere).
  await adminDb.collection('submissions').doc(id).set(
    { questionComments, questionScores },
    { merge: true },
  );

  return NextResponse.json({ questionComments, questionScores });
}
