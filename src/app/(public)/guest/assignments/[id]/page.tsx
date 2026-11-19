'use client';

import { useEffect, useMemo, useState, use } from 'react';
import Link from 'next/link';
import { driveThumb } from '@/lib/img';
import { GuestFooter, GuestTopBar, Spinner, scoreTone, typeMeta } from '../../_shared';

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
  assignment: {
    id: string; title: string; description: string; contentType: string; blocks: Block[];
    isGroupWork: boolean; unit: string | null; subjectName: string;
  };
  submissions: GuestSubmission[];
}

const QUESTION_TYPES = ['short-answer', 'long-answer', 'multiple-choice', 'checkbox', 'ordering', 'image-upload', 'true-false', 'matching', 'fill-blank', 'link'];
const PAGE = 20;

type SortKey = 'score' | 'recent';

function statusLabel(status: string) {
  if (status === 'reviewed') return 'ตรวจแล้ว';
  if (status === 'graded') return 'รอบันทึกคะแนน';
  if (status === 'submitted') return 'รอตรวจ';
  return status;
}

function firstAnswerPreview(s: GuestSubmission, blocks: Block[]): string {
  if (s.content) return s.content;
  for (const b of blocks) {
    const v = s.answers?.[b.id];
    if (typeof v === 'string' && v.trim() && b.type !== 'image-upload') return v;
  }
  return '';
}

export default function GuestSubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<GuestData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'work' | 'questions'>('work');
  const [classFilter, setClassFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('score');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/guest/submissions/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: GuestData) => setData(d))
      .catch((s) => setError(s === 404 ? 'ไม่พบงานนี้' : 'โหลดข้อมูลไม่สำเร็จ'));
  }, [id]);

  const subs = useMemo(() => data?.submissions ?? [], [data]);
  const classes = useMemo(() => Array.from(new Set(subs.map((s) => s.classId).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th', { numeric: true })), [subs]);
  const scored = subs.filter((s) => typeof s.score === 'number');
  const avg = scored.length ? Math.round(scored.reduce((n, s) => n + (s.score ?? 0), 0) / scored.length) : null;
  const buckets = [
    { label: '80–100', min: 80, color: 'bg-emerald-500' },
    { label: '60–79', min: 60, color: 'bg-amber-400' },
    { label: '40–59', min: 40, color: 'bg-orange-500' },
    { label: '0–39', min: 0, color: 'bg-red-500' },
  ].map((b, i, all) => ({
    ...b,
    n: scored.filter((s) => (s.score ?? 0) >= b.min && (i === 0 || (s.score ?? 0) < all[i - 1].min)).length,
  }));

  const list = useMemo(() => {
    const filtered = classFilter ? subs.filter((s) => s.classId === classFilter) : subs;
    return [...filtered].sort((a, b) =>
      sort === 'score'
        ? (b.score ?? -1) - (a.score ?? -1)
        : (b.submittedAt?._seconds ?? 0) - (a.submittedAt?._seconds ?? 0),
    );
  }, [subs, classFilter, sort]);

  const toggle = (sid: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });

  const a = data?.assignment;
  const meta = typeMeta(a?.contentType ?? 'worksheet');
  const questionCount = a ? a.blocks.filter((b) => QUESTION_TYPES.includes(b.type)).length : 0;

  return (
    <div className="min-h-screen bg-slate-950">
      <GuestTopBar />

      <main className="mx-auto max-w-4xl px-4 py-6">
        <Link href="/guest" className="text-sm text-slate-400 transition-colors hover:text-slate-200">← กลับไปหน้ารวมงาน</Link>

        {error ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-800 py-16 text-center">
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        ) : !data || !a ? (
          <Spinner />
        ) : (
          <>
            {/* ── Header ── */}
            <header className="relative mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${meta.accent}`} />
              <p className="text-xs text-slate-500">
                {a.subjectName}{a.unit ? ` › ${a.unit}` : ''}
              </p>
              <h1 className="mt-1.5 text-xl font-bold leading-snug text-slate-50 sm:text-2xl">{a.title}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full border px-2.5 py-0.5 text-xs ${meta.badge}`}>{meta.icon} {meta.label}</span>
                {a.isGroupWork && <span className="rounded-full border border-slate-700 px-2.5 py-0.5 text-xs text-slate-400">👥 งานกลุ่ม</span>}
                {questionCount > 0 && <span className="rounded-full border border-slate-700 px-2.5 py-0.5 text-xs text-slate-400">{questionCount} ข้อ</span>}
              </div>
              {a.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-400">{a.description}</p>}

              {a.contentType !== 'knowledge' && (
                <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-800 pt-5">
                  <Stat value={subs.length} label="ผลงานที่ส่ง" />
                  <Stat value={scored.length} label="ตรวจให้คะแนนแล้ว" />
                  <Stat value={avg ?? '—'} label="คะแนนเฉลี่ย" />
                </div>
              )}
              {scored.length > 0 && (
                <div className="mt-4">
                  <div className="flex h-2 overflow-hidden rounded-full bg-slate-800">
                    {buckets.map((b) => b.n > 0 && (
                      <div key={b.label} className={b.color} style={{ width: `${(b.n / scored.length) * 100}%` }} title={`${b.label}: ${b.n} คน`} />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    {buckets.map((b) => (
                      <span key={b.label} className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${b.color}`} />{b.label} คะแนน · {b.n}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </header>

            {a.contentType === 'knowledge' ? (
              <div className="mt-6"><KnowledgePreview blocks={a.blocks} /></div>
            ) : (
              <>
                {/* ── Tabs ── */}
                <div className="mt-6 flex gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
                  <TabButton active={tab === 'work'} onClick={() => setTab('work')}>🗂 ผลงานนักเรียน ({subs.length})</TabButton>
                  <TabButton active={tab === 'questions'} onClick={() => setTab('questions')}>📋 โจทย์{questionCount ? ` (${questionCount} ข้อ)` : ''}</TabButton>
                </div>

                {tab === 'questions' ? (
                  <div className="mt-4"><QuestionsPreview blocks={a.blocks} /></div>
                ) : (
                  <>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <select
                        value={classFilter}
                        onChange={(e) => { setClassFilter(e.target.value); setLimit(PAGE); }}
                        className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-blue-600 focus:outline-none"
                      >
                        <option value="">ทุกห้อง ({subs.length})</option>
                        {classes.map((c) => (
                          <option key={c} value={c}>{c} ({subs.filter((s) => s.classId === c).length})</option>
                        ))}
                      </select>
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortKey)}
                        className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-blue-600 focus:outline-none"
                      >
                        <option value="score">เรียงตามคะแนนสูงสุด</option>
                        <option value="recent">เรียงตามส่งล่าสุด</option>
                      </select>
                      <button
                        onClick={() => setOpen(open.size ? new Set() : new Set(list.slice(0, limit).map((s) => s.id)))}
                        className="ml-auto rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400 hover:border-slate-600"
                      >
                        {open.size ? 'ย่อทั้งหมด' : 'ขยายทั้งหมด'}
                      </button>
                    </div>

                    {list.length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-800 py-16 text-center">
                        <p className="text-sm text-slate-500">ยังไม่มีผลงานที่ส่ง</p>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {list.slice(0, limit).map((s) => {
                          const isOpen = open.has(s.id);
                          const preview = firstAnswerPreview(s, a.blocks);
                          return (
                            <div key={s.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 transition-colors hover:border-slate-700">
                              <button onClick={() => toggle(s.id)} className="flex w-full items-center gap-3 p-4 text-left">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm">🎓</span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-slate-100">
                                    {s.alias}{s.classId && <span className="ml-2 text-xs font-normal text-slate-500">{s.classId}</span>}
                                  </p>
                                  {!isOpen && preview && <p className="mt-0.5 truncate text-xs text-slate-500">{preview}</p>}
                                </div>
                                {typeof s.score === 'number' ? (
                                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${scoreTone(s.score)}`}>{s.score}/100</span>
                                ) : (
                                  <span className="shrink-0 rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] text-slate-400">{statusLabel(s.status)}</span>
                                )}
                                <span className={`shrink-0 text-slate-600 transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                              </button>
                              {isOpen && (
                                <div className="border-t border-slate-800 bg-slate-950/40 p-4">
                                  {s.answers && Object.keys(s.answers).length > 0 ? (
                                    <BlockAnswers blocks={a.blocks} answers={s.answers} comments={s.questionComments} />
                                  ) : s.content ? (
                                    <p className="whitespace-pre-wrap text-sm text-slate-300">{s.content}</p>
                                  ) : (
                                    <p className="text-sm italic text-slate-500">ไม่มีคำตอบ</p>
                                  )}
                                  {s.feedback && (
                                    <p className="mt-4 rounded-lg border border-blue-900/60 bg-blue-950/30 px-3 py-2 text-xs text-blue-200">
                                      💬 ความเห็นจากครู: {s.feedback}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {list.length > limit && (
                          <button
                            onClick={() => setLimit((n) => n + PAGE)}
                            className="w-full rounded-2xl border border-slate-800 bg-slate-900 py-3 text-sm text-slate-300 transition-colors hover:border-slate-600"
                          >
                            แสดงเพิ่ม ({list.length - limit} ผลงานที่เหลือ)
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

        <GuestFooter />
      </main>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-xl font-bold tabular-nums text-slate-50 sm:text-2xl">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:text-sm ${
        active ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

/** The worksheet itself as students see it — content blocks and numbered questions. */
function QuestionsPreview({ blocks }: { blocks: Block[] }) {
  if (!blocks?.length) {
    return <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center text-sm text-slate-500">ไม่มีโจทย์ในงานนี้</div>;
  }
  const numberOf = new Map(blocks.filter((b) => QUESTION_TYPES.includes(b.type)).map((b, i) => [b.id, i + 1]));
  return (
    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      {blocks.map((b) => {
        if (!QUESTION_TYPES.includes(b.type)) {
          return <ContentBlock key={b.id} block={b} />;
        }
        const n = numberOf.get(b.id);
        const q = b.question ?? '';
        return (
          <div key={b.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <p className="whitespace-pre-wrap text-sm font-medium text-slate-200">
              <span className="mr-1.5 text-blue-400">ข้อ {n}.</span>{b.type === 'fill-blank' ? q.replaceAll('___', '_____') : q}
            </p>
            {(b.type === 'multiple-choice' || b.type === 'checkbox' || b.type === 'ordering') && b.options?.length ? (
              <ul className="mt-2 space-y-1">
                {b.options.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                    <span className="mt-0.5 text-slate-600">{b.type === 'checkbox' ? '☐' : b.type === 'ordering' ? `${i + 1}.` : '○'}</span>{o}
                  </li>
                ))}
              </ul>
            ) : b.type === 'true-false' && b.items?.length ? (
              <ul className="mt-2 space-y-1">
                {b.items.map((it, i) => <li key={i} className="text-sm text-slate-400">• {it.statement} <span className="text-slate-600">(ถูก/ผิด)</span></li>)}
              </ul>
            ) : b.type === 'matching' && b.leftItems?.length ? (
              <ul className="mt-2 space-y-1">
                {b.leftItems.map((l, i) => <li key={i} className="text-sm text-slate-400">• {l} → ……</li>)}
              </ul>
            ) : (
              <p className="mt-1.5 text-xs text-slate-600">
                {b.type === 'image-upload' ? '📷 ตอบโดยอัปโหลดรูปภาพ' : b.type === 'link' ? '🔗 ตอบเป็นลิงก์' : b.type === 'long-answer' ? '✍️ ตอบแบบบรรยาย' : b.type === 'short-answer' ? '✍️ ตอบสั้น' : ''}
              </p>
            )}
          </div>
        );
      })}
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
    <div className="space-y-4 rounded-2xl border border-emerald-900/50 bg-slate-900 p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500">📖 เนื้อหาใบความรู้ — สำหรับอ่านศึกษา ไม่ต้องส่งงาน</p>
      {blocks.map((block) => <ContentBlock key={block.id} block={block} />)}
    </div>
  );
}

function ContentBlock({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading':
      return <h3 className="text-base font-bold text-slate-100">{block.text}</h3>;
    case 'paragraph':
      return <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{block.text}</p>;
    case 'image':
      return block.url ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={driveThumb(block.url, 1000)} alt={block.caption ?? ''} className="max-h-96 w-full rounded-xl border border-slate-700 bg-slate-800/30 object-contain" />
          {block.caption && <p className="mt-1 text-center text-xs text-slate-500">{block.caption}</p>}
        </div>
      ) : null;
    case 'pdf':
      return block.url ? (
        <div>
          <iframe src={block.url} className="w-full rounded-xl border border-slate-700" style={{ height: block.height ?? 500 }} />
          {block.caption && <p className="mt-1 text-center text-xs text-slate-500">{block.caption}</p>}
        </div>
      ) : null;
    case 'infographic':
      return (
        <div className={`rounded-xl border p-4 ${INFOGRAPHIC_COLORS[block.color ?? 'blue'] ?? INFOGRAPHIC_COLORS.blue}`}>
          <p className="mb-1 text-lg">{block.icon}</p>
          <p className="font-semibold text-slate-100">{block.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{block.body}</p>
        </div>
      );
    default:
      return null;
  }
}
