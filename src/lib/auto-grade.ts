/**
 * Deterministic grading for objective questions, using the answer key stored on
 * each block. Shared by per-question grading and the hybrid overall grader so
 * objective questions are scored by comparison (exact / partial), never by
 * asking the AI to guess the right answer blind.
 */
export interface GradableBlock {
  id?: string;
  type: string;
  question?: string;
  options?: string[];
  correctIndex?: number;
  correctIndexes?: number[];
  leftItems?: string[];
  rightItems?: string[];
  correctPairs?: number[];
  correctAnswers?: string[];
  items?: unknown[]; // true-false: {statement, correctAnswer}[] · ordering: string[]
}

// Subjective = needs human/AI judgement; everything else gradable has a key.
export const SUBJECTIVE_TYPES = ['short-answer', 'long-answer', 'link'];

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Grade one objective question against its key. Returns a fraction (0..1) and a
 * short Thai comment, or null when the block isn't an objective type with a
 * usable key (→ leave to the AI / teacher).
 */
export function autoGradeFraction(
  b: GradableBlock,
  answer: string | string[] | undefined,
): { fraction: number; comment: string } | null {
  switch (b.type) {
    case 'multiple-choice': {
      if (b.correctIndex == null || !b.options) return null;
      const correct = b.options[b.correctIndex];
      const ok = answer != null && !Array.isArray(answer) && norm(answer) === norm(correct);
      return { fraction: ok ? 1 : 0, comment: ok ? 'ตอบถูก ✓' : `ตอบผิด (เฉลย: ${correct})` };
    }
    case 'checkbox': {
      if (!b.correctIndexes || !b.options) return null;
      const correctSet = new Set(b.correctIndexes.map((i) => norm(b.options![i])));
      const chosen = (Array.isArray(answer) ? answer : []).map(norm);
      const hit = chosen.filter((c) => correctSet.has(c)).length;
      const wrong = chosen.filter((c) => !correctSet.has(c)).length;
      const frac = Math.max(0, (hit - wrong) / Math.max(1, correctSet.size));
      return { fraction: frac, comment: `เลือกถูก ${hit}/${correctSet.size}${wrong ? ` · เกิน ${wrong}` : ''}` };
    }
    case 'true-false': {
      const items = (b.items as Array<{ correctAnswer?: boolean }> | undefined) ?? [];
      if (items.length === 0) return null;
      const ans = Array.isArray(answer) ? answer : [];
      const ok = items.filter((it, i) => (it.correctAnswer ? ans[i] === 'true' : ans[i] === 'false')).length;
      return { fraction: ok / items.length, comment: `ถูก ${ok}/${items.length} ข้อย่อย` };
    }
    case 'matching': {
      const left = b.leftItems ?? []; const right = b.rightItems ?? []; const pairs = b.correctPairs ?? [];
      if (left.length === 0 || pairs.length === 0) return null;
      const ans = Array.isArray(answer) ? answer : [];
      const ok = left.filter((_, i) => { const cr = right[pairs[i]]; return cr != null && norm(ans[i]) === norm(cr); }).length;
      return { fraction: ok / left.length, comment: `จับคู่ถูก ${ok}/${left.length}` };
    }
    case 'fill-blank': {
      const keys = b.correctAnswers ?? [];
      if (keys.length === 0) return null;
      const ans = Array.isArray(answer) ? answer : [];
      const ok = keys.filter((k, i) => norm(ans[i]) === norm(k)).length;
      return { fraction: ok / keys.length, comment: `เติมถูก ${ok}/${keys.length} ช่อง` };
    }
    case 'ordering': {
      const correct = (b.items as string[] | undefined) ?? [];
      if (correct.length === 0) return null;
      const ans = Array.isArray(answer) ? answer : [];
      const ok = correct.filter((c, i) => norm(ans[i]) === norm(c)).length;
      return { fraction: ok / correct.length, comment: `เรียงถูก ${ok}/${correct.length} ตำแหน่ง` };
    }
    default:
      return null; // short-answer, long-answer, link, image-upload → AI / teacher
  }
}
