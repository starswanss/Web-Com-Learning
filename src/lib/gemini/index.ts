import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';
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

// ── Grading style ──────────────────────────────────────────────────────────
// A global knob (set once on the Admin page) for how the AI grades: strict
// (accuracy + on-topic, short/off-topic penalised), balanced, or lenient
// (reward sound reasoning and effort, give partial credit even when the answer
// doesn't match the exact question). Stored in system/aiConfig.gradingStyle.
export const GRADING_STYLE_CACHE_KEY = 'ai-grading-style';
export type GradingStyle = 'strict' | 'balanced' | 'lenient';
const DEFAULT_STYLE: GradingStyle = 'balanced';

export async function getGradingStyle(): Promise<GradingStyle> {
  return cachedGlobal(GRADING_STYLE_CACHE_KEY, 60_000, async () => {
    try {
      const snap = await adminDb.doc('system/aiConfig').get();
      const s = snap.exists ? (snap.data()?.gradingStyle as string | undefined) : undefined;
      return (s === 'strict' || s === 'balanced' || s === 'lenient') ? s : DEFAULT_STYLE;
    } catch {
      return DEFAULT_STYLE;
    }
  });
}

export async function setGradingStyle(style: GradingStyle): Promise<void> {
  await adminDb.doc('system/aiConfig').set({ gradingStyle: style }, { merge: true });
  invalidateGlobal(GRADING_STYLE_CACHE_KEY);
}

/** Prompt guidance (Thai) that tells the model how generous to be. */
function styleGuidance(style: GradingStyle): string {
  switch (style) {
    case 'strict':
      return 'เข้มงวด: เน้นความถูกต้องและตรงคำถามเป็นหลัก คำตอบที่ผิดหรือไม่ตรงคำถามให้คะแนนต่ำ คำตอบสั้นมาก (<30 คำ) ให้ไม่เกิน 40 คะแนน เว้นแต่คำถามง่ายมาก';
    case 'lenient':
      return 'ผ่อนปรน: ให้เครดิตกับ "กระบวนการคิดและเหตุผล" มากกว่าความถูกต้องแบบเป๊ะ ถ้านักเรียนตอบไม่ตรงคำถามทั้งหมด แต่ให้เหตุผลสมเหตุสมผล แสดงความเข้าใจหรือความพยายาม ให้คะแนนบางส่วนอย่างใจกว้าง (อย่าให้ใกล้ 0) อย่าหักหนักเพราะคำตอบสั้นถ้าใจความถูก เน้นให้กำลังใจ';
    case 'balanced':
    default:
      return 'สมดุล: ความถูกต้องสำคัญ แต่ให้คะแนนบางส่วนตามความเข้าใจและความพยายามที่เห็นได้ ถ้าเหตุผลสมเหตุสมผลแม้ไม่ตรงคำถามทั้งหมดก็ให้เครดิตตามสมควร ไม่ลงโทษหนักเกินไป';
  }
}

/** List chat models this Groq account can actually access. */
export async function listModels(): Promise<string[]> {
  try {
    const res = await getGroq().models.list();
    const ids = (res.data ?? [])
      .map((m: { id?: string }) => m.id)
      .filter((id): id is string => !!id)
      // Drop non-chat models (speech, safety) — only text-grading models are useful.
      .filter((id) => !/whisper|tts|playai|guard|embed/i.test(id))
      .sort();
    return ids;
  } catch {
    return [];
  }
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

// ── Provider (Groq vs Claude) ────────────────────────────────────────────────
// Grading can run on Groq (llama, default) or Claude (smarter at partial credit
// / reasoning). Chosen on the Admin page; Claude needs ANTHROPIC_API_KEY set.
function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}
export type AIProvider = 'groq' | 'claude';
export const PROVIDER_CACHE_KEY = 'ai-provider';
export const CLAUDE_MODEL_CACHE_KEY = 'ai-claude-model';
const DEFAULT_PROVIDER: AIProvider = 'groq';
const DEFAULT_CLAUDE_MODEL = 'claude-haiku-5-5';

export async function getProvider(): Promise<AIProvider> {
  return cachedGlobal(PROVIDER_CACHE_KEY, 60_000, async () => {
    try {
      const snap = await adminDb.doc('system/aiConfig').get();
      return snap.exists && snap.data()?.provider === 'claude' ? 'claude' : DEFAULT_PROVIDER;
    } catch {
      return DEFAULT_PROVIDER;
    }
  });
}
export async function setProvider(p: AIProvider): Promise<void> {
  await adminDb.doc('system/aiConfig').set({ provider: p }, { merge: true });
  invalidateGlobal(PROVIDER_CACHE_KEY);
}
export async function getClaudeModelId(): Promise<string> {
  return cachedGlobal(CLAUDE_MODEL_CACHE_KEY, 60_000, async () => {
    try {
      const snap = await adminDb.doc('system/aiConfig').get();
      const m = snap.exists ? (snap.data()?.claudeModel as string | undefined) : undefined;
      return m && m.trim() ? m.trim() : DEFAULT_CLAUDE_MODEL;
    } catch {
      return DEFAULT_CLAUDE_MODEL;
    }
  });
}
export async function setClaudeModelId(model: string): Promise<void> {
  await adminDb.doc('system/aiConfig').set({ claudeModel: model.trim() }, { merge: true });
  invalidateGlobal(CLAUDE_MODEL_CACHE_KEY);
}
/** True when an Anthropic key is present (so the Claude option can actually run). */
export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Send one grading prompt to the active provider; return the raw text reply. */
async function runCompletion(prompt: string, maxTokens = 2048): Promise<string> {
  if ((await getProvider()) === 'claude') {
    const model = await getClaudeModelId();
    const msg = await withRetry(() =>
      getAnthropic().messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    );
    return msg.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim();
  }
  const model = await getModelId();
  const completion = await withRetry(() =>
    getGroq().chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  );
  return completion.choices[0].message.content?.trim() ?? '';
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
  if ((err as { status?: number })?.status === 429) return true; // Anthropic/Groq 429
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

// Cap answer length before sending to the AI — long pastes waste tokens (and
// Groq's free tier limits tokens-per-day). A ม.3 answer rarely needs more.
function capText(s: string, max = 1500): string {
  return s.length > max ? s.slice(0, max) + ' …[ตัดเนื่องจากยาวเกิน]' : s;
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

  const style = await getGradingStyle();

  const prompt = `You are a teacher assistant for a Thai secondary school Computing Science class (ม.3 / Grade 9).
Grade the following student submission.

Assignment: ${assignmentTitle}
Instructions: ${assignmentDescription}${rubricBlock}

Student's answer:
"""
${capText(studentContent)}
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
แนวทางการให้คะแนน (สำคัญมาก — ยึดตามนี้): ${styleGuidance(style)}`;

  const text = await runCompletion(prompt, 1500);

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

  const style = await getGradingStyle();

  const studentBlocks = submissions
    .map((s, i) => `[Student ${i + 1}]\n${capText(s.content)}`)
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
- แนวทางการให้คะแนน (สำคัญมาก — ยึดตามนี้): ${styleGuidance(style)}
- Grade each student independently`;

  const text = await runCompletion(prompt, 4096);

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

export interface DetailedQuestion { id: string; question: string; answer: string; scoreMax?: number; scoreKind?: 'K' | 'P' }
export interface DetailedResult { id: string; comment: string; score?: number }

/**
 * Grade a single submission question-by-question: a short Thai comment for every
 * question, plus a 0..scoreMax score for the questions that carry one (K/P).
 */
export async function gradeDetailed(
  assignmentTitle: string,
  assignmentDescription: string,
  questions: DetailedQuestion[],
  rubric?: string,
): Promise<DetailedResult[]> {
  if (questions.length === 0) return [];
  const rubricBlock = rubric ? `\n\nเกณฑ์การให้คะแนนจากครู:\n${rubric}` : '';
  const style = await getGradingStyle();
  const qText = questions.map((q, i) => {
    const scoreInfo = q.scoreMax
      ? ` — ให้คะแนน 0 ถึง ${q.scoreMax}${q.scoreKind ? ` (ประเภท ${q.scoreKind})` : ''}`
      : ' — ไม่ต้องให้คะแนน (score = null)';
    return `[ข้อ ${i + 1}]${scoreInfo}\nคำถาม: ${q.question}\nคำตอบนักเรียน: ${capText(q.answer, 800)}`;
  }).join('\n\n');

  const prompt = `คุณเป็นผู้ช่วยครูวิชาวิทยาการคำนวณ ม.3 ตรวจคำตอบของนักเรียน "รายข้อ"
งาน: ${assignmentTitle}
คำชี้แจง: ${assignmentDescription}${rubricBlock}

${qText}

ตอบกลับเป็น JSON array เท่านั้น (ห้ามมีข้อความอื่น) จำนวน ${questions.length} รายการ เรียงตามลำดับข้อ:
[{"comment":"ความเห็นสั้นๆ ภาษาไทย 1-2 ประโยค สุภาพ สร้างสรรค์","score": คะแนนเป็นตัวเลข 0 ถึงคะแนนเต็มของข้อนั้น ถ้าข้อนั้นไม่ต้องให้คะแนนให้ใส่ null}, ...]
แนวทางการให้คะแนน (สำคัญมาก — ยึดตามนี้): ${styleGuidance(style)}
กติกา: ถ้าไม่ได้ตอบเลยให้คะแนนต่ำ · comment ต้องอ้างถึงคำตอบจริง`;

  const text = await runCompletion(prompt, 4096);

  let parsed: Array<{ comment?: string; score?: number | null }>;
  try { parsed = parseJson(text, true); } catch { throw new Error('detailed parse failed'); }

  return questions.map((q, i) => {
    const p = parsed[i] ?? {};
    let score: number | undefined;
    if (q.scoreMax && typeof p.score === 'number' && isFinite(p.score)) {
      score = Math.max(0, Math.min(q.scoreMax, Math.round(p.score)));
    }
    return { id: q.id, comment: String(p.comment ?? '').slice(0, 500), score };
  });
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
