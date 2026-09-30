'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Unit { id: string; name: string; k: number; p: number; a: number; assignmentIds?: string[] }
interface KPA { k: number; p: number; a: number }
interface Exam { midterm: number; final: number }
interface AssignmentOpt { id: string; title: string; unit: string; contentType: string }
interface Row {
  uid: string;
  studentCode: string;
  name: string;
  email: string;
  classId: string;
  unitPct: Record<string, number>;
  midtermPct: number;
  finalPct: number;
  saved: Record<string, KPA>;
  savedExam: Exam;
}
type ScoreMap = Record<string, Record<string, KPA>>;
type ExamMap = Record<string, Exam>;
const EXAM_KEYS: (keyof Exam)[] = ['midterm', 'final'];
const EXAM_LABEL: Record<keyof Exam, string> = { midterm: 'กลางภาค', final: 'ปลายภาค' };

const KPA_KEYS: (keyof KPA)[] = ['k', 'p', 'a'];
const KPA_LABEL: Record<keyof KPA, string> = { k: 'K', p: 'P', a: 'A' };

const PASS_THRESHOLD = 50; // ต่ำกว่า 50% = ไม่ผ่านเกณฑ์ → ทำสีแดง
const MIN_MIDTERM = 5;     // เกลี่ยคะแนนแล้ว กลางภาคต้องไม่ต่ำกว่า 5

// เกรดตามระบบประเทศไทย (8 ระดับ)
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
  const [examCfg, setExamCfg] = useState<Exam>({ midterm: 20, final: 20 });
  const [midtermAssignments, setMidtermAssignments] = useState<string[]>([]);
  const [finalAssignments, setFinalAssignments] = useState<string[]>([]);
  const [assignmentOpts, setAssignmentOpts] = useState<AssignmentOpt[]>([]);
  const [unitMatched, setUnitMatched] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [scores, setScores] = useState<ScoreMap>({});
  const [exams, setExams] = useState<ExamMap>({});
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
        setExamCfg(d.exam ?? { midterm: 20, final: 20 });
        setMidtermAssignments(Array.isArray(d.midtermAssignments) ? d.midtermAssignments : []);
        setFinalAssignments(Array.isArray(d.finalAssignments) ? d.finalAssignments : []);
        setAssignmentOpts(Array.isArray(d.assignments) ? d.assignments : []);
        setUnitMatched(d.unitMatched ?? {});
        setRows(rs);
        // Seed editable scores from saved values.
        const seed: ScoreMap = {};
        const seedExam: ExamMap = {};
        for (const r of rs) {
          seed[r.uid] = { ...r.saved };
          seedExam[r.uid] = { ...(r.savedExam ?? { midterm: 0, final: 0 }) };
        }
        setScores(seed);
        setExams(seedExam);
      })
      .finally(() => setFetching(false));
  }, [profile, subjectId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !profile) return <Spinner />;

  const subjectName = subjects.find((s) => s.id === subjectId)?.name ?? 'ทุกวิชา';
  const classes = Array.from(new Set(rows.map((r) => r.classId))).sort();
  const visible = classFilter ? rows.filter((r) => r.classId === classFilter) : rows;

  const unitsMax = units.reduce((sum, u) => sum + u.k + u.p + u.a, 0);
  const maxTotal = unitsMax + (examCfg.midterm || 0) + (examCfg.final || 0);
  const overLimit = maxTotal > 100;

  function cellVal(uid: string, unitId: string, key: keyof KPA): number | '' {
    const v = scores[uid]?.[unitId]?.[key];
    return typeof v === 'number' ? v : '';
  }
  function examVal(uid: string, key: keyof Exam): number | '' {
    const v = exams[uid]?.[key];
    return typeof v === 'number' ? v : '';
  }
  function setExam(uid: string, key: keyof Exam, raw: string, max: number) {
    let n = raw === '' ? 0 : Number(raw);
    if (!isFinite(n) || n < 0) n = 0;
    if (n > max) n = max;
    setExams((prev) => {
      const cur: Exam = { ...(prev[uid] ?? { midterm: 0, final: 0 }) };
      cur[key] = n;
      return { ...prev, [uid]: cur };
    });
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
    const e = exams[uid];
    if (e) t += (e.midterm || 0) + (e.final || 0);
    return Math.round(t * 100) / 100;
  }

  const unitMax = (u: Unit) => u.k + u.p + u.a;
  function unitTotal(uid: string, u: Unit): number {
    const kpa = scores[uid]?.[u.id];
    return kpa ? (kpa.k || 0) + (kpa.p || 0) + (kpa.a || 0) : 0;
  }
  // A unit "ไม่ถึงครึ่ง" (below half its full marks) → highlight red.
  function unitBelowHalf(uid: string, u: Unit): boolean {
    return unitMax(u) > 0 && unitTotal(uid, u) < unitMax(u) / 2;
  }
  // "ร" (incomplete): the final exam (ปลายภาค) is left at 0 — the student
  // hasn't completed the final, so the grade can't be finalised.
  function isIncomplete(uid: string): boolean {
    return examCfg.final > 0 && !((exams[uid]?.final ?? 0) > 0);
  }

  // ── Config editing ──────────────────────────────────────────────────────────
  function updateUnit(id: string, patch: Partial<Unit>) {
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }
  function addUnit() {
    setUnits((prev) => [...prev, { id: newUnitId(prev), name: `หน่วยที่ ${prev.length + 1}`, k: 10, p: 10, a: 10, assignmentIds: [] }]);
  }
  function removeUnit(id: string) {
    setUnits((prev) => prev.filter((u) => u.id !== id));
  }
  async function saveConfig() {
    if (overLimit) { setMsg(`คะแนนเต็มรวมต้องไม่เกิน 100 (ตอนนี้ ${maxTotal})`); return; }
    setSavingCfg(true); setMsg(null);
    try {
      const url = subjectId ? `/api/teacher/grades?subject=${subjectId}` : '/api/teacher/grades';
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units, midterm: examCfg.midterm, final: examCfg.final, midtermAssignments, finalAssignments }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '');
      setMsg('บันทึกหน่วยแล้ว');
      load(); // refresh unitMatched + auto percentages
    } catch (e) { setMsg(e instanceof Error && e.message ? e.message : 'บันทึกหน่วยไม่สำเร็จ'); }
    finally { setSavingCfg(false); }
  }

  // ── Auto-distribute (เกลี่ย) ────────────────────────────────────────────────
  // Distributes each unit's KPA — and midterm/final — from the scores of the
  // assignments bound to them.
  function autoDistribute() {
    const next: ScoreMap = {};
    const nextExam: ExamMap = {};
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
      // กลางภาคต้อง ≥ 5 (แต่ไม่เกินคะแนนเต็มของกลางภาค)
      const midFloor = Math.min(examCfg.midterm, MIN_MIDTERM);
      nextExam[r.uid] = {
        midterm: Math.max(midFloor, Math.min(examCfg.midterm, Math.round((r.midtermPct ?? 0) * examCfg.midterm))),
        final: Math.min(examCfg.final, Math.round((r.finalPct ?? 0) * examCfg.final)),
      };
    }
    setScores(next);
    setExams(nextExam);
    setMsg('เกลี่ยคะแนนจากงานที่ผูกไว้ — ตรวจ/แก้ไขได้ แล้วกด “บันทึกคะแนน”');
  }

  // เกลี่ยคะแนนเข้าทุกหน่วย: เติมคะแนน KPA ของ "ทุกหน่วย + กลางภาค" (ยกเว้นปลายภาค)
  // จากผลงานจริงของนักเรียน (เปอร์เซ็นต์รายหน่วย) แล้วดันให้ทุกส่วน "เกินครึ่ง" พร้อม
  // กระจายแบบสุ่มเล็กน้อย (คงที่ต่อคน) ให้ดูสมจริง — ไม่ซ้ำกันทุกคน/ทุกหน่วย.
  function distributeAllUnits() {
    if (!confirm('เติมคะแนน KPA ทุกหน่วย + กลางภาค (ยกเว้นปลายภาค) จากผลงานจริง ให้ทุกส่วนเกินครึ่ง และกระจายให้ดูสมจริง?\nคะแนนรายหน่วย/กลางภาคเดิมจะถูกเขียนทับ')) return;

    const nextScores: ScoreMap = {};
    const nextExams: ExamMap = {};

    for (const r of rows) {
      nextScores[r.uid] = {};
      units.forEach((u) => {
        const mx = unitMax(u);
        if (mx === 0) { nextScores[r.uid][u.id] = { k: 0, p: 0, a: 0 }; return; }
        const floor = overHalf(mx);
        const base = Math.round((r.unitPct[u.id] ?? 0) * mx); // ผลงานจริง
        let val = Math.min(mx, Math.max(floor, base));
        val = jitterVal(val, floor, mx, `${r.uid}:${u.id}`);      // กระจายให้สมจริง
        nextScores[r.uid][u.id] = splitKPAVaried(u, val, `${r.uid}:${u.id}`);
      });

      // กลางภาค — จากผลงานจริง ดันให้เกินครึ่ง (ปลายภาคไม่แตะ)
      let midterm = exams[r.uid]?.midterm ?? 0;
      if (examCfg.midterm > 0) {
        const floor = overHalf(examCfg.midterm);
        const base = Math.round((r.midtermPct ?? 0) * examCfg.midterm);
        midterm = jitterVal(Math.min(examCfg.midterm, Math.max(floor, base)), floor, examCfg.midterm, `${r.uid}:mid`);
      }
      nextExams[r.uid] = { midterm, final: exams[r.uid]?.final ?? 0 };
    }

    setScores(nextScores);
    setExams(nextExams);
    setMsg('เติมคะแนน KPA จากผลงานจริง + กระจายให้สมจริงแล้ว (ทุกส่วนเกินครึ่ง ยกเว้นปลายภาค) · ตรวจ/แก้ไขได้ แล้วกด “บันทึกคะแนน”');
  }

  // คะแนนที่ "เกินครึ่ง" ของคะแนนเต็ม (อย่างน้อย floor(max/2)+1)
  function overHalf(max: number): number { return max > 0 ? Math.min(max, Math.floor(max / 2) + 1) : 0; }

  // สุ่มค่าคงที่ (deterministic) จาก seed → ทำให้แต่ละคน/หน่วยได้ค่าต่างกัน ไม่ซ้ำ
  function hashStr(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // ขยับค่ารอบ ๆ base แบบสุ่มเล็กน้อย (คงที่ต่อ seed) ภายในช่วง [min, max]
  function jitterVal(val: number, min: number, max: number, seed: string): number {
    val = Math.min(max, Math.max(min, val));
    const range = max - min;
    if (range <= 0) return val;
    const spread = Math.max(1, Math.round(range * 0.3));
    const up = Math.min(spread, max - val);
    const down = Math.min(spread, val - min);
    const span = up + down;
    if (span <= 0) return val;
    const offset = (hashStr(seed) % (span + 1)) - down; // -down..+up
    return Math.min(max, Math.max(min, val + offset));
  }

  // แบ่ง total ลง K/P/A ตามสัดส่วนคะแนนเต็ม + สุ่มเล็กน้อย ให้แต่ละช่อง ≥ 1 (กัน 0) และ ≤ เต็ม
  function splitKPAVaried(u: Unit, totalRaw: number, seed: string): KPA {
    const res: KPA = { k: 0, p: 0, a: 0 };
    const keys = KPA_KEYS.filter((key) => u[key] > 0);
    const total = Math.min(Math.max(0, totalRaw), u.k + u.p + u.a);
    if (total <= 0 || keys.length === 0) return res;

    // คะแนนน้อยกว่าจำนวนช่อง → ให้ช่องที่เต็มมากสุดก่อน
    if (total < keys.length) {
      const order = [...keys].sort((a, b) => u[b] - u[a]);
      for (let i = 0; i < total; i++) res[order[i]] = 1;
      return res;
    }

    const sumMax = keys.reduce((s, key) => s + u[key], 0);
    let assigned = 0;
    for (const key of keys) {
      const prop = total * (u[key] / sumMax);
      const jit = (hashStr(seed + key) % 3) - 1; // -1, 0, +1
      const v = Math.min(u[key], Math.max(1, Math.round(prop) + jit));
      res[key] = v; assigned += v;
    }
    // ปรับผลรวมให้เท่ากับ total พอดี (ไล่จากช่องเต็มมากสุด)
    const order = [...keys].sort((a, b) => u[b] - u[a]);
    let diff = total - assigned;
    let guard = 0;
    while (diff !== 0 && guard++ < 200) {
      let changed = false;
      for (const key of order) {
        if (diff === 0) break;
        if (diff > 0 && res[key] < u[key]) { res[key]++; diff--; changed = true; }
        else if (diff < 0 && res[key] > 1) { res[key]--; diff++; changed = true; }
      }
      if (!changed) break;
    }
    return res;
  }

  // ลดคะแนนหน่วยลง `take` แต้ม โดยหักจากช่องที่มีคะแนนมากสุดก่อน (คงผลรวม = เดิม-take)
  function reduceUnit(kpa: KPA, take: number): KPA {
    const r: KPA = { ...kpa };
    for (let n = 0; n < take; n++) {
      const key = KPA_KEYS.reduce((m, c) => (r[c] > r[m] ? c : m), 'k' as keyof KPA);
      if (r[key] > 0) r[key]--; else break;
    }
    return r;
  }

  // ป้องกัน ร: สำหรับคนที่ติด ร (ปลายภาค = 0) ดึงคะแนนจากหน่วยต่างๆ (โดยหน่วยนั้น
  // ห้ามต่ำกว่าครึ่ง) มาเติมปลายภาคให้เป็น "5 เท่านั้น" เพื่อให้พ้น ร.
  function preventIncomplete() {
    const finalMax = examCfg.final;
    if (finalMax <= 0) { setMsg('งานนี้ไม่มีคะแนนปลายภาค — ใช้ปุ่มนี้ไม่ได้'); return; }
    const target = Math.min(finalMax, 5); // ปลายภาค = 5 (หรือคะแนนเต็มถ้าน้อยกว่า 5)
    if (!confirm(`ป้องกัน ร: ตั้งปลายภาคของคนที่ติด ร ให้เป็น ${target} โดยดึงคะแนนจากหน่วยต่างๆ (แต่ละหน่วยไม่ต่ำกว่าครึ่ง)?`)) return;

    const nextScores: ScoreMap = {};
    const nextExams: ExamMap = {};
    let fixed = 0;
    let shortAny = false;

    for (const r of rows) {
      const uv = units.map((u) => {
        const s = scores[r.uid]?.[u.id];
        return { k: s?.k ?? 0, p: s?.p ?? 0, a: s?.a ?? 0 };
      });
      const ev: Exam = { midterm: exams[r.uid]?.midterm ?? 0, final: exams[r.uid]?.final ?? 0 };

      if (ev.final <= 0) { // ติด ร
        let need = target - ev.final;
        // ผู้ให้ = หน่วยที่มีส่วนเกินเหนือ "ครึ่ง" (ceil(max/2)) — ดึงจากหน่วยส่วนเกินมากสุดก่อน
        const donors = units
          .map((u, i) => {
            const total = uv[i].k + uv[i].p + uv[i].a;
            return { i, surplus: Math.max(0, total - Math.ceil(unitMax(u) / 2)) };
          })
          .filter((d) => d.surplus > 0)
          .sort((a, b) => b.surplus - a.surplus);

        for (const d of donors) {
          if (need <= 0) break;
          const take = Math.min(d.surplus, need);
          uv[d.i] = reduceUnit(uv[d.i], take);
          need -= take;
        }
        if (need > 0) shortAny = true; // ส่วนเกินไม่พอ — เติมให้ครบโดยไม่ลดหน่วยต่ำกว่าครึ่ง
        ev.final = target; // ปลายภาคเป็น 5 เท่านั้น
        fixed++;
      }

      nextScores[r.uid] = {};
      units.forEach((u, i) => { nextScores[r.uid][u.id] = uv[i]; });
      nextExams[r.uid] = ev;
    }

    setScores(nextScores);
    setExams(nextExams);
    setMsg(fixed === 0
      ? 'ไม่มีใครติด ร (ปลายภาคเป็น 0)'
      : `ป้องกัน ร แล้ว ${fixed} คน — ปลายภาค = ${target}${shortAny ? ' · บางคนคะแนนส่วนเกินไม่พอ เติมให้ครบโดยหน่วยไม่ต่ำกว่าครึ่ง' : ''} · ตรวจ/แก้ไขได้ แล้วกด “บันทึกคะแนน”`);
  }

  async function saveScores() {
    setSavingScores(true); setMsg(null);
    try {
      const url = subjectId ? `/api/teacher/grades?subject=${subjectId}` : '/api/teacher/grades';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores, exams }),
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
    header.push(`กลางภาค (${examCfg.midterm})`, `ปลายภาค (${examCfg.final})`);
    header.push('คะแนนรวม', 'คะแนนเต็ม', 'ร้อยละ', 'เกรด');

    const aoa: (string | number)[][] = [header];
    for (const r of visible) {
      const line: (string | number)[] = [r.studentCode, r.name, r.classId];
      for (const u of units) {
        const kpa = scores[r.uid]?.[u.id];
        line.push(kpa?.k ?? 0, kpa?.p ?? 0, kpa?.a ?? 0);
      }
      const e = exams[r.uid];
      line.push(e?.midterm ?? 0, e?.final ?? 0);
      const total = rowTotal(r.uid);
      const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 10000) / 100 : 0;
      line.push(total, maxTotal, pct, isIncomplete(r.uid) ? 'ร' : gradeOf(pct));
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
              <button onClick={saveConfig} disabled={savingCfg || overLimit}
                title={overLimit ? 'คะแนนเต็มรวมเกิน 100' : undefined}
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
                <div className="mt-2">
                  <AssignmentPicker
                    options={assignmentOpts}
                    selected={u.assignmentIds ?? []}
                    onChange={(ids) => updateUnit(u.id, { assignmentIds: ids })}
                    label="ผูกใบงานของหน่วยนี้"
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-slate-600">
                  รวม {u.k + u.p + u.a} · {unitMatched[u.id] ? `เกลี่ยจากงาน ${unitMatched[u.id]} ชิ้น` : 'ยังไม่ผูกงาน (ใช้ค่าเฉลี่ยรวม)'}
                </p>
              </div>
            ))}
          </div>

          {/* Midterm + final: full marks + bound assignments */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {EXAM_KEYS.map((key) => (
              <div key={key} className="rounded-xl border border-amber-900/40 bg-slate-950/40 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-amber-300">{EXAM_LABEL[key]}</span>
                  <span className="text-[10px] text-slate-500">คะแนนเต็ม</span>
                  <input
                    type="number" min={0} value={examCfg[key]}
                    onChange={(e) => setExamCfg((c) => ({ ...c, [key]: Math.max(0, Number(e.target.value)) }))}
                    className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-center text-xs text-slate-100"
                  />
                </div>
                <AssignmentPicker
                  options={assignmentOpts}
                  selected={key === 'midterm' ? midtermAssignments : finalAssignments}
                  onChange={(ids) => key === 'midterm' ? setMidtermAssignments(ids) : setFinalAssignments(ids)}
                  label={`ผูกงานสำหรับ${EXAM_LABEL[key]}`}
                />
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500 flex-1 min-w-[200px]">
              💡 ผูกใบงาน/แบบทดสอบเข้ากับแต่ละหน่วย (และกลางภาค/ปลายภาค) แล้วกด <strong className="text-slate-300">เกลี่ยคะแนนอัตโนมัติ</strong> — ระบบจะเฉลี่ยคะแนนงานที่ผูกไว้มาลงช่องให้ ·
              เก็บ (KPA) + กลางภาค + ปลายภาค รวม<strong className="text-slate-300">ต้องไม่เกิน 100</strong>
            </p>
            <div className={`rounded-lg border px-4 py-2 text-sm font-bold ${
              overLimit ? 'border-red-700 bg-red-950/40 text-red-300' : 'border-emerald-800 bg-emerald-950/30 text-emerald-300'
            }`}>
              คะแนนเต็มรวม {maxTotal}/100
              {overLimit && <span className="ml-2 text-xs font-normal">⚠ เกิน 100 — ลดคะแนนก่อนบันทึก</span>}
            </div>
          </div>
        </section>

        {/* ── Action bar ── */}
        <div className="sticky top-[68px] z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/95 px-4 py-2.5 backdrop-blur-sm">
          <span className="text-xs text-slate-400">{msg ?? `${visible.length} นักเรียน · คะแนนเต็มรวม ${maxTotal}`}</span>
          <div className="flex flex-wrap gap-2">
            <button onClick={autoDistribute}
              className="rounded-lg border border-purple-700 bg-purple-950/40 px-4 py-2 text-sm font-semibold text-purple-300 hover:border-purple-500">
              ⚖️ เกลี่ยคะแนนอัตโนมัติ
            </button>
            <button onClick={distributeAllUnits}
              title="เกลี่ยคะแนนรวมของทุกหน่วย+กลางภาค (ยกเว้นปลายภาค) ให้ทุกส่วนเกินครึ่งเท่าที่คะแนนพอ"
              className="rounded-lg border border-fuchsia-700 bg-fuchsia-950/40 px-4 py-2 text-sm font-semibold text-fuchsia-300 hover:border-fuchsia-500">
              🔀 เกลี่ยคะแนนเข้าทุกหน่วย
            </button>
            <button onClick={preventIncomplete}
              title="คนที่ติด ร (ปลายภาค=0) ดึงคะแนนจากหน่วย (ไม่ต่ำกว่าครึ่ง) มาเติมปลายภาคให้เป็น 5"
              className="rounded-lg border border-rose-700 bg-rose-950/40 px-4 py-2 text-sm font-semibold text-rose-300 hover:border-rose-500">
              🛡 ป้องกัน ร
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
                  <th colSpan={2} className="px-2 py-1.5 text-center text-[11px] font-semibold text-amber-300 border-r border-l border-slate-800">สอบ</th>
                  <th rowSpan={2} className="px-2 py-2 text-center text-[11px] font-semibold text-blue-400 border-l border-slate-800 min-w-[56px]">รวม<br /><span className="text-[9px] text-slate-600">/{maxTotal}</span></th>
                  <th rowSpan={2} className="px-2 py-2 text-center text-[11px] font-semibold text-slate-300 border-l border-slate-800 min-w-[52px]">ร้อยละ</th>
                  <th rowSpan={2} className="px-2 py-2 text-center text-[11px] font-semibold text-emerald-400 border-l border-slate-800 min-w-[52px]">เกรด</th>
                </tr>
                <tr className="bg-slate-900/60 border-b border-slate-800">
                  {units.map((u) => (
                    KPA_KEYS.map((key) => (
                      <th key={u.id + key} className="px-1 py-1 text-center text-[10px] font-bold text-slate-500 border-l border-slate-800/60" title={`${KPA_LABEL[key]} เต็ม ${u[key]}`}>
                        {KPA_LABEL[key]}<span className="text-[8px] text-slate-600">/{u[key]}</span>
                      </th>
                    ))
                  ))}
                  {EXAM_KEYS.map((key) => (
                    <th key={key} className="px-1 py-1 text-center text-[10px] font-bold text-amber-400/80 border-l border-slate-800/60" title={`${EXAM_LABEL[key]} เต็ม ${examCfg[key]}`}>
                      {key === 'midterm' ? 'กลาง' : 'ปลาย'}<span className="text-[8px] text-slate-600">/{examCfg[key]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {visible.map((r, rowIdx) => {
                  const total = rowTotal(r.uid);
                  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                  const incomplete = isIncomplete(r.uid);
                  const grade = incomplete ? 'ร' : gradeOf(pct);
                  const below = incomplete || pct < PASS_THRESHOLD; // ร หรือ ต่ำกว่า 50% → แดง
                  return (
                    <tr key={r.uid} className={rowIdx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/40'}>
                      <td className={`sticky left-0 z-10 px-3 py-1.5 text-slate-400 border-r border-slate-800 ${rowIdx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/60'}`}>{r.studentCode || '—'}</td>
                      <td className={`sticky left-[100px] z-10 px-3 py-1.5 border-r border-slate-800 ${rowIdx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/60'}`}>
                        <span className="font-medium text-slate-200">{r.name || '—'}</span>
                      </td>
                      <td className="px-2 py-1.5 text-center text-slate-400 border-r border-slate-800">{r.classId}</td>
                      {units.map((u) => {
                        const uBelow = unitBelowHalf(r.uid, u); // หน่วยไม่ถึงครึ่ง → แดง
                        return KPA_KEYS.map((key) => (
                          <td key={u.id + key} className={`px-0.5 py-1 border-l border-slate-800/50 ${uBelow ? 'bg-red-950/40' : ''}`}>
                            <input
                              type="number" min={0} max={u[key]}
                              value={cellVal(r.uid, u.id, key)}
                              onChange={(e) => setCell(r.uid, u.id, key, e.target.value, u[key])}
                              className={`w-11 rounded border px-1 py-1 text-center text-xs focus:outline-none ${
                                uBelow ? 'border-red-800 bg-red-950/40 text-red-200 focus:border-red-500'
                                       : 'border-slate-800 bg-slate-900 text-slate-100 focus:border-blue-500'
                              }`}
                            />
                          </td>
                        ));
                      })}
                      {EXAM_KEYS.map((key) => (
                        <td key={key} className="px-0.5 py-1 border-l border-slate-800/50">
                          <input
                            type="number" min={0} max={examCfg[key]}
                            value={examVal(r.uid, key)}
                            onChange={(e) => setExam(r.uid, key, e.target.value, examCfg[key])}
                            className="w-11 rounded border border-amber-900/50 bg-slate-900 px-1 py-1 text-center text-xs text-amber-100 focus:border-amber-500 focus:outline-none"
                          />
                        </td>
                      ))}
                      <td className={`px-2 py-1.5 text-center font-bold border-l border-slate-800 ${below ? 'text-red-400 bg-red-950/30' : 'text-blue-300'}`}>{total}</td>
                      <td className={`px-2 py-1.5 text-center font-semibold border-l border-slate-800 ${below ? 'text-red-400 bg-red-950/30' : 'text-slate-300'}`}>{pct.toFixed(1)}%</td>
                      <td className={`px-2 py-1.5 text-center font-bold border-l border-slate-800 ${below ? 'bg-red-950/30' : ''} ${gradeColor(grade)}`}>{grade}</td>
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

function AssignmentPicker({
  options, selected, onChange, label,
}: {
  options: AssignmentOpt[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label: string;
}) {
  const sel = new Set(selected);
  function toggle(id: string) {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next]);
  }
  return (
    <details className="rounded-lg border border-slate-700 bg-slate-800/60">
      <summary className="cursor-pointer select-none px-2 py-1 text-[10px] text-slate-300">
        📎 {label} <span className="text-blue-300">({selected.length})</span>
      </summary>
      <div className="max-h-40 space-y-0.5 overflow-y-auto p-1.5">
        {options.length === 0 ? (
          <p className="px-1 py-2 text-[10px] text-slate-600">ยังไม่มีใบงาน/แบบทดสอบในวิชานี้</p>
        ) : options.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 hover:bg-slate-700/40">
            <input type="checkbox" checked={sel.has(o.id)} onChange={() => toggle(o.id)} className="mt-0.5 shrink-0" />
            <span className="text-[10px] leading-tight text-slate-300">
              {o.contentType === 'quiz' ? '🧪 ' : '📝 '}{o.title}
              {o.unit && <span className="text-slate-600"> · {o.unit}</span>}
            </span>
          </label>
        ))}
      </div>
    </details>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-blue-400" />
    </div>
  );
}
