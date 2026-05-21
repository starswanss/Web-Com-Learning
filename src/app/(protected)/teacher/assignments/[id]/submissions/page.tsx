'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

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
  status: string;
  submittedAt?: { _seconds: number };
  reviewedAt?: { _seconds: number };
}

interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate?: { _seconds: number };
  blocks?: Array<{ id: string; type: string; text?: string; question?: string; options?: string[] }>;
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
  if (status === 'graded')    return 'AI ตรวจแล้ว';
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
  const [approving, setApproving] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher' || !id) return;
    fetch(`/api/teacher/submissions/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setAssignment(data.assignment ?? null);
        setSubmissions(Array.isArray(data.submissions) ? data.submissions : []);
        setClassStats(Array.isArray(data.classStats) ? data.classStats : []);
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

  const pendingCount = submissions.filter((s) => s.status === 'submitted').length;

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-4 flex-wrap">
          <Link href="/teacher" className="text-sm text-slate-400 hover:text-slate-200">← ย้อนกลับ</Link>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-100">
              {assignment ? assignment.title : 'กำลังโหลด…'}
            </h1>
            <p className="text-xs text-slate-500">ตรวจงาน — {submissions.length} การส่ง · รอตรวจ {pendingCount}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {batchResult && (
              <span className="text-xs text-emerald-400">{batchResult}</span>
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
              disabled={batchGrading || submissions.length === 0}
              className="rounded-lg border border-purple-700 bg-purple-950/40 px-3 py-1.5 text-xs text-purple-300 transition-all hover:border-purple-500 disabled:opacity-40"
            >
              {batchGrading ? 'กำลังตรวจ…' : `ตรวจ AI ทั้งหมด (${pendingCount > 0 ? pendingCount : submissions.length})`}
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
        {/* Per-class submission mini cards */}
        {!fetching && classStats.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {classStats.map((cs) => {
              const pct = cs.total > 0 ? Math.round((cs.submitted / cs.total) * 100) : 0;
              const color = pct >= 100 ? 'border-emerald-800 bg-emerald-950/40 text-emerald-400'
                : pct >= 50 ? 'border-amber-800 bg-amber-950/40 text-amber-400'
                : 'border-red-900 bg-red-950/40 text-red-400';
              return (
                <div key={cs.classId} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${color}`}>
                  <span className="text-xs font-bold">{cs.classId}</span>
                  <span className="text-xs opacity-80">
                    ส่ง {cs.submitted}{cs.total > 0 ? `/${cs.total}` : ''} คน
                  </span>
                  {cs.total > 0 && cs.submitted < cs.total && (
                    <span className="text-[10px] opacity-60">ค้าง {cs.total - cs.submitted}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {fetching ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : (
          <div className="flex gap-4 h-[calc(100vh-112px)]">
            {/* Submission list */}
            <div className="w-72 shrink-0 overflow-y-auto pr-1">
              {submissions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center">
                  <p className="text-sm text-slate-500">ยังไม่มีการส่งงาน</p>
                </div>
              ) : (
                <>
                  {/* รอตรวจ section */}
                  {(() => {
                    const pending = submissions.filter((s) => s.status === 'submitted');
                    if (pending.length === 0) return null;
                    return (
                      <div className="mb-3">
                        <div className="mb-2 flex items-center gap-2 px-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">รอตรวจ</span>
                          <span className="rounded-full bg-amber-950/60 border border-amber-800 px-2 py-0.5 text-[10px] font-bold text-amber-400">{pending.length}</span>
                        </div>
                        <div className="space-y-2">
                          {pending.map((sub) => (
                            <SubmissionCard
                              key={sub.id}
                              sub={sub}
                              selected={selected}
                              deleting={deleting}
                              onOpen={openSubmission}
                              onDelete={handleDeleteSubmission}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Divider */}
                  {submissions.some((s) => s.status === 'submitted') && submissions.some((s) => s.status !== 'submitted') && (
                    <div className="my-3 flex items-center gap-2">
                      <div className="h-px flex-1 bg-slate-800" />
                      <span className="text-[10px] text-slate-600">ตรวจแล้ว</span>
                      <div className="h-px flex-1 bg-slate-800" />
                    </div>
                  )}

                  {/* ตรวจแล้ว section */}
                  {(() => {
                    const done = submissions.filter((s) => s.status !== 'submitted');
                    if (done.length === 0) return null;
                    return (
                      <div>
                        {submissions.every((s) => s.status !== 'submitted') && (
                          <div className="mb-2 flex items-center gap-2 px-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">ตรวจแล้ว</span>
                            <span className="rounded-full bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 text-[10px] font-bold text-emerald-400">{done.length}</span>
                          </div>
                        )}
                        <div className="space-y-2">
                          {done.map((sub) => (
                            <SubmissionCard
                              key={sub.id}
                              sub={sub}
                              selected={selected}
                              deleting={deleting}
                              onOpen={openSubmission}
                              onDelete={handleDeleteSubmission}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </>
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

                  {/* AI score display */}
                  {typeof selected.score === 'number' && selected.status !== 'reviewed' && (
                    <div className={`rounded-2xl border p-5 ${scoreColor(selected.score)}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">คะแนน AI (ก่อนปรับ)</p>
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
  const questionBlocks = assignment.blocks.filter((b) =>
    ['short-answer', 'long-answer', 'multiple-choice', 'checkbox'].includes(b.type)
  );
  return (
    <div className="space-y-5">
      {questionBlocks.map((block, i) => {
        const answer = answers[block.id];
        return (
          <div key={block.id}>
            <p className="text-xs font-medium text-slate-400 mb-1">ข้อ {i + 1}. {block.question}</p>
            {answer === undefined ? (
              <p className="text-sm text-slate-600 italic">ไม่ได้ตอบ</p>
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

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
    </div>
  );
}
