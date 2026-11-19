'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import TermSelect from '@/components/TermSelect';

interface NotSubmittedStudent {
  uid: string;
  name: string;
  classId: string;
}

interface AssignmentStat {
  assignmentId: string;
  title: string;
  totalStudents: number;
  submitted: number;
  notSubmitted: number;
  notSubmittedNames: NotSubmittedStudent[];
  /** Earlier term: only the submitted count is known (no roster for then). */
  pastTerm?: boolean;
}

interface Subject {
  id: string;
  name: string;
}

export default function SubmissionStatsPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [term, setTerm] = useState<string | undefined>(undefined);
  const [stats, setStats] = useState<AssignmentStat[]>([]);
  const [fetching, setFetching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('');

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    const saved = localStorage.getItem('lms_subject');
    if (saved) {
      try {
        const sub = JSON.parse(saved);
        if (sub?.id) setSelectedSubject(sub.id);
      } catch { /* ignore */ }
    }
    fetch('/api/teacher/subjects')
      .then(r => r.json())
      .then((d: Subject[]) => setSubjects(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [profile]);

  const loadStats = useCallback(async () => {
    setFetching(true);
    try {
      const sp = new URLSearchParams();
      if (selectedSubject) sp.set('subject', selectedSubject);
      if (term) sp.set('term', term);
      const qs = sp.toString();
      const res = await fetch(`/api/teacher/submission-stats${qs ? `?${qs}` : ''}`);
      const data = await res.json();
      setStats(Array.isArray(data) ? data : []);
    } catch {
      setStats([]);
    } finally {
      setFetching(false);
    }
  }, [selectedSubject, term]);

  useEffect(() => {
    if (profile?.role === 'teacher' && term !== undefined) loadStats();
  }, [profile, term, loadStats]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
      </div>
    );
  }

  // All distinct classIds from notSubmitted lists across all stats
  const allClassIds = Array.from(
    new Set(stats.flatMap(s => s.notSubmittedNames.map(n => n.classId)))
  ).sort();

  const filtered = stats.filter(s =>
    (!search.trim() || s.title.toLowerCase().includes(search.toLowerCase()))
  );

  const totalAssignments = filtered.length;
  const fullySubmitted = filtered.filter(s => s.totalStudents > 0 && s.submitted >= s.totalStudents).length;
  const noneSubmitted = filtered.filter(s => s.submitted === 0).length;
  const totalMissing = filtered.reduce((acc, s) => acc + s.notSubmitted, 0);

  function badgeColor(stat: AssignmentStat) {
    if (stat.pastTerm || stat.totalStudents === 0) return 'bg-slate-800 text-slate-400';
    const ratio = stat.submitted / stat.totalStudents;
    if (ratio >= 1) return 'bg-emerald-900/50 text-emerald-400 border border-emerald-800/50';
    if (ratio >= 0.5) return 'bg-amber-900/50 text-amber-400 border border-amber-800/50';
    return 'bg-red-900/50 text-red-400 border border-red-800/50';
  }

  function barColor(stat: AssignmentStat) {
    if (stat.totalStudents === 0) return 'bg-slate-700';
    const ratio = stat.submitted / stat.totalStudents;
    if (ratio >= 1) return 'bg-emerald-500';
    if (ratio >= 0.5) return 'bg-amber-500';
    return 'bg-red-500';
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="mx-auto max-w-3xl">

        {/* Header */}
        <Link href="/teacher" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
          ← กลับ
        </Link>

        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-xl font-bold text-slate-100">📊 สถานะการส่งงาน</h1>
          <p className="text-sm text-slate-400">ติดตามว่านักเรียนส่งใบงาน / แบบทดสอบแต่ละชิ้นครบแล้วหรือยัง</p>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <select
            value={selectedSubject}
            onChange={e => setSelectedSubject(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="">ทุกวิชา</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <TermSelect value={term} onChange={setTerm} className="rounded-xl border border-blue-800 bg-blue-950/30 px-3 py-2 text-sm text-blue-200" />

          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="">ทุกห้อง</option>
            {allClassIds.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="ค้นหาชื่องาน…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-40 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
          />

          <button
            onClick={loadStats}
            disabled={fetching}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 transition-all hover:bg-slate-700 disabled:opacity-50"
          >
            {fetching ? '⏳ โหลด…' : '🔄 รีเฟรช'}
          </button>
        </div>

        {/* Summary cards */}
        {!fetching && filtered.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="ใบงานทั้งหมด" value={totalAssignments} color="text-slate-200" />
            <SummaryCard label="ส่งครบแล้ว" value={fullySubmitted} color="text-emerald-400" />
            <SummaryCard label="ยังไม่มีส่ง" value={noneSubmitted} color="text-red-400" />
            <SummaryCard label="ยอดค้างทั้งหมด" value={totalMissing} color="text-amber-400" suffix="คน" />
          </div>
        )}

        {/* Content */}
        {fetching ? (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 py-16 text-center text-slate-500">
            {search ? 'ไม่พบใบงานที่ตรงกับคำค้นหา' : 'ยังไม่มีใบงานในระบบ'}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(stat => {
              const pct = stat.totalStudents > 0
                ? Math.round((stat.submitted / stat.totalStudents) * 100)
                : 0;
              const isExpanded = expandedId === stat.assignmentId;

              return (
                <div key={stat.assignmentId} className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
                  {/* Main row */}
                  <div className="flex items-center gap-3 px-4 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">{stat.title}</p>

                      {/* Progress bar */}
                      {stat.pastTerm ? (
                        <p className="mt-1 text-[11px] text-slate-500">เทอมที่เลือกเป็นเทอมก่อน — แสดงเฉพาะจำนวนที่ส่ง</p>
                      ) : (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${barColor(stat)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-500">{pct}%</span>
                      </div>
                      )}
                    </div>

                    {/* Badge */}
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : stat.assignmentId)}
                      className={`shrink-0 cursor-pointer rounded-xl px-3 py-1.5 text-center transition-all active:scale-95 ${badgeColor(stat)}`}
                    >
                      <p className="text-xs font-bold leading-none">
                        {stat.pastTerm ? stat.submitted : `${stat.submitted}/${stat.totalStudents}`}
                      </p>
                      <p className="mt-0.5 text-[9px] leading-none opacity-75">
                        {stat.pastTerm ? 'ส่งแล้ว' : stat.notSubmitted > 0 ? `ค้าง ${stat.notSubmitted}` : 'ครบแล้ว'}
                      </p>
                    </div>
                  </div>

                  {/* Expandable: missing students grouped by class */}
                  {isExpanded && stat.notSubmittedNames.length > 0 && (() => {
                    const displayList = classFilter
                      ? stat.notSubmittedNames.filter(s => s.classId === classFilter)
                      : stat.notSubmittedNames;
                    if (displayList.length === 0) return (
                      <div className="border-t border-slate-800/50 bg-slate-950/50 px-4 py-3">
                        <p className="text-[11px] text-slate-500">ไม่มีนักเรียนค้างในห้อง {classFilter}</p>
                      </div>
                    );
                    const grouped = displayList.reduce<Record<string, NotSubmittedStudent[]>>((acc, s) => {
                      (acc[s.classId] ??= []).push(s);
                      return acc;
                    }, {});
                    return (
                      <div className="border-t border-slate-800/50 bg-slate-950/50 px-4 py-3 space-y-3">
                        {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cid, students]) => (
                          <div key={cid}>
                            <p className="mb-1.5 text-[10px] font-bold text-slate-500">ห้อง {cid} · {students.length} คน</p>
                            <div className="flex flex-wrap gap-1.5">
                              {students.map(s => (
                                <span key={s.uid} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300">
                                  {s.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {isExpanded && stat.notSubmittedNames.length === 0 && (
                    <div className="border-t border-slate-800/50 bg-slate-950/50 px-4 py-3">
                      <p className="text-[11px] text-emerald-400">นักเรียนทุกคนส่งงานครบแล้ว</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, suffix = '' }: {
  label: string;
  value: number;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}{suffix}</p>
      <p className="mt-0.5 text-[10px] text-slate-500">{label}</p>
    </div>
  );
}
