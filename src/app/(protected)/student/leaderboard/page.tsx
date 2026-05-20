'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface LeaderboardEntry {
  rank: number;
  studentId: string;
  avgScore: number | null;
  bonusPoints: number;
  medalCount: number;
  totalScore: number;
  submittedCount: number;
  isMe: boolean;
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

/* ─── Flame decoration above podium cards ─── */
function FireDecor({ rank }: { rank: 1 | 2 | 3 }) {
  if (rank === 1) return (
    <div className="relative flex justify-center gap-0.5 select-none pointer-events-none" aria-hidden>
      <span className="text-xl animate-fire-flicker" style={{ animationDelay: '0.05s', animationDuration: '0.62s' }}>🔥</span>
      <span className="text-3xl animate-fire-flicker" style={{ animationDelay: '0s',    animationDuration: '0.75s' }}>🔥</span>
      <span className="text-xl animate-fire-flicker" style={{ animationDelay: '0.15s', animationDuration: '0.67s' }}>🔥</span>
      <span className="absolute -top-3 left-[28%] animate-ember-rise text-xs text-orange-400" style={{ animationDelay: '0.4s'  }}>✦</span>
      <span className="absolute -top-2 right-[22%] animate-ember-rise text-[10px] text-yellow-400" style={{ animationDelay: '1.0s'  }}>◆</span>
      <span className="absolute -top-1 left-[52%] animate-ember-rise text-[8px]  text-red-400"    style={{ animationDelay: '1.6s'  }}>✦</span>
    </div>
  );
  if (rank === 2) return (
    <div className="flex justify-center gap-1 select-none pointer-events-none" aria-hidden>
      <span className="text-lg animate-fire-flicker" style={{ animationDelay: '0.1s',  animationDuration: '0.82s' }}>🔥</span>
      <span className="text-xl animate-fire-flicker" style={{ animationDelay: '0.3s',  animationDuration: '0.90s' }}>🔥</span>
    </div>
  );
  return (
    <div className="flex justify-center select-none pointer-events-none" aria-hidden>
      <span className="text-lg animate-fire-flicker" style={{ animationDelay: '0.2s', animationDuration: '1s' }}>🔥</span>
    </div>
  );
}

function AnonPodiumCard({ entry, size, myName }: { entry: LeaderboardEntry; size: 'large' | 'medium' | 'small'; myName?: string }) {
  const isMe = entry.isMe;
  const cfg = {
    large: {
      outer: isMe
        ? 'bg-gradient-to-b from-yellow-950/80 to-blue-950/50 border-yellow-500/70 ring-2 ring-yellow-500/40 shadow-xl shadow-yellow-900/30 animate-fire-glow-1'
        : 'bg-gradient-to-b from-orange-950/80 via-yellow-950/50 to-amber-950/50 border-orange-500/80 ring-2 ring-orange-500/50 shadow-2xl shadow-orange-900/50 animate-fire-glow-1',
      nameSize: 'text-xl font-bold',
      scoreSize: 'text-5xl font-black',
      avatar: 'h-20 w-20 text-3xl',
      avatarBorder: isMe ? 'border-yellow-700/60' : 'border-orange-700/60',
      rankIcon: '👑',
      totalColor: 'text-yellow-300',
      pedestal: 'h-10 bg-orange-900/40 border border-t-0 border-orange-700/40',
      fireRank: 1 as const,
    },
    medium: {
      outer: isMe
        ? 'bg-gradient-to-b from-slate-800/80 to-blue-950/50 border-blue-500/60 ring-2 ring-blue-500/30 animate-fire-glow-2'
        : 'bg-gradient-to-b from-slate-800/80 to-slate-900/80 border-amber-600/50 ring-1 ring-amber-600/20 shadow-lg shadow-amber-900/15 animate-fire-glow-2',
      nameSize: 'text-base font-semibold',
      scoreSize: 'text-4xl font-black',
      avatar: 'h-16 w-16 text-2xl',
      avatarBorder: 'border-slate-600',
      rankIcon: '🥈',
      totalColor: 'text-slate-200',
      pedestal: 'h-6 bg-amber-900/20 border border-t-0 border-amber-700/20',
      fireRank: 2 as const,
    },
    small: {
      outer: isMe
        ? 'bg-gradient-to-b from-orange-950/70 to-blue-950/50 border-blue-500/60 ring-2 ring-blue-500/30 animate-fire-glow-3'
        : 'bg-gradient-to-b from-orange-950/60 to-slate-900/80 border-amber-700/50 ring-1 ring-amber-700/20 shadow-md shadow-amber-900/10 animate-fire-glow-3',
      nameSize: 'text-base font-semibold',
      scoreSize: 'text-4xl font-black',
      avatar: 'h-16 w-16 text-2xl',
      avatarBorder: 'border-slate-600',
      rankIcon: '🥉',
      totalColor: 'text-orange-300',
      pedestal: 'h-4 bg-orange-900/20 border border-t-0 border-orange-800/20',
      fireRank: 3 as const,
    },
  }[size];

  const displayName = isMe ? (myName ?? 'คุณ') : `อันดับ ${entry.rank}`;
  const avatarContent = isMe ? '😊' : size === 'large' ? '🎖' : size === 'medium' ? '🏅' : '🎗';

  return (
    <div className={`flex flex-col items-center ${size === 'large' ? 'order-2' : size === 'medium' ? 'order-1' : 'order-3'}`}>
      <FireDecor rank={cfg.fireRank} />
      {size === 'large' && <div className="mt-1 text-3xl animate-bounce">👑</div>}
      <div className={`w-full rounded-3xl border p-5 text-center ${cfg.outer}`}>
        {size === 'large' && (
          <div className="-mt-1 mb-2 flex justify-center">
            <span className={`animate-pulse rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              isMe
                ? 'border-yellow-700/50 bg-yellow-950/40 text-yellow-400'
                : 'border-orange-700/50 bg-orange-950/40 text-orange-400'
            }`}>
              🔥 ON FIRE
            </span>
          </div>
        )}
        <div className={`mx-auto mb-3 flex items-center justify-center rounded-full bg-slate-800 border ${cfg.avatarBorder} ${cfg.avatar}`}>
          {avatarContent}
        </div>
        <div className="mb-2 text-2xl">{cfg.rankIcon}</div>
        <p className={`${cfg.nameSize} ${isMe ? 'text-blue-300' : 'text-slate-100'} leading-tight`}>
          {displayName}
          {isMe && <span className="ml-1 text-xs text-blue-400">← ฉัน</span>}
        </p>
        <p className={`mt-3 ${cfg.scoreSize} ${cfg.totalColor}`}>{entry.totalScore}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">คะแนนรวม</p>
        <div className="mt-2 flex items-center justify-center gap-2 text-[11px]">
          <span className={entry.avgScore !== null ? scoreColor(entry.avgScore) : 'text-slate-600'}>
            avg {entry.avgScore ?? '—'}
          </span>
          {entry.bonusPoints > 0 && (
            <>
              <span className="text-slate-600">+</span>
              <span className="text-yellow-400">+{entry.bonusPoints} bonus</span>
            </>
          )}
        </div>
        {entry.medalCount > 0 && (
          <p className="mt-1 text-[11px] text-yellow-500">🏅 ×{entry.medalCount}</p>
        )}
        <p className="mt-2 text-[10px] text-slate-600">ส่งงาน {entry.submittedCount} ชิ้น</p>
      </div>
      <div className={`mt-0 w-full rounded-b-xl ${cfg.pedestal}`} />
    </div>
  );
}

export default function StudentLeaderboardPage() {
  const { user, profile, loading } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (profile?.role !== 'student') return;
    const saved = localStorage.getItem('lms_subject');
    const sub = saved ? JSON.parse(saved) : null;
    setSubject(sub);
    const url = sub ? `/api/student/leaderboard?subject=${sub.id}` : '/api/student/leaderboard';
    fetch(url)
      .then((r) => r.json())
      .then((data) => setEntries(Array.isArray(data) ? data : []))
      .finally(() => setFetching(false));
  }, [profile]);

  if (loading || !profile) return <Spinner />;

  const myName = user?.displayName ?? 'คุณ';
  const myEntry = entries.find((e) => e.isMe);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  /* Podium order: 2nd | 1st | 3rd */
  const sizes: ('large' | 'medium' | 'small')[] = ['medium', 'large', 'small'];
  const podiumEntries = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;
  const podiumSizes  = top3.length === 3 ? sizes : (['large', 'medium', 'small'] as const).slice(0, top3.length);

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <Link href="/student" className="text-xs text-slate-500 hover:text-slate-300">←</Link>
          <div>
            <h1 className="text-base font-semibold text-slate-100">🏆 Leaderboard ห้องเรียน</h1>
            {subject && <p className="text-xs text-slate-500">{subject.name}</p>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-8">
        {/* My rank highlight card (if not in top 3) */}
        {myEntry && myEntry.rank > 3 && (
          <div className="mb-6 rounded-2xl border border-blue-800/60 bg-blue-950/20 p-5 text-center">
            <p className="mb-1 text-xs text-slate-500">อันดับของคุณ</p>
            <p className="text-3xl font-black text-blue-300">#{myEntry.rank}</p>
            <p className={`mt-1 text-2xl font-bold ${myEntry.avgScore !== null ? scoreColor(myEntry.avgScore) : 'text-slate-500'}`}>
              {myEntry.totalScore} <span className="text-sm text-slate-500">คะแนนรวม</span>
            </p>
            {myEntry.bonusPoints > 0 && (
              <p className="text-xs text-yellow-400 mt-0.5">avg {myEntry.avgScore} + {myEntry.bonusPoints} bonus</p>
            )}
            <p className="mt-1 text-xs text-slate-500">จาก {entries.length} คน · ส่งงาน {myEntry.submittedCount} ชิ้น</p>
          </div>
        )}

        {fetching ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-orange-400" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 py-20 text-center">
            <p className="text-slate-400">ยังไม่มีข้อมูลคะแนน</p>
            <p className="mt-1 text-sm text-slate-500">ส่งงานและรับคะแนนก่อนนะ</p>
          </div>
        ) : (
          <>
            {/* ─── Podium ─── */}
            {podiumEntries.length >= 1 && (
              <div className="mb-8">
                <p className="mb-6 text-center text-xs font-bold uppercase tracking-widest text-orange-500/80">🔥 ผู้นำห้องเรียน 🔥</p>
                <div className={`grid gap-3 items-end ${podiumEntries.length === 3 ? 'grid-cols-3' : podiumEntries.length === 2 ? 'grid-cols-2' : 'grid-cols-1 max-w-[200px] mx-auto'}`}>
                  {podiumEntries.map((e, i) => (
                    <AnonPodiumCard
                      key={e.studentId}
                      entry={e}
                      size={podiumSizes[i]}
                      myName={myName}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ─── Rest of the list ─── */}
            {rest.length > 0 && (
              <div className="rounded-2xl border border-slate-800 overflow-hidden">
                <div className="divide-y divide-slate-800">
                  {rest.map((e) => (
                    <div
                      key={e.studentId}
                      className={`flex items-center gap-4 px-5 py-3.5 transition-colors ${
                        e.isMe ? 'bg-blue-950/30 border-l-2 border-l-blue-500' : 'bg-slate-950 hover:bg-slate-900'
                      }`}
                    >
                      <div className="w-10 flex-shrink-0 text-center">
                        <span className="text-sm font-bold text-slate-500">#{e.rank}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200">
                          {e.isMe ? myName : `อันดับที่ ${e.rank}`}
                          {e.isMe && <span className="ml-2 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">ฉัน</span>}
                        </p>
                        <p className="text-xs text-slate-500">ส่งงาน {e.submittedCount} ชิ้น</p>
                      </div>
                      {e.medalCount > 0 && (
                        <span className="text-xs text-yellow-500">🏅 ×{e.medalCount}</span>
                      )}
                      <div className="shrink-0 text-right">
                        <p className={`text-lg font-bold ${scoreColor(e.totalScore)}`}>{e.totalScore}</p>
                        {e.bonusPoints > 0 && (
                          <p className="text-[10px] text-yellow-600">+{e.bonusPoints}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-5 text-center text-xs text-slate-600">
              * ชื่อของเพื่อนถูกซ่อนไว้เพื่อความเป็นส่วนตัว
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-orange-400" />
    </div>
  );
}
