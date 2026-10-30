'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { CONTENT_TYPE_LABELS, type ContentType } from '@/types';

interface AssignmentOverview {
  id: string;
  title: string;
  contentType: ContentType;
  academicYear: number | null;
  term: number | null;
  unit: string | null;
  dueDate: { _seconds: number } | null;
  classIds: string[];
  driveWebViewLink: string | null;
  submittedCount: number;
  gradedCount: number;
  reviewedCount: number;
  totalSubmissions: number;
}

function dueDateStatus(seconds: number): { dot: string; text: string; label: string } {
  const diff = seconds * 1000 - Date.now();
  const days = diff / 86400000;
  if (diff < 0) return { dot: 'bg-red-600', text: 'text-red-500', label: 'เกินกำหนด' };
  if (days < 1) return { dot: 'bg-red-500', text: 'text-red-400', label: 'วันนี้!' };
  if (days < 3) return { dot: 'bg-orange-500', text: 'text-orange-400', label: `${Math.ceil(days)} วัน` };
  if (days < 7) return { dot: 'bg-amber-400', text: 'text-amber-400', label: `${Math.ceil(days)} วัน` };
  return { dot: 'bg-emerald-500', text: 'text-emerald-400', label: `${Math.ceil(days)} วัน` };
}

const TYPE_FILTERS: { key: ContentType | 'all'; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'worksheet', label: '📝 ใบงาน' },
  { key: 'knowledge', label: '📖 ใบความรู้' },
  { key: 'quiz', label: '✏️ แบบทดสอบ' },
];

export default function TeacherOverviewPage() {
  const { profile, loading } = useAuth();
  const [assignments, setAssignments] = useState<AssignmentOverview[]>([]);
  const [fetching, setFetching] = useState(true);
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);
  const [typeFilter, setTypeFilter] = useState<ContentType | 'all'>('all');
  const [pendingOnly, setPendingOnly] = useState(false);
  // Term filter: '' = ทุกเทอม, otherwise "year/term" (e.g. "2568/1")
  const [termFilter, setTermFilter] = useState<string>('');
  const [termReady, setTermReady] = useState(false);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    const saved = localStorage.getItem('lms_subject');
    const sub = saved ? JSON.parse(saved) : null;
    setSubject(sub);
    const url = sub ? `/api/teacher/overview?subject=${sub.id}` : '/api/teacher/overview';
    fetch(url)
      .then((r) => r.json())
      .then((data) => setAssignments(Array.isArray(data) ? data : []))
      .finally(() => setFetching(false));
    // Default the term filter to the active term.
    fetch('/api/teacher/reset-term')
      .then((r) => r.json())
      .then((d) => { if (d?.currentTerm) setTermFilter(`${d.currentTerm.year}/${d.currentTerm.term}`); })
      .catch(() => {})
      .finally(() => setTermReady(true));
  }, [profile]);

  if (loading || !profile) return <Spinner />;

  const termKey = (a: AssignmentOverview) => (a.academicYear && a.term ? `${a.academicYear}/${a.term}` : '');
  // Distinct terms present (newest first) for the dropdown.
  const terms = Array.from(new Set(assignments.map(termKey).filter(Boolean)))
    .sort((x, y) => y.localeCompare(x, undefined, { numeric: true }));
  // Only apply the term filter once we know the terms (avoid hiding everything
  // before the default resolves, and when the selected term isn't present).
  const effectiveTerm = termReady && termFilter && terms.includes(termFilter) ? termFilter : '';

  const byTerm = effectiveTerm ? assignments.filter((a) => termKey(a) === effectiveTerm) : assignments;
  const byType = typeFilter === 'all' ? byTerm : byTerm.filter((a) => a.contentType === typeFilter);
  const filtered = pendingOnly ? byType.filter((a) => a.submittedCount + a.gradedCount > 0) : byType;
  const totalSubmissions = byType.reduce((a, b) => a + b.totalSubmissions, 0);
  const pendingGrade = byType.reduce((a, b) => a + b.submittedCount, 0);
  const reviewed = byType.reduce((a, b) => a + b.reviewedCount, 0);
  const pendingCount = byType.filter((a) => a.submittedCount + a.gradedCount > 0).length;

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/teacher" className="text-xs text-slate-500 hover:text-slate-300">←</Link>
            <div>
              <h1 className="text-base font-semibold text-slate-100">ภาพรวมใบงานทั้งหมด</h1>
              {subject && <p className="text-xs text-slate-500">{subject.name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {terms.length > 0 && (
              <select
                value={effectiveTerm}
                onChange={(e) => setTermFilter(e.target.value)}
                className="rounded-lg border border-blue-800 bg-blue-950/30 px-3 py-1.5 text-xs text-blue-200"
                title="เลือกเทอมที่จะดูงาน"
              >
                <option value="">🗓 ทุกเทอม</option>
                {terms.map((t) => {
                  const [y, n] = t.split('/');
                  return <option key={t} value={t}>ปี {y} เทอม {n}</option>;
                })}
              </select>
            )}
            <Link href="/teacher/assignments/new"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-blue-500 active:scale-95">
              + สร้างใบงาน
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Summary */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-center">
            <p className="text-2xl font-bold text-slate-100">{filtered.length}</p>
            <p className="mt-1 text-xs text-slate-500">ใบงานทั้งหมด</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-center">
            <p className={`text-2xl font-bold ${pendingGrade > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
              {pendingGrade}
            </p>
            <p className="mt-1 text-xs text-slate-500">รอตรวจ</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{reviewed}</p>
            <p className="mt-1 text-xs text-slate-500">ครูตรวจแล้ว · {totalSubmissions} รวม</p>
          </div>
        </div>

        {/* Pending toggle */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setPendingOnly(false)}
            className={`rounded-xl border px-4 py-1.5 text-xs font-medium transition-all ${
              !pendingOnly ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            ทั้งหมด
          </button>
          <button
            onClick={() => setPendingOnly(true)}
            className={`flex items-center gap-1.5 rounded-xl border px-4 py-1.5 text-xs font-medium transition-all ${
              pendingOnly ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            รอตรวจ
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        {/* Type filter */}
        <div className="mb-6 flex flex-wrap gap-2">
          {TYPE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key as ContentType | 'all')}
              className={`rounded-xl border px-4 py-1.5 text-xs font-medium transition-all ${
                typeFilter === key
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {fetching ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 py-20 text-center">
            <p className="text-slate-400">ยังไม่มีใบงาน</p>
            <Link href="/teacher/assignments/new" className="mt-3 text-sm text-blue-400 hover:text-blue-300">
              + สร้างใบงานแรก
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => <OverviewCard key={a.id} assignment={a} />)}
          </div>
        )}
      </main>
    </div>
  );
}

function OverviewCard({ assignment: a }: { assignment: AssignmentOverview }) {
  const ctMeta = CONTENT_TYPE_LABELS[a.contentType] ?? CONTENT_TYPE_LABELS.worksheet;
  const due = a.dueDate?._seconds;
  const dueStr = due
    ? new Date(due * 1000).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const status = due ? dueDateStatus(due) : null;
  const total = a.totalSubmissions;
  const reviewedPct = total > 0 ? Math.round((a.reviewedCount / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition-colors hover:border-slate-700">
      <div className="flex items-start gap-4">
        {/* Type icon */}
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl ${ctMeta.color}`}>
          {ctMeta.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`rounded-full border px-2 py-0.5 text-xs ${ctMeta.color}`}>
              {ctMeta.label}
            </span>
            {a.unit && (
              <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                {a.unit}
              </span>
            )}
          </div>

          <h3 className="font-medium text-slate-100 truncate">{a.title}</h3>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {status && (
              <span className={`flex items-center gap-1 ${status.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {dueStr} · {status.label}
              </span>
            )}
            <div className="flex flex-wrap gap-1">
              {a.classIds.slice(0, 4).map((c) => (
                <span key={c} className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-slate-400">
                  {c}
                </span>
              ))}
              {a.classIds.length > 4 && (
                <span className="text-slate-500">+{a.classIds.length - 4}</span>
              )}
            </div>
          </div>

          {/* Status breakdown */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-slate-400">
              <span className="font-semibold text-slate-200">{total}</span> ส่งแล้ว
            </span>
            {a.submittedCount > 0 && (
              <span className="flex items-center gap-1 text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                รอตรวจ {a.submittedCount}
              </span>
            )}
            {a.gradedCount > 0 && (
              <span className="flex items-center gap-1 text-blue-400">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                AI ตรวจแล้ว {a.gradedCount}
              </span>
            )}
            {a.reviewedCount > 0 && (
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                ครูตรวจแล้ว {a.reviewedCount}
              </span>
            )}
          </div>

          {/* Progress bar: reviewed / total */}
          {total > 0 && (
            <div className="mt-2 h-1.5 rounded-full bg-slate-800">
              <div
                className="h-1.5 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${reviewedPct}%` }}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          {a.submittedCount > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
              {a.submittedCount} รอตรวจ
            </span>
          )}
          <div className="flex gap-2">
            <Link
              href={`/teacher/assignments/${a.id}/edit`}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-200 transition-all"
            >
              แก้ไข
            </Link>
            <Link
              href={`/teacher/assignments/${a.id}/submissions`}
              className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500 hover:bg-slate-700 transition-all"
            >
              ตรวจงาน →
            </Link>
          </div>
        </div>
      </div>
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
