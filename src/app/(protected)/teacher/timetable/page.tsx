'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'];
const DAY_COLORS = [
  'text-yellow-400',
  'text-pink-400',
  'text-emerald-400',
  'text-orange-400',
  'text-blue-400',
];

const PERIODS = [
  { label: 'โฮมรูม', start: '08:00', end: '08:50' },
  { label: 'คาบ 1',  start: '08:50', end: '09:40' },
  { label: 'คาบ 2',  start: '09:40', end: '10:30' },
  { label: 'คาบ 3',  start: '10:30', end: '11:20' },
  { label: 'คาบ 4',  start: '11:20', end: '12:10' },
  { label: 'คาบ 5',  start: '12:10', end: '13:00' },
  { label: 'คาบ 6',  start: '13:00', end: '13:50' },
  { label: 'คาบ 7',  start: '13:50', end: '14:40' },
  { label: 'คาบ 8',  start: '14:40', end: '15:30' },
  { label: 'คาบ 9',  start: '15:30', end: '16:20' },
  { label: 'คาบ 10', start: '16:20', end: '17:10' },
];

interface Cell { subject: string; room: string }
type Cells = Record<string, Cell>;

function cellKey(day: number, period: number) { return `${day}_${period}`; }

export default function TimetablePage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [cells, setCells] = useState<Cells>({});
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editRoom, setEditRoom] = useState('');
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isTeacher = profile?.role === 'teacher';

  useEffect(() => {
    if (!loading && !profile) router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    fetch('/api/teacher/timetable')
      .then((r) => r.json())
      .then((d) => setCells(d.cells ?? {}))
      .finally(() => setFetching(false));
  }, []);

  function openEdit(key: string) {
    if (!isTeacher) return;
    setEditKey(key);
    setEditSubject(cells[key]?.subject ?? '');
    setEditRoom(cells[key]?.room ?? '');
  }

  function closeEdit() { setEditKey(null); }

  function applyEdit() {
    if (!editKey) return;
    const subject = editSubject.trim();
    if (!subject) {
      const next = { ...cells };
      delete next[editKey];
      setCells(next);
    } else {
      setCells((prev) => ({ ...prev, [editKey]: { subject, room: editRoom.trim() } }));
    }
    closeEdit();
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/teacher/timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cells }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !profile) return <Spinner />;

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/teacher" className="text-xs text-slate-500 hover:text-slate-300">←</Link>
            <h1 className="text-base font-semibold text-slate-100">📅 ตารางสอน</h1>
          </div>
          {isTeacher && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-all"
            >
              {saving ? 'กำลังบันทึก…' : saved ? '✓ บันทึกแล้ว' : 'บันทึก'}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 overflow-x-auto">
        {fetching ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : (
          <>
            {isTeacher && (
              <p className="mb-4 text-xs text-slate-500">คลิกที่ช่องเพื่อแก้ไข</p>
            )}
            <div className="min-w-[800px]">
              {/* Header row */}
              <div className="mb-1 grid grid-cols-[100px_repeat(5,1fr)] gap-1">
                <div />
                {DAYS.map((d, i) => (
                  <div key={d} className={`rounded-xl py-2 text-center text-sm font-semibold ${DAY_COLORS[i]} bg-slate-900 border border-slate-800`}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Period rows */}
              {PERIODS.map((p, pi) => (
                <div key={pi} className="mb-1 grid grid-cols-[100px_repeat(5,1fr)] gap-1">
                  {/* Time label */}
                  <div className="flex flex-col items-end justify-center pr-3 py-2">
                    <span className="text-xs font-medium text-slate-300">{p.label}</span>
                    <span className="text-[10px] text-slate-600">{p.start}–{p.end}</span>
                  </div>

                  {/* Day cells */}
                  {DAYS.map((_, di) => {
                    const key = cellKey(di, pi);
                    const cell = cells[key];
                    const isEditing = editKey === key;

                    return (
                      <div
                        key={di}
                        onClick={() => !isEditing && openEdit(key)}
                        className={`relative min-h-[60px] rounded-xl border p-2 transition-all ${
                          isTeacher ? 'cursor-pointer' : ''
                        } ${
                          cell
                            ? 'border-blue-800/60 bg-blue-950/20'
                            : isTeacher
                              ? 'border-slate-800 bg-slate-900 hover:border-slate-700 hover:bg-slate-800'
                              : 'border-slate-800 bg-slate-900/50'
                        }`}
                      >
                        {isEditing ? (
                          <div
                            className="space-y-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              autoFocus
                              value={editSubject}
                              onChange={(e) => setEditSubject(e.target.value)}
                              placeholder="วิชา"
                              className="w-full rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-100 outline-none border border-slate-600 focus:border-blue-500"
                              onKeyDown={(e) => { if (e.key === 'Enter') applyEdit(); if (e.key === 'Escape') closeEdit(); }}
                            />
                            <input
                              value={editRoom}
                              onChange={(e) => setEditRoom(e.target.value)}
                              placeholder="ห้อง (ไม่บังคับ)"
                              className="w-full rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-500 outline-none border border-slate-700 focus:border-blue-500"
                              onKeyDown={(e) => { if (e.key === 'Enter') applyEdit(); if (e.key === 'Escape') closeEdit(); }}
                            />
                            <div className="flex gap-1">
                              <button onClick={applyEdit} className="flex-1 rounded-lg bg-blue-600 py-0.5 text-[10px] text-white hover:bg-blue-500">ตกลง</button>
                              <button onClick={closeEdit} className="flex-1 rounded-lg border border-slate-700 py-0.5 text-[10px] text-slate-400 hover:text-slate-200">ยกเลิก</button>
                            </div>
                          </div>
                        ) : cell ? (
                          <>
                            <p className="text-xs font-medium text-blue-300 leading-tight">{cell.subject}</p>
                            {cell.room && <p className="mt-0.5 text-[10px] text-slate-500">{cell.room}</p>}
                          </>
                        ) : isTeacher ? (
                          <p className="text-[10px] text-slate-700 select-none">+ เพิ่ม</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
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
