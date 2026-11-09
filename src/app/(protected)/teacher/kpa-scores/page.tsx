'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TermSelect from '@/components/TermSelect';

interface Block { id: string; type: string; question?: string; scoreMax?: number; scoreKind?: 'K' | 'P' }
interface AssignmentItem { id: string; title: string; contentType?: string; subjectId?: string | null; blocks?: Block[]; attitudeMax?: number | null; academicYear?: number | null; term?: number | null }
interface Sub {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  classId: string;
  questionScores?: Record<string, number>;
  attitudeScore?: number;
}

const QT = ['short-answer', 'long-answer', 'multiple-choice', 'checkbox', 'ordering', 'image-upload', 'true-false', 'matching', 'fill-blank', 'link'];

function hasKpa(a: AssignmentItem): boolean {
  const scored = (a.blocks ?? []).some((b) => QT.includes(b.type) && typeof b.scoreMax === 'number' && b.scoreMax > 0);
  return scored || (typeof a.attitudeMax === 'number' && a.attitudeMax > 0);
}

export default function KpaScoresPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [subjectId, setSubjectId] = useState<string | null | undefined>(undefined);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [term, setTerm] = useState<string | undefined>(undefined);
  const [selectedId, setSelectedId] = useState('');
  const [assignment, setAssignment] = useState<AssignmentItem | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    const saved = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('lms_subject') ?? 'null') : null;
    setSubjectId(saved?.id ?? null);
    fetch('/api/subjects').then((r) => r.json())
      .then((d) => setSubjects(Array.isArray(d) ? d.map((s) => ({ id: s.id, name: s.name })) : [])).catch(() => {});
  }, [profile]);

  // Load the assignment list (only those that have KPA scoring configured).
  useEffect(() => {
    if (profile?.role !== 'teacher' || subjectId === undefined || term === undefined) return;
    const url = subjectId ? `/api/assignments?subject=${subjectId}` : '/api/assignments';
    fetch(url).then((r) => r.json()).then((d) => {
      // Worksheets are a permanent library reused every term, so list every
      // KPA-configured one. Per-term separation comes from the submissions,
      // which /api/teacher/submissions/[id] already scopes to the current roster.
      const list: AssignmentItem[] = (Array.isArray(d) ? d.filter(hasKpa) : []);
      setAssignments(list);
      setSelectedId((cur) => (list.some((a) => a.id === cur) ? cur : (list[0]?.id ?? '')));
    }).catch(() => {});
  }, [profile, subjectId, term]);

  const loadScores = useCallback(() => {
    if (!selectedId) { setAssignment(null); setSubs([]); return; }
    setFetching(true);
    fetch(`/api/teacher/submissions/${selectedId}`).then((r) => r.json()).then((data) => {
      setAssignment(data.assignment ?? null);
      setSubs(Array.isArray(data.submissions) ? data.submissions : []);
    }).finally(() => setFetching(false));
  }, [selectedId]);

  useEffect(() => { loadScores(); }, [loadScores]);

  if (loading || !profile) return <Spinner />;

  const scoredBlocks = (assignment?.blocks ?? []).filter((b) => QT.includes(b.type) && typeof b.scoreMax === 'number' && b.scoreMax > 0);
  const allQ = (assignment?.blocks ?? []).filter((b) => QT.includes(b.type));
  const numOf = new Map(allQ.map((b, i) => [b.id, i + 1]));
  const aMax = assignment?.attitudeMax;
  const hasA = typeof aMax === 'number' && aMax > 0;
  const kMax = scoredBlocks.filter((b) => b.scoreKind === 'K').reduce((s, b) => s + (b.scoreMax || 0), 0);
  const pMax = scoredBlocks.filter((b) => b.scoreKind === 'P').reduce((s, b) => s + (b.scoreMax || 0), 0);
  const grandMax = kMax + pMax + (hasA ? (aMax ?? 0) : 0);

  const classes = Array.from(new Set(subs.map((s) => s.classId).filter(Boolean))).sort();
  const visible = (classFilter ? subs.filter((s) => s.classId === classFilter) : subs)
    .slice().sort((a, b) => (a.classId.localeCompare(b.classId) || a.studentName.localeCompare(b.studentName, 'th')));

  const qScore = (s: Sub, bId: string) => s.questionScores?.[bId];
  const sumKind = (s: Sub, kind: 'K' | 'P') => scoredBlocks.filter((b) => b.scoreKind === kind).reduce((t, b) => t + (Number(qScore(s, b.id)) || 0), 0);
  const aVal = (s: Sub) => (typeof s.attitudeScore === 'number' ? s.attitudeScore : 0);
  const total = (s: Sub) => sumKind(s, 'K') + sumKind(s, 'P') + (hasA ? aVal(s) : 0);

  async function exportExcel() {
    if (!assignment) return;
    const XLSX = await import('xlsx');
    const header = ['รหัสประจำตัว', 'ชื่อ-สกุล', 'ห้อง'];
    for (const b of scoredBlocks) header.push(`ข้อ ${numOf.get(b.id)} ${b.scoreKind ?? ''} (${b.scoreMax})`);
    if (hasA) header.push(`A (${aMax})`);
    header.push(`รวม K (${kMax})`, `รวม P (${pMax})`, ...(hasA ? [`A (${aMax})`] : []), `รวม (${grandMax})`);

    const aoa: (string | number)[][] = [header];
    for (const s of visible) {
      const row: (string | number)[] = [(s.studentEmail ?? '').split('@')[0], s.studentName, s.classId];
      for (const b of scoredBlocks) { const v = qScore(s, b.id); row.push(v != null ? v : ''); }
      if (hasA) row.push(typeof s.attitudeScore === 'number' ? s.attitudeScore : '');
      row.push(sumKind(s, 'K'), sumKind(s, 'P'), ...(hasA ? [aVal(s)] : []), total(s));
      aoa.push(row);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = header.map((h, i) => ({ wch: i === 1 ? 24 : Math.max(7, h.length + 1) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPA');
    const safe = `${assignment.title}${classFilter ? `_${classFilter}` : ''}`.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
    XLSX.writeFile(wb, `KPA_${safe}.xlsx`);
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 sticky top-0 z-20">
        <div className="mx-auto flex max-w-full items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/teacher" className="text-xs text-slate-500 hover:text-slate-300">←</Link>
            <div>
              <h1 className="text-base font-semibold text-slate-100">🧮 คะแนน KPA ตามงาน</h1>
              <p className="text-xs text-slate-500">เลือกใบงาน · ดูคะแนนรายข้อ (K/P) + A · ดาวน์โหลด Excel</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={subjectId ?? ''} onChange={(e) => setSubjectId(e.target.value || null)}
              className="rounded-lg border border-blue-800 bg-blue-950/30 px-3 py-1.5 text-xs text-blue-200">
              <option value="">📚 ทุกวิชา</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <TermSelect value={term} onChange={setTerm} />
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
              className="max-w-[260px] rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200">
              {assignments.length === 0 ? <option value="">— ไม่มีใบงานที่ตั้งคะแนน KPA —</option>
                : assignments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
            {classes.length > 1 && (
              <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
                <option value="">ทุกห้อง</option>
                {classes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <button onClick={exportExcel} disabled={!assignment || visible.length === 0}
              className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:border-emerald-500 disabled:opacity-40">
              📥 Excel
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 py-6">
        {fetching ? (
          <div className="flex items-center justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-blue-400" /></div>
        ) : !assignment || (scoredBlocks.length === 0 && !hasA) ? (
          <div className="rounded-2xl border border-dashed border-slate-800 py-24 text-center">
            <p className="text-slate-400">{assignments.length === 0 ? 'ยังไม่มีใบงานที่ตั้งคะแนน KPA — ไปตั้งคะแนนรายข้อในใบงานก่อน' : 'เลือกใบงานที่มีคะแนน KPA'}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 py-24 text-center"><p className="text-slate-400">ยังไม่มีงานที่ส่ง</p></div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800">
                  <th className="sticky left-0 z-10 bg-slate-900 px-3 py-2 text-left text-[11px] font-semibold text-slate-400 border-r border-slate-800 min-w-[96px]">รหัส</th>
                  <th className="sticky left-[96px] z-10 bg-slate-900 px-3 py-2 text-left text-[11px] font-semibold text-slate-400 border-r border-slate-800 min-w-[150px]">ชื่อ-สกุล</th>
                  <th className="px-2 py-2 text-center text-[11px] font-semibold text-slate-400 border-r border-slate-800">ห้อง</th>
                  {scoredBlocks.map((b) => (
                    <th key={b.id} className="px-1.5 py-2 text-center text-[10px] font-semibold text-slate-400 border-l border-slate-800/60"
                      title={b.question ?? ''}>
                      ข้อ {numOf.get(b.id)}<br />
                      <span className={`text-[9px] font-bold ${b.scoreKind === 'K' ? 'text-blue-400' : 'text-violet-400'}`}>{b.scoreKind ?? ''}</span>
                      <span className="text-[8px] text-slate-600">/{b.scoreMax}</span>
                    </th>
                  ))}
                  {hasA && <th className="px-1.5 py-2 text-center text-[10px] font-semibold text-emerald-400 border-l border-slate-800">A<br /><span className="text-[8px] text-slate-600">/{aMax}</span></th>}
                  <th className="px-2 py-2 text-center text-[10px] font-semibold text-blue-300 border-l border-slate-800">รวม K<br /><span className="text-[8px] text-slate-600">/{kMax}</span></th>
                  <th className="px-2 py-2 text-center text-[10px] font-semibold text-violet-300">รวม P<br /><span className="text-[8px] text-slate-600">/{pMax}</span></th>
                  <th className="px-2 py-2 text-center text-[10px] font-semibold text-amber-300 border-l border-slate-800">รวม<br /><span className="text-[8px] text-slate-600">/{grandMax}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {visible.map((s, i) => (
                  <tr key={s.id} className={i % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/40'}>
                    <td className={`sticky left-0 z-10 px-3 py-1.5 text-slate-400 border-r border-slate-800 ${i % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/60'}`}>{(s.studentEmail ?? '').split('@')[0] || '—'}</td>
                    <td className={`sticky left-[96px] z-10 px-3 py-1.5 border-r border-slate-800 ${i % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/60'}`}><span className="font-medium text-slate-200">{s.studentName || '—'}</span></td>
                    <td className="px-2 py-1.5 text-center text-slate-400 border-r border-slate-800">{s.classId}</td>
                    {scoredBlocks.map((b) => {
                      const v = qScore(s, b.id);
                      return <td key={b.id} className="px-1.5 py-1.5 text-center border-l border-slate-800/50 text-slate-200">{v != null ? v : <span className="text-slate-700">—</span>}</td>;
                    })}
                    {hasA && <td className="px-1.5 py-1.5 text-center border-l border-slate-800 text-emerald-300">{typeof s.attitudeScore === 'number' ? s.attitudeScore : <span className="text-slate-700">—</span>}</td>}
                    <td className="px-2 py-1.5 text-center font-semibold text-blue-300 border-l border-slate-800">{sumKind(s, 'K')}</td>
                    <td className="px-2 py-1.5 text-center font-semibold text-violet-300">{sumKind(s, 'P')}</td>
                    <td className="px-2 py-1.5 text-center font-bold text-amber-300 border-l border-slate-800">{total(s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {assignment && visible.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">{visible.length} คน · คะแนนเต็มรวม {grandMax} (K {kMax} · P {pMax}{hasA ? ` · A ${aMax}` : ''})</p>
        )}
      </main>
    </div>
  );
}

function Spinner() {
  return <div className="flex min-h-screen items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-blue-400" /></div>;
}
