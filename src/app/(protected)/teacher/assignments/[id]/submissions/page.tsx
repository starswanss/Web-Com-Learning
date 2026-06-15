'use client';

import { useEffect, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { driveThumb } from '@/lib/img';

interface Submission {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  content?: string;
  driveWebViewLink?: string;
  answers?: Record<string, string | string[]>;
  score?: number;
  feedback?: string;
  plagiarismSuspicion?: number;
  tabSwitchCount?: number;
  burstInsertCount?: number;
  status: string;
  submittedAt?: { _seconds: number };
  reviewedAt?: { _seconds: number };
}

interface AssignmentBlock {
  id: string;
  type: string;
  text?: string;
  question?: string;
  options?: string[];
  url?: string;
  caption?: string;
  height?: number;
  title?: string;
  body?: string;
  icon?: string;
  color?: string;
}

interface Assignment {
  id: string;
  title: string;
  description: string;
  contentType?: string;
  dueDate?: { _seconds: number };
  blocks?: AssignmentBlock[];
  isGroupWork?: boolean;
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400 border-emerald-700 bg-emerald-950/40';
  if (score >= 60) return 'text-amber-400 border-amber-700 bg-amber-950/40';
  if (score >= 40) return 'text-orange-400 border-orange-700 bg-orange-950/40';
  return 'text-red-400 border-red-700 bg-red-950/40';
}

function statusBadge(status: string) {
  if (status === 'reviewed') return 'bg-emerald-950/60 text-emerald-400 border-emerald-800';
  if (status === 'graded')   return 'bg-blue-950/60 text-blue-400 border-blue-800';
  if (status === 'submitted') return 'bg-amber-950/60 text-amber-400 border-amber-800';
  return 'bg-slate-800 text-slate-500 border-slate-700';
}

function statusLabel(status: string) {
  if (status === 'reviewed')  return 'ตรวจแล้ว';
  if (status === 'graded')    return 'รอบันทึกคะแนน';
  if (status === 'submitted') return 'รอตรวจ';
  return 'ยังไม่ส่ง';
}

function exportCSV(assignment: Assignment | null, submissions: Submission[]) {
  const header = ['ชื่อนักเรียน', 'ห้อง', 'คะแนน', 'สถานะ', 'Feedback', 'วันที่ส่ง'];
  const rows = submissions.map((s) => [
    s.studentName,
    s.classId,
    s.score !== undefined ? String(s.score) : '',
    statusLabel(s.status),
    (s.feedback ?? '').replace(/,/g, '，'),
    s.submittedAt ? new Date(s.submittedAt._seconds * 1000).toLocaleDateString('th-TH') : '',
  ]);
  const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `คะแนน_${assignment?.title ?? 'assignment'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoSubId = searchParams.get('sub');

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [classStats, setClassStats] = useState<{ classId: string; submitted: number; total: number }[]>([]);
  const [fetching, setFetching] = useState(true);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [quickGrading, setQuickGrading] = useState(false);
  const [batchGrading, setBatchGrading] = useState(false);
  const [autoGrading, setAutoGrading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [viewAll, setViewAll] = useState(false);

  // Review-all mode: centralised score/feedback drafts so "save all" can grade
  // everyone at once.
  const [gradeDraft, setGradeDraft] = useState<Record<string, { score: string; feedback: string }>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [saveAllMsg, setSaveAllMsg] = useState<string | null>(null);

  function updateSubmission(updated: Submission) {
    setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    if (selected?.id === updated.id) setSelected(updated);
  }

  // Seed drafts for any submission not yet edited (without clobbering edits).
  useEffect(() => {
    if (!viewAll) return;
    setGradeDraft((prev) => {
      const next = { ...prev };
      for (const s of submissions) {
        if (!(s.id in next)) {
          next[s.id] = { score: s.score != null ? String(s.score) : '', feedback: s.feedback ?? '' };
        }
      }
      return next;
    });
  }, [viewAll, submissions]);

  function setDraft(id: string, patch: Partial<{ score: string; feedback: string }>) {
    setGradeDraft((d) => {
      const cur = d[id] ?? { score: '', feedback: '' };
      return { ...d, [id]: { ...cur, ...patch } };
    });
  }

  // Grade one submission from its draft. Returns the updated Submission on
  // success, or null on validation/network failure.
  async function gradeFromDraft(sub: Submission): Promise<Submission | null> {
    const d = gradeDraft[sub.id] ?? { score: '', feedback: '' };
    const parsed = Number(d.score);
    if (d.score === '' || isNaN(parsed) || parsed < 0 || parsed > 100) {
      setRowErr((e) => ({ ...e, [sub.id]: 'คะแนน 0–100' }));
      return null;
    }
    setRowErr((e) => { const n = { ...e }; delete n[sub.id]; return n; });
    try {
      const res = await fetch(`/api/teacher/grade/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: parsed, feedback: d.feedback }),
      });
      if (!res.ok) throw new Error();
      return { ...sub, score: parsed, feedback: d.feedback, status: 'reviewed' };
    } catch {
      setRowErr((e) => ({ ...e, [sub.id]: 'บันทึกไม่สำเร็จ' }));
      return null;
    }
  }

  async function saveOne(sub: Submission) {
    setSavingIds((s) => new Set(s).add(sub.id));
    const updated = await gradeFromDraft(sub);
    if (updated) {
      updateSubmission(updated);
      setSavedIds((s) => new Set(s).add(sub.id));
      setTimeout(() => setSavedIds((s) => { const n = new Set(s); n.delete(sub.id); return n; }), 2000);
    }
    setSavingIds((s) => { const n = new Set(s); n.delete(sub.id); return n; });
  }

  async function saveAll(targets: Submission[]) {
    // Only rows with a filled-in score are graded; blanks are skipped.
    const toGrade = targets.filter((s) => (gradeDraft[s.id]?.score ?? '') !== '');
    if (toGrade.length === 0) { setSaveAllMsg('ยังไม่มีคะแนนที่จะบันทึก'); return; }
    setSavingAll(true); setSaveAllMsg(null);
    setSavingIds(new Set(toGrade.map((s) => s.id)));

    const results = await Promise.all(toGrade.map((s) => gradeFromDraft(s)));
    const updates = results.filter((r): r is Submission => r !== null);
    if (updates.length > 0) {
      const map = new Map(updates.map((u) => [u.id, u]));
      setSubmissions((prev) => prev.map((s) => map.get(s.id) ?? s));
    }
    const failed = toGrade.length - updates.length;
    setSaveAllMsg(`บันทึกสำเร็จ ${updates.length} คน${failed > 0 ? ` · ไม่สำเร็จ ${failed}` : ''}`);
    setSavingIds(new Set());
    setSavingAll(false);
  }

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher' || !id) return;
    fetch(`/api/teacher/submissions/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setAssignment(data.assignment ?? null);
        const subs: Submission[] = Array.isArray(data.submissions) ? data.submissions : [];
        setSubmissions(subs);
        setClassStats(Array.isArray(data.classStats) ? data.classStats : []);
        // Auto-open submission from ?sub= query param (e.g. coming from Gradebook)
        if (autoSubId) {
          const target = subs.find((s) => s.id === autoSubId);
          if (target) {
            setSelected(target);
            setScore(target.score !== undefined ? String(target.score) : '');
            setFeedback(target.feedback ?? '');
          }
        }
      })
      .finally(() => setFetching(false));
  }, [profile, id]);

  function openSubmission(sub: Submission) {
    setSelected(sub);
    setScore(sub.score !== undefined ? String(sub.score) : '');
    setFeedback(sub.feedback ?? '');
    setSaveError(null);
    setBatchResult(null);
  }

  async function handleSave() {
    if (!selected) return;
    const parsed = Number(score);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) { setSaveError('คะแนนต้องอยู่ระหว่าง 0–100'); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch(`/api/teacher/grade/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: parsed, feedback }),
      });
      if (!res.ok) throw new Error();
      const updated: Submission = { ...selected, score: parsed, feedback, status: 'reviewed' };
      setSubmissions((prev) => prev.map((s) => (s.id === selected.id ? updated : s)));
      setSelected(updated);
    } catch { setSaveError('บันทึกไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setSaving(false); }
  }

  async function handleQuickGrade() {
    if (!selected) return;
    setQuickGrading(true); setSaveError(null);
    try {
      const res = await fetch(`/api/teacher/quick-grade/${selected.id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400) { setSaveError('ไม่มีเนื้อหาที่จะตรวจ (งานนี้ไม่มีคำตอบ)'); return; }
        if (res.status === 429) { setSaveError(`โควต้า AI เต็มชั่วคราว: ${data.detail ?? 'กรุณาลองใหม่ใน 1 นาที'}`); return; }
        setSaveError(`ตรวจ AI ไม่สำเร็จ: ${data.detail ?? data.error ?? 'กรุณาลองใหม่'}`);
        return;
      }
      const updated: Submission = { ...selected, score: data.score, feedback: data.feedback, plagiarismSuspicion: data.plagiarismSuspicion, status: 'graded' };
      setSubmissions((prev) => prev.map((s) => (s.id === selected.id ? updated : s)));
      setSelected(updated);
      setScore(String(data.score));
      setFeedback(data.feedback);
    } catch { setSaveError('ตรวจ AI ไม่สำเร็จ: ไม่สามารถเชื่อมต่อได้'); }
    finally { setQuickGrading(false); }
  }

  async function handleApproveAll() {
    setApproving(true); setBatchResult(null);
    try {
      const res = await fetch(`/api/teacher/approve-all/${id}`, { method: 'POST' });
      const data = await res.json();
      setBatchResult(`บันทึกคะแนน AI สำเร็จ ${data.approved} คน`);
      setSubmissions((prev) => prev.map((s) => s.status === 'graded' ? { ...s, status: 'reviewed' } : s));
      if (selected?.status === 'graded') setSelected((prev) => prev ? { ...prev, status: 'reviewed' } : prev);
    } catch { setBatchResult('ไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setApproving(false); }
  }

  async function handleDeleteSubmission(subId: string) {
    if (!confirm('ลบงานของนักเรียนคนนี้? นักเรียนจะสามารถส่งงานใหม่ได้')) return;
    setDeleting(subId);
    try {
      await fetch(`/api/teacher/submission/${subId}`, { method: 'DELETE' });
      setSubmissions((prev) => prev.filter((s) => s.id !== subId));
      if (selected?.id === subId) setSelected(null);
    } finally {
      setDeleting(null);
    }
  }

  async function handleAutoGrade() {
    setAutoGrading(true); setBatchResult(null);
    try {
      const res = await fetch(`/api/teacher/auto-grade/${id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setBatchResult(`ตรวจเฉลยไม่สำเร็จ: ${data.error ?? 'กรุณาลองใหม่'}`); return; }
      setBatchResult(`ตรวจเฉลยสำเร็จ ${data.graded} คน${data.errors ? ` · ผิดพลาด ${data.errors}` : ''}`);
      const reload = await fetch(`/api/teacher/submissions/${id}`).then((r) => r.json());
      setSubmissions(Array.isArray(reload.submissions) ? reload.submissions : []);
      if (selected) {
        const refreshed = reload.submissions?.find((s: Submission) => s.id === selected.id);
        if (refreshed) { setSelected(refreshed); setScore(String(refreshed.score ?? '')); setFeedback(refreshed.feedback ?? ''); }
      }
    } catch { setBatchResult('ตรวจเฉลยไม่สำเร็จ: ไม่สามารถเชื่อมต่อได้'); }
    finally { setAutoGrading(false); }
  }

  async function handleBatchGrade() {
    setBatchGrading(true); setBatchResult(null);
    try {
      const res = await fetch(`/api/teacher/batch-grade/${id}`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBatchResult(`ตรวจสำเร็จ ${data.graded} คน, ข้าม ${data.skipped} คน${data.errors ? `, ผิดพลาด ${data.errors} คน` : ''}`);
      // Reload submissions to reflect new scores
      const reload = await fetch(`/api/teacher/submissions/${id}`).then((r) => r.json());
      setSubmissions(Array.isArray(reload.submissions) ? reload.submissions : []);
      if (selected) {
        const refreshed = reload.submissions?.find((s: Submission) => s.id === selected.id);
        if (refreshed) { setSelected(refreshed); setScore(String(refreshed.score ?? '')); setFeedback(refreshed.feedback ?? ''); }
      }
    } catch { setBatchResult('ตรวจ AI ไม่สำเร็จ: ไม่สามารถเชื่อมต่อได้'); }
    finally { setBatchGrading(false); }
  }

  if (loading || !profile) return <Spinner />;

  // Submissions shown, narrowed to the clicked class.
  const visible = classFilter ? submissions.filter((s) => s.classId === classFilter) : submissions;

  const pendingCount  = visible.filter((s) => s.status === 'submitted').length;
  const gradedCount   = visible.filter((s) => s.status === 'graded').length;
  const reviewedCount = visible.filter((s) => s.status === 'reviewed').length;

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-4 flex-wrap">
          <Link href="/teacher" className="text-sm text-slate-400 hover:text-slate-200">← ย้อนกลับ</Link>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-100">
              {assignment ? assignment.title : 'กำลังโหลด…'}
            </h1>
            <p className="text-xs text-slate-500">
              ตรวจงาน — {submissions.length} การส่ง
              {pendingCount > 0 && ` · รอตรวจ ${pendingCount}`}
              {gradedCount > 0 && ` · รอบันทึก ${gradedCount}`}
              {reviewedCount > 0 && ` · ตรวจแล้ว ${reviewedCount}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {batchResult && (
              <span className="text-xs text-emerald-400">{batchResult}</span>
            )}
            {assignment?.isGroupWork && (
              <Link
                href={`/teacher/assignments/${id}/groups`}
                className="rounded-lg border border-blue-700 bg-blue-950/40 px-3 py-1.5 text-xs text-blue-300 transition-all hover:border-blue-500"
              >
                👥 จัดกลุ่ม
              </Link>
            )}
            {assignment?.isGroupWork && (
              <Link
                href={`/teacher/assignments/${id}/group-submissions`}
                className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-3 py-1.5 text-xs text-emerald-300 transition-all hover:border-emerald-500"
              >
                📋 งานกลุ่ม
              </Link>
            )}
            {assignment?.contentType === 'quiz' && (
              <button
                onClick={handleAutoGrade}
                disabled={autoGrading || pendingCount === 0}
                className="rounded-lg border border-teal-700 bg-teal-950/40 px-3 py-1.5 text-xs text-teal-300 transition-all hover:border-teal-500 disabled:opacity-40"
              >
                {autoGrading ? 'กำลังตรวจเฉลย…' : `✅ ตรวจเฉลย (${pendingCount})`}
              </button>
            )}
            <button
              onClick={handleApproveAll}
              disabled={approving || submissions.filter((s) => s.status === 'graded').length === 0}
              className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-1.5 text-xs text-emerald-300 transition-all hover:border-emerald-600 disabled:opacity-40"
            >
              {approving ? '…' : `✓ บันทึกคะแนน AI (${submissions.filter((s) => s.status === 'graded').length})`}
            </button>
            <button
              onClick={handleBatchGrade}
              disabled={batchGrading || pendingCount === 0}
              className="rounded-lg border border-purple-700 bg-purple-950/40 px-3 py-1.5 text-xs text-purple-300 transition-all hover:border-purple-500 disabled:opacity-40"
            >
              {batchGrading ? 'กำลังตรวจ…' : `ตรวจ AI (${pendingCount} รอตรวจ)`}
            </button>
            <button
              onClick={() => setViewAll((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                viewAll
                  ? 'border-blue-600 bg-blue-950/50 text-blue-300'
                  : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500'
              }`}
            >
              {viewAll ? '📋 ตรวจทีละคน' : '📑 ดูงานทั้งหมด'}
            </button>
            <button
              onClick={() => exportCSV(assignment, submissions)}
              disabled={submissions.length === 0}
              className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition-all hover:border-slate-500 disabled:opacity-40"
            >
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Per-class submission cards — click to filter the list by class */}
        {!fetching && classStats.length > 0 && (
          <div className="mb-4 flex flex-wrap items-stretch gap-2">
            {/* "ทั้งหมด" — clears the filter */}
            <button
              onClick={() => setClassFilter(null)}
              className={`flex items-center rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                classFilter === null
                  ? 'border-blue-600 bg-blue-950/50 text-blue-300 ring-1 ring-blue-600/40'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
              }`}
            >
              ทั้งหมด
            </button>
            {classStats.map((cs) => {
              const pct = cs.total > 0 ? Math.round((cs.submitted / cs.total) * 100) : 0;
              const color = pct >= 100 ? 'border-emerald-800 bg-emerald-950/40 text-emerald-400'
                : pct >= 50 ? 'border-amber-800 bg-amber-950/40 text-amber-400'
                : 'border-red-900 bg-red-950/40 text-red-400';
              const active = classFilter === cs.classId;
              return (
                <button
                  key={cs.classId}
                  onClick={() => setClassFilter(active ? null : cs.classId)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${color} ${
                    active ? 'ring-2 ring-blue-500/70' : 'hover:brightness-125'
                  }`}
                >
                  <span className="text-xs font-bold">{cs.classId}</span>
                  <span className="text-xs opacity-80">
                    ส่ง {cs.submitted}{cs.total > 0 ? `/${cs.total}` : ''} คน
                  </span>
                  {cs.total > 0 && cs.submitted < cs.total && (
                    <span className="text-[10px] opacity-60">ค้าง {cs.total - cs.submitted}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {fetching ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : viewAll ? (
          /* ── Review-all mode: every student's work with an inline score box ── */
          visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 py-16 text-center">
              <p className="text-sm text-slate-500">
                {classFilter ? `ยังไม่มีการส่งงานจากห้อง ${classFilter}` : 'ยังไม่มีการส่งงาน'}
              </p>
            </div>
          ) : (() => {
            // Pending (รอตรวจ) first, then รอบันทึก, then ตรวจแล้ว
            const order: Record<string, number> = { submitted: 0, graded: 1, reviewed: 2 };
            const groups = [
              { key: 'submitted', label: 'รอตรวจ', color: 'amber' },
              { key: 'graded', label: 'รอบันทึกคะแนน', color: 'blue' },
              { key: 'reviewed', label: 'ตรวจแล้ว', color: 'emerald' },
            ];
            const byStatus = (st: string) => visible.filter((s) => s.status === st);
            const ungrouped = visible.filter((s) => !(s.status in order));
            return (
              <div className="space-y-5">
                {/* Save-all bar */}
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/95 px-4 py-2.5 backdrop-blur-sm">
                  <span className="text-xs text-slate-400">
                    {saveAllMsg ?? `กรอกคะแนนแล้วกดบันทึกทั้งหมด — ${visible.length} คน`}
                  </span>
                  <button
                    onClick={() => saveAll(visible)}
                    disabled={savingAll}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95"
                  >
                    {savingAll ? 'กำลังบันทึก…' : '💾 บันทึกคะแนนทั้งหมด'}
                  </button>
                </div>

                {groups.map((g) => {
                  const items = byStatus(g.key);
                  if (items.length === 0) return null;
                  return (
                    <div key={g.key} className="space-y-3">
                      <div className={`flex items-center gap-2 border-b pb-1.5 ${GROUP_COLORS[g.color].divider}`}>
                        <span className={`text-[11px] font-bold uppercase tracking-wider ${GROUP_COLORS[g.color].label}`}>{g.label}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${GROUP_COLORS[g.color].count}`}>{items.length}</span>
                      </div>
                      {items.map((sub) => (
                        <GradeAllRow
                          key={sub.id} sub={sub} assignment={assignment}
                          draft={gradeDraft[sub.id] ?? { score: '', feedback: '' }}
                          onChange={(field, value) => setDraft(sub.id, { [field]: value })}
                          onSave={() => saveOne(sub)}
                          saving={savingIds.has(sub.id)} saved={savedIds.has(sub.id)} err={rowErr[sub.id]}
                        />
                      ))}
                    </div>
                  );
                })}
                {ungrouped.map((sub) => (
                  <GradeAllRow
                    key={sub.id} sub={sub} assignment={assignment}
                    draft={gradeDraft[sub.id] ?? { score: '', feedback: '' }}
                    onChange={(field, value) => setDraft(sub.id, { [field]: value })}
                    onSave={() => saveOne(sub)}
                    saving={savingIds.has(sub.id)} saved={savedIds.has(sub.id)} err={rowErr[sub.id]}
                  />
                ))}
              </div>
            );
          })()
        ) : (
          <div className="flex gap-4 h-[calc(100vh-112px)]">
            {/* Submission list */}
            <div className="w-72 shrink-0 overflow-y-auto pr-1">
              {visible.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center">
                  <p className="text-sm text-slate-500">
                    {classFilter ? `ยังไม่มีการส่งงานจากห้อง ${classFilter}` : 'ยังไม่มีการส่งงาน'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* รอตรวจ */}
                  <SubmissionGroup
                    label="รอตรวจ"
                    color="amber"
                    items={visible.filter((s) => s.status === 'submitted')}
                    selected={selected}
                    deleting={deleting}
                    onOpen={openSubmission}
                    onDelete={handleDeleteSubmission}
                  />

                  {/* รอบันทึกคะแนน */}
                  <SubmissionGroup
                    label="รอบันทึกคะแนน"
                    color="blue"
                    items={visible.filter((s) => s.status === 'graded')}
                    selected={selected}
                    deleting={deleting}
                    onOpen={openSubmission}
                    onDelete={handleDeleteSubmission}
                  />

                  {/* ตรวจแล้ว */}
                  <SubmissionGroup
                    label="ตรวจแล้ว"
                    color="emerald"
                    items={visible.filter((s) => s.status === 'reviewed')}
                    selected={selected}
                    deleting={deleting}
                    onOpen={openSubmission}
                    onDelete={handleDeleteSubmission}
                  />
                </div>
              )}
            </div>

            {/* Detail panel */}
            <div className="flex-1 min-w-0 overflow-y-auto">
              {selected ? (
                <div className="space-y-4">
                  {/* Student info */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <p className="font-medium text-slate-100">{selected.studentName}</p>
                        <p className="text-sm text-slate-500">{selected.classId}</p>
                        {selected.submittedAt && (
                          <p className="mt-1 text-xs text-slate-600">
                            ส่งเมื่อ {new Date(selected.submittedAt._seconds * 1000).toLocaleString('th-TH', {
                              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        )}
                        {(selected.tabSwitchCount ?? 0) > 0 && (
                          <p className="mt-1 text-xs text-orange-400">🔍 ออกจากหน้านี้ระหว่างทำ {selected.tabSwitchCount} ครั้ง</p>
                        )}
                        {(selected.burstInsertCount ?? 0) > 0 && (
                          <p className="mt-1 text-xs text-amber-400">
                            🎤 ป้อนข้อความเป็นก้อน {selected.burstInsertCount} ครั้ง
                            <span className="ml-1 text-slate-500">(อาจมาจากเสียง/swipe — โปรดพิจารณา)</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs ${statusBadge(selected.status)}`}>
                          {statusLabel(selected.status)}
                        </span>
                        <button
                          onClick={handleQuickGrade}
                          disabled={quickGrading}
                          className="rounded-lg border border-blue-700 bg-blue-950/40 px-3 py-1.5 text-xs text-blue-300 transition-all hover:border-blue-500 disabled:opacity-40"
                        >
                          {quickGrading ? '…' : 'ตรวจเร็ว AI'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Plagiarism alert */}
                  {(selected.plagiarismSuspicion ?? 0) > 60 && (
                    <div className="rounded-xl border border-amber-800 bg-amber-950/40 px-4 py-3">
                      <p className="text-sm font-medium text-amber-400">
                        ⚠ ระบบตรวจพบความเสี่ยงการคัดลอก {selected.plagiarismSuspicion}%
                      </p>
                      <p className="mt-1 text-xs text-amber-600">กรุณาตรวจสอบคำตอบอย่างละเอียดก่อนให้คะแนน</p>
                    </div>
                  )}

                  {/* Answer content */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                    <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">คำตอบของนักเรียน</p>
                    {selected.answers && Object.keys(selected.answers).length > 0 ? (
                      <BlockAnswers assignment={assignment} answers={selected.answers} />
                    ) : selected.content ? (
                      <p className="whitespace-pre-wrap text-sm text-slate-300">{selected.content}</p>
                    ) : (
                      <p className="text-sm text-slate-500 italic">ไม่มีคำตอบ</p>
                    )}
                    {selected.driveWebViewLink && (
                      <a href={selected.driveWebViewLink} target="_blank" rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
                        📎 ดูไฟล์แนบ
                      </a>
                    )}
                  </div>

                  {/* AI score display (graded = waiting for teacher to finalize) */}
                  {typeof selected.score === 'number' && selected.status === 'graded' && (
                    <div className={`rounded-2xl border p-5 ${scoreColor(selected.score)}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">คะแนน AI — รอบันทึกคะแนน</p>
                        <span className="text-xl font-bold">{selected.score}/100</span>
                      </div>
                      {selected.feedback && <p className="mt-2 text-sm opacity-80">{selected.feedback}</p>}
                    </div>
                  )}
                  {/* Reviewed score display */}
                  {typeof selected.score === 'number' && selected.status === 'reviewed' && (
                    <div className={`rounded-2xl border p-5 ${scoreColor(selected.score)}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">คะแนนที่บันทึกแล้ว</p>
                        <span className="text-xl font-bold">{selected.score}/100</span>
                      </div>
                      {selected.feedback && <p className="mt-2 text-sm opacity-80">{selected.feedback}</p>}
                    </div>
                  )}

                  {/* Manual grade form */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
                    <p className="text-sm font-medium text-slate-200">ให้คะแนนและ Feedback (Manual)</p>
                    <div>
                      <label className="mb-1.5 block text-xs text-slate-400">คะแนน (0–100)</label>
                      <input type="number" min={0} max={100} value={score}
                        onChange={(e) => setScore(e.target.value)}
                        placeholder="เช่น 85" className="input w-32" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-slate-400">Feedback ให้นักเรียน</label>
                      <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)}
                        rows={4} placeholder="เขียนความคิดเห็นหรือข้อแนะนำ..." className="input resize-none" />
                    </div>
                    {saveError && <p className="text-xs text-red-400">{saveError}</p>}
                    <button onClick={handleSave} disabled={saving}
                      className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95">
                      {saving ? 'กำลังบันทึก…' : 'บันทึกคะแนน'}
                    </button>
                  </div>
                </div>
              ) : assignment?.contentType === 'knowledge' ? (
                <KnowledgePreview assignment={assignment} />
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-800">
                  <p className="text-sm text-slate-500">เลือกนักเรียนเพื่อดูงาน</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const GROUP_COLORS: Record<string, { label: string; count: string; divider: string }> = {
  amber:   { label: 'text-amber-400',   count: 'bg-amber-950/60 border-amber-800 text-amber-400',   divider: 'bg-amber-800/40' },
  blue:    { label: 'text-blue-400',    count: 'bg-blue-950/60 border-blue-800 text-blue-400',       divider: 'bg-blue-800/40' },
  emerald: { label: 'text-emerald-400', count: 'bg-emerald-950/60 border-emerald-800 text-emerald-400', divider: 'bg-emerald-800/40' },
};

function GradeAllRow({
  sub, assignment, draft, onChange, onSave, saving, saved, err,
}: {
  sub: Submission;
  assignment: Assignment | null;
  draft: { score: string; feedback: string };
  onChange: (field: 'score' | 'feedback', value: string) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  err?: string;
}) {
  const score = draft.score;
  const feedback = draft.feedback;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      {/* Student header */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="font-medium text-slate-100">{sub.studentName}</p>
          <p className="text-xs text-slate-500">{sub.classId}</p>
        </div>
        <div className="flex items-center gap-2">
          {(sub.tabSwitchCount ?? 0) > 0 && (
            <span className="text-[11px] text-orange-400">🔍 {sub.tabSwitchCount}</span>
          )}
          {(sub.burstInsertCount ?? 0) > 0 && (
            <span className="text-[11px] text-amber-400">🎤 {sub.burstInsertCount}</span>
          )}
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${statusBadge(sub.status)}`}>
            {statusLabel(sub.status)}
          </span>
        </div>
      </div>

      {/* Answer */}
      <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        {sub.answers && Object.keys(sub.answers).length > 0 ? (
          <BlockAnswers assignment={assignment} answers={sub.answers} />
        ) : sub.content ? (
          <p className="whitespace-pre-wrap text-sm text-slate-300">{sub.content}</p>
        ) : (
          <p className="text-sm text-slate-500 italic">ไม่มีคำตอบ</p>
        )}
        {sub.driveWebViewLink && (
          <a href={sub.driveWebViewLink} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
            📎 ดูไฟล์แนบ
          </a>
        )}
      </div>

      {/* Score + feedback row */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[11px] text-slate-400">คะแนน (0–100)</label>
          <input
            type="number" min={0} max={100} value={score}
            onChange={(e) => onChange('score', e.target.value)}
            placeholder="เช่น 85"
            className="w-24 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[11px] text-slate-400">Feedback</label>
          <input
            type="text" value={feedback}
            onChange={(e) => onChange('feedback', e.target.value)}
            placeholder="ความคิดเห็น (ถ้ามี)"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95"
        >
          {saving ? '…' : saved ? '✓ บันทึกแล้ว' : 'บันทึก'}
        </button>
        {err && <span className="text-xs text-red-400">{err}</span>}
      </div>
    </div>
  );
}

function SubmissionGroup({
  label, color, items, selected, deleting, onOpen, onDelete,
}: {
  label: string;
  color: string;
  items: Submission[];
  selected: Submission | null;
  deleting: string | null;
  onOpen: (s: Submission) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const c = GROUP_COLORS[color] ?? GROUP_COLORS.amber;
  return (
    <div>
      <div className={`mb-2 flex items-center gap-2 px-1 pb-1.5 border-b ${c.divider}`}>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${c.label}`}>{label}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${c.count}`}>{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((sub) => (
          <SubmissionCard
            key={sub.id}
            sub={sub}
            selected={selected}
            deleting={deleting}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function SubmissionCard({
  sub, selected, deleting, onOpen, onDelete,
}: {
  sub: Submission;
  selected: Submission | null;
  deleting: string | null;
  onOpen: (s: Submission) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={`rounded-xl border transition-all ${
      selected?.id === sub.id ? 'border-blue-700 bg-blue-950/30' : 'border-slate-800 bg-slate-900'
    }`}>
      <button
        onClick={() => onOpen(sub)}
        className="w-full p-3 text-left hover:bg-white/5 rounded-t-xl transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-200 truncate">{sub.studentName}</p>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${statusBadge(sub.status)}`}>
            {statusLabel(sub.status)}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{sub.classId}</p>
        {typeof sub.score === 'number' && (
          <p className={`mt-1 text-xs font-semibold ${sub.score >= 60 ? 'text-emerald-400' : 'text-red-400'}`}>
            {sub.score}/100
          </p>
        )}
        {(sub.plagiarismSuspicion ?? 0) > 60 && (
          <p className="mt-1 text-xs text-amber-500">⚠ เสี่ยงคัดลอก {sub.plagiarismSuspicion}%</p>
        )}
        {(sub.tabSwitchCount ?? 0) > 0 && (
          <p className="mt-1 text-xs text-orange-400">🔍 เปลี่ยนแท็บ {sub.tabSwitchCount} ครั้ง</p>
        )}
        {(sub.burstInsertCount ?? 0) > 0 && (
          <p className="mt-1 text-xs text-amber-400">🎤 ป้อนเป็นก้อน {sub.burstInsertCount} ครั้ง</p>
        )}
      </button>
      <div className="border-t border-slate-800 px-3 py-1.5">
        <button
          onClick={() => onDelete(sub.id)}
          disabled={deleting === sub.id}
          className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50 transition-colors"
        >
          {deleting === sub.id ? '…' : 'ลบงาน (ให้ส่งใหม่)'}
        </button>
      </div>
    </div>
  );
}

function BlockAnswers({ assignment, answers }: { assignment: Assignment | null; answers: Record<string, string | string[]> }) {
  if (!assignment?.blocks) {
    return (
      <div className="space-y-3">
        {Object.entries(answers).map(([blockId, answer]) => (
          <div key={blockId}>
            <p className="text-xs text-slate-500 mb-1">{blockId}</p>
            <p className="text-sm text-slate-300">{Array.isArray(answer) ? answer.join(', ') : answer}</p>
          </div>
        ))}
      </div>
    );
  }
  const questionBlocks = (assignment.blocks as AssignmentBlock[]).filter((b) =>
    ['short-answer', 'long-answer', 'multiple-choice', 'checkbox', 'ordering', 'image-upload', 'true-false', 'matching', 'fill-blank'].includes(b.type)
  );
  return (
    <div className="space-y-5">
      {questionBlocks.map((block, i) => {
        const answer = answers[block.id];
        const q = 'question' in block ? (block as { question: string }).question : block.id;
        return (
          <div key={block.id}>
            <p className="text-xs font-medium text-slate-400 mb-1">ข้อ {i + 1}. {q}</p>
            {answer === undefined ? (
              <p className="text-sm text-slate-600 italic">ไม่ได้ตอบ</p>
            ) : block.type === 'image-upload' && typeof answer === 'string' && answer ? (
              <div className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={driveThumb(answer, 800)} alt="คำตอบนักเรียน" className="max-h-64 rounded-xl border border-slate-700 object-contain bg-slate-800/30" />
                <a href={answer} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:text-blue-300">
                  เปิดภาพเต็ม ↗
                </a>
              </div>
            ) : block.type === 'image-upload' ? (
              <p className="text-sm text-slate-600 italic">ไม่ได้อัปโหลดรูป</p>
            ) : block.type === 'true-false' && Array.isArray(answer) ? (
              <div className="space-y-1">
                {((block as AssignmentBlock & { items?: Array<{ statement: string; correctAnswer: boolean }> }).items ?? []).map((item, j) => (
                  <div key={j} className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">{item.statement}</span>
                    <span className={`ml-2 text-xs font-semibold shrink-0 ${
                      answer[j] === 'true' ? 'text-emerald-400' : answer[j] === 'false' ? 'text-red-400' : 'text-slate-600'
                    }`}>{answer[j] === 'true' ? 'ถูก' : answer[j] === 'false' ? 'ผิด' : '—'}</span>
                  </div>
                ))}
              </div>
            ) : block.type === 'matching' && Array.isArray(answer) ? (
              <div className="space-y-1">
                {((block as AssignmentBlock & { leftItems?: string[] }).leftItems ?? []).map((left, j) => (
                  <div key={j} className="flex items-center gap-2 text-sm text-slate-300">
                    <span>{left}</span>
                    <span className="text-slate-600">→</span>
                    <span>{answer[j] ?? '—'}</span>
                  </div>
                ))}
              </div>
            ) : block.type === 'fill-blank' ? (() => {
              const fbAns = Array.isArray(answer) ? answer : [];
              const parts = q.split('___');
              return (
                <p className="text-sm text-slate-300 flex flex-wrap items-baseline gap-x-0.5">
                  {parts.map((part, j) => (
                    <span key={j} className="contents">
                      <span className="whitespace-pre-wrap">{part}</span>
                      {j < parts.length - 1 && (
                        <span className="border-b border-slate-500 text-blue-300 px-1">[{fbAns[j] ?? '—'}]</span>
                      )}
                    </span>
                  ))}
                </p>
              );
            })() : block.type === 'ordering' && Array.isArray(answer) ? (
              <div className="space-y-1">
                {answer.map((a, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-slate-300">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-400">{idx + 1}</span>
                    {a}
                  </div>
                ))}
              </div>
            ) : Array.isArray(answer) ? (
              <div className="flex flex-wrap gap-2">
                {answer.map((a) => (
                  <span key={a} className="rounded-full border border-blue-800 bg-blue-950/40 px-3 py-0.5 text-xs text-blue-300">{a}</span>
                ))}
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-slate-300">{answer}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

const INFOGRAPHIC_COLORS: Record<string, string> = {
  blue:   'border-blue-700/60 bg-blue-950/30',
  green:  'border-emerald-700/60 bg-emerald-950/30',
  yellow: 'border-amber-700/60 bg-amber-950/30',
  red:    'border-red-700/60 bg-red-950/30',
  purple: 'border-violet-700/60 bg-violet-950/30',
};

function KnowledgePreview({ assignment }: { assignment: Assignment }) {
  const blocks = assignment.blocks ?? [];
  if (blocks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-emerald-900">
        <p className="text-sm text-slate-500">ไม่มีเนื้อหาในใบความรู้นี้</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-emerald-900/50 bg-slate-900 p-5 overflow-y-auto space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500">📖 เนื้อหาใบความรู้</p>
      {blocks.map((block) => {
        switch (block.type) {
          case 'heading':
            return <h3 key={block.id} className="text-base font-bold text-slate-100">{block.text}</h3>;
          case 'paragraph':
            return <p key={block.id} className="whitespace-pre-wrap text-sm text-slate-300 leading-relaxed">{block.text}</p>;
          case 'image':
            return block.url ? (
              <div key={block.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={driveThumb(block.url, 1000)} alt={block.caption ?? ''} className="max-h-80 w-full rounded-xl border border-slate-700 object-contain bg-slate-800/30" />
                {block.caption && <p className="mt-1 text-center text-xs text-slate-500">{block.caption}</p>}
              </div>
            ) : null;
          case 'pdf':
            return block.url ? (
              <div key={block.id}>
                <iframe src={block.url} className="w-full rounded-xl border border-slate-700" style={{ height: block.height ?? 500 }} />
                {block.caption && <p className="mt-1 text-center text-xs text-slate-500">{block.caption}</p>}
              </div>
            ) : null;
          case 'infographic':
            return (
              <div key={block.id} className={`rounded-xl border p-4 ${INFOGRAPHIC_COLORS[block.color ?? 'blue'] ?? INFOGRAPHIC_COLORS.blue}`}>
                <p className="mb-1 text-lg">{block.icon}</p>
                <p className="font-semibold text-slate-100">{block.title}</p>
                <p className="mt-1 text-sm text-slate-300 whitespace-pre-wrap">{block.body}</p>
              </div>
            );
          default:
            return null;
        }
      })}
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
