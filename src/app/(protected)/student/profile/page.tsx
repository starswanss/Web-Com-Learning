'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface AssignmentEntry {
  id: string;
  title: string;
  dueDate?: { _seconds: number };
  submission: null | {
    status: string;
    score?: number;
    feedback?: string;
    submittedAt?: { _seconds: number };
  };
}

interface Stats {
  total: number;
  submitted: number;
  graded: number;
  avgScore: number | null;
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400 border-emerald-700 bg-emerald-950/40';
  if (score >= 60) return 'text-amber-400 border-amber-700 bg-amber-950/40';
  if (score >= 40) return 'text-orange-400 border-orange-700 bg-orange-950/40';
  return 'text-red-400 border-red-700 bg-red-950/40';
}

function statusIcon(status: string) {
  if (status === 'reviewed') return '✅';
  if (status === 'graded')   return '🤖';
  if (status === 'submitted') return '⏳';
  return '❌';
}

function statusLabel(status: string) {
  if (status === 'reviewed')  return 'ครูตรวจแล้ว';
  if (status === 'graded')    return 'AI ตรวจแล้ว';
  if (status === 'submitted') return 'รอตรวจ';
  return 'ยังไม่ส่ง';
}

export default function StudentProfilePage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<Stats | null>(null);
  const [assignments, setAssignments] = useState<AssignmentEntry[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && profile?.role !== 'student') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'student') return;
    fetch('/api/student/stats')
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats ?? null);
        setAssignments(Array.isArray(data.assignments) ? data.assignments : []);
      })
      .finally(() => setFetching(false));
  }, [profile]);

  if (loading || !profile) return <Spinner />;

  const submissionRate = stats ? Math.round((stats.submitted / (stats.total || 1)) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/student" className="text-sm text-slate-400 hover:text-slate-200">← กลับ</Link>
          <h1 className="text-lg font-semibold text-slate-100">Portfolio ของฉัน</h1>
        </div>

        {/* Student card */}
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-lg font-semibold text-slate-100">{profile.displayName}</p>
          <p className="mt-0.5 text-sm text-slate-400">ห้อง {profile.classId} — Computing Science & IT ม.3</p>
        </div>

        {/* Stats */}
        {fetching ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="ใบงานทั้งหมด" value={stats?.total ?? 0} unit="ใบ" />
              <StatCard label="ส่งแล้ว" value={stats?.submitted ?? 0} unit={`ใบ (${submissionRate}%)`} />
              <StatCard label="ตรวจแล้ว" value={stats?.graded ?? 0} unit="ใบ" />
              <StatCard
                label="คะแนนเฉลี่ย"
                value={stats?.avgScore ?? '—'}
                unit={stats?.avgScore !== null ? '/100' : ''}
                highlight={stats?.avgScore !== null}
                score={stats?.avgScore ?? undefined}
              />
            </div>

            {/* Score bar */}
            {stats?.avgScore !== null && stats?.avgScore !== undefined && (
              <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-slate-400">ความคืบหน้าคะแนนเฉลี่ย</span>
                  <span className="font-semibold text-slate-200">{stats.avgScore}/100</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      stats.avgScore >= 80 ? 'bg-emerald-500' :
                      stats.avgScore >= 60 ? 'bg-amber-500' :
                      stats.avgScore >= 40 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${stats.avgScore}%` }}
                  />
                </div>
              </div>
            )}

            {/* Assignment history */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">ประวัติใบงาน</h2>
              {assignments.length === 0 ? (
                <p className="text-sm text-slate-500">ยังไม่มีใบงาน</p>
              ) : (
                assignments.map((a) => {
                  const sub = a.submission;
                  const hasScore = sub && typeof sub.score === 'number';
                  return (
                    <Link
                      key={a.id}
                      href={`/student/assignments/${a.id}`}
                      className="block rounded-2xl border border-slate-800 bg-slate-900 p-4 transition-all hover:border-slate-700"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium text-slate-200">{a.title}</p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                            <span>{sub ? statusIcon(sub.status) : '❌'}</span>
                            <span>{sub ? statusLabel(sub.status) : 'ยังไม่ส่ง'}</span>
                            {sub?.submittedAt && (
                              <>
                                <span>·</span>
                                <span>
                                  ส่ง {new Date(sub.submittedAt._seconds * 1000).toLocaleDateString('th-TH', {
                                    day: 'numeric', month: 'short',
                                  })}
                                </span>
                              </>
                            )}
                          </div>
                          {sub?.feedback && (
                            <p className="mt-1.5 line-clamp-1 text-xs text-slate-500 italic">{sub.feedback}</p>
                          )}
                        </div>
                        {hasScore && (
                          <span className={`shrink-0 rounded-xl border px-3 py-1.5 text-sm font-bold ${scoreColor(sub!.score!)}`}>
                            {sub!.score}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label, value, unit, highlight, score,
}: {
  label: string; value: number | string; unit: string; highlight?: boolean; score?: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${highlight && score !== undefined ? (score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400') : 'text-slate-100'}`}>
        {value}
      </p>
      {unit && <p className="mt-0.5 text-xs text-slate-600">{unit}</p>}
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
