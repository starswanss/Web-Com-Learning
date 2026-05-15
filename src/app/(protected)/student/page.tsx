'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Image from 'next/image';
import Link from 'next/link';
import { CONTENT_TYPE_LABELS, type ContentType } from '@/types';

/* ───────── Types ───────── */
interface AssignmentWithSubmission {
  id: string;
  title: string;
  description: string;
  dueDate?: { _seconds: number };
  driveWebViewLink?: string;
  contentType?: ContentType;
  unit?: string;
  isOpen?: boolean;
  submission: null | {
    status: 'submitted' | 'graded' | 'reviewed';
    score?: number;
    feedback?: string;
  };
}

/* ───────── Helpers ───────── */
function dueDateColor(s: number) {
  const diff = s*1000 - Date.now(); const d = diff/86400000;
  if (diff < 0) return 'bg-red-600';
  if (d < 1)   return 'bg-red-500';
  if (d < 3)   return 'bg-orange-500';
  if (d < 7)   return 'bg-amber-400';
  return 'bg-emerald-500';
}
function dueDateStatus(s?: number) {
  if (!s) return null;
  const diff = s*1000 - Date.now(); const d = diff/86400000;
  if (diff < 0) return { dot:'bg-red-600',    text:'text-red-500',    label:'เกินกำหนด' };
  if (d < 1)    return { dot:'bg-red-500',    text:'text-red-400',    label:'วันนี้!' };
  if (d < 3)    return { dot:'bg-orange-500', text:'text-orange-400', label:`${Math.ceil(d)} วัน` };
  if (d < 7)    return { dot:'bg-amber-400',  text:'text-amber-400',  label:`${Math.ceil(d)} วัน` };
  return          { dot:'bg-emerald-500', text:'text-emerald-400', label:`${Math.ceil(d)} วัน` };
}
function formatDateShort(s?: number) {
  if (!s) return '—';
  return new Date(s*1000).toLocaleDateString('th-TH',{ day:'numeric', month:'short' });
}
function scoreColor(n: number) {
  if (n >= 80) return 'text-emerald-400 border-emerald-800/60 bg-emerald-950/40';
  if (n >= 60) return 'text-amber-400 border-amber-800/60 bg-amber-950/40';
  if (n >= 40) return 'text-orange-400 border-orange-800/60 bg-orange-950/40';
  return 'text-red-400 border-red-800/60 bg-red-950/40';
}

const MONTH_NAMES_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const DAY_NAMES_TH   = ['อา','จ','อ','พ','พฤ','ศ','ส'];

/* ═══════════════════════════ MAIN PAGE ═══════════════════════════ */
export default function StudentPage() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();

  const [assignments, setAssignments] = useState<AssignmentWithSubmission[]>([]);
  const [fetching, setFetching] = useState(true);
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);
  const [calYear, setCalYear]   = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && profile?.role !== 'student') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'student') return;
    const saved = localStorage.getItem('lms_subject');
    const sub = saved ? JSON.parse(saved) : null;
    setSubject(sub);
    const qs = new URLSearchParams();
    if (sub) qs.set('subject', sub.id);
    if (profile.classId) qs.set('classId', profile.classId);
    fetch(`/api/assignments/student?${qs}`)
      .then(r => r.json())
      .then(d => setAssignments(Array.isArray(d) ? d : []))
      .finally(() => setFetching(false));
  }, [profile]);

  if (loading || !profile) return <Spinner />;

  /* ── Derived ── */
  const pending   = assignments.filter(a => !a.submission);
  const submitted = assignments.filter(a => a.submission?.status === 'submitted');
  const graded    = assignments.filter(a => a.submission && ['graded','reviewed'].includes(a.submission.status));
  const scores    = graded.map(a => a.submission!.score).filter((s): s is number => typeof s === 'number');
  const avgScore  = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;

  /* ── Calendar ── */
  const today = new Date();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const calCells: (number|null)[] = [];
  for (let i = 0; i < firstDay; i++) calCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calCells.push(d);

  const dayMap = new Map<number, AssignmentWithSubmission[]>();
  assignments.forEach(a => {
    if (!a.dueDate) return;
    const d = new Date(a.dueDate._seconds*1000);
    if (d.getFullYear()===calYear && d.getMonth()===calMonth) {
      const day = d.getDate();
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(a);
    }
  });
  const selectedAssignments = selectedDay !== null ? (dayMap.get(selectedDay) ?? []) : [];

  /* ── Upcoming ── */
  const upcoming = pending
    .filter(a => a.dueDate)
    .sort((a,b) => a.dueDate!._seconds - b.dueDate!._seconds)
    .slice(0, 6);

  /* ── Unit groups ── */
  const unitGroups = new Map<string, AssignmentWithSubmission[]>();
  pending.forEach(a => {
    const key = a.unit ?? '';
    if (!unitGroups.has(key)) unitGroups.set(key, []);
    unitGroups.get(key)!.push(a);
  });

  /* ── Score bar color ── */
  const scoreBarColor = avgScore === null ? 'bg-slate-700'
    : avgScore >= 80 ? 'bg-emerald-500'
    : avgScore >= 60 ? 'bg-amber-500'
    : 'bg-red-500';

  return (
    <div className="min-h-screen bg-slate-950">

      {/* ══ HEADER ══ */}
      <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-6 py-3">

          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={() => { localStorage.removeItem('lms_subject'); router.push('/select-subject'); }}
              className="shrink-0 rounded-lg border border-slate-800 p-1.5 text-slate-500 transition-all hover:border-slate-700 hover:text-slate-300"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600">
                {subject?.name ?? 'Computing Science & IT'} · ห้อง {profile.classId}
              </p>
              <h1 className="truncate text-sm font-bold text-slate-100">{user?.displayName}</h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Link href="/student/leaderboard"
              className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-all hover:bg-slate-800/70 hover:text-slate-200">
              🏆 อันดับ
            </Link>
            <Link href="/student/profile"
              className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-all hover:bg-slate-800/70 hover:text-slate-200">
              Portfolio
            </Link>
            {user?.photoURL && <Image src={user.photoURL} alt="" width={30} height={30} className="rounded-full ring-2 ring-slate-700/60" />}
            <button onClick={signOut}
              className="rounded-lg border border-slate-800 px-3 py-1.5 text-[11px] text-slate-500 transition-all hover:border-slate-700 hover:text-slate-300">
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-6 space-y-5">
        {fetching ? (
          <div className="flex items-center justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-400" /></div>
        ) : (
          <>
            {/* ══ STAT CARDS ══ */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label:'รอส่ง',     value:pending.length,   color:'text-blue-300',    line:'bg-blue-500',    glow:'from-blue-500/8' },
                { label:'รอตรวจ',    value:submitted.length, color:'text-amber-300',   line:'bg-amber-400',   glow:'from-amber-400/8' },
                { label:'ตรวจแล้ว', value:graded.length,    color:'text-emerald-300', line:'bg-emerald-500', glow:'from-emerald-500/8' },
                {
                  label:'คะแนนเฉลี่ย',
                  value: avgScore !== null ? avgScore : '—',
                  color: avgScore===null ? 'text-slate-600' : avgScore>=80 ? 'text-emerald-300' : avgScore>=60 ? 'text-amber-300' : 'text-red-300',
                  line: avgScore===null ? 'bg-slate-700' : avgScore>=80 ? 'bg-emerald-500' : avgScore>=60 ? 'bg-amber-400' : 'bg-red-500',
                  glow: 'from-slate-700/5',
                },
              ].map(s => (
                <div key={s.label} className={`relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-b ${s.glow} to-slate-900 p-4`}>
                  <div className={`absolute inset-x-0 top-0 h-[2px] ${s.line}`} />
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{s.label}</p>
                  <p className={`mt-1.5 text-3xl font-black leading-none ${s.color}`}>{s.value}
                    {typeof s.value === 'number' && s.label==='คะแนนเฉลี่ย' && <span className="text-sm font-normal text-slate-600">/100</span>}
                  </p>
                  {/* mini score bar for avg */}
                  {s.label==='คะแนนเฉลี่ย' && avgScore !== null && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
                      <div className={`h-full rounded-full ${scoreBarColor}`} style={{width:`${avgScore}%`}} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ══ MAIN CONTENT ══ */}
            <div className="grid gap-5 xl:grid-cols-[1fr_280px]">

              {/* ── LEFT: Assignment Sections ── */}
              <div className="space-y-4 min-w-0">

                {/* Pending */}
                <section className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900">
                  <div className="flex items-center gap-3 border-b border-slate-800/80 bg-blue-500/5 px-5 py-3.5">
                    <div className="h-4 w-0.5 rounded-full bg-blue-500" />
                    <h2 className="text-[11px] font-bold uppercase tracking-widest text-blue-400">งานที่ต้องทำ</h2>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">{pending.length}</span>
                  </div>

                  {pending.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1 py-10">
                      <span className="text-2xl">🎉</span>
                      <p className="text-xs text-slate-700">ไม่มีงานค้าง</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/50">
                      {Array.from(unitGroups.entries()).map(([unit, items]) => (
                        <div key={unit}>
                          {unit && (
                            <div className="bg-slate-950/40 px-5 py-2">
                              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{unit}</p>
                            </div>
                          )}
                          {items.map(a => <AssignmentRow key={a.id} assignment={a} />)}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Submitted */}
                {submitted.length > 0 && (
                  <section className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900">
                    <div className="flex items-center gap-3 border-b border-slate-800/80 bg-amber-500/5 px-5 py-3.5">
                      <div className="h-4 w-0.5 rounded-full bg-amber-400" />
                      <h2 className="text-[11px] font-bold uppercase tracking-widest text-amber-400">รอตรวจ</h2>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">{submitted.length}</span>
                    </div>
                    <div className="divide-y divide-slate-800/50">
                      {submitted.map(a => <AssignmentRow key={a.id} assignment={a} />)}
                    </div>
                  </section>
                )}

                {/* Graded */}
                {graded.length > 0 && (
                  <section className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900">
                    <div className="flex items-center gap-3 border-b border-slate-800/80 bg-emerald-500/5 px-5 py-3.5">
                      <div className="h-4 w-0.5 rounded-full bg-emerald-500" />
                      <h2 className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">ตรวจแล้ว</h2>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">{graded.length}</span>
                    </div>
                    <div className="divide-y divide-slate-800/50">
                      {graded.map(a => <AssignmentRow key={a.id} assignment={a} />)}
                    </div>
                  </section>
                )}

              </div>

              {/* ── RIGHT: Sidebar ── */}
              <div className="space-y-4">

                {/* Upcoming */}
                <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900">
                  <div className="border-b border-slate-800/80 px-5 py-3.5">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">กำหนดส่งถัดไป</p>
                    <h2 className="mt-0.5 text-xs font-semibold text-slate-300">⏰ งานใกล้ครบกำหนด</h2>
                  </div>

                  {upcoming.length === 0 ? (
                    <div className="flex flex-col items-center gap-1 py-8">
                      <span className="text-xl">✅</span>
                      <p className="text-[10px] text-slate-700">ไม่มีงานที่ต้องส่ง</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/40">
                      {upcoming.map(a => {
                        const status = dueDateStatus(a.dueDate?._seconds);
                        const m = a.contentType ? CONTENT_TYPE_LABELS[a.contentType] : null;
                        return (
                          <Link key={a.id} href={`/student/assignments/${a.id}`}
                            className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-800/30">
                            {m && <span className="shrink-0 text-sm">{m.icon}</span>}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-medium text-slate-200">{a.title}</p>
                              {status && (
                                <span className={`flex items-center gap-1 text-[9px] ${status.text}`}>
                                  <span className={`h-1 w-1 rounded-full ${status.dot}`}/>
                                  {formatDateShort(a.dueDate?._seconds)} · {status.label}
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Calendar */}
                <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5">
                    <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">ปฏิทิน</h2>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1); setSelectedDay(null); }}
                        className="rounded border border-slate-800 px-2 py-0.5 text-[10px] text-slate-500 hover:text-slate-300 transition-all">←</button>
                      <span className="min-w-[90px] text-center text-[10px] font-medium text-slate-400">{MONTH_NAMES_TH[calMonth]} {calYear+543}</span>
                      <button onClick={() => { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1); setSelectedDay(null); }}
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
                        const dayItems = dayMap.get(day) ?? [];
                        const isSel = selectedDay === day;
                        return (
                          <button key={day} onClick={() => setSelectedDay(isSel ? null : day)}
                            className={`flex flex-col items-center rounded-lg py-1.5 transition-all ${
                              isSel    ? 'bg-blue-600 text-white'
                              : isToday ? 'bg-slate-800 text-blue-400'
                              : 'text-slate-500 hover:bg-slate-800/60'
                            }`}>
                            <span className="text-[11px] font-semibold leading-none">{day}</span>
                            {dayItems.length > 0 && (
                              <div className="mt-0.5 flex gap-0.5">
                                {dayItems.slice(0,3).map(a => (
                                  <span key={a.id} className={`h-1 w-1 rounded-full ${
                                    isSel ? 'bg-white/60' : a.submission ? 'bg-slate-600' : dueDateColor(a.dueDate!._seconds)
                                  }`}/>
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
                          <p className="text-[10px] text-slate-700">ไม่มีงานวันนี้</p>
                        ) : (
                          <div className="space-y-1.5">
                            {selectedAssignments.map(a => {
                              const m = a.contentType ? CONTENT_TYPE_LABELS[a.contentType] : null;
                              return (
                                <Link key={a.id} href={`/student/assignments/${a.id}`}
                                  className="flex items-center gap-2 rounded-lg border border-slate-800 px-2.5 py-1.5 hover:border-slate-700 transition-all">
                                  {m && <span className="text-xs">{m.icon}</span>}
                                  <span className="flex-1 truncate text-[10px] text-slate-300">{a.title}</span>
                                  {a.submission
                                    ? <span className="shrink-0 rounded-full border border-emerald-800/40 px-1.5 py-0.5 text-[9px] text-emerald-500">✓</span>
                                    : <span className="shrink-0 rounded-full border border-blue-800/40 px-1.5 py-0.5 text-[9px] text-blue-400">ส่ง</span>
                                  }
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                      {[['bg-red-600','เกิน'],['bg-orange-500','<3วัน'],['bg-amber-400','<7วัน'],['bg-emerald-500','ปกติ'],['bg-slate-600','ส่งแล้ว']].map(([c,l]) => (
                        <span key={l} className="flex items-center gap-1 text-[9px] text-slate-700">
                          <span className={`h-1.5 w-1.5 rounded-full ${c}`}/>{l}
                        </span>
                      ))}
                    </div>
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

function AssignmentRow({ assignment: a }: { assignment: AssignmentWithSubmission }) {
  const dueStatus = dueDateStatus(a.dueDate?._seconds);
  const m = a.contentType ? CONTENT_TYPE_LABELS[a.contentType] : null;
  const hasScore = a.submission && typeof a.submission.score === 'number';
  const isQuiz = a.contentType === 'quiz';

  const accentBorder = a.contentType === 'knowledge' ? 'border-l-emerald-500'
    : a.contentType === 'quiz' ? 'border-l-purple-500'
    : 'border-l-blue-500';

  return (
    <Link href={`/student/assignments/${a.id}`}
      className={`flex items-center gap-4 border-l-2 ${accentBorder} px-5 py-3.5 transition-colors hover:bg-slate-800/20`}>
      <div className="min-w-0 flex-1">
        {m && (
          <span className={`mb-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${m.color}`}>
            {m.icon} {m.label}
          </span>
        )}
        <p className="font-medium text-slate-100 truncate">{a.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {!a.submission && isQuiz && !a.isOpen && (
            <span className="text-[9px] text-slate-600">🔒 ยังไม่เปิดสอบ</span>
          )}
          {!a.submission && dueStatus && (
            <span className={`flex items-center gap-1 text-[9px] ${dueStatus.text}`}>
              <span className={`h-1 w-1 rounded-full ${dueStatus.dot}`}/>
              ส่ง {formatDateShort(a.dueDate?._seconds)} · เหลือ {dueStatus.label}
            </span>
          )}
          {a.submission && (
            <span className="text-[9px] text-slate-600">ส่งแล้ว · {formatDateShort(a.dueDate?._seconds)}</span>
          )}
          {a.submission?.feedback && (
            <p className="mt-0.5 line-clamp-1 text-[9px] italic text-slate-600">{a.submission.feedback}</p>
          )}
        </div>
      </div>

      <div className="shrink-0">
        {hasScore && (
          <span className={`rounded-xl border px-3 py-1.5 text-sm font-black ${scoreColor(a.submission!.score!)}`}>
            {a.submission!.score}
          </span>
        )}
        {!a.submission && (
          <span className="rounded-xl border border-blue-800/60 bg-blue-950/30 px-3 py-1.5 text-[10px] font-semibold text-blue-400">
            ส่งงาน →
          </span>
        )}
        {a.submission && !hasScore && (
          <span className="rounded-xl border border-amber-800/60 bg-amber-950/30 px-3 py-1.5 text-[10px] font-semibold text-amber-400">
            รอตรวจ
          </span>
        )}
      </div>
    </Link>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-800 border-t-slate-400" />
    </div>
  );
}
