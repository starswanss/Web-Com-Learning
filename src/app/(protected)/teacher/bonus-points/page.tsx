'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface StudentResult {
  studentId: string;
  displayName: string;
  email: string;
  classId: string;
}

interface BonusEntry {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  points: number;
  medal: string;
  reason: string;
  createdAt?: { _seconds: number };
}

const MEDALS = [
  { id: 'gold',    icon: '⭐', label: 'Gold Star',    desc: 'ผลงานดีเยี่ยม',      color: 'border-yellow-600 bg-yellow-950/40 text-yellow-300' },
  { id: 'diamond', icon: '💎', label: 'Diamond',      desc: 'ความพยายามพิเศษ',    color: 'border-cyan-600 bg-cyan-950/40 text-cyan-300' },
  { id: 'silver',  icon: '🏅', label: 'Silver Medal', desc: 'ส่งงานครบ/ตรงเวลา',  color: 'border-slate-400 bg-slate-800/60 text-slate-200' },
  { id: 'special', icon: '🎖', label: 'Special Award', desc: 'รางวัลพิเศษ',        color: 'border-purple-600 bg-purple-950/40 text-purple-300' },
] as const;

export default function BonusPointsPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [searchEmail, setSearchEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState<StudentResult | null>(null);
  const [searchError, setSearchError] = useState('');

  const [selectedMedal, setSelectedMedal] = useState<string>('gold');
  const [points, setPoints] = useState('10');
  const [reason, setReason] = useState('');
  const [awarding, setAwarding] = useState(false);
  const [awarded, setAwarded] = useState(false);

  const [history, setHistory] = useState<BonusEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    fetch('/api/teacher/bonus-points')
      .then((r) => r.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .finally(() => setLoadingHistory(false));
  }, [profile]);

  async function searchStudent() {
    const q = searchEmail.trim();
    if (!q) return;
    setSearching(true);
    setSearchError('');
    setStudent(null);
    setAwarded(false);
    try {
      const res = await fetch(`/api/teacher/bonus-points/search?email=${encodeURIComponent(q)}`);
      if (!res.ok) { setSearchError('ไม่พบนักเรียนในระบบ'); return; }
      const data = await res.json();
      setStudent(data);
    } catch { setSearchError('เกิดข้อผิดพลาด'); }
    finally { setSearching(false); }
  }

  async function awardBonus() {
    if (!student || !points) return;
    setAwarding(true);
    try {
      const res = await fetch('/api/teacher/bonus-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.studentId, points: parseInt(points), medal: selectedMedal, reason }),
      });
      if (!res.ok) throw new Error();
      const { id } = await res.json();
      const medal = MEDALS.find((m) => m.id === selectedMedal)!;
      const newEntry: BonusEntry = {
        id, studentId: student.studentId, studentName: student.displayName,
        classId: student.classId, points: parseInt(points), medal: selectedMedal, reason,
      };
      setHistory((prev) => [newEntry, ...prev]);
      setAwarded(true);
      setReason('');
      setPoints('10');
    } catch { /* ignore */ }
    finally { setAwarding(false); }
  }

  async function revokeBonus(id: string) {
    if (!confirm('ยืนยันการลบ bonus นี้?')) return;
    await fetch('/api/teacher/bonus-points', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setHistory((prev) => prev.filter((e) => e.id !== id));
  }

  if (loading || !profile) return <Spinner />;

  const medalObj = MEDALS.find((m) => m.id === selectedMedal);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Link href="/teacher/leaderboard" className="text-sm text-slate-400 hover:text-slate-200">← กลับ</Link>
          <div>
            <h1 className="text-xl font-bold text-slate-100">⭐ ให้ Bonus Points</h1>
            <p className="text-xs text-slate-500">ค้นหานักเรียนด้วยอีเมล แล้วมอบเหรียญรางวัล</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">

          {/* ─── Search & Award panel ─── */}
          <div className="space-y-5">
            {/* Email search */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-300">🔍 ค้นหานักเรียน</h2>
              <div className="flex gap-2">
                <input
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchStudent()}
                  placeholder="พิมพ์อีเมลหรือชื่อนักเรียน..."
                  className="input flex-1 text-sm"
                />
                <button
                  onClick={searchStudent}
                  disabled={searching}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  {searching ? '…' : 'ค้นหา'}
                </button>
              </div>
              {searchError && <p className="mt-2 text-xs text-red-400">{searchError}</p>}

              {/* Student found card */}
              {student && (
                <div className="mt-4 rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-900/50 text-2xl">
                      {student.displayName.slice(0, 2).toUpperCase() || '??'}
                    </div>
                    <div>
                      <p className="font-semibold text-emerald-300">{student.displayName}</p>
                      <p className="text-xs text-slate-400">{student.email}</p>
                      <span className="mt-0.5 inline-block rounded-full border border-slate-600 px-2 py-0.5 text-[10px] text-slate-300">
                        {student.classId}
                      </span>
                    </div>
                  </div>
                  {awarded && (
                    <p className="mt-3 text-center text-xs font-medium text-emerald-400">✅ มอบเหรียญรางวัลแล้ว!</p>
                  )}
                </div>
              )}
            </div>

            {/* Medal & points selection */}
            {student && !awarded && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-slate-300">🏅 เลือกรางวัล</h2>

                {/* Medal type */}
                <div className="grid grid-cols-2 gap-2">
                  {MEDALS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMedal(m.id)}
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-all ${
                        selectedMedal === m.id ? m.color + ' ring-1 ring-current' : 'border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <span className="text-2xl">{m.icon}</span>
                      <div>
                        <p className="text-xs font-semibold">{m.label}</p>
                        <p className="text-[10px] opacity-70">{m.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Points */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">คะแนน Bonus</label>
                  <div className="flex items-center gap-2">
                    {[5, 10, 15, 20, 30].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPoints(String(n))}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                          points === String(n) ? 'border-yellow-600 bg-yellow-950/40 text-yellow-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        +{n}
                      </button>
                    ))}
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={points}
                      onChange={(e) => setPoints(e.target.value)}
                      className="w-16 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-center text-xs text-slate-300"
                    />
                  </div>
                </div>

                {/* Reason */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">เหตุผล (ไม่บังคับ)</label>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="เช่น ช่วยเหลือเพื่อน, ตอบคำถามได้ถูก..."
                    className="input text-sm"
                  />
                </div>

                {/* Preview & Award button */}
                <div className="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center">
                  <p className="text-2xl">{medalObj?.icon}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-200">
                    {medalObj?.label} · +{points} คะแนน
                  </p>
                  <p className="text-xs text-slate-400">→ {student.displayName}</p>
                </div>

                <button
                  onClick={awardBonus}
                  disabled={awarding || !points}
                  className="w-full rounded-xl bg-yellow-600 py-3 text-sm font-bold text-slate-950 hover:bg-yellow-500 disabled:opacity-40 transition-all active:scale-95"
                >
                  {awarding ? 'กำลังมอบรางวัล…' : `🎁 มอบ ${medalObj?.icon} +${points} ให้ ${student.displayName}`}
                </button>
              </div>
            )}
          </div>

          {/* ─── History panel ─── */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="border-b border-slate-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-300">📋 ประวัติการมอบรางวัล</h2>
            </div>
            {loadingHistory ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
              </div>
            ) : history.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-slate-600">ยังไม่มีการมอบรางวัล</div>
            ) : (
              <div className="divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
                {history.map((entry) => {
                  const m = MEDALS.find((x) => x.id === entry.medal);
                  return (
                    <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="shrink-0 text-2xl">{m?.icon ?? '🏅'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-200 truncate">{entry.studentName}</p>
                        <p className="text-[10px] text-slate-500">
                          {entry.classId} · {m?.label} · +{entry.points} pts
                        </p>
                        {entry.reason && <p className="text-[10px] text-slate-600 italic truncate">{entry.reason}</p>}
                      </div>
                      <button
                        onClick={() => revokeBonus(entry.id)}
                        className="shrink-0 rounded-lg border border-red-900/50 px-2 py-1 text-[10px] text-red-600 hover:border-red-700 hover:text-red-400 transition-all"
                      >
                        ลบ
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
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
