import Groq from 'groq-sdk';
import { adminDb } from '@/lib/firebase/admin';
import { cachedGlobal, invalidateGlobal } from '@/lib/server-cache';

// Fallback model if none is configured. The active model is chosen at runtime:
//   1) GROQ_MODEL env var (hard override)  2) system/aiConfig.model in Firestore
//   3) this default. So the teacher can change it from the Admin page — no
//   code change or redeploy — when Groq decommissions a model.
const DEFAULT_MODEL = 'llama-3.1-8b-instant';
export const AI_MODEL_CACHE_KEY = 'ai-model';

function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

/** Resolve the Groq model to use (env override → saved config → default). */
export async function getModelId(): Promise<string> {
  if (process.env.GROQ_MODEL) return process.env.GROQ_MODEL;
  return cachedGlobal(AI_MODEL_CACHE_KEY, 60_000, async () => {
    try {
      const snap = await adminDb.doc('system/aiConfig').get();
      const m = snap.exists ? (snap.data()?.model as string | undefined) : undefined;
      return m && m.trim() ? m.trim() : DEFAULT_MODEL;
    } catch {
      return DEFAULT_MODEL;
    }
  });
}

/** Persist the chosen model and refresh the cache so it takes effect at once. */
export async function setModelId(model: string): Promise<void> {
  await adminDb.doc('system/aiConfig').set({ model: model.trim() }, { merge: true });
  invalidateGlobal(AI_MODEL_CACHE_KEY);
}

/** True when GROQ_MODEL env is set (which overrides the Admin setting). */
export function isModelEnvLocked(): boolean {
  return !!process.env.GROQ_MODEL;
}

/** Try a tiny completion to verify a model works for this account. */
export async function testModel(model: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await getGroq().chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface GradingResult {
  score: number;
  feedback: string;
  plagiarismSuspicion: number;
  details: {
    quality: number;
    relevance: number;
    copyPasteRisk: number;
  };
}

export interface BatchSubmission {
  id: string;
  content: string;
}

export interface BatchGradingResult {
  id: string;
  score: number;
  feedback: string;
  plagiarismSuspicion: number;
}

function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('429') || msg.includes('rate_limit') || msg.includes('quota');
}

// Keep total wait small — the grading route runs under a 60s function timeout,
// and the client already retries whole rounds, so long internal waits only
// risk a 504.
async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 5_000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isRateLimit(err) && attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

function parseJson<T>(text: string, arrayFallback: boolean): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const pattern = arrayFallback ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
    const match = text.match(pattern);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error('JSON parse failed');
  }
}

export async function gradeSubmission(
  assignmentTitle: string,
  assignmentDescription: string,
  studentContent: string,
  otherSubmissions: string[] = [],
  rubric?: string
): Promise<GradingResult> {
  const comparisonBlock =
    otherSubmissions.length > 0
      ? `\n\nCompare with these other submissions in the same class for plagiarism detection:\n${otherSubmissions
          .slice(0, 10)
          .map((s, i) => `[Student ${i + 1}]: "${s.slice(0, 300)}"`)
          .join('\n')}`
      : '';

  const rubricBlock = rubric
    ? `\n\nCustom grading rubric from teacher (follow these criteria carefully):\n${rubric}`
    : '';

  const prompt = `You are a teacher assistant for a Thai secondary school Computing Science class (ม.3 / Grade 9).
Grade the following student submission.

Assignment: ${assignmentTitle}
Instructions: ${assignmentDescription}${rubricBlock}

Student's answer:
"""
${studentContent}
"""${comparisonBlock}

Respond ONLY with a JSON object in this exact shape — no markdown, no extra text:
{"score":0,"feedback":"","plagiarismSuspicion":0,"details":{"quality":0,"relevance":0,"copyPasteRisk":0}}

Rules:
- score: 0-100 overall score
- feedback: 2-3 sentences in Thai, constructive and kind
- plagiarismSuspicion: 0-100 (0=clearly original, 100=definitely copied from internet or peers)
- details.quality: depth and accuracy of content (0-100)
- details.relevance: how well the answer addresses the question (0-100)
- details.copyPasteRisk: likelihood of copy-paste from external sources (0-100)

Scoring guide: 90-100 excellent, 70-89 good, 50-69 adequate, 30-49 incomplete, 0-29 very poor or copied.
Short answers (<30 words) should score at most 40 unless the question is trivial.`;

  const model = await getModelId();
  const completion = await withRetry(() =>
    getGroq().chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    })
  );

  const text = completion.choices[0].message.content?.trim() ?? '';

  try {
    return parseJson<GradingResult>(text, false);
  } catch {
    return {
      score: 50,
      feedback: 'ระบบตรวจงานอัตโนมัติพบข้อผิดพลาด กรุณารอครูตรวจสอบด้วยตนเอง',
      plagiarismSuspicion: 0,
      details: { quality: 50, relevance: 50, copyPasteRisk: 0 },
    };
  }
}

/**
 * Grade multiple student submissions in a single request.
 * Chunks of up to 15 keep the prompt within safe token limits.
 */
export async function gradeSubmissionsBatch(
  assignmentTitle: string,
  assignmentDescription: string,
  submissions: BatchSubmission[],
  rubric?: string
): Promise<BatchGradingResult[]> {
  if (submissions.length === 0) return [];

  const rubricBlock = rubric ? `\n\nCriteria from teacher:\n${rubric}` : '';

  const studentBlocks = submissions
    .map((s, i) => `[Student ${i + 1}]\n${s.content}`)
    .join('\n\n---\n\n');

  const prompt = `You are a teacher assistant for a Thai secondary school Computing Science class (ม.3 / Grade 9).
Grade ALL ${submissions.length} student submissions below for the SAME assignment.

Assignment: ${assignmentTitle}
Instructions: ${assignmentDescription}${rubricBlock}

${studentBlocks}

Respond ONLY with a JSON array — no markdown, no extra text. Exactly ${submissions.length} entries in the same order as [Student 1..N]:
[{"score":0,"feedback":"","plagiarismSuspicion":0},...]

Rules:
- score: 0-100
- feedback: 2-3 sentences in Thai, constructive and kind
- plagiarismSuspicion: 0-100 (0=clearly original, 100=definitely copied; compare students against each other)
- Scoring guide: 90-100 excellent · 70-89 good · 50-69 adequate · 30-49 incomplete · 0-29 very poor or copied
- Short answers (<30 words) score at most 40 unless the question is trivial
- Grade each student independently`;

  const model = await getModelId();
  const completion = await withRetry(() =>
    getGroq().chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    })
  );

  const text = completion.choices[0].message.content?.trim() ?? '';

  let parsed: Array<{ score: number; feedback: string; plagiarismSuspicion: number }>;
  try {
    parsed = parseJson(text, true);
  } catch {
    throw new Error('batch parse failed');
  }

  return submissions.map((s, i) => ({
    id: s.id,
    score: Number(parsed[i]?.score ?? 50),
    feedback: parsed[i]?.feedback ?? 'ระบบตรวจงานอัตโนมัติพบข้อผิดพลาด กรุณารอครูตรวจสอบด้วยตนเอง',
    plagiarismSuspicion: Number(parsed[i]?.plagiarismSuspicion ?? 0),
  }));
}

/** Convert block-based answers to readable text for AI grading */
export function answersToText(
  blocks: Array<{ id: string; type: string; question?: string; [key: string]: unknown }>,
  answers: Record<string, string | string[]>
): string {
  return blocks
    .filter((b) =>
      ['short-answer', 'long-answer', 'multiple-choice', 'checkbox', 'ordering', 'true-false', 'matching', 'fill-blank'].includes(b.type)
      // image-upload blocks are intentionally excluded — AI cannot grade images via text
    )
    .map((b) => {
      const ans = answers[b.id];
      let ansText: string;
      if (b.type === 'ordering' && Array.isArray(ans)) {
        ansText = ans.map((item, i) => `${i + 1}. ${item}`).join(' → ');
      } else if (b.type === 'true-false' && Array.isArray(ans)) {
        const items = (b.items as Array<{ statement: string; correctAnswer: boolean }> | undefined) ?? [];
        ansText = items.map((item, i) =>
          `"${item.statement}": ${ans[i] === 'true' ? 'ถูก' : ans[i] === 'false' ? 'ผิด' : '(ไม่ได้ตอบ)'}`
        ).join('; ');
      } else if (b.type === 'matching' && Array.isArray(ans)) {
        const leftItems = (b.leftItems as string[] | undefined) ?? [];
        ansText = leftItems.map((left, i) => `"${left}" → "${(ans as string[])[i] ?? '(ไม่ได้ตอบ)'}"`).join('; ');
      } else if (b.type === 'fill-blank') {
        const parts = (b.question ?? '').split('___');
        const fbAns = Array.isArray(ans) ? ans : [];
        ansText = parts.map((part, i) => i < parts.length - 1 ? `${part}[${fbAns[i] ?? '—'}]` : part).join('');
      } else {
        ansText = Array.isArray(ans) ? ans.join(', ') : (ans ?? '(ไม่ได้ตอบ)');
      }
      return `Q: ${b.question ?? b.id}\nA: ${ansText}`;
    })
    .join('\n\n');
}
