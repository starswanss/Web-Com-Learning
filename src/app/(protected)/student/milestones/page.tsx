'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface MilestoneData {
  id: string;
  title: string;
  description: string;
  icon: string;
  order: number;
  requiredAssignmentIds: string[];
  completedCount: number;
  totalRequired: number;
  isComplete: boolean;
}

function MilestoneCard({ m, index, visible }: { m: MilestoneData; index: number; visible: boolean }) {
  const progressPct = m.totalRequired > 0 ? Math.round((m.completedCount / m.totalRequired) * 100) : 100;
  const isLocked = !m.isComplete && index > 0;

  const stateColor = m.isComplete
    ? { ring: 'border-emerald-500', bg: 'bg-emerald-950/50', glow: 'shadow-emerald-500/20' }
    : isLocked
    ? { ring: 'border-slate-700', bg: 'bg-slate-900/60', glow: '' }
    : { ring: 'border-violet-500', bg: 'bg-violet-950/40', glow: 'shadow-violet-500/20' };

  return (
    <div
      className="animate-slide-up"
      style={{ animationDelay: `${index * 120}ms`, opacity: visible ? undefined : 0 }}
    >
      <div className={`relative overflow-hidden rounded-2xl border-2 ${stateColor.ring} ${stateColor.bg} p-5 shadow-lg ${stateColor.glow} transition-all duration-300 hover:scale-[1.01]`}>
        {/* Complete shimmer overlay */}
        {m.isComplete && (
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/5 via-transparent to-emerald-400/5" />
        )}

        {/* Active pulse ring */}
        {!m.isComplete && !isLocked && (
          <div className="animate-pulse-glow pointer-events-none absolute inset-0 rounded-2xl" />
        )}

        <div className="flex items-start gap-4">
          {/* Icon bubble */}
          <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 text-2xl
            ${m.isComplete ? 'border-emerald-600 bg-emerald-900/60 animate-float' : isLocked ? 'border-slate-700 bg-slate-800/60 grayscale' : 'border-violet-600 bg-violet-900/60 animate-float'}`}
          >
            {isLocked ? '🔒' : m.icon}
            {m.isComplete && (
              <div className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px]">✓</div>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`font-bold text-base leading-tight ${m.isComplete ? 'text-emerald-300' : isLocked ? 'text-slate-500' : 'text-slate-100'}`}>
                {m.title}
              </h3>
              {m.isComplete && (
                <span className="animate-sparkle inline-block rounded-full border border-emerald-700 bg-emerald-950 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                  ✅ ผ่านแล้ว!
                </span>
              )}
              {!m.isComplete && !isLocked && (
                <span className="rounded-full border border-violet-700/60 bg-violet-950/60 px-2 py-0.5 text-[11px] font-semibold text-violet-400">
                  กำลังเรียน
                </span>
              )}
              {isLocked && (
                <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-600">
                  ล็อก
                </span>
              )}
            </div>

            {m.description && (
              <p className={`mt-1 text-sm ${isLocked ? 'text-slate-600' : 'text-slate-400'}`}>
                {m.description}
              </p>
            )}

            {/* Progress bar */}
            {m.totalRequired > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className={isLocked ? 'text-slate-600' : 'text-slate-400'}>
                    ส่งงาน {m.completedCount}/{m.totalRequired} ชิ้น
                  </span>
                  <span className={`font-semibold ${m.isComplete ? 'text-emerald-400' : isLocked ? 'text-slate-600' : 'text-violet-400'}`}>
                    {progressPct}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${m.isComplete ? 'bg-emerald-500' : isLocked ? 'bg-slate-700' : 'bg-gradient-to-r from-violet-600 to-violet-400'}`}
                    style={{
                      width: `${progressPct}%`,
                      '--progress-target': `${progressPct}%`,
                      animation: visible ? 'fill-progress 1s ease-out forwards' : 'none',
                      animationDelay: `${index * 120 + 300}ms`,
                    } as React.CSSProperties}
                  />
                </div>
              </div>
            )}

            {m.totalRequired === 0 && !isLocked && (
              <p className="mt-2 text-[11px] text-slate-500">จุดอ้างอิง — ไม่ต้องส่งงาน</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudentMilestonesPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [milestones, setMilestones] = useState<MilestoneData[]>([]);
  const [fetching, setFetching] = useState(true);
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && profile?.role !== 'student') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'student') return;
    const saved = localStorage.getItem('lms_subject');
    const sub = saved ? JSON.parse(saved) : null;
    setSubject(sub);
    const qs = new URLSearchParams();
    if (sub) qs.set('subject', sub.id);
    fetch(`/api/student/milestones?${qs}`)
      .then(r => r.json())
      .then(d => setMilestones(Array.isArray(d) ? d : []))
      .finally(() => {
        setFetching(false);
        setTimeout(() => setVisible(true), 100);
      });
  }, [profile]);

  if (loading || fetching) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-sm text-slate-500">กำลังโหลดเส้นทาง...</p>
        </div>
      </div>
    );
  }

  const completedCount = milestones.filter(m => m.isComplete).length;
  const overallPct = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/student" className="nav-btn">← กลับ</Link>
            <span className="text-sm font-semibold">🏁 เส้นทางการเรียนรู้</span>
          </div>
          {subject && <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-0.5 text-xs text-slate-400">{subject.name}</span>}
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8" ref={containerRef}>
        {milestones.length === 0 ? (
          <div className="animate-slide-up flex flex-col items-center gap-5 py-24 text-center">
            <div className="animate-float text-7xl">🗺️</div>
            <h2 className="text-xl font-bold text-slate-300">ยังไม่มีเส้นทางการเรียนรู้</h2>
            <p className="text-sm text-slate-500">ครูยังไม่ได้กำหนด Milestone สำหรับวิชานี้</p>
          </div>
        ) : (
          <>
            {/* Summary hero */}
            <div className="animate-slide-up mb-8 overflow-hidden rounded-3xl border border-violet-800/40 bg-gradient-to-br from-violet-950/60 via-slate-900 to-slate-950 p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">ความคืบหน้าทั้งหมด</p>
                  <p className="mt-0.5 text-3xl font-black text-violet-300">{overallPct}%</p>
                  <p className="text-sm text-slate-400">ผ่านแล้ว {completedCount}/{milestones.length} Milestone</p>
                </div>
                <div className="relative flex h-20 w-20 items-center justify-center">
                  {/* Circular progress */}
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="#1e1b4b" strokeWidth="8" />
                    <circle
                      cx="40" cy="40" r="34" fill="none"
                      stroke={overallPct === 100 ? '#10b981' : '#7c3aed'}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 34}`}
                      strokeDashoffset={`${2 * Math.PI * 34 * (1 - overallPct / 100)}`}
                      style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
                    />
                  </svg>
                  <span className="text-xl font-black">{overallPct === 100 ? '🏆' : '🚀'}</span>
                </div>
              </div>

              {/* Linear progress bar */}
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full ${overallPct === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-violet-600 to-violet-400'}`}
                  style={{
                    width: `${overallPct}%`,
                    transition: 'width 1.2s ease-out',
                  }}
                />
              </div>
            </div>

            {/* Milestone timeline */}
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-7 top-14 w-0.5 bg-slate-800" style={{ bottom: '56px' }} />

              <div className="flex flex-col gap-3">
                {milestones.map((m, i) => (
                  <div key={m.id} className="flex gap-4">
                    {/* Left: step number */}
                    <div className="flex w-14 shrink-0 flex-col items-center">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold z-10
                        ${m.isComplete ? 'bg-emerald-600 text-white' : i === 0 || milestones[i - 1]?.isComplete ? 'bg-violet-700 text-white' : 'bg-slate-800 text-slate-600'}`}
                      >
                        {m.isComplete ? '✓' : i + 1}
                      </div>
                    </div>
                    {/* Right: card */}
                    <div className="flex-1 pb-3">
                      <MilestoneCard m={m} index={i} visible={visible} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {overallPct === 100 && (
              <div className="animate-bounce-in mt-8 rounded-2xl border border-emerald-700/60 bg-emerald-950/40 p-6 text-center">
                <div className="animate-float mb-3 text-5xl">🏆</div>
                <h3 className="text-xl font-black text-emerald-300">ยอดเยี่ยมมาก!</h3>
                <p className="mt-1 text-slate-400">คุณผ่านทุก Milestone แล้ว — คุณเก่งมากเลย!</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
