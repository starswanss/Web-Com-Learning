'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Image from 'next/image';
import Link from 'next/link';
import { CONTENT_TYPE_LABELS, type ContentType } from '@/types';

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
  isOpen?: boolean;
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

const NAV_LINKS = [
  { href: '/teacher/overview',       label: 'ภาพรวม' },
  { href: '/teacher/students',       label: 'นักเรียน' },
  { href: '/teacher/leaderboard',    label: 'Rank' },
  { href: '/teacher/analytics',      label: 'Analytics' },
  { href: '/teacher/timetable',      label: 'ตารางสอน' },
  { href: '/teacher/question-bank',  label: 'Q-Bank' },
  { href: '/teacher/templates',      label: 'Template' },
  { href: '/teacher/export-report',  label: 'Export' },
  { href: '/teacher/admin',          label: 'Admin' },
];

/* ───────── Helpers ───────── */
function dueDateColor(s: number) {
  const diff = s * 1000 - Date.now(); const d = diff / 86400000;
  if (diff < 0) return 'bg-red-600';
  if (d < 1)   return 'bg-red-500';
  if (d < 3)   return 'bg-orange-500';
  if (d < 7)   return 'bg-amber-400';
  return 'bg-emerald-500';
}
function dueDateStatus(s: number) {
  const diff = s * 1000 - Date.now(); const d = diff / 86400000;
  if (diff < 0) return { dot: 'bg-red-600',    text: 'text-red-500',    label: 'เกินกำหนด' };
  if (d < 1)    return { dot: 'bg-red-500',    text: 'text-red-400',    label: 'วันนี้!' };
  if (d < 3)    return { dot: 'bg-orange-500', text: 'text-orange-400', label: `${Math.ceil(d)} วัน` };
  if (d < 7)    return { dot: 'bg-amber-400',  text: 'text-amber-400',  label: `${Math.ceil(d)} วัน` };
  return         { dot: 'bg-emerald-500', text: 'text-emerald-400', label: `${Math.ceil(d)} วัน` };
}
function todayDayIndex() {
  const d = new Date().getDay();
  return (d === 0 || d === 6) ? 0 : d - 1;
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
  const router = useRouter();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [fetching, setFetching] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);
  const [timetable, setTimetable] = useState<TimetableCells>({});
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
    fetch(url).then(r => r.json()).then(d => setAssignments(Array.isArray(d) ? d : [])).finally(() => setFetching(false));
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

  if (loading || !profile) return <Spinner />;

  /* ── Derived ── */
  const totalAssignments = assignments.length;
  const openQuizzes  = assignments.filter(a => a.contentType === 'quiz' && a.isOpen).length;
  const dueThisWeek  = assignments.filter(a => { if (!a.dueDate) return false; const d = a.dueDate._seconds*1000-Date.now(); return d>0 && d<7*86400000; }).length;
  const knowledgeCount = assignments.filter(a => (a.contentType??'worksheet') === 'knowledge').length;
  const worksheetCount = assignments.filter(a => (a.contentType??'worksheet') === 'worksheet').length;
  const quizCount      = assignments.filter(a => (a.contentType??'worksheet') === 'quiz').length;

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

  const STATS = [
    { label: 'ทั้งหมด',      value: totalAssignments, color: 'text-slate-100',   line: 'bg-slate-500',   glow: 'from-slate-500/8' },
    { label: 'ใบความรู้',    value: knowledgeCount,  color: 'text-emerald-300', line: 'bg-emerald-500', glow: 'from-emerald-500/10' },
    { label: 'ใบงาน',        value: worksheetCount,  color: 'text-blue-300',    line: 'bg-blue-500',    glow: 'from-blue-500/10' },
    { label: 'แบบทดสอบ',    value: quizCount,       color: 'text-purple-300',  line: 'bg-purple-500',  glow: 'from-purple-500/10' },
    { label: 'เปิดสอบอยู่', value: openQuizzes,     color: 'text-emerald-300', line: 'bg-emerald-400', glow: 'from-emerald-400/10' },
    { label: 'ส่งสัปดาห์นี้', value: dueThisWeek,  color: 'text-amber-300',   line: 'bg-amber-400',   glow: 'from-amber-400/10' },
  ];

  return (
    <div className="min-h-screen bg-slate-950">

      {/* ══ HEADER ══ */}
      <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-6 py-3">

          {/* Left: back + subject */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={() => { localStorage.removeItem('lms_subject'); router.push('/select-subject'); }}
              className="shrink-0 rounded-lg border border-slate-800 p-1.5 text-slate-500 transition-all hover:border-slate-700 hover:text-slate-300"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600">Teacher Dashboard</p>
              <h1 className="truncate text-sm font-bold text-slate-100">{subject?.name ?? 'Computing Science & IT'}</h1>
            </div>
          </div>

          {/* Center: nav */}
          <nav className="hidden items-center xl:flex">
            {NAV_LINKS.map(n => (
              <Link key={n.href} href={n.href}
                className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-all hover:bg-slate-800/70 hover:text-slate-200">
                {n.label}
              </Link>
            ))}
          </nav>

          {/* Right: avatar + logout */}
          <div className="flex shrink-0 items-center gap-2">
            {user?.photoURL && (
              <Image src={user.photoURL} alt="" width={30} height={30} className="rounded-full ring-2 ring-slate-700/60" />
            )}
            <button onClick={signOut}
              className="rounded-lg border border-slate-800 px-3 py-1.5 text-[11px] text-slate-500 transition-all hover:border-slate-700 hover:text-slate-300">
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-6 space-y-5">
        {fetching ? (
          <div className="flex items-center justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-400" /></div>
        ) : (
          <>
            {/* ══ STAT CARDS ══ */}
            <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
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
                  const items = grouped[ct];
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

                      {/* Rows */}
                      {items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-1 py-10">
                          <span className="text-2xl opacity-20">{meta.icon}</span>
                          <p className="text-xs text-slate-700">{smeta.emptyText}</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-800/50">
                          {items.map(a => (
                            <AssignmentRow
                              key={a.id} assignment={a} accentBorder={smeta.accentBorder}
                              onDelete={handleDelete} onToggleQuiz={handleToggleQuiz}
                              deleting={deleting === a.id} toggling={toggling === a.id}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>

              {/* ── RIGHT: Sidebar ── */}
              <div className="space-y-4">

                {/* Calendar */}
                <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900">
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
                <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900">
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

function AssignmentRow({
  assignment: a, accentBorder, onDelete, onToggleQuiz, deleting, toggling,
}: {
  assignment: Assignment; accentBorder: string;
  onDelete: (id: string) => void; onToggleQuiz: (id: string) => void;
  deleting: boolean; toggling: boolean;
}) {
  const due = a.dueDate?._seconds;
  const dueStr = due ? new Date(due*1000).toLocaleDateString('th-TH',{day:'numeric',month:'short'}) : null;
  const status = due ? dueDateStatus(due) : null;
  const isQuiz = a.contentType === 'quiz';

  return (
    <div className={`flex items-center gap-4 border-l-2 ${accentBorder} px-5 py-3.5 transition-colors hover:bg-slate-800/20`}>
      <div className="min-w-0 flex-1">
        {a.unit && (
          <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-600">{a.unit}</p>
        )}
        <p className="font-medium text-slate-100 truncate">{a.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {isQuiz && (
            <span className={`flex items-center gap-1 text-[10px] font-semibold ${a.isOpen ? 'text-emerald-400' : 'text-slate-600'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${a.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}/>
              {a.isOpen ? 'เปิดสอบอยู่' : 'ปิดอยู่'}
            </span>
          )}
          {status && dueStr && (
            <span className={`flex items-center gap-1 text-[10px] ${status.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`}/>
              ส่ง {dueStr} · {status.label}
            </span>
          )}
          <div className="flex flex-wrap gap-1">
            {a.classIds.slice(0,4).map(c => (
              <span key={c} className="rounded-full border border-slate-700/60 bg-slate-800/60 px-1.5 py-0.5 text-[9px] text-slate-400">{c}</span>
            ))}
            {a.classIds.length > 4 && <span className="text-[9px] text-slate-600">+{a.classIds.length-4}</span>}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {isQuiz && (
          <button onClick={() => onToggleQuiz(a.id)} disabled={toggling}
            className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold transition-all disabled:opacity-50 ${
              a.isOpen
                ? 'border-red-900/60 bg-red-950/30 text-red-400 hover:border-red-800'
                : 'border-emerald-900/60 bg-emerald-950/30 text-emerald-400 hover:border-emerald-800'
            }`}>
            {toggling ? '…' : a.isOpen ? '⏸ ปิด' : '▶ เปิด'}
          </button>
        )}
        {a.driveWebViewLink && (
          <a href={a.driveWebViewLink} target="_blank" rel="noopener noreferrer"
            className="rounded-lg border border-slate-800 px-2.5 py-1 text-[10px] text-slate-500 hover:border-slate-700 hover:text-slate-300 transition-all">
            Drive
          </a>
        )}
        <Link href={`/teacher/assignments/${a.id}/edit`}
          className="rounded-lg border border-slate-800 px-2.5 py-1 text-[10px] text-slate-500 hover:border-slate-700 hover:text-slate-300 transition-all">
          แก้ไข
        </Link>
        <Link href={`/teacher/assignments/${a.id}/submissions`}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-700 transition-all">
          ตรวจงาน
        </Link>
        <button onClick={() => onDelete(a.id)} disabled={deleting}
          className="rounded-lg border border-slate-800 px-2 py-1 text-[10px] text-red-700 transition-all hover:border-red-900 hover:text-red-500 disabled:opacity-40">
          {deleting ? '…' : '✕'}
        </button>
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
