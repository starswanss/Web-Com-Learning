'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface Member {
  uid: string;
  displayName: string;
  email: string;
  classId: string;
  onboardingComplete: boolean;
  createdAt: number | null;
}

const ALL_CLASSES = Array.from({ length: 18 }, (_, i) => `ม.3/${i + 1}`);

function initials(name: string) {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '??';
}

function formatDate(seconds: number | null) {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function MembersPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [members, setMembers] = useState<Member[]>([]);
  const [fetching, setFetching] = useState(true);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    fetch('/api/teacher/members')
      .then(r => r.json())
      .then(d => setMembers(Array.isArray(d) ? d : []))
      .finally(() => setFetching(false));
  }, [profile]);

  const classCounts = useMemo(() => {
    const map: Record<string, number> = {};
    members.forEach(m => {
      map[m.classId] = (map[m.classId] ?? 0) + 1;
    });
    return map;
  }, [members]);

  const filtered = useMemo(() => {
    return members.filter(m => {
      const matchClass = selectedClass === 'all' || m.classId === selectedClass;
      const q = search.toLowerCase();
      const matchSearch = !q || m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
      return matchClass && matchSearch;
    });
  }, [members, selectedClass, search]);

  const activeCount = members.filter(m => m.onboardingComplete).length;
  const pendingCount = members.length - activeCount;

  if (loading || !profile) return <Spinner />;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
          <Link href="/teacher" className="shrink-0 rounded-lg border border-slate-800 p-1.5 text-slate-500 transition-all hover:border-slate-700 hover:text-slate-300">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </Link>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Teacher</p>
            <h1 className="text-sm font-bold text-slate-100">👥 สมาชิกในระบบ</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6 space-y-6">

        {fetching ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-400" />
          </div>
        ) : (
          <>
            {/* ── STAT CARDS ── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'ลงทะเบียนทั้งหมด', value: members.length, color: 'text-slate-100', line: 'bg-slate-500', glow: 'from-slate-500/8' },
                { label: 'ใช้งานแล้ว',         value: activeCount,   color: 'text-emerald-300', line: 'bg-emerald-500', glow: 'from-emerald-500/10' },
                { label: 'รอ Onboarding',      value: pendingCount,  color: 'text-amber-300',   line: 'bg-amber-400',   glow: 'from-amber-400/10' },
                { label: 'จำนวนห้อง',           value: Object.keys(classCounts).filter(k=>k).length, color: 'text-blue-300', line: 'bg-blue-500', glow: 'from-blue-500/10' },
              ].map(s => (
                <div key={s.label} className={`relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-b ${s.glow} to-slate-900 p-4`}>
                  <div className={`absolute inset-x-0 top-0 h-[2px] ${s.line}`} />
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{s.label}</p>
                  <p className={`mt-1.5 text-3xl font-black leading-none ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* ── CLASS OVERVIEW CHIPS ── */}
            <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900">
              <div className="border-b border-slate-800/80 px-5 py-3.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">นักเรียนแต่ละห้อง</p>
              </div>
              <div className="flex flex-wrap gap-2 p-5">
                {ALL_CLASSES.map(cls => {
                  const count = classCounts[cls] ?? 0;
                  const isActive = selectedClass === cls;
                  return (
                    <button key={cls} onClick={() => setSelectedClass(isActive ? 'all' : cls)}
                      className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                        isActive
                          ? 'border-blue-600 bg-blue-950/40 text-blue-300'
                          : count > 0
                          ? 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600'
                          : 'border-slate-800 text-slate-700 cursor-default'
                      }`}
                      disabled={count === 0}
                    >
                      <span>{cls}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                        isActive ? 'bg-blue-600 text-white' : count > 0 ? 'bg-slate-700 text-slate-300' : 'bg-slate-800 text-slate-700'
                      }`}>{count}</span>
                    </button>
                  );
                })}
                {selectedClass !== 'all' && (
                  <button onClick={() => setSelectedClass('all')}
                    className="rounded-xl border border-slate-800 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-400 transition-all">
                    ดูทั้งหมด ×
                  </button>
                )}
              </div>
            </div>

            {/* ── MEMBER TABLE ── */}
            <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900">
              {/* Table header */}
              <div className="flex items-center gap-4 border-b border-slate-800/80 px-5 py-3.5">
                <div className="flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                    {selectedClass === 'all' ? 'นักเรียนทั้งหมด' : selectedClass} · {filtered.length} คน
                  </p>
                </div>
                <div className="relative">
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="ค้นหาชื่อ / อีเมล..."
                    className="rounded-xl border border-slate-800 bg-slate-800/60 py-1.5 pl-8 pr-3 text-xs text-slate-300 placeholder:text-slate-600 focus:border-slate-700 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16">
                  <span className="text-3xl opacity-20">👥</span>
                  <p className="text-sm text-slate-700">{search ? 'ไม่พบนักเรียนที่ค้นหา' : 'ยังไม่มีนักเรียนในห้องนี้'}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/50">
                  {/* Column header */}
                  <div className="grid grid-cols-[2.5rem_1fr_1fr_6rem_7rem_5rem] gap-4 px-5 py-2">
                    {['', 'ชื่อ', 'อีเมล', 'ห้อง', 'วันที่เข้าร่วม', 'สถานะ'].map(h => (
                      <p key={h} className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{h}</p>
                    ))}
                  </div>
                  {filtered.map(m => (
                    <div key={m.uid}
                      className="grid grid-cols-[2.5rem_1fr_1fr_6rem_7rem_5rem] items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-800/20">
                      {/* Avatar */}
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-300">
                        {initials(m.displayName)}
                      </div>
                      {/* Name */}
                      <p className="truncate text-sm font-medium text-slate-200">{m.displayName || '—'}</p>
                      {/* Email */}
                      <p className="truncate text-xs text-slate-500">{m.email}</p>
                      {/* Class */}
                      <span className="inline-flex items-center rounded-full border border-slate-700/60 bg-slate-800/60 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                        {m.classId || '—'}
                      </span>
                      {/* Joined */}
                      <p className="text-[10px] text-slate-600">{formatDate(m.createdAt)}</p>
                      {/* Status */}
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                        m.onboardingComplete
                          ? 'border-emerald-800/50 bg-emerald-950/30 text-emerald-400'
                          : 'border-amber-800/50 bg-amber-950/30 text-amber-500'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${m.onboardingComplete ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
                        {m.onboardingComplete ? 'ใช้งาน' : 'รอ'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
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
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-800 border-t-slate-400" />
    </div>
  );
}
