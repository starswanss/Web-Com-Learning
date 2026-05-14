'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import {
  ALL_CLASSES, makeBlock, groupBlocks, BLOCK_LABELS, BlockCard,
  type FormBlock, type BlockType,
} from '../_builder';
import { CONTENT_TYPE_LABELS, type ContentType } from '@/types';

export default function NewAssignmentPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [rubric, setRubric] = useState('');
  const [unit, setUnit] = useState('');
  const [contentType, setContentType] = useState<ContentType>('worksheet');
  const [blocks, setBlocks] = useState<FormBlock[]>([]);
  const subjectId = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('lms_subject') ?? 'null')?.id ?? ''
    : '';
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && profile?.role !== 'teacher') { router.push('/dashboard'); return null; }

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('กรุณากรอกชื่อใบงาน');
    if (!dueDate) return setError('กรุณาเลือกวันกำหนดส่ง');
    if (selectedClasses.length === 0) return setError('กรุณาเลือกห้องอย่างน้อย 1 ห้อง');

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('description', '');
      fd.append('dueDate', dueDate);
      fd.append('classIds', JSON.stringify(selectedClasses));
      fd.append('blocks', JSON.stringify(blocks));
      fd.append('rubric', rubric.trim());
      fd.append('unit', unit.trim());
      fd.append('contentType', contentType);
      fd.append('subjectId', subjectId);
      if (file) fd.append('file', file);

      const res = await fetch('/api/assignments', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('failed');
      router.push('/teacher');
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">ชื่อใบงาน *</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น ใบงานที่ 1 — อัลกอริทึม" className="input" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">วันกำหนดส่ง *</label>
                <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
              </div>
            </div>

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

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">ไฟล์แนบ (ถ้ามี)</label>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:border-slate-600 transition-all">
                  <span>เลือกไฟล์</span>
                  <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
                {file && <span className="truncate text-sm text-slate-400">{file.name}</span>}
              </div>
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
          </section>

          {/* Block builder */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">เนื้อหาใบงาน</h2>
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
            {submitting ? 'กำลังบันทึก…' : 'สร้างใบงาน'}
          </button>
        </form>
      </div>
    </div>
  );
}
