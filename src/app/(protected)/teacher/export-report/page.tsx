'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface StudentRow {
  uid: string;
  displayName: string;
  classId: string;
  submitted: number;
  graded: number;
  avgScore: number | null;
  tabSwitchTotal: number;
}

export default function ExportReportPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [filterClass, setFilterClass] = useState('');

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    const sub = JSON.parse(localStorage.getItem('lms_subject') ?? 'null');
    const url = sub ? `/api/teacher/students?subject=${sub.id}` : '/api/teacher/students';
    fetch(url)
      .then((r) => r.json())
      .then((d) => setStudents(Array.isArray(d) ? d : []))
      .finally(() => setFetching(false));
  }, [profile]);

  if (loading || !profile) return <Spinner />;

  const classes = Array.from(new Set(students.map((s) => s.classId))).sort();
  const filtered = filterClass ? students.filter((s) => s.classId === filterClass) : students;
  const subject = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('lms_subject') ?? 'null')
    : null;

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/teacher" className="text-xs text-slate-500 hover:text-slate-300">←</Link>
            <h1 className="text-base font-semibold text-slate-100">🖨 Export / พิมพ์รายงาน</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300"
            >
              <option value="">ทุกห้อง</option>
              {classes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={() => window.print()}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 transition-all"
            >
              🖨 พิมพ์
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Print header */}
        <div className="mb-6 hidden print:block">
          <h1 className="text-2xl font-bold text-slate-900">รายงานผลการเรียน</h1>
          <p className="text-sm text-slate-600">
            วิชา: {subject?.name ?? 'ทุกวิชา'} · พิมพ์: {new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}
          </p>
          {filterClass && <p className="text-sm text-slate-600">ห้อง: {filterClass}</p>}
        </div>

        {fetching ? (
          <div className="flex items-center justify-center py-20 print:hidden">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="mb-6 grid grid-cols-3 gap-4 print:grid-cols-3 print:gap-2">
              {[
                { label: 'นักเรียนทั้งหมด', value: filtered.length },
                { label: 'คะแนนเฉลี่ย', value: filtered.filter((s) => s.avgScore !== null).length
                  ? Math.round(filtered.filter((s) => s.avgScore !== null).reduce((a, s) => a + (s.avgScore ?? 0), 0) / filtered.filter((s) => s.avgScore !== null).length)
                  : '—' },
                { label: 'ส่งงานเฉลี่ย', value: filtered.length
                  ? Math.round(filtered.reduce((a, s) => a + s.submitted, 0) / filtered.length)
                  : 0 },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 print:border-gray-300 print:bg-white">
                  <p className="text-xs text-slate-500 print:text-gray-500">{item.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-100 print:text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800 print:border-gray-300">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900 print:border-gray-300 print:bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 print:text-gray-600">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 print:text-gray-600">ชื่อ</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 print:text-gray-600">ห้อง</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 print:text-gray-600">ส่งงาน</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 print:text-gray-600">ตรวจแล้ว</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 print:text-gray-600">คะแนนเฉลี่ย</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 print:text-gray-600">Tab Switch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 print:divide-gray-200">
                  {filtered.map((s, i) => (
                    <tr key={s.uid} className="bg-slate-900 hover:bg-slate-800 transition-colors print:bg-white print:hover:bg-white">
                      <td className="px-4 py-3 text-slate-500 print:text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-100 print:text-gray-900">{s.displayName}</td>
                      <td className="px-4 py-3 text-slate-400 print:text-gray-600">{s.classId}</td>
                      <td className="px-4 py-3 text-center text-slate-300 print:text-gray-700">{s.submitted}</td>
                      <td className="px-4 py-3 text-center text-slate-300 print:text-gray-700">{s.graded}</td>
                      <td className="px-4 py-3 text-center">
                        {s.avgScore !== null ? (
                          <span className={`font-semibold ${s.avgScore >= 80 ? 'text-emerald-400 print:text-green-700' : s.avgScore >= 60 ? 'text-amber-400 print:text-yellow-700' : 'text-red-400 print:text-red-700'}`}>
                            {s.avgScore}
                          </span>
                        ) : (
                          <span className="text-slate-600 print:text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs ${s.tabSwitchTotal > 5 ? 'text-red-400 print:text-red-700' : 'text-slate-500 print:text-gray-400'}`}>
                          {s.tabSwitchTotal}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
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
