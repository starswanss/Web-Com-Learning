'use client';

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Image from 'next/image';
import Link from 'next/link';
import { CONTENT_TYPE_LABELS, type ContentType, type QuizPhase } from '@/types';
import { useTheme } from '@/context/ThemeContext';

/* ───────── Types ───────── */
interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate?: { _seconds: number } | null;
  classIds: string[];
  driveWebViewLink?: string;
  contentType?: ContentType;
  unit?: string;
  order?: number;
  createdAt?: { _seconds: number };
  isOpen?: boolean;
  quizPhase?: QuizPhase;
  pairedQuizId?: string;
}
interface TimetableCell { subject: string; room: string }
type TimetableCells = Record<string, TimetableCell>;

/* ───────── Constants ───────── */
const SECTION_ORDER: ContentType[] = ['knowledge', 'worksheet', 'quiz'];

const SECTION_META: Record<ContentType, {
  accentLine: string; accentBorder: string; headerBg: string; emptyText: string;
}> = {
  knowledge: { accentLine: 'bg-emerald-500', accentBorder: 'border-l-emerald-500', headerBg: 'bg-emerald-500/5', emptyText: 'ยังไม่มีใบความรู้' },
  worksheet:  { accentLine: 'bg-blue-500',    accentBorder: 'border-l-blue-500',    headerBg: 'bg-blue-500/5',    emptyText: 'ยังไม่มีใบงาน' },
  quiz:       { accentLine: 'bg-purple-500',  accentBorder: 'border-l-purple-500',  headerBg: 'bg-purple-500/5',  emptyText: 'ยังไม่มีแบบทดสอบ' },
};

const PERIODS = [
  { label: 'โฮมรูม', start: '08:00' },
  { label: 'คาบ 1',  start: '08:50' },
  { label: 'คาบ 2',  start: '09:40' },
  { label: 'คาบ 3',  start: '10:30' },
  { label: 'คาบ 4',  start: '11:20' },
  { label: 'คาบ 5',  start: '12:10' },
  { label: 'คาบ 6',  start: '13:00' },
  { label: 'คาบ 7',  start: '13:50' },
  { label: 'คาบ 8',  start: '14:40' },
  { label: 'คาบ 9',  start: '15:30' },
  { label: 'คาบ 10', start: '16:20' },
];
const DAY_NAMES_TH   = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const MONTH_NAMES_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const WEEKDAY_LABELS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'];


/* ───────── Helpers ───────── */
function dueDateColor(s: number) {
  const diff = s * 1000 - Date.now(); const d = diff / 86400000;
  if (diff < 0) return 'bg-red-600';
  if (d < 1)   return 'bg-red-500';
  if (d < 3)   return 'bg-orange-500';
  if (d < 7)   return 'bg-amber-400';
  return 'bg-emerald-500';
}
function todayDayIndex() {
  const d = new Date().getDay();
  return (d === 0 || d === 6) ? 0 : d - 1;
}
/** Manual order (ascending); unordered items fall to the end, newest first. */
function byOrder(a: Assignment, b: Assignment) {
  const oa = typeof a.order === 'number' ? a.order : Infinity;
  const ob = typeof b.order === 'number' ? b.order : Infinity;
  if (oa !== ob) return oa - ob;
  return (b.createdAt?._seconds ?? 0) - (a.createdAt?._seconds ?? 0);
}
function currentPeriodIndex() {
  const now = new Date(); const t = now.getHours() * 60 + now.getMinutes();
  const s = [480,530,580,630,680,730,780,830,880,930,980];
  const e = [530,580,630,680,730,780,830,880,930,980,1030];
  for (let i = 0; i < s.length; i++) if (t >= s[i] && t < e[i]) return i;
  return -1;
}

/* ═══════════════════════════ MAIN PAGE ═══════════════════════════ */
export default function TeacherPage() {
  const { user, profile, loading, signOut } = useAuth();
  const { toggle: toggleTheme, isLight } = useTheme();
  const router = useRouter();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [fetching, setFetching] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);
  const [timetable, setTimetable] = useState<TimetableCells>({});
  const [subStats, setSubStats] = useState<Map<string, { total: number; submitted: number; notSubmitted: Array<{ uid: string; name: string; classId: string }> }>>(new Map());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    const saved = localStorage.getItem('lms_subject');
    const sub = saved ? JSON.parse(saved) : null;
    setSubject(sub);
    const url = sub ? `/api/assignments?subject=${sub.id}` : '/api/assignments';
    fetch(url)
      .then(r => r.json())
      .then((d: Assignment[]) => {
        const list = Array.isArray(d) ? d : [];
        setAssignments(list);
        if (list.length > 0) {
          const statsUrl = sub
            ? `/api/teacher/submission-stats?subject=${sub.id}`
            : '/api/teacher/submission-stats';
          fetch(statsUrl)
            .then(r => r.json())
            .then((stats: Array<{ assignmentId: string; totalStudents: number; submitted: number; notSubmitted: number; notSubmittedNames: Array<{ uid: string; name: string; classId: string }> }>) => {
              if (!Array.isArray(stats)) return;
              const m = new Map<string, { total: number; submitted: number; notSubmitted: Array<{ uid: string; name: string; classId: string }> }>();
              stats.forEach(s => m.set(s.assignmentId, { total: s.totalStudents, submitted: s.submitted, notSubmitted: s.notSubmittedNames ?? [] }));
              setSubStats(m);
            })
            .catch(() => {});
        }
      })
      .finally(() => setFetching(false));
  }, [profile]);

  useEffect(() => {
    fetch('/api/teacher/timetable').then(r => r.json()).then(d => setTimetable(d.cells ?? {}));
  }, []);

  async function handleDelete(id: string) {
    if (!confirm('ลบใบงานนี้?')) return;
    setDeleting(id);
    await fetch('/api/assignments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setAssignments(p => p.filter(a => a.id !== id));
    setDeleting(null);
  }
  async function handleToggleQuiz(id: string) {
    setToggling(id);
    try {
      const res = await fetch(`/api/teacher/toggle-quiz/${id}`, { method: 'PATCH' });
      if (res.ok) { const { isOpen } = await res.json(); setAssignments(p => p.map(a => a.id === id ? { ...a, isOpen } : a)); }
    } finally { setToggling(null); }
  }

  // Admin drag-reorder: `ids` is one content-type section in its new order.
  // Write the index back as each item's `order` (optimistic) and persist it so
  // every student sees the same sequence.
  const persistOrder = useCallback((ids: string[]) => {
    setAssignments(prev => prev.map(a => {
      const idx = ids.indexOf(a.id);
      return idx >= 0 ? { ...a, order: idx } : a;
    }));
    fetch('/api/assignments/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }, []);

  if (loading || !profile) return <Spinner />;

  /* ── Derived ── */
  const totalAssignments = assignments.length;
  const openQuizzes  = assignments.filter(a => a.contentType === 'quiz' && a.isOpen).length;
  const dueThisWeek  = assignments.filter(a => { if (!a.dueDate) return false; const d = a.dueDate._seconds*1000-Date.now(); return d>0 && d<7*86400000; }).length;

  const today = new Date();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calCells: (number|null)[] = [];
  for (let i = 0; i < firstDay; i++) calCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calCells.push(d);

  const dayMap = new Map<number, Assignment[]>();
  assignments.forEach(a => {
    if (!a.dueDate) return;
    const d = new Date(a.dueDate._seconds * 1000);
    if (d.getFullYear()===calYear && d.getMonth()===calMonth) {
      const day = d.getDate();
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(a);
    }
  });
  const selectedAssignments = selectedDay !== null ? (dayMap.get(selectedDay) ?? []) : [];

  const todayIdx = todayDayIndex();
  const currentPeriod = currentPeriodIndex();
  const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;

  const grouped = SECTION_ORDER.reduce((acc, ct) => {
    acc[ct] = assignments.filter(a => (a.contentType ?? 'worksheet') === ct);
    return acc;
  }, {} as Record<ContentType, Assignment[]>);

  // The per-type counts (ใบความรู้/ใบงาน/แบบทดสอบ) already appear on each
  // section header below, so the top row keeps only the summary + the two
  // numbers a teacher acts on: what's open and what's due soon.
  const STATS = [
    { label: 'งานทั้งหมด',    value: totalAssignments, color: 'text-slate-100',   line: 'bg-slate-500',  glow: 'from-slate-500/8' },
    { label: 'เปิดสอบอยู่',   value: openQuizzes,      color: 'text-emerald-300', line: 'bg-emerald-400', glow: 'from-emerald-400/10' },
    { label: 'ส่งสัปดาห์นี้', value: dueThisWeek,      color: 'text-amber-300',   line: 'bg-amber-400',   glow: 'from-amber-400/10' },
  ];

  return (
    <div className="min-h-screen bg-slate-950">

      {/* ══ HEADER ══ */}
      <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">

          {/* Left: back + subject */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <button
              onClick={() => { localStorage.removeItem('lms_subject'); router.push('/select-subject'); }}
              className="shrink-0 rounded-lg border border-slate-800 p-1.5 text-slate-500 transition-all hover:border-slate-700 hover:text-slate-300"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold tracking-wider text-slate-600">Teacher Dashboard</p>
              <h1 className="truncate text-sm font-bold text-slate-100">{subject?.name ?? 'Computing Science & IT'}</h1>
            </div>
          </div>

          {/* Right */}
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={toggleTheme}
              className="rounded-lg border border-slate-800 p-2 text-sm transition-all hover:border-slate-700">
              {isLight ? '🌙' : '☀️'}
            </button>
            {user?.photoURL && (
              <Image src={user.photoURL} alt="" width={30} height={30} className="hidden sm:block rounded-full ring-2 ring-slate-700/60" />
            )}
            <button onClick={signOut}
              className="hidden sm:block rounded-lg border border-slate-800 px-3 py-1.5 text-[11px] text-slate-500 transition-all hover:border-slate-700 hover:text-slate-300">
              ออก
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-4 space-y-4 sm:px-6 sm:py-6">
        <AiStatusBanner />
        {fetching ? (
          <div className="flex items-center justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-400" /></div>
        ) : (
          <>
            {/* ══ STAT CARDS ══ */}
            <div className="grid grid-cols-3 gap-3">
              {STATS.map(s => (
                <div key={s.label} className={`relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-b ${s.glow} to-slate-900 p-4`}>
                  <div className={`absolute inset-x-0 top-0 h-[2px] ${s.line}`} />
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{s.label}</p>
                  <p className={`mt-1.5 text-3xl font-black leading-none ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* ══ MAIN CONTENT ══ */}
            <div className="grid gap-5 xl:grid-cols-[1fr_300px]">

              {/* ── LEFT: Assignment Sections ── */}
              <div className="space-y-4 min-w-0">
                {SECTION_ORDER.map(ct => {
                  const meta  = CONTENT_TYPE_LABELS[ct];
                  const smeta = SECTION_META[ct];
                  const items = grouped[ct].slice().sort(byOrder);
                  return (
                    <section key={ct} className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900">
                      {/* Section header */}
                      <div className={`flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5 ${smeta.headerBg}`}>
                        <div className="flex items-center gap-3">
                          <div className={`h-4 w-0.5 rounded-full ${smeta.accentLine}`} />
                          <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${meta.color}`}>
                            {meta.icon} {meta.label}
                          </span>
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                            {items.length}
                          </span>
                        </div>
                        <Link href={`/teacher/assignments/new?type=${ct}`}
                          className="rounded-xl bg-blue-600 px-4 py-1.5 text-[11px] font-bold text-white transition-all hover:bg-blue-500 active:scale-95">
                          + สร้าง{meta.label}
                        </Link>
                      </div>

                      {/* Rows — flat, in the admin's manual order (drag ⠿ to sort) */}
                      {items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-1 py-10">
                          <span className="text-2xl opacity-20">{meta.icon}</span>
                          <p className="text-xs text-slate-700">{smeta.emptyText}</p>
                        </div>
                      ) : (
                        <ReorderableRows
                          items={items}
                          onReorder={persistOrder}
                          renderRow={(a) => (
                            <AssignmentRow
                              assignment={a} accentBorder={smeta.accentBorder}
                              onDelete={handleDelete} onToggleQuiz={handleToggleQuiz}
                              deleting={deleting === a.id} toggling={toggling === a.id}
                              stat={subStats.get(a.id)}
                            />
                          )}
                        />
                      )}
                    </section>
                  );
                })}
              </div>

              {/* ── RIGHT: Sidebar — ordered by how often it's used day to day:
                     ตารางสอน (now) → ปฏิทิน (due dates) → Firestore (monitoring) ── */}
              <div className="flex flex-col gap-4">

                {/* Firestore usage — monitoring, so it sits last */}
                <div className="order-3"><FirestoreUsageCard /></div>

                {/* Calendar */}
                <div className="order-2 overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5">
                    <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">ปฏิทิน</h2>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { if (calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1); setSelectedDay(null); }}
                        className="rounded border border-slate-800 px-2 py-0.5 text-[10px] text-slate-500 hover:text-slate-300 transition-all">←</button>
                      <span className="min-w-[90px] text-center text-[10px] font-medium text-slate-400">{MONTH_NAMES_TH[calMonth]} {calYear+543}</span>
                      <button onClick={() => { if (calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1); setSelectedDay(null); }}
                        className="rounded border border-slate-800 px-2 py-0.5 text-[10px] text-slate-500 hover:text-slate-300 transition-all">→</button>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="mb-1 grid grid-cols-7">
                      {DAY_NAMES_TH.map(d => (
                        <div key={d} className="py-1 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-700">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {calCells.map((day, i) => {
                        if (!day) return <div key={`e-${i}`} />;
                        const isToday = day===today.getDate() && calMonth===today.getMonth() && calYear===today.getFullYear();
                        const dayA = dayMap.get(day) ?? [];
                        const isSel = selectedDay === day;
                        return (
                          <button key={day} onClick={() => setSelectedDay(isSel ? null : day)}
                            className={`relative flex flex-col items-center rounded-lg py-1.5 transition-all ${
                              isSel   ? 'bg-blue-600 text-white'
                              : isToday ? 'bg-slate-800 text-blue-400'
                              : 'text-slate-500 hover:bg-slate-800/60'
                            }`}>
                            <span className="text-[11px] font-semibold leading-none">{day}</span>
                            {dayA.length > 0 && (
                              <div className="mt-0.5 flex gap-0.5">
                                {dayA.slice(0,3).map(a => (
                                  <span key={a.id} className={`h-1 w-1 rounded-full ${isSel ? 'bg-white/60' : a.dueDate ? dueDateColor(a.dueDate._seconds) : 'bg-slate-600'}`} />
                                ))}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {selectedDay !== null && (
                      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-600">
                          {selectedDay} {MONTH_NAMES_TH[calMonth]}
                        </p>
                        {selectedAssignments.length === 0 ? (
                          <p className="text-[10px] text-slate-700">ไม่มีใบงานวันนี้</p>
                        ) : (
                          <div className="space-y-1.5">
                            {selectedAssignments.map(a => {
                              const m = a.contentType ? CONTENT_TYPE_LABELS[a.contentType] : null;
                              return (
                                <Link key={a.id} href={`/teacher/assignments/${a.id}/submissions`}
                                  className="flex items-center gap-2 rounded-lg border border-slate-800 px-2.5 py-1.5 hover:border-slate-700 transition-all">
                                  {m && <span className="text-xs">{m.icon}</span>}
                                  <p className="min-w-0 flex-1 truncate text-[10px] text-slate-300">{a.title}</p>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                      {[['bg-red-600','เกิน'],['bg-orange-500','<3วัน'],['bg-amber-400','<7วัน'],['bg-emerald-500','ปกติ']].map(([c,l]) => (
                        <span key={l} className="flex items-center gap-1 text-[9px] text-slate-700">
                          <span className={`h-1.5 w-1.5 rounded-full ${c}`}/>{l}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Timetable */}
                <div className="order-1 overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">ตารางสอน</p>
                      <h2 className="text-xs font-semibold text-slate-300">
                        {isWeekend ? 'วันจันทร์' : WEEKDAY_LABELS[todayIdx]}
                      </h2>
                    </div>
                    <Link href="/teacher/timetable" className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">แก้ไข →</Link>
                  </div>
                  <div className="divide-y divide-slate-800/40">
                    {PERIODS.map((p, pi) => {
                      const cell = timetable[`${todayIdx}_${pi}`];
                      const isNow = pi === currentPeriod && !isWeekend;
                      return (
                        <div key={pi} className={`flex items-center gap-3 px-4 py-2 transition-colors ${isNow ? 'bg-blue-950/40' : 'hover:bg-slate-800/20'}`}>
                          <div className="w-14 shrink-0">
                            <p className={`text-[9px] font-semibold ${isNow ? 'text-blue-400' : 'text-slate-600'}`}>{p.label}</p>
                            <p className="text-[8px] text-slate-800">{p.start}</p>
                          </div>
                          <div className="min-w-0 flex-1">
                            {cell ? (
                              <>
                                <p className={`truncate text-[11px] font-medium ${isNow ? 'text-blue-200' : 'text-slate-300'}`}>{cell.subject}</p>
                                {cell.room && <p className="text-[9px] text-slate-600">{cell.room}</p>}
                              </>
                            ) : (
                              <p className="text-[10px] text-slate-800">—</p>
                            )}
                          </div>
                          {isNow && (
                            <span className="shrink-0 rounded-full bg-blue-600 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white">NOW</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ═══════════════════════════ SUB-COMPONENTS ═══════════════════════════ */

type StatMap = Map<string, { total: number; submitted: number; notSubmitted: Array<{ uid: string; name: string; classId: string }> }>;

/* A flat, drag-reorderable list. Only the ⠿ handle starts a drag, so the row's
   own buttons/links keep working; each row is a drop target. On drop we emit
   the new id order and the parent persists it. */
function ReorderableRows<T extends { id: string }>({
  items, onReorder, renderRow,
}: {
  items: T[];
  onReorder: (ids: string[]) => void;
  renderRow: (item: T) => ReactNode;
}) {
  const [order, setOrder] = useState<T[]>(items);
  useEffect(() => { setOrder(items); }, [items]);
  const dragFrom = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function drop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    setOverIndex(null);
    if (from === null || from === to) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    onReorder(next.map((x) => x.id));
  }

  return (
    <div className="divide-y divide-slate-800/50">
      {order.map((item, i) => (
        <div
          key={item.id}
          onDragOver={(e) => { e.preventDefault(); setOverIndex(i); }}
          onDragLeave={() => setOverIndex((v) => (v === i ? null : v))}
          onDrop={() => drop(i)}
          className={`flex items-stretch ${overIndex === i ? 'bg-blue-950/40 ring-1 ring-inset ring-blue-700/50' : ''}`}
        >
          <span
            draggable
            onDragStart={() => { dragFrom.current = i; }}
            onDragEnd={() => { dragFrom.current = null; setOverIndex(null); }}
            title="ลากเพื่อจัดลำดับ"
            className="flex w-7 shrink-0 cursor-grab select-none items-center justify-center text-base text-slate-700 transition-colors hover:text-slate-400 active:cursor-grabbing"
          >
            ⠿
          </span>
          <div className="min-w-0 flex-1">{renderRow(item)}</div>
        </div>
      ))}
    </div>
  );
}

const QUIZ_PHASE_LABELS: Record<string, { label: string; color: string }> = {
  pre:  { label: 'ก่อนเรียน', color: 'border-sky-800/60 bg-sky-950/30 text-sky-400' },
  post: { label: 'หลังเรียน', color: 'border-violet-800/60 bg-violet-950/30 text-violet-400' },
};

function AssignmentRow({
  assignment: a, accentBorder, onDelete, onToggleQuiz, deleting, toggling, stat,
}: {
  assignment: Assignment; accentBorder: string;
  onDelete: (id: string) => void; onToggleQuiz: (id: string) => void;
  deleting: boolean; toggling: boolean;
  stat?: { total: number; submitted: number; notSubmitted: Array<{ uid: string; name: string; classId: string }> };
}) {
  const [showMissing, setShowMissing] = useState(false);
  const isQuiz = a.contentType === 'quiz';
  const isKnowledge = a.contentType === 'knowledge';

  const submitPct = stat && stat.total > 0 ? Math.round((stat.submitted / stat.total) * 100) : null;

  return (
    <div className={`border-l-2 ${accentBorder} transition-colors hover:bg-slate-800/20`}>
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-3.5">
      {/* ── Info ── */}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-100 truncate">{a.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {a.unit && (
            <span className="rounded-md border border-slate-700/60 bg-slate-800/60 px-2 py-0.5 text-[9px] font-semibold text-slate-400">
              {a.unit}
            </span>
          )}
          {isQuiz && a.quizPhase && a.quizPhase !== 'standalone' && (() => {
            const ph = QUIZ_PHASE_LABELS[a.quizPhase];
            return ph ? (
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${ph.color}`}>{ph.label}</span>
            ) : null;
          })()}
          {a.isOpen !== undefined && a.isOpen !== null && (
            <span className={`flex items-center gap-1 text-[10px] font-semibold ${a.isOpen ? 'text-emerald-400' : 'text-slate-600'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${a.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}/>
              {a.isOpen ? (isQuiz ? 'เปิดสอบอยู่' : 'เปิดอยู่') : 'ปิดอยู่'}
            </span>
          )}
          {/* Submission stat badge — hidden for knowledge sheets */}
          {!isKnowledge && stat && stat.total > 0 && (
            <button
              onClick={() => setShowMissing(v => !v)}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold transition-all ${
                stat.submitted === stat.total
                  ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-400'
                  : stat.submitted === 0
                  ? 'border-red-800/60 bg-red-950/30 text-red-400'
                  : 'border-amber-800/60 bg-amber-950/30 text-amber-400'
              }`}
            >
              <span>{stat.submitted}/{stat.total} ส่งแล้ว</span>
              {submitPct !== null && <span className="opacity-60">({submitPct}%)</span>}
              {stat.notSubmitted.length > 0 && <span className="opacity-50">{showMissing ? '▲' : '▼'}</span>}
            </button>
          )}
        </div>
        {/* Submission progress bar — hidden for knowledge sheets */}
        {!isKnowledge && stat && stat.total > 0 && (
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                stat.submitted === stat.total ? 'bg-emerald-500' : stat.submitted === 0 ? 'bg-red-800' : 'bg-amber-400'
              }`}
              style={{ width: `${submitPct ?? 0}%` }}
            />
          </div>
        )}
      </div>

      {/* ── Action buttons — full-width row on mobile, compact on desktop ── */}
      <div className="flex items-center gap-2 sm:shrink-0 sm:gap-1.5">
        <button onClick={() => onToggleQuiz(a.id)} disabled={toggling}
          className={`flex-1 sm:flex-none rounded-lg border px-3 py-2 text-xs font-bold transition-all disabled:opacity-50 sm:px-2.5 sm:py-1 sm:text-[10px] ${
            a.isOpen
              ? 'border-red-900/60 bg-red-950/30 text-red-400 hover:border-red-800'
              : 'border-emerald-900/60 bg-emerald-950/30 text-emerald-400 hover:border-emerald-800'
          }`}>
          {toggling ? '…' : a.isOpen
            ? (isQuiz ? '⏸ ปิด' : '⏸ ปิด')
            : (isQuiz ? '▶ เปิด' : '▶ เปิด')}
        </button>
        <Link href={`/teacher/assignments/${a.id}/edit`}
          className="flex-1 sm:flex-none text-center rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200 transition-all sm:px-2.5 sm:py-1 sm:text-[10px]">
          แก้ไข
        </Link>
        <Link href={`/teacher/assignments/${a.id}/submissions`}
          className={`flex-1 sm:flex-none text-center rounded-lg border px-3 py-2 text-xs font-semibold transition-all sm:px-2.5 sm:py-1 sm:text-[10px] ${
            isKnowledge
              ? 'border-emerald-800/60 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-950/40'
              : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
          }`}>
          {isKnowledge ? 'เปิดดู' : 'ตรวจงาน'}
        </Link>
        <button onClick={() => onDelete(a.id)} disabled={deleting}
          className="rounded-lg border border-slate-800 px-3 py-2 text-xs text-red-700 transition-all hover:border-red-900 hover:text-red-500 disabled:opacity-40 sm:px-2 sm:py-1 sm:text-[10px]">
          {deleting ? '…' : '✕'}
        </button>
      </div>
    </div>{/* closes inner flex row */}

    {/* Expandable not-submitted list */}
    {showMissing && stat && stat.notSubmitted.length > 0 && (
      <div className="border-t border-slate-800/50 bg-slate-950/50 px-5 py-3">
        <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">
          ยังไม่ส่ง · {stat.notSubmitted.length} คน
        </p>
        <div className="flex flex-wrap gap-1.5">
          {stat.notSubmitted.map(s => (
            <span key={s.uid} className="rounded-full border border-slate-700/60 bg-slate-800/60 px-2 py-0.5 text-[9px] text-slate-400">
              {s.name} <span className="text-slate-600">{s.classId}</span>
            </span>
          ))}
        </div>
      </div>
    )}
  </div>
  );
}

/* Firestore daily read usage — ESTIMATED from our own per-student read-tracker
   (readStats/{date}/students). Works on the free plan with no billing/Cloud
   Monitoring. Students are the bulk of reads, so the self-counted total tracks
   the real figure closely; the exact number lives in the Firebase Console. */
interface ReadStatsData {
  date: string;
  total: number;
  students: Array<{ uid: string; reads: number; displayName: string; classId: string }>;
}

const READ_LIMIT = 50000; // Spark free-tier daily reads

interface AiStatusData { state: 'ok' | 'exhausted' | 'reset'; provider?: string; resetAt?: string }

/**
 * Dashboard banner for AI grading availability. Shows a warning when the daily
 * AI quota is used up (with the reset time), and a "กลับมาใช้ได้แล้ว" notice
 * once the quota rolls over. Silent when everything is normal.
 */
function AiStatusBanner() {
  const [data, setData] = useState<AiStatusData | null>(null);

  const load = useCallback(() => {
    fetch('/api/teacher/ai-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j && j.state ? j : null))
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // refresh each minute so a reset shows up on its own
    return () => clearInterval(t);
  }, [load]);

  if (!data || data.state === 'ok') return null;

  const providerName =
    data.provider === 'claude' ? 'Claude' : data.provider === 'openrouter' ? 'OpenRouter' : 'Groq';

  if (data.state === 'reset') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-600/40 bg-emerald-950/40 px-5 py-3.5">
        <span className="text-lg">✅</span>
        <div>
          <p className="text-sm font-semibold text-emerald-300">AI ตรวจงานกลับมาใช้งานได้แล้ว</p>
          <p className="text-xs text-emerald-400/70">โควตารายวันรีเซ็ตแล้ว — กดตรวจงานที่เหลือต่อได้เลย</p>
        </div>
      </div>
    );
  }

  // state === 'exhausted'
  const reset = data.resetAt ? new Date(data.resetAt) : null;
  const resetText = reset
    ? reset.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-amber-600/40 bg-amber-950/40 px-5 py-3.5">
      <span className="text-lg">⏳</span>
      <div>
        <p className="text-sm font-semibold text-amber-300">AI ตรวจงานใช้ครบโควตารายวันแล้ว ({providerName})</p>
        <p className="text-xs text-amber-400/70">
          {resetText ? `กลับมาใช้ได้อีกครั้งประมาณ ${resetText} น.` : 'กลับมาใช้ได้อีกครั้งในวันถัดไป'} · ที่ตรวจไปแล้วยังอยู่ครบ
        </p>
      </div>
    </div>
  );
}

function FirestoreUsageCard() {
  const [stats, setStats] = useState<ReadStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [showPerStudent, setShowPerStudent] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/teacher/read-stats')
      .then((r) => r.json())
      .then((j) => { if (j?.students) { setStats(j); setFailed(false); } else setFailed(true); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const reads = stats?.total ?? 0;
  const pct = Math.min(100, Math.round((reads / READ_LIMIT) * 100));
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-500';
  const txtColor = pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-emerald-400';
  const students = stats?.students ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Firestore วันนี้ (ประมาณ)</p>
          <h2 className="text-xs font-semibold text-slate-300">📊 การอ่าน</h2>
        </div>
        <button onClick={load} disabled={loading}
          className="rounded-lg border border-slate-800 px-2 py-1 text-[10px] text-slate-500 transition-all hover:border-slate-700 hover:text-slate-300 disabled:opacity-50">
          {loading ? '…' : '↻'}
        </button>
      </div>

      <div className="p-4">
        {failed ? (
          <p className="py-2 text-[10px] leading-relaxed text-slate-600">
            ยังไม่มีข้อมูลการนับวันนี้ — ตัวเลขจะขึ้นเมื่อนักเรียนเริ่มใช้งาน
          </p>
        ) : (
          <>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className={`text-lg font-black tabular-nums ${txtColor}`}>
                ~{reads.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500">/ {READ_LIMIT.toLocaleString()} อ่าน</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className={`text-[10px] font-bold ${txtColor}`}>~{pct}% ใช้แล้ว</span>
              <span className="text-[9px] text-slate-600">{students.length} คน</span>
            </div>
            {pct >= 80 && (
              <p className="mt-2 rounded-lg border border-red-900/50 bg-red-950/30 px-2 py-1.5 text-[10px] font-medium text-red-400">
                ใกล้เต็มโควต้า! เว็บจะล่มเมื่อชน 100% — แนะนำอัปเกรด Blaze
              </p>
            )}
            <p className="mt-2 text-[9px] leading-relaxed text-slate-700">
              ค่าประมาณจากการนับฝั่งนักเรียน · ตัวเลขจริงดูใน Firebase Console · reset เที่ยงคืน Pacific (~บ่าย 2 ไทย)
            </p>

            {students.length > 0 && (
              <>
                <button onClick={() => setShowPerStudent((v) => !v)}
                  className="mt-3 w-full rounded-lg border border-slate-800 py-1.5 text-[10px] font-semibold text-slate-400 transition-all hover:border-slate-700 hover:text-slate-200">
                  {showPerStudent ? '▲ ซ่อนรายคน' : '▼ ดู read รายคน'}
                </button>

                {showPerStudent && (
                  <div className="mt-2 space-y-1">
                    {students.slice(0, 15).map((s, i) => {
                      const max = students[0]?.reads || 1;
                      const w = Math.max(4, Math.round((s.reads / max) * 100));
                      return (
                        <div key={s.uid} className="flex items-center gap-2">
                          <span className="w-4 shrink-0 text-right text-[9px] text-slate-600">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[10px] text-slate-300">
                                {s.displayName || s.uid.slice(0, 6)}
                                {s.classId && <span className="ml-1 text-slate-600">{s.classId}</span>}
                              </span>
                              <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-400">{s.reads.toLocaleString()}</span>
                            </div>
                            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-800">
                              <div className="h-full rounded-full bg-blue-500/70" style={{ width: `${w}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {students.length > 15 && (
                      <p className="pt-1 text-center text-[9px] text-slate-600">+ อีก {students.length - 15} คน</p>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-800 border-t-slate-400" />
    </div>
  );
}
