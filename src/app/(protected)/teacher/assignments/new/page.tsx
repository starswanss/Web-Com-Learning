'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import {
  ALL_CLASSES, makeBlock, groupBlocks, BLOCK_LABELS, BlockCard,
  type FormBlock, type BlockType,
} from '../_builder';
import { CONTENT_TYPE_LABELS, type ContentType } from '@/types';

interface Template {
  id: string;
  name: string;
  contentType: ContentType;
  unit: string | null;
  blocks: FormBlock[];
  rubric: string | null;
}

interface QBankQuestion {
  id: string;
  type: 'short-answer' | 'long-answer' | 'multiple-choice' | 'checkbox';
  question: string;
  options: string[];
  tags: string[];
}

export default function NewAssignmentPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get('type') as ContentType | null;

  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [rubric, setRubric] = useState('');
  const [unit, setUnit] = useState('');
  const [contentType, setContentType] = useState<ContentType>(
    (typeParam && ['worksheet', 'knowledge', 'quiz'].includes(typeParam)) ? typeParam : 'worksheet'
  );
  const [timeLimit, setTimeLimit] = useState('');
  const [isGroupWork, setIsGroupWork] = useState(false);
  const [groupSize, setGroupSize] = useState('');
  const [quizMode, setQuizMode] = useState<'standalone' | 'prepost'>('standalone');
  const [blocks, setBlocks] = useState<FormBlock[]>([]);
  const subjectId = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('lms_subject') ?? 'null')?.id ?? ''
    : '';
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const [showQBank, setShowQBank] = useState(false);
  const [qbankQuestions, setQBankQuestions] = useState<QBankQuestion[]>([]);
  const [qbankSelected, setQBankSelected] = useState<Set<string>>(new Set());
  const [qbankTypeFilter, setQBankTypeFilter] = useState('');
  const [qbankTagFilter, setQBankTagFilter] = useState('');
  const [qbankRandom, setQBankRandom] = useState('');
  const [loadingQBank, setLoadingQBank] = useState(false);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    fetch('/api/teacher/templates')
      .then((r) => r.json())
      .then((data) => setTemplates(Array.isArray(data) ? data : []));
    fetch('/api/teacher/question-bank')
      .then((r) => r.json())
      .then((data) => setQBankQuestions(Array.isArray(data) ? data : []));

    // Load imported data from import page
    if (searchParams.get('from') === 'import') {
      const raw = sessionStorage.getItem('lms_import');
      if (raw) {
        try {
          const imported = JSON.parse(raw);
          if (imported.title) setTitle(imported.title);
          if (imported.unit) setUnit(imported.unit);
          if (imported.contentType) setContentType(imported.contentType);
          if (imported.rubric) setRubric(imported.rubric);
          if (Array.isArray(imported.blocks)) setBlocks(imported.blocks);
          sessionStorage.removeItem('lms_import');
        } catch { /* ignore */ }
      }
    }
  }, [profile, searchParams]);

  if (!loading && profile?.role !== 'teacher') { router.push('/dashboard'); return null; }

  function loadTemplate(t: Template) {
    setContentType(t.contentType);
    setUnit(t.unit ?? '');
    setBlocks(t.blocks.map((b) => ({ ...b, id: Math.random().toString(36).slice(2, 9) })));
    setRubric(t.rubric ?? '');
    setShowTemplates(false);
  }

  async function saveAsTemplate() {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      await fetch('/api/teacher/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName.trim(), contentType, unit, blocks, rubric }),
      });
      setTemplateName('');
    } finally {
      setSavingTemplate(false);
    }
  }

  function toggleClass(cls: string) {
    setSelectedClasses((p) => p.includes(cls) ? p.filter((c) => c !== cls) : [...p, cls]);
  }
  function toggleAll() {
    setSelectedClasses((p) => p.length === ALL_CLASSES.length ? [] : [...ALL_CLASSES]);
  }
  function addBlock(type: BlockType) { setBlocks((p) => [...p, makeBlock(type)]); }
  function updateBlock(id: string, updated: FormBlock) { setBlocks((p) => p.map((b) => b.id === id ? updated : b)); }
  function moveBlock(index: number, dir: -1 | 1) {
    setBlocks((p) => {
      const next = [...p];
      const target = index + dir;
      if (target < 0 || target >= next.length) return p;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function toggleHalf(id: string) { setBlocks((p) => p.map((b) => b.id === id ? { ...b, half: !b.half } : b)); }
  function deleteBlock(id: string) { setBlocks((p) => p.filter((b) => b.id !== id)); }

  function openQBank() {
    setShowQBank(true);
    setQBankSelected(new Set());
    setQBankTypeFilter('');
    setQBankTagFilter('');
    setQBankRandom('');
  }

  function qbankToggle(id: string) {
    setQBankSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function importFromQBank() {
    let pool = qbankQuestions.filter((q) => qbankSelected.has(q.id));
    const n = parseInt(qbankRandom);
    if (n > 0 && pool.length > n) {
      // Fisher-Yates shuffle then slice
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      pool = pool.slice(0, n);
    }
    const newBlocks: FormBlock[] = pool.map((q) => {
      const id = Math.random().toString(36).slice(2, 9);
      if (q.type === 'short-answer') return { id, type: 'short-answer', question: q.question, required: true };
      if (q.type === 'long-answer')  return { id, type: 'long-answer',  question: q.question, required: true };
      return { id, type: q.type, question: q.question, options: q.options.length ? q.options : [''], required: true };
    });
    setBlocks((prev) => [...prev, ...newBlocks]);
    setShowQBank(false);
  }

  function buildFormData(extra?: Record<string, string>): FormData {
    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('description', '');
    fd.append('dueDate', dueDate);
    fd.append('classIds', JSON.stringify(selectedClasses));
    fd.append('blocks', JSON.stringify(blocks));
    fd.append('rubric', rubric.trim());
    fd.append('unit', unit.trim());
    fd.append('contentType', contentType);
    if (timeLimit) fd.append('timeLimit', timeLimit);
    fd.append('isGroupWork', String(isGroupWork));
    if (isGroupWork && groupSize) fd.append('groupSize', groupSize);
    fd.append('subjectId', subjectId);
    if (extra) Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
    return fd;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('กรุณากรอกชื่อใบงาน');
    if (contentType === 'worksheet' && !dueDate) return setError('กรุณาเลือกวันกำหนดส่ง');
    if (selectedClasses.length === 0) return setError('กรุณาเลือกห้องอย่างน้อย 1 ห้อง');

    setSubmitting(true);
    try {
      if (contentType === 'quiz' && quizMode === 'prepost') {
        const groupId = Math.random().toString(36).slice(2, 9);
        const [preRes, postRes] = await Promise.all([
          fetch('/api/assignments', { method: 'POST', body: buildFormData({ quizPhase: 'pre',  pairedQuizId: groupId, title: `${title.trim()} (ก่อนเรียน)` }) }),
          fetch('/api/assignments', { method: 'POST', body: buildFormData({ quizPhase: 'post', pairedQuizId: groupId, title: `${title.trim()} (หลังเรียน)` }) }),
        ]);
        if (!preRes.ok || !postRes.ok) {
          const errData = await (!preRes.ok ? preRes : postRes).json().catch(() => ({}));
          throw new Error(errData.error ?? 'สร้างแบบทดสอบไม่สำเร็จ');
        }
      } else {
        const fd = buildFormData(contentType === 'quiz' ? { quizPhase: 'standalone' } : {});
        const res = await fetch('/api/assignments', { method: 'POST', body: fd });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error ?? 'บันทึกไม่สำเร็จ');
        }
      }
      router.push('/teacher');
    } catch (err) {
      setError(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'กรุณาลองใหม่'}`);
    } finally {
      setSubmitting(false);
    }
  }

  const grouped = groupBlocks(blocks);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-3">
          <Link href="/teacher" className="text-sm text-slate-400 hover:text-slate-200">← กลับ</Link>
          <h1 className="text-xl font-semibold text-slate-100">สร้างใบงาน</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <div className="rounded-xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-400">{error}</div>
          )}
          {/* Basic info */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">ข้อมูลพื้นฐาน</h2>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">ชื่อ *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="เช่น ใบงานที่ 1 — อัลกอริทึม" className="input" />
            </div>

            {contentType === 'worksheet' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">วันกำหนดส่ง *</label>
                <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
              </div>
            )}
            {contentType === 'quiz' && (
              <div className="rounded-xl border border-purple-800 bg-purple-950/20 px-4 py-3 text-sm text-purple-300">
                ⏸ แบบทดสอบจะเปิด/ปิดจากหน้าหลักได้ — ไม่มีวันกำหนดส่ง
              </div>
            )}
            {contentType === 'knowledge' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">วันกำหนดส่ง (ไม่บังคับ)</label>
                <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">หน่วยการเรียนรู้</label>
                <input value={unit} onChange={(e) => setUnit(e.target.value)}
                  placeholder="เช่น หน่วยที่ 1 — อัลกอริทึม" className="input text-sm" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">ประเภท</label>
                <div className="flex gap-2">
                  {(Object.entries(CONTENT_TYPE_LABELS) as [ContentType, { label: string; icon: string }][]).map(([t, meta]) => (
                    <button key={t} type="button" onClick={() => setContentType(t)}
                      className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                        contentType === t ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}>
                      {meta.icon} {meta.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {contentType === 'quiz' && (
              <>
                {/* ── Quiz phase selector ── */}
                <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-1 rounded-full bg-purple-500" />
                    <p className="text-sm font-semibold text-slate-200">รูปแบบการทดสอบ</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Option A — standalone */}
                    <button type="button" onClick={() => setQuizMode('standalone')}
                      className={`group relative flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all ${
                        quizMode === 'standalone'
                          ? 'border-purple-500 bg-purple-950/40 shadow-lg shadow-purple-950/30'
                          : 'border-slate-700 bg-slate-900/60 hover:border-slate-600'
                      }`}>
                      {quizMode === 'standalone' && (
                        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-[10px] text-white">✓</span>
                      )}
                      <span className="text-2xl">📝</span>
                      <div>
                        <p className={`text-sm font-bold ${quizMode === 'standalone' ? 'text-purple-200' : 'text-slate-300'}`}>แบบทดสอบปกติ</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">สร้างชุดเดียว · เปิด-ปิดได้เอง</p>
                      </div>
                    </button>

                    {/* Option B — pre+post */}
                    <button type="button" onClick={() => setQuizMode('prepost')}
                      className={`group relative flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all ${
                        quizMode === 'prepost'
                          ? 'border-sky-500 bg-sky-950/40 shadow-lg shadow-sky-950/30'
                          : 'border-slate-700 bg-slate-900/60 hover:border-slate-600'
                      }`}>
                      {quizMode === 'prepost' && (
                        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[10px] text-white">✓</span>
                      )}
                      <div className="flex gap-1.5">
                        <span className="text-2xl">📋</span>
                        <span className="text-2xl">📋</span>
                      </div>
                      <div>
                        <p className={`text-sm font-bold ${quizMode === 'prepost' ? 'text-sky-200' : 'text-slate-300'}`}>ก่อนเรียน + หลังเรียน</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">สร้าง 2 ชุดพร้อมกัน · คำถามเดิม · เก็บผลแยก</p>
                      </div>
                    </button>
                  </div>

                  {/* Pre+post preview banner */}
                  {quizMode === 'prepost' && (
                    <div className="rounded-xl border border-sky-800/50 bg-sky-950/30 p-4 space-y-3">
                      <p className="text-[11px] font-bold text-sky-400 uppercase tracking-widest">ตัวอย่างที่จะสร้าง</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-sky-800/60 bg-sky-900/20 px-3 py-2.5">
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-700/60 bg-sky-950/60 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                            ก่อนเรียน
                          </span>
                          <p className="mt-1.5 text-[11px] font-medium text-slate-300 truncate">
                            {title ? `${title} (ก่อนเรียน)` : 'ชื่อ (ก่อนเรียน)'}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">ทำก่อนเริ่มบทเรียน</p>
                        </div>
                        <div className="rounded-lg border border-violet-800/60 bg-violet-900/20 px-3 py-2.5">
                          <span className="inline-flex items-center gap-1 rounded-full border border-violet-700/60 bg-violet-950/60 px-2 py-0.5 text-[10px] font-bold text-violet-300">
                            หลังเรียน
                          </span>
                          <p className="mt-1.5 text-[11px] font-medium text-slate-300 truncate">
                            {title ? `${title} (หลังเรียน)` : 'ชื่อ (หลังเรียน)'}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">ทบทวนหลังเรียนจบ</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-sky-500">
                        ✦ ทั้งสองชุดใช้คำถามเดียวกัน แต่เปิด-ปิดและเก็บคะแนนแยกกัน
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">เวลาทำข้อสอบ (นาที)</label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(e.target.value)}
                    placeholder="เช่น 30 (เว้นว่างหากไม่จำกัดเวลา)"
                    className="input text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-500">เมื่อหมดเวลาระบบจะส่งงานให้อัตโนมัติ</p>
                </div>
              </>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-800/30 px-4 py-3 text-xs text-slate-500">
              📄 ต้องการแนบ PDF? ใช้บล็อก <span className="font-semibold text-slate-400">+ ไฟล์ PDF</span> ในส่วนเนื้อหาใบงานด้านล่าง
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">ห้องที่มอบหมาย *</label>
                <button type="button" onClick={toggleAll} className="text-xs text-blue-400 hover:text-blue-300">
                  {selectedClasses.length === ALL_CLASSES.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {ALL_CLASSES.map((cls) => (
                  <button key={cls} type="button" onClick={() => toggleClass(cls)}
                    className={`rounded-xl border py-2.5 text-xs font-medium transition-all ${
                      selectedClasses.includes(cls)
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                        : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                    }`}>{cls}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Rubric / เกณฑ์การตรวจ (สำหรับ AI)
              </label>
              <textarea
                value={rubric}
                onChange={(e) => setRubric(e.target.value)}
                rows={3}
                placeholder="เช่น ต้องมีตัวอย่าง code อย่างน้อย 1 อัน, อธิบายด้วยคำพูดของตัวเองให้ชัดเจน, หักคะแนนถ้าไม่มีหัวข้อ..."
                className="input resize-none text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">ถ้าเว้นว่างไว้ AI จะใช้เกณฑ์มาตรฐาน</p>
            </div>

            {/* Group work toggle */}
            <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-700 bg-slate-800/40 p-4">
              <div>
                <p className="text-sm font-medium text-slate-200">👥 งานกลุ่ม</p>
                <p className="text-xs text-slate-500 mt-0.5">ครูจัดกลุ่มนักเรียน นักเรียนส่งงานในนามกลุ่ม ทุกคนได้คะแนนเท่ากัน</p>
                {isGroupWork && (
                  <div className="mt-3">
                    <label className="text-xs text-slate-400 block mb-1">ขนาดกลุ่มโดยประมาณ (hint สำหรับสุ่ม)</label>
                    <input
                      type="number" min={2} max={10}
                      value={groupSize}
                      onChange={e => setGroupSize(e.target.value)}
                      placeholder="เช่น 4"
                      className="input w-24 text-sm"
                    />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsGroupWork(v => !v)}
                className={`shrink-0 mt-0.5 h-6 w-11 rounded-full transition-colors ${isGroupWork ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform mx-1 ${isGroupWork ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

          </section>

          {/* Template loader */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Template</h2>
              <button
                type="button"
                onClick={() => setShowTemplates((v) => !v)}
                className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-200 transition-all"
              >
                📂 โหลดจาก Template ({templates.length})
              </button>
            </div>

            {showTemplates && (
              <div className="space-y-2">
                {templates.length === 0 ? (
                  <p className="text-xs text-slate-500">ยังไม่มี Template — บันทึกใบงานเป็น Template ก่อน</p>
                ) : (
                  templates.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{t.name}</p>
                        <p className="text-xs text-slate-500">{t.blocks.length} บล็อก</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => loadTemplate(t)}
                        className="ml-3 rounded-lg border border-blue-700 px-3 py-1 text-xs text-blue-400 hover:bg-blue-900/30 transition-all"
                      >
                        โหลด
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Save as template */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="ชื่อ Template ใหม่..."
                className="input flex-1 text-sm"
              />
              <button
                type="button"
                onClick={saveAsTemplate}
                disabled={savingTemplate || !templateName.trim()}
                className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-200 disabled:opacity-40 transition-all whitespace-nowrap"
              >
                {savingTemplate ? '…' : '💾 บันทึก Template'}
              </button>
            </div>
          </section>

          {/* Block builder */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">เนื้อหาใบงาน</h2>
              {qbankQuestions.length > 0 && (
                <button
                  type="button"
                  onClick={openQBank}
                  className="rounded-xl border border-purple-700 px-3 py-1.5 text-xs text-purple-400 hover:border-purple-600 hover:text-purple-300 transition-all"
                >
                  📦 นำเข้าจาก Q-Bank ({qbankQuestions.length})
                </button>
              )}
            </div>
            {grouped.length === 0 && (
              <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-800 py-12 text-sm text-slate-600">
                ยังไม่มีบล็อก — เพิ่มได้จากปุ่มด้านล่าง
              </div>
            )}
            {grouped.map((row) => {
              if (Array.isArray(row)) {
                const [a, b] = row;
                const ai = blocks.findIndex((bl) => bl.id === a.id);
                const bi = blocks.findIndex((bl) => bl.id === b.id);
                return (
                  <div key={`${a.id}-${b.id}`} className="grid grid-cols-2 gap-4">
                    <BlockCard block={a} index={ai} total={blocks.length}
                      onChange={(u) => updateBlock(a.id, u)} onMove={(d) => moveBlock(ai, d)}
                      onToggleHalf={() => toggleHalf(a.id)} onDelete={() => deleteBlock(a.id)} />
                    <BlockCard block={b} index={bi} total={blocks.length}
                      onChange={(u) => updateBlock(b.id, u)} onMove={(d) => moveBlock(bi, d)}
                      onToggleHalf={() => toggleHalf(b.id)} onDelete={() => deleteBlock(b.id)} />
                  </div>
                );
              }
              const idx = blocks.findIndex((bl) => bl.id === row.id);
              return (
                <BlockCard key={row.id} block={row} index={idx} total={blocks.length}
                  onChange={(u) => updateBlock(row.id, u)} onMove={(d) => moveBlock(idx, d)}
                  onToggleHalf={() => toggleHalf(row.id)} onDelete={() => deleteBlock(row.id)} />
              );
            })}
            <div className="flex flex-wrap gap-2 rounded-2xl border border-dashed border-slate-800 p-4">
              {BLOCK_LABELS.map(({ type, label, icon }) => (
                <button key={type} type="button" onClick={() => addBlock(type)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 transition-all hover:border-slate-600 hover:text-slate-100 active:scale-95">
                  <span>{icon}</span><span>+ {label}</span>
                </button>
              ))}
            </div>
          </section>

          <button type="submit" disabled={submitting}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95">
            {submitting
              ? 'กำลังบันทึก…'
              : contentType === 'quiz' && quizMode === 'prepost'
              ? '🔄 สร้างแบบทดสอบก่อน-หลังเรียน (2 ชุด)'
              : 'สร้างใบงาน'}
          </button>
        </form>
      </div>

      {/* Q-Bank import modal */}
      {showQBank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h3 className="font-semibold text-slate-100">📦 นำเข้าจาก Q-Bank</h3>
              <button onClick={() => setShowQBank(false)} className="text-slate-500 hover:text-slate-200">✕</button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 border-b border-slate-800 px-6 py-3">
              <select
                value={qbankTypeFilter}
                onChange={(e) => setQBankTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300"
              >
                <option value="">ทุกประเภท</option>
                <option value="short-answer">ตอบสั้น</option>
                <option value="long-answer">ตอบยาว</option>
                <option value="multiple-choice">ตัวเลือก</option>
                <option value="checkbox">เลือกหลายข้อ</option>
              </select>
              <input
                value={qbankTagFilter}
                onChange={(e) => setQBankTagFilter(e.target.value)}
                placeholder="กรองตามแท็ก..."
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 flex-1 min-w-[120px]"
              />
              <button
                type="button"
                onClick={() => {
                  const filtered = qbankQuestions.filter((q) => {
                    if (qbankTypeFilter && q.type !== qbankTypeFilter) return false;
                    if (qbankTagFilter && !q.tags.some((t) => t.toLowerCase().includes(qbankTagFilter.toLowerCase()))) return false;
                    return true;
                  });
                  setQBankSelected(new Set(filtered.map((q) => q.id)));
                }}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                เลือกทั้งหมดที่กรอง
              </button>
            </div>

            {/* Question list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
              {qbankQuestions
                .filter((q) => {
                  if (qbankTypeFilter && q.type !== qbankTypeFilter) return false;
                  if (qbankTagFilter && !q.tags.some((t) => t.toLowerCase().includes(qbankTagFilter.toLowerCase()))) return false;
                  return true;
                })
                .map((q) => {
                  const TYPE_LABELS: Record<string, string> = {
                    'short-answer': 'ตอบสั้น',
                    'long-answer': 'ตอบยาว',
                    'multiple-choice': 'ตัวเลือก',
                    'checkbox': 'เลือกหลายข้อ',
                  };
                  return (
                    <label key={q.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all ${
                      qbankSelected.has(q.id) ? 'border-purple-700 bg-purple-950/20' : 'border-slate-800 hover:border-slate-700'
                    }`}>
                      <input
                        type="checkbox"
                        checked={qbankSelected.has(q.id)}
                        onChange={() => qbankToggle(q.id)}
                        className="mt-0.5 accent-purple-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-200">{q.question}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="rounded-full border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500">{TYPE_LABELS[q.type]}</span>
                          {q.tags.map((t) => (
                            <span key={t} className="rounded-full border border-purple-900 px-1.5 py-0.5 text-[10px] text-purple-500">{t}</span>
                          ))}
                        </div>
                      </div>
                    </label>
                  );
                })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4 gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">เลือกแล้ว {qbankSelected.size} ข้อ · สุ่ม</span>
                <input
                  type="number"
                  min="1"
                  max={qbankSelected.size}
                  value={qbankRandom}
                  onChange={(e) => setQBankRandom(e.target.value)}
                  placeholder="ทั้งหมด"
                  className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300"
                />
                <span className="text-xs text-slate-400">ข้อ</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowQBank(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-all">
                  ยกเลิก
                </button>
                <button
                  onClick={importFromQBank}
                  disabled={qbankSelected.size === 0}
                  className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-40 transition-all"
                >
                  นำเข้า {qbankSelected.size} ข้อ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
