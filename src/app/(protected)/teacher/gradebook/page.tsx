'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AssignmentCol {
  id: string;
  title: string;
  classIds: string[];
}

interface SubmissionCell {
  submissionId: string;
  score: number | null;
  status: string;
}

interface StudentRow {
  uid: string;
  displayName: string;
  email: string;
  classId: string;
  submissions: Record<string, SubmissionCell>;
}

function cellStyle(cell: SubmissionCell | undefined): { bg: string; text: string; label: string } {
  if (!cell) return { bg: 'bg-slate-900', text: 'text-slate-700', label: '—' };
  if (cell.status === 'reviewed') {
    const s = cell.score ?? 0;
    if (s >= 80) return { bg: 'bg-emerald-950/60', text: 'text-emerald-300', label: String(s) };
    if (s >= 60) return { bg: 'bg-amber-950/60', text: 'text-amber-300', label: String(s) };
    return { bg: 'bg-red-950/60', text: 'text-red-300', label: String(s) };
  }
  if (cell.status === 'graded') return { bg: 'bg-blue-950/60', text: 'text-blue-300', label: `~${cell.score ?? '?'}` };
  if (cell.status === 'submitted') return { bg: 'bg-amber-950/40', text: 'text-amber-500', label: 'รอ' };
  return { bg: 'bg-slate-900', text: 'text-slate-700', label: '—' };
}

export default function GradebookPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [assignments, setAssignments] = useState<AssignmentCol[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [filterClass, setFilterClass] = useState('');
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  // null = ทุกวิชา; undefined = not yet initialised from localStorage
  const [subjectId, setSubjectId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  // Load the teacher's subjects + the currently-selected one (from localStorage).
  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    const saved = typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem('lms_subject') ?? 'null')
      : null;
    setSubjectId(saved?.id ?? null);
    fetch('/api/subjects')
      .then((r) => r.json())
      .then((d) => setSubjects(Array.isArray(d) ? d.map((s) => ({ id: s.id, name: s.name })) : []))
      .catch(() => {});
  }, [profile]);

  // Re-fetch the gradebook whenever the chosen subject changes.
  useEffect(() => {
    if (profile?.role !== 'teacher' || subjectId === undefined) return;
    setFetching(true);
    const url = subjectId ? `/api/teacher/gradebook?subject=${subjectId}` : '/api/teacher/gradebook';
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setAssignments(Array.isArray(d.assignments) ? d.assignments : []);
        setStudents(Array.isArray(d.students) ? d.students : []);
      })
      .finally(() => setFetching(false));
  }, [profile, subjectId]);

  if (loading || !profile) return <Spinner />;

  const classes = Array.from(new Set(students.map((s) => s.classId))).sort();
  const filtered = filterClass ? students.filter((s) => s.classId === filterClass) : students;

  // Assignments visible for current class filter
  const visibleAssignments = filterClass
    ? assignments.filter((a) => a.classIds.includes(filterClass))
    : assignments;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 sticky top-0 z-20">
        <div className="mx-auto flex max-w-full items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/teacher" className="text-xs text-slate-500 hover:text-slate-300">←</Link>
            <div>
              <h1 className="text-base font-semibold text-slate-100">📒 Grade Book</h1>
              <p className="text-xs text-slate-500">แยกตามรายวิชา</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Legend */}
            <div className="hidden sm:flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-950/60 border border-emerald-800" />ตรวจแล้ว</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-blue-950/60 border border-blue-800" />AI ตรวจ</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-amber-950/40 border border-amber-800" />รอตรวจ</span>
            </div>
            {/* Subject selector — separates the gradebook by รายวิชา */}
            <select
              value={subjectId ?? ''}
              onChange={(e) => setSubjectId(e.target.value || null)}
              className="rounded-lg border border-blue-800 bg-blue-950/30 px-3 py-1.5 text-xs text-blue-200"
            >
              <option value="">📚 ทุกวิชา</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300"
            >
              <option value="">ทุกห้อง</option>
              {classes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </header>

      <main className="px-4 py-6">
        {fetching ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-blue-400" />
          </div>
        ) : visibleAssignments.length === 0 || filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 py-24 text-center">
            <p className="text-slate-400">ยังไม่มีข้อมูล</p>
            <p className="mt-1 text-sm text-slate-500">สร้างงานและให้นักเรียนส่งก่อนนะ</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800">
                  {/* Sticky name + class columns */}
                  <th className="sticky left-0 z-10 bg-slate-900 px-4 py-3 text-left text-[11px] font-semibold text-slate-400 whitespace-nowrap border-r border-slate-800 min-w-[160px]">
                    ชื่อนักเรียน
                  </th>
                  <th className="sticky left-[160px] z-10 bg-slate-900 px-3 py-3 text-left text-[11px] font-semibold text-slate-400 whitespace-nowrap border-r border-slate-800 min-w-[72px]">
                    ห้อง
                  </th>
                  {visibleAssignments.map((a) => (
                    <th
                      key={a.id}
                      className="px-3 py-3 text-center text-[11px] font-semibold text-slate-400 min-w-[80px] max-w-[120px]"
                    >
                      <Link
                        href={`/teacher/assignments/${a.id}/submissions`}
                        className="block truncate hover:text-blue-400 transition-colors"
                        title={a.title}
                      >
                        {a.title}
                      </Link>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center text-[11px] font-semibold text-blue-400 min-w-[72px] border-l border-slate-800">
                    เฉลี่ย
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((student, rowIdx) => {
                  const reviewedScores = visibleAssignments
                    .map((a) => student.submissions[a.id])
                    .filter((c) => c?.status === 'reviewed' && typeof c.score === 'number')
                    .map((c) => c!.score as number);
                  const avg = reviewedScores.length > 0
                    ? Math.round(reviewedScores.reduce((a, b) => a + b, 0) / reviewedScores.length)
                    : null;

                  return (
                    <tr
                      key={student.uid}
                      className={rowIdx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/40'}
                    >
                      {/* Sticky name */}
                      <td className={`sticky left-0 z-10 px-4 py-2.5 border-r border-slate-800 min-w-[160px] ${rowIdx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/60'}`}>
                        <p className="font-medium text-slate-200 truncate max-w-[148px]" title={student.displayName}>
                          {student.displayName || '—'}
                        </p>
                        <p className="text-[10px] text-slate-600 truncate">{student.email}</p>
                      </td>
                      {/* Sticky class */}
                      <td className={`sticky left-[160px] z-10 px-3 py-2.5 text-slate-400 border-r border-slate-800 min-w-[72px] whitespace-nowrap ${rowIdx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/60'}`}>
                        {student.classId}
                      </td>
                      {/* Score cells */}
                      {visibleAssignments.map((a) => {
                        const cell = student.submissions[a.id];
                        const style = cellStyle(cell);
                        const cellBorder = cell
                          ? cell.status === 'reviewed'
                            ? (cell.score ?? 0) >= 80 ? 'border-emerald-800' : (cell.score ?? 0) >= 60 ? 'border-amber-800' : 'border-red-800'
                            : cell.status === 'graded' ? 'border-blue-800'
                            : 'border-amber-800'
                          : '';
                        return (
                          <td key={a.id} className="px-1.5 py-1.5 text-center">
                            {cell ? (
                              <Link
                                href={`/teacher/assignments/${a.id}/submissions?sub=${cell.submissionId}`}
                                className={`inline-flex h-8 w-14 items-center justify-center rounded-lg border font-semibold transition-all hover:brightness-125 ${style.bg} ${style.text} ${cellBorder}`}
                                title={`${student.displayName} — ${a.title} (${style.label})`}
                              >
                                {style.label}
                              </Link>
                            ) : (
                              <span className="inline-flex h-8 w-14 items-center justify-center rounded-lg text-slate-700">—</span>
                            )}
                          </td>
                        );
                      })}
                      {/* Average */}
                      <td className="px-3 py-2.5 text-center border-l border-slate-800">
                        {avg !== null ? (
                          <span className={`font-bold ${avg >= 80 ? 'text-emerald-400' : avg >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                            {avg}
                          </span>
                        ) : (
                          <span className="text-slate-700">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary footer */}
        {!fetching && filtered.length > 0 && visibleAssignments.length > 0 && (
          <div className="mt-4 flex items-center gap-6 px-2 text-xs text-slate-500">
            <span>{filtered.length} นักเรียน</span>
            <span>{visibleAssignments.length} งาน</span>
            <span>
              ส่งงานแล้ว{' '}
              <span className="text-slate-300">
                {filtered.reduce((acc, s) => acc + Object.keys(s.submissions).length, 0)}
              </span>
              {' '}/ {filtered.length * visibleAssignments.length} ชิ้น
            </span>
          </div>
        )}
      </main>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-blue-400" />
    </div>
  );
}
