'use client';

import { useEffect, useState, FormEvent, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import type { FormBlock } from '@/types';

interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate?: { _seconds: number };
  driveWebViewLink?: string;
  blocks?: FormBlock[];
}

interface Submission {
  id: string;
  content?: string;
  answers?: Record<string, string | string[]>;
  driveWebViewLink?: string;
  score?: number;
  feedback?: string;
  plagiarismSuspicion?: number;
  status: string;
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400 border-emerald-700 bg-emerald-950/40';
  if (score >= 60) return 'text-amber-400 border-amber-700 bg-amber-950/40';
  if (score >= 40) return 'text-orange-400 border-orange-700 bg-orange-950/40';
  return 'text-red-400 border-red-700 bg-red-950/40';
}

// Group consecutive half-width blocks into pairs
function groupBlocks(blocks: FormBlock[]): Array<FormBlock | [FormBlock, FormBlock]> {
  const result: Array<FormBlock | [FormBlock, FormBlock]> = [];
  let i = 0;
  while (i < blocks.length) {
    if (blocks[i].half && i + 1 < blocks.length && blocks[i + 1].half) {
      result.push([blocks[i], blocks[i + 1]]);
      i += 2;
    } else {
      result.push(blocks[i]);
      i++;
    }
  }
  return result;
}

export default function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<Submission | null | undefined>(undefined);
  // Answers keyed by block id
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ score: number; feedback: string } | null>(null);
  const [pasteBlocked, setPasteBlocked] = useState(false);

  function blockPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    setPasteBlocked(true);
    setTimeout(() => setPasteBlocked(false), 2500);
  }

  useEffect(() => {
    if (!loading && profile?.role !== 'student') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/submissions/${id}`)
      .then((r) => r.json())
      .then((data: Submission | null) => setSubmission(data));
    fetch(`/api/assignments/student/${id}`)
      .then((r) => r.json())
      .then((data: Assignment) => setAssignment(data ?? null));
  }, [id]);

  function setAnswer(blockId: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [blockId]: value }));
  }

  function toggleCheckbox(blockId: string, option: string) {
    setAnswers((prev) => {
      const current = (prev[blockId] as string[]) ?? [];
      return {
        ...prev,
        [blockId]: current.includes(option)
          ? current.filter((v) => v !== option)
          : [...current, option],
      };
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const hasBlocks = (assignment?.blocks?.length ?? 0) > 0;

    if (hasBlocks) {
      // Validate required blocks
      const requiredMissing = (assignment!.blocks ?? []).some((b) => {
        if (!('required' in b) || !b.required) return false;
        const ans = answers[b.id];
        return !ans || (Array.isArray(ans) ? ans.length === 0 : ans.trim() === '');
      });
      if (requiredMissing) return setError('กรุณาตอบคำถามที่จำเป็นให้ครบ');
    } else {
      if (!content.trim() && !file) return setError('กรุณาพิมพ์คำตอบหรืออัปโหลดไฟล์');
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('assignmentId', id);
      if (hasBlocks) {
        fd.append('answers', JSON.stringify(answers));
      } else {
        fd.append('content', content);
      }
      if (file) fd.append('file', file);

      const res = await fetch('/api/submissions', { method: 'POST', body: fd });
      if (res.status === 409) return setError('คุณส่งงานนี้ไปแล้ว');
      if (!res.ok) throw new Error();

      const data = await res.json();
      setResult({ score: data.score, feedback: data.feedback });
      setSubmission({
        id: data.id,
        content,
        answers,
        score: data.score,
        feedback: data.feedback,
        status: 'graded',
      });
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !profile || submission === undefined) return <Spinner />;

  const hasBlocks = (assignment?.blocks?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/student" className="mb-6 inline-block text-sm text-slate-400 hover:text-slate-200">
          ← กลับ
        </Link>

        {/* Assignment header */}
        {assignment ? (
          <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h1 className="text-xl font-semibold text-slate-100">{assignment.title}</h1>
            {assignment.description && (
              <p className="mt-2 text-sm text-slate-400">{assignment.description}</p>
            )}
            {assignment.dueDate && (
              <p className="mt-3 text-xs text-slate-500">
                กำหนดส่ง:{' '}
                {new Date(assignment.dueDate._seconds * 1000).toLocaleDateString('th-TH', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
            {assignment.driveWebViewLink && (
              <a
                href={assignment.driveWebViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
              >
                📎 ดูไฟล์ประกอบ
              </a>
            )}
          </div>
        ) : (
          <div className="mb-6 h-32 animate-pulse rounded-2xl bg-slate-900" />
        )}

        {/* AI grade result (shown right after submit) */}
        {result && (
          <div className={`mb-6 rounded-2xl border p-6 ${scoreColor(result.score)}`}>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold">ผลการตรวจ (AI)</p>
              <span className="text-2xl font-bold">{result.score}/100</span>
            </div>
            <p className="text-sm opacity-90">{result.feedback}</p>
          </div>
        )}

        {submission ? (
          <SubmissionView submission={submission} assignment={assignment} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Anti-paste toast */}
            {pasteBlocked && (
              <div className="rounded-xl border border-amber-800 bg-amber-950/50 px-4 py-2.5 text-sm text-amber-400">
                ⚠ ไม่อนุญาตให้วางข้อความ — กรุณาพิมพ์คำตอบด้วยตัวเอง
              </div>
            )}

            {/* Block-based form */}
            {hasBlocks && assignment ? (
              <BlockForm
                blocks={assignment.blocks!}
                answers={answers}
                setAnswer={setAnswer}
                toggleCheckbox={toggleCheckbox}
                onPaste={blockPaste}
              />
            ) : (
              /* Legacy plain-text form */
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">คำตอบของคุณ</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={blockPaste}
                  rows={8}
                  placeholder="พิมพ์คำตอบที่นี่..."
                  className="input resize-none"
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                แนบรูปภาพ (ถ้ามี)
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-300 hover:border-slate-600 transition-all">
                <span>เลือกรูปภาพ</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {file && <p className="mt-2 truncate text-sm text-slate-400">{file.name}</p>}
            </div>

            {error && (
              <div className="rounded-xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95"
            >
              {submitting ? 'กำลังส่งและตรวจงาน…' : 'ส่งงาน'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Block form renderer ────────────────────────────────────────────────────────

function BlockForm({
  blocks,
  answers,
  setAnswer,
  toggleCheckbox,
  onPaste,
}: {
  blocks: FormBlock[];
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, v: string | string[]) => void;
  toggleCheckbox: (id: string, option: string) => void;
  onPaste: (e: React.ClipboardEvent) => void;
}) {
  const grouped = groupBlocks(blocks);
  return (
    <div className="space-y-4">
      {grouped.map((item, idx) => {
        if (Array.isArray(item)) {
          return (
            <div key={idx} className="grid grid-cols-2 gap-4">
              {item.map((block) => (
                <BlockRenderer key={block.id} block={block} answers={answers}
                  setAnswer={setAnswer} toggleCheckbox={toggleCheckbox} onPaste={onPaste} />
              ))}
            </div>
          );
        }
        return (
          <BlockRenderer key={item.id} block={item} answers={answers}
            setAnswer={setAnswer} toggleCheckbox={toggleCheckbox} onPaste={onPaste} />
        );
      })}
    </div>
  );
}

function BlockRenderer({
  block,
  answers,
  setAnswer,
  toggleCheckbox,
  onPaste,
}: {
  block: FormBlock;
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, v: string | string[]) => void;
  toggleCheckbox: (id: string, option: string) => void;
  onPaste: (e: React.ClipboardEvent) => void;
}) {
  switch (block.type) {
    case 'heading':
      return <h2 className="text-lg font-semibold text-slate-100 pt-2">{block.text}</h2>;

    case 'paragraph':
      return <p className="text-sm text-slate-400 whitespace-pre-wrap">{block.text}</p>;

    case 'image':
      return (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.url}
            alt={block.caption ?? ''}
            className="w-full rounded-xl border border-slate-800 object-contain"
          />
          {block.caption && (
            <p className="mt-1.5 text-center text-xs text-slate-500">{block.caption}</p>
          )}
        </div>
      );

    case 'short-answer':
      return (
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            {block.question}
            {block.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <input
            type="text"
            value={(answers[block.id] as string) ?? ''}
            onChange={(e) => setAnswer(block.id, e.target.value)}
            onPaste={onPaste}
            placeholder="คำตอบสั้น..."
            className="input"
          />
        </div>
      );

    case 'long-answer':
      return (
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            {block.question}
            {block.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <textarea
            value={(answers[block.id] as string) ?? ''}
            onChange={(e) => setAnswer(block.id, e.target.value)}
            onPaste={onPaste}
            rows={5}
            placeholder="คำตอบยาว..."
            className="input resize-none"
          />
        </div>
      );

    case 'multiple-choice': {
      const selected = (answers[block.id] as string) ?? '';
      return (
        <div>
          <p className="mb-3 text-sm font-medium text-slate-300">
            {block.question}
            {block.required && <span className="ml-1 text-red-400">*</span>}
          </p>
          <div className="space-y-2">
            {block.options.map((opt) => (
              <label
                key={opt}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all ${
                  selected === opt
                    ? 'border-blue-600 bg-blue-950/40 text-blue-300'
                    : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name={block.id}
                  value={opt}
                  checked={selected === opt}
                  onChange={() => setAnswer(block.id, opt)}
                  className="sr-only"
                />
                <span
                  className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                    selected === opt ? 'border-blue-500' : 'border-slate-600'
                  }`}
                >
                  {selected === opt && (
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                  )}
                </span>
                {opt}
              </label>
            ))}
          </div>
        </div>
      );
    }

    case 'checkbox': {
      const checked = (answers[block.id] as string[]) ?? [];
      return (
        <div>
          <p className="mb-3 text-sm font-medium text-slate-300">
            {block.question}
            {block.required && <span className="ml-1 text-red-400">*</span>}
          </p>
          <div className="space-y-2">
            {block.options.map((opt) => {
              const isChecked = checked.includes(opt);
              return (
                <label
                  key={opt}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all ${
                    isChecked
                      ? 'border-blue-600 bg-blue-950/40 text-blue-300'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCheckbox(block.id, opt)}
                    className="sr-only"
                  />
                  <span
                    className={`h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center ${
                      isChecked ? 'border-blue-500 bg-blue-500' : 'border-slate-600'
                    }`}
                  >
                    {isChecked && (
                      <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-white">
                        <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  {opt}
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

// ── Submission view (after submit) ─────────────────────────────────────────────

function SubmissionView({
  submission: s,
  assignment,
}: {
  submission: Submission;
  assignment: Assignment | null;
}) {
  const hasScore = typeof s.score === 'number';
  const hasAnswers = s.answers && Object.keys(s.answers).length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
          คำตอบที่ส่ง
        </p>
        {hasAnswers && assignment?.blocks ? (
          <AnswerReview blocks={assignment.blocks} answers={s.answers!} />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-slate-300">{s.content || '—'}</p>
        )}
        {s.driveWebViewLink && (
          <a
            href={s.driveWebViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
          >
            📎 ดูไฟล์ที่แนบ
          </a>
        )}
      </div>

      {hasScore && (
        <div className={`rounded-2xl border p-6 ${scoreColor(s.score!)}`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {s.status === 'reviewed' ? 'คะแนน (ครูตรวจแล้ว)' : 'คะแนน (AI)'}
            </p>
            <span className="text-2xl font-bold">{s.score}/100</span>
          </div>
          {s.feedback && <p className="text-sm opacity-90">{s.feedback}</p>}
          {(s.plagiarismSuspicion ?? 0) > 60 && s.status !== 'reviewed' && (
            <p className="mt-2 text-xs opacity-70">
              ⚠ ระบบตรวจพบความเสี่ยงการคัดลอก ({s.plagiarismSuspicion}%) — รอครูตรวจสอบ
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AnswerReview({
  blocks,
  answers,
}: {
  blocks: FormBlock[];
  answers: Record<string, string | string[]>;
}) {
  const questionBlocks = blocks.filter((b) =>
    ['short-answer', 'long-answer', 'multiple-choice', 'checkbox'].includes(b.type)
  );
  if (questionBlocks.length === 0) return null;

  return (
    <div className="space-y-4">
      {questionBlocks.map((block, i) => {
        const answer = answers[block.id];
        const q = 'question' in block ? block.question : '';
        return (
          <div key={block.id}>
            <p className="text-xs font-medium text-slate-500 mb-1">
              ข้อ {i + 1}. {q}
            </p>
            {answer === undefined ? (
              <p className="text-sm text-slate-600 italic">ไม่ได้ตอบ</p>
            ) : Array.isArray(answer) ? (
              <div className="flex flex-wrap gap-2">
                {answer.map((a) => (
                  <span
                    key={a}
                    className="rounded-full border border-blue-800 bg-blue-950/40 px-3 py-0.5 text-xs text-blue-300"
                  >
                    {a}
                  </span>
                ))}
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-slate-300">{answer}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
    </div>
  );
}
