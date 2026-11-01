'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface Subject { id: string; name: string; classIds: string[] }

const ALL_CLASSES = Array.from({ length: 18 }, (_, i) => `ม.3/${i + 1}`);

export default function ManageSubjectsPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [fetching, setFetching] = useState(true);
  const [name, setName] = useState('');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inline edit state (one subject at a time)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editClasses, setEditClasses] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    fetch('/api/subjects')
      .then((r) => r.json())
      .then((data) => setSubjects(Array.isArray(data) ? data : []))
      .finally(() => setFetching(false));
  }, [profile]);

  async function handleCreate() {
    setError(null);
    if (!name.trim()) return setError('กรุณากรอกชื่อวิชา');
    if (selectedClasses.length === 0) return setError('กรุณาเลือกห้องอย่างน้อย 1 ห้อง');
    setCreating(true);
    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), classIds: selectedClasses }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSubjects((prev) => [{ id: data.id, name: name.trim(), classIds: selectedClasses }, ...prev]);
      setName('');
      setSelectedClasses([]);
    } catch { setError('สร้างไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setCreating(false); }
  }

  function startEdit(s: Subject) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditClasses([...s.classIds]);
    setEditError(null);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditClasses([]);
    setEditError(null);
  }
  async function saveEdit(id: string) {
    setEditError(null);
    if (!editName.trim()) return setEditError('กรุณากรอกชื่อวิชา');
    if (editClasses.length === 0) return setEditError('กรุณาเลือกห้องอย่างน้อย 1 ห้อง');
    setSavingEdit(true);
    try {
      const res = await fetch('/api/subjects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editName.trim(), classIds: editClasses }),
      });
      if (!res.ok) throw new Error();
      setSubjects((prev) => prev.map((s) => s.id === id ? { ...s, name: editName.trim(), classIds: editClasses } : s));
      cancelEdit();
    } catch { setEditError('บันทึกไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setSavingEdit(false); }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    await fetch('/api/subjects', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    setDeleting(null);
  }

  if (loading || !profile) return <Spinner />;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <Link href="/select-subject" className="text-sm text-slate-400 hover:text-slate-200">← กลับ</Link>
          <h1 className="text-xl font-semibold text-slate-100">จัดการวิชา</h1>
        </div>

        {/* Create form */}
        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">สร้างวิชาใหม่</h2>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">ชื่อวิชา *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น วิทยาการคำนวณ ม.3/1-6"
              className="input"
            />
          </div>
          <ClassGrid selected={selectedClasses} onChange={setSelectedClasses} />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-all active:scale-95"
          >
            {creating ? 'กำลังสร้าง…' : '+ สร้างวิชา'}
          </button>
        </div>

        {/* Subject list */}
        <h2 className="mb-4 text-sm font-semibold text-slate-400 uppercase tracking-wider">
          วิชาทั้งหมด ({subjects.length})
        </h2>
        {fetching ? (
          <div className="flex justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : subjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 py-12 text-center">
            <p className="text-sm text-slate-500">ยังไม่มีวิชา</p>
          </div>
        ) : (
          <div className="space-y-3">
            {subjects.map((s) => (
              editingId === s.id ? (
                <div key={s.id} className="rounded-2xl border border-blue-800/70 bg-slate-900 p-4 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-300">ชื่อวิชา *</label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="input"
                      autoFocus
                    />
                  </div>
                  <ClassGrid selected={editClasses} onChange={setEditClasses} />
                  {editError && <p className="text-xs text-red-400">{editError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(s.id)}
                      disabled={savingEdit}
                      className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-all active:scale-95"
                    >
                      {savingEdit ? 'กำลังบันทึก…' : 'บันทึก'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={savingEdit}
                      className="rounded-xl border border-slate-700 px-5 py-2 text-sm text-slate-300 hover:border-slate-600 disabled:opacity-50 transition-all"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              ) : (
                <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-100 truncate">{s.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{s.classIds.join(', ')}</p>
                  </div>
                  <button
                    onClick={() => startEdit(s)}
                    className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-blue-600 hover:text-blue-300 transition-all"
                  >
                    แก้ไข
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={deleting === s.id}
                    className="shrink-0 rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:border-red-700 disabled:opacity-40 transition-all"
                  >
                    {deleting === s.id ? '…' : 'ลบ'}
                  </button>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 18-room (ม.3/1..18) multi-select grid with a select-all toggle. */
function ClassGrid({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  function toggle(cls: string) {
    onChange(selected.includes(cls) ? selected.filter((c) => c !== cls) : [...selected, cls]);
  }
  function toggleAll() {
    onChange(selected.length === ALL_CLASSES.length ? [] : [...ALL_CLASSES]);
  }
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-medium text-slate-300">ห้องที่เรียนวิชานี้ *</label>
        <button type="button" onClick={toggleAll} className="text-xs text-blue-400 hover:text-blue-300">
          {selected.length === ALL_CLASSES.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ALL_CLASSES.map((cls) => (
          <button key={cls} type="button" onClick={() => toggle(cls)}
            className={`rounded-xl border py-2 text-xs font-medium transition-all ${
              selected.includes(cls)
                ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
            }`}>{cls}</button>
        ))}
      </div>
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
