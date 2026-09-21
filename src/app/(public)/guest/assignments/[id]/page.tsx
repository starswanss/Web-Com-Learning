'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { driveThumb } from '@/lib/img';

interface Block {
  id: string;
  type: string;
  text?: string;
  question?: string;
  options?: string[];
  url?: string;
  caption?: string;
  height?: number;
  title?: string;
  body?: string;
  icon?: string;
  color?: string;
  leftItems?: string[];
  items?: Array<{ statement: string; correctAnswer: boolean }>;
}

interface GuestSubmission {
  id: string;
  alias: string;
  classId: string;
  answers?: Record<string, string | string[]>;
  content?: string;
  score?: number;
  feedback?: string;
  questionComments?: Record<string, string>;
  status: string;
  submittedAt?: { _seconds: number };
}

interface GuestData {
  assignment: { id: string; title: string; description: string; contentType: string; blocks: Block[]; isGroupWork: boolean };
  submissions: GuestSubmission[];
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400 border-emerald-700 bg-emerald-950/40';
  if (score >= 60) return 'text-amber-400 border-amber-700 bg-amber-950/40';
  if (score >= 40) return 'text-orange-400 border-orange-700 bg-orange-950/40';
  return 'text-red-400 border-red-700 bg-red-950/40';
}

function statusLabel(status: string) {
  if (status === 'reviewed') return 'ตรวจแล้ว';
  if (status === 'graded') return 'รอบันทึกคะแนน';
  if (status === 'submitted') return 'รอตรวจ';
  return status;
}

export default function GuestSubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<GuestData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/guest/submissions/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: GuestData) => setData(d))
      .catch((s) => setError(s === 404 ? 'ไม่พบงานนี้' : 'โหลดข้อมูลไม่สำเร็จ'));
  }, [id]);

  const classes = data ? Array.from(new Set(data.submissions.map((s) => s.classId).filter(Boolean))).sort() : [];
  const visible = data
    ? (classFilter ? data.submissions.filter((s) => s.classId === classFilter) : data.submissions)
    : [];

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="border-b border-amber-900/50 bg-amber-950/30 px-4 py-2.5">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <p className="text-xs text-amber-300">👁 โหมดผู้เยี่ยมชม — ชื่อนักเรียนถูกซ่อนไว้</p>
          <Link href="/login" className="shrink-0 rounded-lg border border-amber-700 bg-amber-950/50 px-3 py-1 text-xs text-amber-200 transition-all hover:border-amber-500">
            เข้าสู่ระบบ →
          </Link>
        </div>
      </div>

      <header className="border-b border-slate-800 bg-slate-900 px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Link href="/guest" className="text-sm text-slate-400 hover:text-slate-200">← รายการงาน</Link>
          <h1 className="truncate text-base font-semibold text-slate-100">{data?.assignment.title ?? 'กำลังโหลด…'}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {error ? (
          <div className="rounded-xl border border-dashed border-slate-800 py-16 text-center">
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : data.assignment.contentType === 'knowledge' ? (
          <KnowledgePreview blocks={data.assignment.blocks} />
        ) : (
          <>
            {classes.length > 1 && (
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setClassFilter(null)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${!classFilter ? 'border-blue-600 bg-blue-950/50 text-blue-300' : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'}`}
                >
                  ทุกห้อง ({data.submissions.length})
                </button>
                {classes.map((c) => (
                  <button
                    key={c}
                    onClick={() => setClassFilter(classFilter === c ? null : c)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${classFilter === c ? 'border-blue-600 bg-blue-950/50 text-blue-300' : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 py-16 text-center">
                <p className="text-sm text-slate-500">ยังไม่มีงานที่ส่ง</p>
              </div>
            ) : (
              <div className="space-y-4">
                {visible.map((s) => (
                  <div key={s.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                    <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-medium text-slate-100">{s.alias}</p>
                        {s.classId && <p className="text-xs text-slate-500">{s.classId}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] text-slate-400">{statusLabel(s.status)}</span>
                        {typeof s.score === 'number' && (
                          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${scoreColor(s.score)}`}>{s.score}/100</span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                      {s.answers && Object.keys(s.answers).length > 0 ? (
                        <BlockAnswers blocks={data.assignment.blocks} answers={s.answers} comments={s.questionComments} />
                      ) : s.content ? (
                        <p className="whitespace-pre-wrap text-sm text-slate-300">{s.content}</p>
                      ) : (
                        <p className="text-sm text-slate-500 italic">ไม่มีคำตอบ</p>
                      )}
                    </div>

                    {s.feedback && (
                      <p className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
                        <span className="text-slate-500">Feedback: </span>{s.feedback}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function BlockAnswers({
  blocks, answers, comments,
}: {
  blocks: Block[];
  answers: Record<string, string | string[]>;
  comments?: Record<string, string>;
}) {
  const questionBlocks = blocks.filter((b) =>
    ['short-answer', 'long-answer', 'multiple-choice', 'checkbox', 'ordering', 'image-upload', 'true-false', 'matching', 'fill-blank', 'link'].includes(b.type)
  );
  return (
    <div className="space-y-5">
      {questionBlocks.map((block, i) => {
        const answer = answers[block.id];
        const q = block.question ?? block.id;
        return (
          <div key={block.id}>
            <p className="mb-1 whitespace-pre-wrap text-xs font-medium text-slate-400">ข้อ {i + 1}. {q}</p>
            {answer === undefined ? (
              <p className="text-sm text-slate-600 italic">ไม่ได้ตอบ</p>
            ) : block.type === 'image-upload' && typeof answer === 'string' && answer ? (
              <div className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={driveThumb(answer, 800)} alt="คำตอบนักเรียน" className="max-h-64 rounded-xl border border-slate-700 object-contain bg-slate-800/30" />
              </div>
            ) : block.type === 'image-upload' ? (
              <p className="text-sm text-slate-600 italic">ไม่ได้อัปโหลดรูป</p>
            ) : block.type === 'true-false' && Array.isArray(answer) ? (
              <div className="space-y-1">
                {(block.items ?? []).map((item, j) => (
                  <div key={j} className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">{item.statement}</span>
                    <span className={`ml-2 text-xs font-semibold shrink-0 ${answer[j] === 'true' ? 'text-emerald-400' : answer[j] === 'false' ? 'text-red-400' : 'text-slate-600'}`}>
                      {answer[j] === 'true' ? 'ถูก' : answer[j] === 'false' ? 'ผิด' : '—'}
                    </span>
                  </div>
                ))}
              </div>
            ) : block.type === 'matching' && Array.isArray(answer) ? (
              <div className="space-y-1">
                {(block.leftItems ?? []).map((left, j) => (
                  <div key={j} className="flex items-center gap-2 text-sm text-slate-300">
                    <span>{left}</span><span className="text-slate-600">→</span><span>{answer[j] ?? '—'}</span>
                  </div>
                ))}
              </div>
            ) : block.type === 'fill-blank' ? (() => {
              const fbAns = Array.isArray(answer) ? answer : [];
              const parts = q.split('___');
              return (
                <p className="text-sm text-slate-300 flex flex-wrap items-baseline gap-x-0.5">
                  {parts.map((part, j) => (
                    <span key={j} className="contents">
                      <span className="whitespace-pre-wrap">{part}</span>
                      {j < parts.length - 1 && <span className="border-b border-slate-500 text-blue-300 px-1">[{fbAns[j] ?? '—'}]</span>}
                    </span>
                  ))}
                </p>
              );
            })() : block.type === 'ordering' && Array.isArray(answer) ? (
              <div className="space-y-1">
                {answer.map((a, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-slate-300">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-400">{idx + 1}</span>
                    {a}
                  </div>
                ))}
              </div>
            ) : block.type === 'link' && typeof answer === 'string' && answer ? (
              <a href={answer} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 underline break-all hover:text-cyan-300">🔗 {answer}</a>
            ) : Array.isArray(answer) ? (
              <div className="flex flex-wrap gap-2">
                {answer.map((a) => (
                  <span key={a} className="rounded-full border border-blue-800 bg-blue-950/40 px-3 py-0.5 text-xs text-blue-300">{a}</span>
                ))}
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-slate-300">{answer}</p>
            )}

            {comments?.[block.id] && (
              <p className="mt-2 rounded-lg border border-blue-900/60 bg-blue-950/30 px-3 py-1.5 text-xs text-blue-200">
                💬 ครู: {comments[block.id]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

const INFOGRAPHIC_COLORS: Record<string, string> = {
  blue: 'border-blue-700/60 bg-blue-950/30',
  green: 'border-emerald-700/60 bg-emerald-950/30',
  yellow: 'border-amber-700/60 bg-amber-950/30',
  red: 'border-red-700/60 bg-red-950/30',
  purple: 'border-violet-700/60 bg-violet-950/30',
};

function KnowledgePreview({ blocks }: { blocks: Block[] }) {
  if (!blocks || blocks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-emerald-900 py-16 text-center">
        <p className="text-sm text-slate-500">ไม่มีเนื้อหาในใบความรู้นี้</p>
      </div>
    );
  }
  return (
    <div className="space-y-4 rounded-2xl border border-emerald-900/50 bg-slate-900 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500">📖 เนื้อหาใบความรู้</p>
      {blocks.map((block) => {
        switch (block.type) {
          case 'heading':
            return <h3 key={block.id} className="text-base font-bold text-slate-100">{block.text}</h3>;
          case 'paragraph':
            return <p key={block.id} className="whitespace-pre-wrap text-sm text-slate-300 leading-relaxed">{block.text}</p>;
          case 'image':
            return block.url ? (
              <div key={block.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={driveThumb(block.url, 1000)} alt={block.caption ?? ''} className="max-h-80 w-full rounded-xl border border-slate-700 object-contain bg-slate-800/30" />
                {block.caption && <p className="mt-1 text-center text-xs text-slate-500">{block.caption}</p>}
              </div>
            ) : null;
          case 'pdf':
            return block.url ? (
              <div key={block.id}>
                <iframe src={block.url} className="w-full rounded-xl border border-slate-700" style={{ height: block.height ?? 500 }} />
                {block.caption && <p className="mt-1 text-center text-xs text-slate-500">{block.caption}</p>}
              </div>
            ) : null;
          case 'infographic':
            return (
              <div key={block.id} className={`rounded-xl border p-4 ${INFOGRAPHIC_COLORS[block.color ?? 'blue'] ?? INFOGRAPHIC_COLORS.blue}`}>
                <p className="mb-1 text-lg">{block.icon}</p>
                <p className="font-semibold text-slate-100">{block.title}</p>
                <p className="mt-1 text-sm text-slate-300 whitespace-pre-wrap">{block.body}</p>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
