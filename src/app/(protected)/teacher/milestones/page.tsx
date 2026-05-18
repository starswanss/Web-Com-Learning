'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface MilestoneItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  order: number;
  subjectId?: string;
  requiredAssignmentIds: string[];
}

interface Assignment {
  id: string;
  title: string;
  contentType?: string;
  unit?: string;
}

const ICON_OPTIONS = ['🎯', '🚀', '⭐', '🏆', '💡', '📚', '🔬', '🎓', '🌟', '💎', '🔥', '✅'];

export default function TeacherMilestonesPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [fetching, setFetching] = useState(true);
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [order, setOrder] = useState(0);
  const [selectedAssignments, setSelectedAssignments] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    const saved = localStorage.getItem('lms_subject');
    const sub = saved ? JSON.parse(saved) : null;
    setSubject(sub);
    const qs = new URLSearchParams();
    if (sub) qs.set('subject', sub.id);
    Promise.all([
      fetch(`/api/teacher/milestones?${qs}`).then(r => r.json()),
      fetch(`/api/assignments?${qs}`).then(r => r.json()),
    ]).then(([m, a]) => {
      setMilestones(Array.isArray(m) ? m : []);
      setAssignments(Array.isArray(a) ? a : []);
    }).finally(() => setFetching(false));
  }, [profile]);

  function openNew() {
    setEditId(null);
    setTitle('');
    setDescription('');
    setIcon('🎯');
    setOrder(milestones.length);
    setSelectedAssignments([]);
    setShowForm(true);
  }

  function openEdit(m: MilestoneItem) {
    setEditId(m.id);
    setTitle(m.title);
    setDescription(m.description);
    setIcon(m.icon);
    setOrder(m.order);
    setSelectedAssignments(m.requiredAssignmentIds ?? []);
    setShowForm(true);
  }

  function toggleAssignment(id: string) {
    setSelectedAssignments(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const body = {
        id: editId,
        title,
        description,
        icon,
        order,
        subjectId: subject?.id ?? null,
        requiredAssignmentIds: selectedAssignments,
      };
      const res = await fetch('/api/teacher/milestones', {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('save failed');
      const saved = localStorage.getItem('lms_subject');
      const sub = saved ? JSON.parse(saved) : null;
      const qs = new URLSearchParams();
      if (sub) qs.set('subject', sub.id);
      const updated = await fetch(`/api/teacher/milestones?${qs}`).then(r => r.json());
      setMilestones(Array.isArray(updated) ? updated : []);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    if (!confirm('ลบ Milestone นี้?')) return;
    setDeleting(id);
    await fetch('/api/teacher/milestones', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setMilestones(prev => prev.filter(m => m.id !== id));
    setDeleting(null);
  }

  if (loading || fetching) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800/60 bg-slate-950/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/teacher" className="nav-btn">← กลับ</Link>
          <span className="text-sm font-semibold text-slate-100">🏁 จัดการ Milestone</span>
          {subject && <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-0.5 text-xs text-slate-400">{subject.name}</span>}
        </div>
        <button
          onClick={openNew}
          className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-violet-500"
        >
          + สร้าง Milestone
        </button>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        {milestones.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-700 p-16 text-center">
            <span className="text-5xl">🏁</span>
            <p className="text-slate-400">ยังไม่มี Milestone — สร้างเพื่อกำหนดเส้นทางการเรียนรู้</p>
            <button onClick={openNew} className="mt-2 rounded-lg bg-violet-600 px-6 py-2 text-sm text-white hover:bg-violet-500">
              + สร้าง Milestone แรก
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {milestones.map((m, i) => {
              const assignmentTitles = m.requiredAssignmentIds
                .map(id => assignments.find(a => a.id === id)?.title ?? id)
                .slice(0, 3);
              return (
                <div key={m.id} className="group flex gap-4 rounded-2xl border border-slate-800/60 bg-slate-900 p-5 transition hover:border-violet-800/60">
                  {/* Order + Line */}
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-violet-700 bg-violet-950 text-xl">
                      {m.icon}
                    </div>
                    {i < milestones.length - 1 && (
                      <div className="mt-2 w-0.5 flex-1 bg-slate-700/50" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-100">{m.title}</p>
                        {m.description && <p className="mt-0.5 text-sm text-slate-400">{m.description}</p>}
                      </div>
                      <div className="flex shrink-0 gap-2 opacity-0 transition group-hover:opacity-100">
                        <button onClick={() => openEdit(m)} className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800">แก้ไข</button>
                        <button onClick={() => del(m.id)} disabled={deleting === m.id} className="rounded-lg border border-red-800/60 px-3 py-1 text-xs text-red-400 hover:bg-red-950/40">
                          {deleting === m.id ? '...' : 'ลบ'}
                        </button>
                      </div>
                    </div>
                    {m.requiredAssignmentIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {assignmentTitles.map((t, j) => (
                          <span key={j} className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-400">{t}</span>
                        ))}
                        {m.requiredAssignmentIds.length > 3 && (
                          <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-500">+{m.requiredAssignmentIds.length - 3} อื่น</span>
                        )}
                        {m.requiredAssignmentIds.length === 0 && (
                          <span className="text-[11px] text-slate-600">ไม่ต้องมีงานก่อน</span>
                        )}
                      </div>
                    )}
                    <p className="mt-1.5 text-[11px] text-slate-600">ลำดับที่ {m.order + 1} · ต้องส่ง {m.requiredAssignmentIds.length} งาน</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="mb-5 text-lg font-bold text-slate-100">
              {editId ? 'แก้ไข Milestone' : 'สร้าง Milestone ใหม่'}
            </h2>

            {/* Icon picker */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs text-slate-400">ไอคอน</label>
              <div className="flex flex-wrap gap-2">
                {ICON_OPTIONS.map(ic => (
                  <button
                    key={ic}
                    onClick={() => setIcon(ic)}
                    className={`rounded-lg border p-2 text-xl transition ${icon === ic ? 'border-violet-500 bg-violet-950' : 'border-slate-700 bg-slate-800 hover:border-slate-600'}`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs text-slate-400">ชื่อ Milestone <span className="text-red-400">*</span></label>
              <input
                className="input"
                placeholder="เช่น หน่วยที่ 1 — พื้นฐานอัลกอริทึม"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs text-slate-400">คำอธิบาย</label>
              <textarea
                className="input resize-none"
                rows={2}
                placeholder="เป้าหมายของหน่วยนี้คือ..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs text-slate-400">ลำดับ</label>
              <input
                type="number"
                className="input w-24"
                min={0}
                value={order}
                onChange={e => setOrder(Number(e.target.value))}
              />
            </div>

            {/* Assignment picker */}
            <div className="mb-5">
              <label className="mb-1.5 block text-xs text-slate-400">งานที่ต้องส่งเพื่อผ่าน Milestone นี้</label>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-700 bg-slate-800/40 p-2">
                {assignments.length === 0 ? (
                  <p className="p-3 text-center text-xs text-slate-500">ยังไม่มีใบงานในวิชานี้</p>
                ) : (
                  assignments.map(a => (
                    <label key={a.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-700/40">
                      <input
                        type="checkbox"
                        checked={selectedAssignments.includes(a.id)}
                        onChange={() => toggleAssignment(a.id)}
                        className="accent-violet-500"
                      />
                      <span className="text-sm text-slate-300">{a.title}</span>
                      {a.unit && <span className="ml-auto text-[10px] text-slate-500">{a.unit}</span>}
                    </label>
                  ))
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-600">เลือก 0 ชิ้น = ผ่านได้ทันที (Milestone แนะนำ)</p>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800">
                ยกเลิก
              </button>
              <button
                onClick={save}
                disabled={saving || !title.trim()}
                className="rounded-lg bg-violet-600 px-6 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก...' : editId ? 'บันทึก' : 'สร้าง'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
