'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface StudentStat {
  studentId: string;
  studentName: string;
  classId: string;
  submittedCount: number;
  totalAssignments: number;
  avgScore: number | null;
  tabSwitchTotal: number;
  scores: number[];
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-800">
      <div
        className={`h-1.5 rounded-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function MiniChart({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const max = 100;
  const w = 60;
  const h = 24;
  const pts = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * w;
    const y = h - (s / max) * h;
    return `${x},${y}`;
  }).join(' ');
  const last = scores[scores.length - 1];
  const prev = scores[scores.length - 2];
  const trend = last > prev ? '↑' : last < prev ? '↓' : '→';
  const trendColor = last > prev ? 'text-emerald-400' : last < prev ? 'text-red-400' : 'text-slate-500';

  return (
    <span className="flex items-center gap-1">
      <svg width={w} height={h} className="opacity-60">
        <polyline points={pts} fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-xs ${trendColor}`}>{trend}</span>
    </span>
  );
}

export default function TeacherStudentsPage() {
  const { profile, loading } = useAuth();
  const [students, setStudents] = useState<StudentStat[]>([]);
  const [fetching, setFetching] = useState(true);
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);
  const [classFilter, setClassFilter] = useState('');
  const [parentLinkState, setParentLinkState] = useState<{ studentId: string; url: string } | null>(null);
  const [generatingLink, setGeneratingLink] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    const saved = localStorage.getItem('lms_subject');
    const sub = saved ? JSON.parse(saved) : null;
    setSubject(sub);
    const url = sub ? `/api/teacher/students?subject=${sub.id}` : '/api/teacher/students';
    fetch(url)
      .then((r) => r.json())
      .then((data) => setStudents(Array.isArray(data) ? data : []))
      .finally(() => setFetching(false));
  }, [profile]);

  async function generateParentLink(studentId: string) {
    setGeneratingLink(studentId);
    try {
      const res = await fetch('/api/teacher/parent-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      const { token } = await res.json();
      const url = `${window.location.origin}/parent/${token}`;
      setParentLinkState({ studentId, url });
    } catch { /* ignore */ }
    finally { setGeneratingLink(null); }
  }

  if (loading || !profile) return <Spinner />;

  const classes = Array.from(new Set(students.map((s) => s.classId))).sort();
  const filtered = classFilter ? students.filter((s) => s.classId === classFilter) : students;

  const totalStudents = filtered.length;
  const avgAll = filtered.length > 0 && filtered.some((s) => s.avgScore !== null)
    ? Math.round(filtered.filter((s) => s.avgScore !== null).reduce((a, s) => a + s.avgScore!, 0) / filtered.filter((s) => s.avgScore !== null).length)
    : null;
  const atRisk = filtered.filter((s) => s.avgScore !== null && s.avgScore < 50).length;

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/teacher" className="text-xs text-slate-500 hover:text-slate-300">←</Link>
            <div>
              <h1 className="text-base font-semibold text-slate-100">ความก้าวหน้านักเรียน</h1>
              {subject && <p className="text-xs text-slate-500">{subject.name}</p>}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {fetching ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 py-20 text-center">
            <p className="text-slate-400">ยังไม่มีข้อมูลนักเรียน</p>
            <p className="mt-1 text-sm text-slate-500">นักเรียนต้องส่งงานอย่างน้อย 1 ชิ้นเพื่อแสดงที่นี่</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-center">
                <p className="text-2xl font-bold text-slate-100">{totalStudents}</p>
                <p className="mt-1 text-xs text-slate-500">นักเรียนที่ส่งงาน</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-center">
                <p className={`text-2xl font-bold ${avgAll !== null ? scoreColor(avgAll) : 'text-slate-500'}`}>
                  {avgAll !== null ? avgAll : '—'}
                </p>
                <p className="mt-1 text-xs text-slate-500">คะแนนเฉลี่ยรวม</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-center">
                <p className={`text-2xl font-bold ${atRisk > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{atRisk}</p>
                <p className="mt-1 text-xs text-slate-500">นักเรียนที่ต้องดูแล (&lt;50)</p>
              </div>
            </div>

            {/* Class filter */}
            {classes.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setClassFilter('')}
                  className={`rounded-xl border px-3 py-1.5 text-xs transition-all ${
                    !classFilter ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  ทั้งหมด
                </button>
                {classes.map((c) => (
                  <button
                    key={c}
                    onClick={() => setClassFilter(c)}
                    className={`rounded-xl border px-3 py-1.5 text-xs transition-all ${
                      classFilter === c ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {/* Student list */}
            <div className="rounded-2xl border border-slate-800 overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_72px_88px_72px_84px_76px] items-center gap-3 border-b border-slate-800 bg-slate-900 px-5 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                <span>นักเรียน</span>
                <span className="text-right">ส่งงาน</span>
                <span className="text-right">เฉลี่ย</span>
                <span className="text-right hidden sm:block">แนวโน้ม</span>
                <span className="text-right hidden sm:block">เปลี่ยนแท็บ</span>
                <span className="text-right hidden sm:block">ผู้ปกครอง</span>
              </div>
              {filtered.map((s) => (
                <div
                  key={s.studentId}
                  className="grid grid-cols-[minmax(0,1fr)_72px_88px_72px_84px_76px] items-center gap-3 border-b border-slate-800 bg-slate-950 px-5 py-3.5 last:border-0 hover:bg-slate-900 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{s.studentName}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-slate-600">{s.classId}</span>
                      <ProgressBar value={s.submittedCount} total={s.totalAssignments} />
                    </div>
                  </div>
                  <span className="text-right text-sm text-slate-400">
                    {s.submittedCount}/{s.totalAssignments}
                  </span>
                  <span className={`text-right text-sm font-semibold ${s.avgScore !== null ? scoreColor(s.avgScore) : 'text-slate-600'}`}>
                    {s.avgScore !== null ? s.avgScore : '—'}
                  </span>
                  <span className="hidden sm:block text-right">
                    <MiniChart scores={s.scores} />
                  </span>
                  <span className={`hidden sm:block text-right text-xs ${s.tabSwitchTotal > 5 ? 'text-orange-400' : 'text-slate-600'}`}>
                    {s.tabSwitchTotal > 0 ? `🔍 ${s.tabSwitchTotal}` : '—'}
                  </span>
                  <span className="hidden sm:block text-right">
                    <button
                      onClick={() => generateParentLink(s.studentId)}
                      disabled={generatingLink === s.studentId}
                      className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] text-slate-500 hover:border-slate-500 hover:text-slate-300 disabled:opacity-40 transition-all"
                      title="สร้างลิงก์สำหรับผู้ปกครอง"
                    >
                      {generatingLink === s.studentId ? '…' : '🔗 ลิงก์'}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Parent link modal */}
      {parentLinkState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-slate-100">🔗 ลิงก์รายงานผู้ปกครอง</h3>
              <button onClick={() => setParentLinkState(null)} className="text-slate-500 hover:text-slate-200">✕</button>
            </div>
            <p className="mb-3 text-xs text-slate-400">ลิงก์นี้ใช้ได้ 30 วัน ผู้ปกครองสามารถเปิดดูได้โดยไม่ต้อง login</p>
            <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2">
              <p className="flex-1 truncate text-xs text-slate-300">{parentLinkState.url}</p>
              <button
                onClick={() => navigator.clipboard.writeText(parentLinkState.url)}
                className="shrink-0 rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
              >
                คัดลอก
              </button>
            </div>
            <button
              onClick={() => setParentLinkState(null)}
              className="mt-4 w-full rounded-xl bg-slate-800 py-2 text-xs text-slate-400 hover:bg-slate-700"
            >
              ปิด
            </button>
          </div>
        </div>
      )}
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
