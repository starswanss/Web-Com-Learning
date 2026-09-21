'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Unit { id: string; name: string; k: number; p: number; a: number }
interface KPA { k: number; p: number; a: number }
interface Row {
  uid: string;
  studentCode: string;
  name: string;
  email: string;
  classId: string;
  unitPct: Record<string, number>;
  saved: Record<string, KPA>;
}
type ScoreMap = Record<string, Record<string, KPA>>;

const KPA_KEYS: (keyof KPA)[] = ['k', 'p', 'a'];
const KPA_LABEL: Record<keyof KPA, string> = { k: 'K', p: 'P', a: 'A' };

function gradeOf(pct: number): string {
  if (pct >= 80) return '4';
  if (pct >= 75) return '3.5';
  if (pct >= 70) return '3';
  if (pct >= 65) return '2.5';
  if (pct >= 60) return '2';
  if (pct >= 55) return '1.5';
  if (pct >= 50) return '1';
  return '0';
}
function gradeColor(g: string): string {
  const n = Number(g);
  if (n >= 3.5) return 'text-emerald-400';
  if (n >= 2.5) return 'text-blue-400';
  if (n >= 1) return 'text-amber-400';
  return 'text-red-400';
}

function newUnitId(units: Unit[]): string {
  let i = units.length + 1;
  const ids = new Set(units.map((u) => u.id));
  while (ids.has(`u${i}`)) i++;
  return `u${i}`;
}

export default function GradesPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [subjectId, setSubjectId] = useState<string | null | undefined>(undefined);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitMatched, setUnitMatched] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [scores, setScores] = useState<ScoreMap>({});
  const [fetching, setFetching] = useState(true);
  const [classFilter, setClassFilter] = useState('');
  const [savingCfg, setSavingCfg] = useState(false);
  const [savingScores, setSavingScores] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

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

  const load = useCallback(() => {
    if (profile?.role !== 'teacher' || subjectId === undefined) return;
    setFetching(true);
    const url = subjectId ? `/api/teacher/grades?subject=${subjectId}` : '/api/teacher/grades';
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        const u: Unit[] = Array.isArray(d.units) ? d.units : [];
        const rs: Row[] = Array.isArray(d.students) ? d.students : [];
        setUnits(u);
        setUnitMatched(d.unitMatched ?? {});
        setRows(rs);
        // Seed editable scores from saved values.
        const seed: ScoreMap = {};
        for (const r of rs) seed[r.uid] = { ...r.saved };
        setScores(seed);
      })
      .finally(() => setFetching(false));
  }, [profile, subjectId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !profile) return <Spinner />;

  const subjectName = subjects.find((s) => s.id === subjectId)?.name ?? 'ทุกวิชา';
  const classes = Array.from(new Set(rows.map((r) => r.classId))).sort();
  const visible = classFilter ? rows.filter((r) => r.classId === classFilter) : rows;

  const maxTotal = units.reduce((sum, u) => sum + u.k + u.p + u.a, 0);

  function cellVal(uid: string, unitId: string, key: keyof KPA): number | '' {
    const v = scores[uid]?.[unitId]?.[key];
    return typeof v === 'number' ? v : '';
  }
  function setCell(uid: string, unitId: string, key: keyof KPA, raw: string, max: number) {
    let n = raw === '' ? 0 : Number(raw);
    if (!isFinite(n) || n < 0) n = 0;
    if (n > max) n = max;
    setScores((prev) => {
      const student = { ...(prev[uid] ?? {}) };
      const unit: KPA = { ...(student[unitId] ?? { k: 0, p: 0, a: 0 }) };
      unit[key] = n;
      student[unitId] = unit;
      return { ...prev, [uid]: student };
    });
  }
  function rowTotal(uid: string): number {
    let t = 0;
    for (const u of units) {
      const kpa = scores[uid]?.[u.id];
      if (kpa) t += (kpa.k || 0) + (kpa.p || 0) + (kpa.a || 0);
    }
    return Math.round(t * 100) / 100;
  }

  // ── Config editing ──────────────────────────────────────────────────────────
  function updateUnit(id: string, patch: Partial<Unit>) {
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }
  function addUnit() {
    setUnits((prev) => [...prev, { id: newUnitId(prev), name: `หน่วยที่ ${prev.length + 1}`, k: 10, p: 10, a: 10 }]);
  }
  function removeUnit(id: string) {
    setUnits((prev) => prev.filter((u) => u.id !== id));
  }
  async function saveConfig() {
    setSavingCfg(true); setMsg(null);
    try {
      const url = subjectId ? `/api/teacher/grades?subject=${subjectId}` : '/api/teacher/grades';
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units }),
      });
      if (!res.ok) throw new Error();
      setMsg('บันทึกหน่วยแล้ว');
      load(); // refresh unitMatched + auto percentages
    } catch { setMsg('บันทึกหน่วยไม่สำเร็จ'); }
    finally { setSavingCfg(false); }
  }

  // ── Auto-distribute (เกลี่ย) ────────────────────────────────────────────────
  function autoDistribute() {
    const next: ScoreMap = {};
    for (const r of rows) {
      next[r.uid] = {};
      for (const u of units) {
        const pct = r.unitPct[u.id] ?? 0;
        next[r.uid][u.id] = {
          k: Math.min(u.k, Math.round(pct * u.k)),
          p: Math.min(u.p, Math.round(pct * u.p)),
          a: Math.min(u.a, Math.round(pct * u.a)),
        };
      }
    }
    setScores(next);
    setMsg('เกลี่ยคะแนนจากงานที่ตรวจแล้ว — ตรวจ/แก้ไขได้ แล้วกด “บันทึกคะแนน”');
  }

  async function saveScores() {
    setSavingScores(true); setMsg(null);
    try {
      const url = subjectId ? `/api/teacher/grades?subject=${subjectId}` : '/api/teacher/grades';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores }),
      });
      if (!res.ok) throw new Error();
      setMsg('บันทึกคะแนนแล้ว');
    } catch { setMsg('บันทึกคะแนนไม่สำเร็จ'); }
    finally { setSavingScores(false); }
  }

  // ── Export Excel ────────────────────────────────────────────────────────────
  async function exportExcel() {
    const XLSX = await import('xlsx');
    const header = ['รหัสประจำตัว', 'ชื่อ-สกุล', 'ห้อง'];
    for (const u of units) header.push(`${u.name} K`, `${u.name} P`, `${u.name} A`);
    header.push('คะแนนรวม', 'คะแนนเต็ม', 'ร้อยละ', 'เกรด');

    const aoa: (string | number)[][] = [header];
    for (const r of visible) {
      const line: (string | number)[] = [r.studentCode, r.name, r.classId];
      for (const u of units) {
        const kpa = scores[r.uid]?.[u.id];
        line.push(kpa?.k ?? 0, kpa?.p ?? 0, kpa?.a ?? 0);
      }
      const total = rowTotal(r.uid);
      const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 10000) / 100 : 0;
      line.push(total, maxTotal, pct, gradeOf(pct));
      aoa.push(line);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = header.map((h, i) => ({ wch: i === 1 ? 24 : Math.max(8, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'เกรด');
    const safe = `${subjectName}${classFilter ? `_${classFilter}` : ''}`.replace(/[\\/:*?"<>|]/g, '_');
    XLSX.writeFile(wb, `เกรด_${safe}.xlsx`);
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 sticky top-0 z-20">
        <div className="mx-auto flex max-w-full items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/teacher" className="text-xs text-slate-500 hover:text-slate-300">←</Link>
            <div>
              <h1 className="text-base font-semibold text-slate-100">🎯 เกรด (KPA)</h1>
              <p className="text-xs text-slate-500">เกลี่ยคะแนนตามหน่วย · ดาวน์โหลด Excel</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={subjectId ?? ''}
              onChange={(e) => setSubjectId(e.target.value || null)}
              className="rounded-lg border border-blue-800 bg-blue-950/30 px-3 py-1.5 text-xs text-blue-200"
            >
              <option value="">📚 ทุกวิชา</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300"
            >
              <option value="">ทุกห้อง</option>
              {classes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 space-y-5">
        {/* ── Unit config ── */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">ตั้งค่าหน่วยและคะแนนเต็ม KPA</h2>
              <p className="text-xs text-slate-500">กำหนดจำนวนหน่วย และคะแนนเต็มของ K (ความรู้) · P (ทักษะ) · A (คุณลักษณะ) แต่ละหน่วย</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={addUnit} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500">+ เพิ่มหน่วย</button>
              <button onClick={saveConfig} disabled={savingCfg}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
                {savingCfg ? 'กำลังบันทึก…' : '💾 บันทึกหน่วย'}
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {units.map((u, i) => (
              <div key={u.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={u.name}
                    onChange={(e) => updateUnit(u.id, { name: e.target.value })}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100"
                    placeholder={`หน่วยที่ ${i + 1}`}
                  />
                  {units.length > 1 && (
                    <button onClick={() => removeUnit(u.id)} className="text-slate-600 hover:text-red-400 text-sm" title="ลบหน่วย">×</button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {KPA_KEYS.map((key) => (
                    <label key={key} className="text-center">
                      <span className="block text-[10px] font-bold text-slate-500">{KPA_LABEL[key]}</span>
                      <input
                        type="number" min={0} value={u[key]}
                        onChange={(e) => updateUnit(u.id, { [key]: Math.max(0, Number(e.target.value)) } as Partial<Unit>)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-center text-xs text-slate-100"
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-slate-600">
                  รวม {u.k + u.p + u.a} · {unitMatched[u.id] ? `ผูกกับงาน ${unitMatched[u.id]} ชิ้น` : 'ยังไม่มีงานผูก (ใช้ค่าเฉลี่ยรวม)'}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-3 text-[11px] text-slate-500">
            💡 “ผูกกับงาน” = ใบงาน/แบบทดสอบที่ตั้งชื่อ <strong className="text-slate-300">หน่วย</strong> ตรงกับชื่อหน่วยนี้ — ระบบจะเกลี่ยคะแนนจากงานเหล่านั้น
          </p>
        </section>

        {/* ── Action bar ── */}
        <div className="sticky top-[68px] z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/95 px-4 py-2.5 backdrop-blur-sm">
          <span className="text-xs text-slate-400">{msg ?? `${visible.length} นักเรียน · คะแนนเต็มรวม ${maxTotal}`}</span>
          <div className="flex flex-wrap gap-2">
            <button onClick={autoDistribute}
              className="rounded-lg border border-purple-700 bg-purple-950/40 px-4 py-2 text-sm font-semibold text-purple-300 hover:border-purple-500">
              ⚖️ เกลี่ยคะแนนอัตโนมัติ
            </button>
            <button onClick={saveScores} disabled={savingScores}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
              {savingScores ? 'กำลังบันทึก…' : '💾 บันทึกคะแนน'}
            </button>
            <button onClick={exportExcel} disabled={visible.length === 0}
              className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-4 py-2 text-sm font-semibold text-emerald-300 hover:border-emerald-500 disabled:opacity-40">
              📥 ดาวน์โหลด Excel
            </button>
          </div>
        </div>

        {/* ── Grade table ── */}
        {fetching ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-blue-400" />
          </div>
        ) : visible.length === 0 || units.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 py-24 text-center">
            <p className="text-slate-400">{units.length === 0 ? 'เพิ่มหน่วยอย่างน้อย 1 หน่วยก่อน' : 'ยังไม่มีนักเรียน'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800">
                  <th rowSpan={2} className="sticky left-0 z-10 bg-slate-900 px-3 py-2 text-left text-[11px] font-semibold text-slate-400 border-r border-slate-800 min-w-[100px]">รหัส</th>
                  <th rowSpan={2} className="sticky left-[100px] z-10 bg-slate-900 px-3 py-2 text-left text-[11px] font-semibold text-slate-400 border-r border-slate-800 min-w-[150px]">ชื่อ-สกุล</th>
                  <th rowSpan={2} className="px-2 py-2 text-center text-[11px] font-semibold text-slate-400 border-r border-slate-800">ห้อง</th>
                  {units.map((u) => (
                    <th key={u.id} colSpan={3} className="px-2 py-1.5 text-center text-[11px] font-semibold text-slate-300 border-r border-l border-slate-800">
                      {u.name}
                    </th>
                  ))}
                  <th rowSpan={2} className="px-2 py-2 text-center text-[11px] font-semibold text-blue-400 border-l border-slate-800 min-w-[56px]">รวม<br /><span className="text-[9px] text-slate-600">/{maxTotal}</span></th>
                  <th rowSpan={2} className="px-2 py-2 text-center text-[11px] font-semibold text-emerald-400 min-w-[48px]">เกรด</th>
                </tr>
                <tr className="bg-slate-900/60 border-b border-slate-800">
                  {units.map((u) => (
                    KPA_KEYS.map((key) => (
                      <th key={u.id + key} className="px-1 py-1 text-center text-[10px] font-bold text-slate-500 border-l border-slate-800/60" title={`${KPA_LABEL[key]} เต็ม ${u[key]}`}>
                        {KPA_LABEL[key]}<span className="text-[8px] text-slate-600">/{u[key]}</span>
                      </th>
                    ))
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {visible.map((r, rowIdx) => {
                  const total = rowTotal(r.uid);
                  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                  const grade = gradeOf(pct);
                  return (
                    <tr key={r.uid} className={rowIdx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/40'}>
                      <td className={`sticky left-0 z-10 px-3 py-1.5 text-slate-400 border-r border-slate-800 ${rowIdx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/60'}`}>{r.studentCode || '—'}</td>
                      <td className={`sticky left-[100px] z-10 px-3 py-1.5 border-r border-slate-800 ${rowIdx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/60'}`}>
                        <span className="font-medium text-slate-200">{r.name || '—'}</span>
                      </td>
                      <td className="px-2 py-1.5 text-center text-slate-400 border-r border-slate-800">{r.classId}</td>
                      {units.map((u) => (
                        KPA_KEYS.map((key) => (
                          <td key={u.id + key} className="px-0.5 py-1 border-l border-slate-800/50">
                            <input
                              type="number" min={0} max={u[key]}
                              value={cellVal(r.uid, u.id, key)}
                              onChange={(e) => setCell(r.uid, u.id, key, e.target.value, u[key])}
                              className="w-11 rounded border border-slate-800 bg-slate-900 px-1 py-1 text-center text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                            />
                          </td>
                        ))
                      ))}
                      <td className="px-2 py-1.5 text-center font-bold text-blue-300 border-l border-slate-800">{total}</td>
                      <td className={`px-2 py-1.5 text-center font-bold ${gradeColor(grade)}`}>{grade}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
