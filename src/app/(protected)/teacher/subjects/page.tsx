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

  function toggleClass(cls: string) {
    setSelectedClasses((p) => p.includes(cls) ? p.filter((c) => c !== cls) : [...p, cls]);
  }
  function toggleAll() {
    setSelectedClasses((p) => p.length === ALL_CLASSES.length ? [] : [...ALL_CLASSES]);
  }

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
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">ห้องที่เรียนวิชานี้ *</label>
              <button type="button" onClick={toggleAll} className="text-xs text-blue-400 hover:text-blue-300">
                {selectedClasses.length === ALL_CLASSES.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ALL_CLASSES.map((cls) => (
                <button key={cls} type="button" onClick={() => toggleClass(cls)}
                  className={`rounded-xl border py-2 text-xs font-medium transition-all ${
                    selectedClasses.includes(cls)
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                  }`}>{cls}</button>
              ))}
            </div>
          </div>
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
              <div key={s.id} className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-100 truncate">{s.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{s.classIds.join(', ')}</p>
                </div>
                <button
                  onClick={() => handleDelete(s.id)}
                  disabled={deleting === s.id}
                  className="shrink-0 rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:border-red-700 disabled:opacity-40 transition-all"
                >
                  {deleting === s.id ? '…' : 'ลบ'}
                </button>
              </div>
            ))}
          </div>
        )}
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
