'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import type { FormBlock } from '@/types';

interface GroupEntry {
  id: string;
  name: string;
  classId: string;
  memberIds: string[];
  memberNames: string[];
  submission: GroupSub | null;
}

type StatusFilter = 'all' | 'none' | 'submitted' | 'reviewed';

interface GroupSub {
  id: string;
  groupId: string;
  content?: string;
  answers?: Record<string, string | string[]>;
  fileUrl?: string;
  score?: number;
  feedback?: string;
  status: 'submitted' | 'reviewed';
  submittedAt?: { _seconds: number };
  reviewedAt?: { _seconds: number };
}

interface AssignmentData {
  id: string;
  title: string;
  description?: string;
  blocks?: FormBlock[];
}

function scoreColor(s: number) {
  if (s >= 80) return 'text-emerald-400 border-emerald-700 bg-emerald-950/40';
  if (s >= 60) return 'text-amber-400 border-amber-700 bg-amber-950/40';
  if (s >= 40) return 'text-orange-400 border-orange-700 bg-orange-950/40';
  return 'text-red-400 border-red-700 bg-red-950/40';
}

function statusBadge(status: string | undefined) {
  if (status === 'reviewed') return 'bg-emerald-950/60 text-emerald-400 border-emerald-800';
  if (status === 'submitted') return 'bg-amber-950/60 text-amber-400 border-amber-800';
  return 'bg-slate-800 text-slate-500 border-slate-700';
}

function statusLabel(status: string | undefined) {
  if (status === 'reviewed') return 'ตรวจแล้ว';
  if (status === 'submitted') return 'รอตรวจ';
  return 'ยังไม่ส่ง';
}

export default function GroupSubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: assignmentId } = use(params);
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [assignment, setAssignment] = useState<AssignmentData | null>(null);
  const [groups, setGroups] = useState<GroupEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [selected, setSelected] = useState<GroupEntry | null>(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [classFilter, setClassFilter] = useState<string | null>(null);

  // Quick-score entry (inline in the list)
  const [quickDraft, setQuickDraft] = useState<Record<string, string>>({});
  const [quickSaving, setQuickSaving] = useState<Set<string>>(new Set());
  const [quickSaved, setQuickSaved] = useState<Set<string>>(new Set());
  const [quickErr, setQuickErr] = useState<Record<string, string>>({});
  const [savingAll, setSavingAll] = useState(false);

  function draftVal(g: GroupEntry): string {
    if (g.id in quickDraft) return quickDraft[g.id];
    return g.submission?.score !== undefined ? String(g.submission.score) : '';
  }

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher' || !assignmentId) return;
    fetch(`/api/teacher/group-submissions/${assignmentId}`)
      .then(r => r.json())
      .then(data => {
        setAssignment(data.assignment ?? null);
        setGroups(Array.isArray(data.groups) ? data.groups : []);
      })
      .finally(() => setFetching(false));
  }, [profile, assignmentId]);

  function openGroup(g: GroupEntry) {
    setSelected(g);
    setScore(g.submission?.score !== undefined ? String(g.submission.score) : '');
    setFeedback(g.submission?.feedback ?? '');
    setSaveMsg(null);
  }

  async function handleSave() {
    if (!selected?.submission) return;
    const parsed = Number(score);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) { setSaveMsg('คะแนนต้องอยู่ระหว่าง 0–100'); return; }

    setSaving(true); setSaveMsg(null);
    const res = await fetch(`/api/teacher/grade-group/${selected.submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: parsed, feedback }),
    });
    const data = await res.json();
    if (res.ok) {
      setSaveMsg(`บันทึกแล้ว · ทุกสมาชิก ${data.memberCount} คนได้รับ ${data.xpAwarded} XP`);
      const updatedSub: GroupSub = { ...selected.submission!, score: parsed, feedback, status: 'reviewed' };
      const updatedGroup = { ...selected, submission: updatedSub };
      setGroups(prev => prev.map(g => g.id === selected.id ? updatedGroup : g));
      setSelected(updatedGroup);
    } else {
      setSaveMsg(data.error ?? 'บันทึกไม่สำเร็จ');
    }
    setSaving(false);
  }

  // Quick-save one group's score from the inline input (keeps existing feedback).
  async function quickSave(g: GroupEntry): Promise<boolean> {
    if (!g.submission) return false;
    const v = draftVal(g);
    const parsed = Number(v);
    if (v === '' || isNaN(parsed) || parsed < 0 || parsed > 100) {
      setQuickErr(e => ({ ...e, [g.id]: '0–100' }));
      return false;
    }
    setQuickErr(e => { const n = { ...e }; delete n[g.id]; return n; });
    setQuickSaving(s => new Set(s).add(g.id));
    try {
      const res = await fetch(`/api/teacher/grade-group/${g.submission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: parsed, feedback: g.submission.feedback ?? '' }),
      });
      if (!res.ok) throw new Error();
      const updatedSub: GroupSub = { ...g.submission, score: parsed, status: 'reviewed' };
      const updatedGroup = { ...g, submission: updatedSub };
      setGroups(prev => prev.map(x => x.id === g.id ? updatedGroup : x));
      if (selected?.id === g.id) { setSelected(updatedGroup); setScore(String(parsed)); }
      setQuickSaved(s => new Set(s).add(g.id));
      setTimeout(() => setQuickSaved(s => { const n = new Set(s); n.delete(g.id); return n; }), 2000);
      return true;
    } catch {
      setQuickErr(e => ({ ...e, [g.id]: 'ไม่สำเร็จ' }));
      return false;
    } finally {
      setQuickSaving(s => { const n = new Set(s); n.delete(g.id); return n; });
    }
  }

  // Save every group in view whose score was entered/changed.
  async function saveAllQuick() {
    const targets = filtered.filter(g => {
      if (!g.submission) return false;
      const v = draftVal(g);
      if (v === '' || isNaN(Number(v))) return false;
      return g.submission.status !== 'reviewed' || String(g.submission.score) !== v;
    });
    if (targets.length === 0) { setSaveMsg('ไม่มีคะแนนใหม่ที่จะบันทึก'); return; }
    setSavingAll(true); setSaveMsg(null);
    const results = await Promise.all(targets.map(g => quickSave(g)));
    const ok = results.filter(Boolean).length;
    setSaveMsg(`บันทึกคะแนนแล้ว ${ok} กลุ่ม${ok < targets.length ? ` · ไม่สำเร็จ ${targets.length - ok}` : ''}`);
    setSavingAll(false);
  }

  function exportCSV() {
    const header = ['ชื่อกลุ่ม', 'สมาชิก', 'คะแนน', 'สถานะ', 'Feedback'];
    const rows = groups.map(g => [
      g.name,
      g.memberNames.join(' | '),
      g.submission?.score !== undefined ? String(g.submission.score) : '',
      statusLabel(g.submission?.status),
      (g.submission?.feedback ?? '').replace(/,/g, '，'),
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `งานกลุ่ม_${assignment?.title ?? ''}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !profile) return <Spinner />;

  const pendingCount = groups.filter(g => g.submission?.status === 'submitted').length;
  const reviewedCount = groups.filter(g => g.submission?.status === 'reviewed').length;
  const noneCount = groups.filter(g => !g.submission).length;

  // Classes present, for the class filter.
  const classes = Array.from(new Set(groups.map(g => g.classId).filter(Boolean))).sort();

  const statusOf = (g: GroupEntry): StatusFilter =>
    !g.submission ? 'none' : g.submission.status === 'reviewed' ? 'reviewed' : 'submitted';

  const filtered = groups.filter(g =>
    (statusFilter === 'all' || statusOf(g) === statusFilter) &&
    (!classFilter || g.classId === classFilter),
  );

  const STATUS_CHIPS: { key: StatusFilter; label: string; count: number; active: string }[] = [
    { key: 'all',       label: 'ทั้งหมด',   count: groups.length,  active: 'border-blue-600 bg-blue-950/50 text-blue-300' },
    { key: 'none',      label: 'ยังไม่ส่ง', count: noneCount,      active: 'border-slate-500 bg-slate-800 text-slate-200' },
    { key: 'submitted', label: 'รอตรวจ',    count: pendingCount,   active: 'border-amber-600 bg-amber-950/50 text-amber-300' },
    { key: 'reviewed',  label: 'ตรวจแล้ว',  count: reviewedCount,  active: 'border-emerald-600 bg-emerald-950/50 text-emerald-300' },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-4 flex-wrap">
          <Link href={`/teacher/assignments/${assignmentId}/groups`} className="text-sm text-slate-400 hover:text-slate-200">← จัดกลุ่ม</Link>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-100">{assignment?.title ?? 'กำลังโหลด…'} — งานกลุ่ม</h1>
            <p className="text-xs text-slate-500">
              {groups.length} กลุ่ม
              {pendingCount > 0 && ` · รอตรวจ ${pendingCount}`}
              {reviewedCount > 0 && ` · ตรวจแล้ว ${reviewedCount}`}
            </p>
          </div>
          <button onClick={saveAllQuick} disabled={savingAll || groups.length === 0} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40 transition-all">
            {savingAll ? 'กำลังบันทึก…' : '💾 บันทึกคะแนนทั้งหมด'}
          </button>
          <button onClick={exportCSV} disabled={groups.length === 0} className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-40 transition-all">
            Export CSV
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {fetching ? (
          <div className="flex justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" /></div>
        ) : (
          <>
          {/* Filter bar */}
          {groups.length > 0 && (
            <div className="mb-4 space-y-2">
              {/* Status filter */}
              <div className="flex flex-wrap items-center gap-2">
                {STATUS_CHIPS.map(c => (
                  <button
                    key={c.key}
                    onClick={() => setStatusFilter(c.key)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                      statusFilter === c.key ? c.active : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                    }`}
                  >
                    {c.label} <span className="opacity-70">{c.count}</span>
                  </button>
                ))}
              </div>
              {/* Class filter */}
              {classes.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">ห้อง:</span>
                  <button
                    onClick={() => setClassFilter(null)}
                    className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-all ${
                      classFilter === null ? 'border-blue-700 bg-blue-950/50 text-blue-300' : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  {classes.map(c => (
                    <button
                      key={c}
                      onClick={() => setClassFilter(classFilter === c ? null : c)}
                      className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-all ${
                        classFilter === c ? 'border-blue-700 bg-blue-950/50 text-blue-300' : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {saveMsg && !selected && (
            <p className={`mb-3 text-xs ${saveMsg.startsWith('บันทึก') ? 'text-emerald-400' : 'text-slate-400'}`}>{saveMsg}</p>
          )}

          <div className="flex gap-4 h-[calc(100vh-180px)]">
            {/* Group list */}
            <div className="w-72 shrink-0 overflow-y-auto pr-1 space-y-2">
              {groups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center">
                  <p className="text-sm text-slate-500">ยังไม่มีกลุ่ม</p>
                  <Link href={`/teacher/assignments/${assignmentId}/groups`} className="mt-2 block text-xs text-blue-400 hover:text-blue-300">→ ไปจัดกลุ่ม</Link>
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center">
                  <p className="text-sm text-slate-500">ไม่มีกลุ่มตรงเงื่อนไข</p>
                </div>
              ) : filtered.map(g => (
                <div
                  key={g.id}
                  onClick={() => openGroup(g)}
                  className={`cursor-pointer rounded-xl border p-3 transition-all ${selected?.id === g.id ? 'border-blue-700 bg-blue-950/30' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-slate-200 truncate">{g.name}</p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusBadge(g.submission?.status)}`}>
                      {statusLabel(g.submission?.status)}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate">{g.memberNames.slice(0, 3).join(', ')}{g.memberNames.length > 3 ? ` +${g.memberNames.length - 3}` : ''}</p>
                  {/* Quick score entry (doesn't open the detail) */}
                  {g.submission ? (
                    <div className="mt-2 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="number" min={0} max={100} value={draftVal(g)}
                        onChange={e => setQuickDraft(d => ({ ...d, [g.id]: e.target.value }))}
                        placeholder="คะแนน"
                        className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                      />
                      <button
                        onClick={() => quickSave(g)}
                        disabled={quickSaving.has(g.id)}
                        className="rounded border border-blue-700 bg-blue-950/40 px-2 py-1 text-[11px] font-semibold text-blue-300 hover:border-blue-500 disabled:opacity-50"
                      >
                        {quickSaving.has(g.id) ? '…' : quickSaved.has(g.id) ? '✓ บันทึก' : 'บันทึก'}
                      </button>
                      {quickErr[g.id] && <span className="text-[10px] text-red-400">{quickErr[g.id]}</span>}
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] text-slate-600 italic">ยังไม่ส่งงาน</p>
                  )}
                </div>
              ))}
            </div>

            {/* Detail panel */}
            <div className="flex-1 min-w-0 overflow-y-auto">
              {selected ? (
                <div className="space-y-4">
                  {/* Group info */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <p className="font-semibold text-slate-100 text-lg">{selected.name}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selected.memberNames.map((name, i) => (
                            <span key={i} className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">{name}</span>
                          ))}
                        </div>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs ${statusBadge(selected.submission?.status)}`}>
                        {statusLabel(selected.submission?.status)}
                      </span>
                    </div>
                    {selected.submission?.submittedAt && (
                      <p className="mt-2 text-xs text-slate-600">
                        ส่งเมื่อ {new Date(selected.submission.submittedAt._seconds * 1000).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>

                  {/* No submission yet */}
                  {!selected.submission && (
                    <div className="rounded-2xl border border-dashed border-slate-700 py-10 text-center">
                      <p className="text-slate-500 text-sm">กลุ่มนี้ยังไม่ได้ส่งงาน</p>
                    </div>
                  )}

                  {/* Answer content */}
                  {selected.submission && (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">คำตอบของกลุ่ม</p>
                      {selected.submission.answers && Object.keys(selected.submission.answers).length > 0 ? (
                        <BlockAnswers blocks={assignment?.blocks ?? []} answers={selected.submission.answers} />
                      ) : selected.submission.content ? (
                        <p className="whitespace-pre-wrap text-sm text-slate-300">{selected.submission.content}</p>
                      ) : (
                        <p className="text-sm text-slate-500 italic">ไม่มีคำตอบข้อความ</p>
                      )}
                      {selected.submission.fileUrl && (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs font-medium text-slate-500">รูปภาพที่แนบ (Google Drive)</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={selected.submission.fileUrl}
                            alt="รูปที่แนบ"
                            className="max-h-80 w-full rounded-xl border border-slate-700 object-contain"
                          />
                          <a
                            href={selected.submission.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
                          >
                            ↗ เปิดรูปใน Drive
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reviewed score */}
                  {typeof selected.submission?.score === 'number' && selected.submission.status === 'reviewed' && (
                    <div className={`rounded-2xl border p-5 ${scoreColor(selected.submission.score)}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">คะแนนที่บันทึกแล้ว</p>
                        <span className="text-xl font-bold">{selected.submission.score}/100</span>
                      </div>
                      {selected.submission.feedback && <p className="mt-2 text-sm opacity-80">{selected.submission.feedback}</p>}
                    </div>
                  )}

                  {/* Grade form */}
                  {selected.submission && (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
                      <p className="text-sm font-medium text-slate-200">ให้คะแนนและ Feedback</p>
                      <p className="text-xs text-slate-500">คะแนนและ XP (คะแนน × 10) จะถูกส่งให้สมาชิกทุกคนในกลุ่ม</p>
                      <div>
                        <label className="mb-1.5 block text-xs text-slate-400">คะแนน (0–100)</label>
                        <input type="number" min={0} max={100} value={score} onChange={e => setScore(e.target.value)} placeholder="เช่น 85" className="input w-32" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs text-slate-400">Feedback ให้กลุ่ม</label>
                        <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={4} placeholder="เขียนความคิดเห็นหรือข้อแนะนำ..." className="input resize-none" />
                      </div>
                      {saveMsg && <p className={`text-xs ${saveMsg.startsWith('บันทึกแล้ว') ? 'text-emerald-400' : 'text-red-400'}`}>{saveMsg}</p>}
                      <button onClick={handleSave} disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 active:scale-95 transition-all">
                        {saving ? 'กำลังบันทึก…' : 'บันทึกคะแนน'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-800">
                  <p className="text-sm text-slate-500">เลือกกลุ่มเพื่อดูงาน</p>
                </div>
              )}
            </div>
          </div>
          </>
        )}
      </main>
    </div>
  );
}

function BlockAnswers({ blocks, answers }: { blocks: FormBlock[]; answers: Record<string, string | string[]> }) {
  const questionBlocks = blocks.filter(b =>
    ['short-answer', 'long-answer', 'multiple-choice', 'checkbox', 'ordering', 'image-upload', 'true-false', 'matching', 'fill-blank', 'link'].includes(b.type)
  );

  // Fallback when no block definitions available — show raw key/value
  if (questionBlocks.length === 0) {
    return (
      <div className="space-y-3">
        {Object.entries(answers).map(([blockId, answer]) => (
          <div key={blockId}>
            <p className="text-xs text-slate-500 mb-1">{blockId}</p>
            {typeof answer === 'string' && answer.startsWith('http') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={answer} alt="คำตอบ" className="max-h-64 rounded-xl border border-slate-700 object-contain" />
            ) : Array.isArray(answer) ? (
              <p className="text-sm text-slate-300">{answer.join(', ')}</p>
            ) : (
              <p className="text-sm text-slate-300">{answer}</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {questionBlocks.map((block, i) => {
        const answer = answers[block.id];
        const q = 'question' in block ? (block as { question: string }).question : block.id;
        return (
          <div key={block.id}>
            <p className="mb-2 whitespace-pre-wrap text-xs font-medium text-slate-400">ข้อ {i + 1}. {q}</p>
            {answer === undefined ? (
              <p className="text-sm text-slate-600 italic">ไม่ได้ตอบ</p>
            ) : block.type === 'image-upload' ? (
              typeof answer === 'string' && answer ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={answer} alt="คำตอบ" className="max-h-64 w-full rounded-xl border border-slate-700 object-contain" />
              ) : (
                <p className="text-sm text-slate-600 italic">ไม่ได้อัปโหลดรูป</p>
              )
            ) : block.type === 'true-false' && Array.isArray(answer) ? (() => {
              const tfBlock = block as Extract<FormBlock, { type: 'true-false' }>;
              return (
                <div className="space-y-1">
                  {tfBlock.items.map((item, j) => (
                    <div key={j} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2 text-sm gap-3">
                      <span className="text-slate-400">{item.statement}</span>
                      <span className={`text-xs font-semibold shrink-0 ${
                        answer[j] === 'true' ? 'text-emerald-400' : answer[j] === 'false' ? 'text-red-400' : 'text-slate-600'
                      }`}>
                        {answer[j] === 'true' ? 'ถูก' : answer[j] === 'false' ? 'ผิด' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })() : block.type === 'matching' && Array.isArray(answer) ? (() => {
              const mBlock = block as Extract<FormBlock, { type: 'matching' }>;
              return (
                <div className="space-y-1">
                  {mBlock.leftItems.map((left, j) => (
                    <div key={j} className="flex items-center gap-2 text-sm text-slate-300">
                      <span className="rounded-lg border border-slate-700 bg-slate-800/40 px-2 py-1 text-xs">{left}</span>
                      <span className="text-slate-600">→</span>
                      <span className="rounded-lg border border-slate-700 bg-slate-800/40 px-2 py-1 text-xs">{(answer as string[])[j] ?? '—'}</span>
                    </div>
                  ))}
                </div>
              );
            })() : block.type === 'fill-blank' && Array.isArray(answer) ? (() => {
              const parts = (block as Extract<FormBlock, { type: 'fill-blank' }>).question.split('___');
              return (
                <p className="text-sm text-slate-300 flex flex-wrap items-baseline gap-x-0.5">
                  {parts.map((part, j) => (
                    <span key={j} className="contents">
                      <span className="whitespace-pre-wrap">{part}</span>
                      {j < parts.length - 1 && (
                        <span className="border-b border-slate-500 text-blue-300 px-1">[{(answer as string[])[j] ?? '—'}]</span>
                      )}
                    </span>
                  ))}
                </p>
              );
            })() : block.type === 'ordering' && Array.isArray(answer) ? (
              <div className="space-y-1">
                {(answer as string[]).map((a, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-slate-300">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-400">{idx + 1}</span>
                    {a}
                  </div>
                ))}
              </div>
            ) : block.type === 'link' && typeof answer === 'string' && answer ? (
              <a href={answer} target="_blank" rel="noopener noreferrer"
                className="text-sm text-cyan-400 underline break-all hover:text-cyan-300">
                🔗 {answer}
              </a>
            ) : Array.isArray(answer) ? (
              <div className="flex flex-wrap gap-2">
                {answer.map((a, j) => (
                  <span key={j} className="rounded-full border border-blue-800 bg-blue-950/40 px-3 py-0.5 text-xs text-blue-300">{a}</span>
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
