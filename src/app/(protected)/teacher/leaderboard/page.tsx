'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { levelColor, levelBarColor } from '@/lib/xp';

interface LeaderboardEntry {
  rank: number;
  studentId: string;
  studentName: string;
  classId: string;
  avgScore: number | null;
  bonusPoints: number;
  medals: { icon: string; reason: string }[];
  totalScore: number;
  submittedCount: number;
}

interface LevelEntry {
  uid: string;
  displayName: string;
  classId: string;
  xp: number;
  level: number;
  title: string;
  currentXp: number;
  nextLevelXp: number;
  progress: number;
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

/* ─── Top-3 podium card ─── */
function PodiumCard({ entry, size }: { entry: LeaderboardEntry; size: 'large' | 'medium' | 'small' }) {
  const cfg = {
    large: {
      order: 'order-2',
      outer: 'bg-gradient-to-b from-orange-950/80 via-yellow-950/50 to-amber-950/50 border-orange-500/80 ring-2 ring-orange-500/50 shadow-2xl shadow-orange-900/50 animate-fire-glow-1',
      nameSize: 'text-xl font-bold',
      scoreSize: 'text-5xl font-black',
      avatar: 'h-20 w-20 text-4xl',
      avatarBorder: 'border-orange-700/60',
      crown: true,
      rankIcon: '👑',
      totalColor: 'text-yellow-300',
      pedestal: 'h-10 bg-orange-900/40 border border-t-0 border-orange-700/40',
      fireRank: 1 as const,
    },
    medium: {
      order: 'order-1',
      outer: 'bg-gradient-to-b from-slate-800/80 to-slate-900/80 border-amber-600/50 ring-1 ring-amber-600/20 shadow-lg shadow-amber-900/15 animate-fire-glow-2',
      nameSize: 'text-base font-semibold',
      scoreSize: 'text-4xl font-black',
      avatar: 'h-16 w-16 text-3xl',
      avatarBorder: 'border-slate-600',
      crown: false,
      rankIcon: '🥈',
      totalColor: 'text-slate-200',
      pedestal: 'h-6 bg-amber-900/20 border border-t-0 border-amber-700/20',
      fireRank: 2 as const,
    },
    small: {
      order: 'order-3',
      outer: 'bg-gradient-to-b from-orange-950/60 to-slate-900/80 border-amber-700/50 ring-1 ring-amber-700/20 shadow-md shadow-amber-900/10 animate-fire-glow-3',
      nameSize: 'text-base font-semibold',
      scoreSize: 'text-4xl font-black',
      avatar: 'h-16 w-16 text-3xl',
      avatarBorder: 'border-slate-600',
      crown: false,
      rankIcon: '🥉',
      totalColor: 'text-orange-300',
      pedestal: 'h-4 bg-orange-900/20 border border-t-0 border-orange-800/20',
      fireRank: 3 as const,
    },
  }[size];

  const initials = entry.studentName.slice(0, 2).toUpperCase() || '??';

  return (
    <div className={`${cfg.order} flex flex-col items-center`}>
      <FireDecor rank={cfg.fireRank} />
      {cfg.crown && <div className="mt-1 text-3xl animate-bounce">👑</div>}
      <div className={`w-full rounded-3xl border p-5 text-center ${cfg.outer}`}>
        {size === 'large' && (
          <div className="-mt-1 mb-2 flex justify-center">
            <span className="animate-pulse rounded-full border border-orange-700/50 bg-orange-950/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-400">
              🔥 ON FIRE
            </span>
          </div>
        )}
        <div className={`mx-auto mb-3 flex items-center justify-center rounded-full bg-slate-800 border ${cfg.avatarBorder} ${cfg.avatar}`}>
          <span>{initials}</span>
        </div>
        <div className="mb-2 text-2xl">{cfg.rankIcon}</div>
        <p className={`${cfg.nameSize} text-slate-100 leading-tight`}>{entry.studentName}</p>
        <p className="mt-1 text-xs font-medium text-slate-400 tracking-wide">{entry.classId}</p>
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
        {entry.medals.length > 0 && (
          <div className="mt-2 flex justify-center gap-1 flex-wrap">
            {entry.medals.slice(0, 5).map((m, i) => (
              <span key={i} title={m.reason} className="text-base cursor-default">{m.icon}</span>
            ))}
            {entry.medals.length > 5 && <span className="text-[10px] text-slate-500">+{entry.medals.length - 5}</span>}
          </div>
        )}
        <p className="mt-2 text-[10px] text-slate-600">ส่งงาน {entry.submittedCount} ชิ้น</p>
      </div>
      <div className={`mt-0 w-full rounded-b-xl ${cfg.pedestal}`} />
    </div>
  );
}

export default function TeacherLeaderboardPage() {
  const { profile, loading } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [levelEntries, setLevelEntries] = useState<LevelEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);
  const [classFilter, setClassFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'score' | 'level'>('score');

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    const saved = localStorage.getItem('lms_subject');
    const sub = saved ? JSON.parse(saved) : null;
    setSubject(sub);
    const url = sub ? `/api/teacher/leaderboard?subject=${sub.id}` : '/api/teacher/leaderboard';
    Promise.all([
      fetch(url).then(r => r.json()),
      fetch('/api/teacher/level-ranking').then(r => r.json()),
    ]).then(([scoreData, levelData]) => {
      setEntries(Array.isArray(scoreData) ? scoreData : []);
      setLevelEntries(Array.isArray(levelData) ? levelData : []);
    }).finally(() => setFetching(false));
  }, [profile]);

  if (loading || !profile) return <Spinner />;

  const classes = Array.from(new Set(entries.map((e) => e.classId))).sort();
  const filtered = classFilter ? entries.filter((e) => e.classId === classFilter) : entries;
  const ranked = filtered.map((e, i) => ({ ...e, rank: i + 1 }));
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  const filteredLevel = classFilter
    ? levelEntries.filter(e => e.classId === classFilter)
    : levelEntries;

  /* Arrange podium: 2nd | 1st | 3rd */
  const podiumOrder: ('large' | 'medium' | 'small')[] = ['medium', 'large', 'small'];
  const podiumEntries = top3.length === 3
    ? [top3[1], top3[0], top3[2]]
    : top3;

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/teacher" className="text-xs text-slate-500 hover:text-slate-300">←</Link>
            <div>
              <h1 className="text-base font-semibold text-slate-100">🏆 Hall of Fame</h1>
              {subject && <p className="text-xs text-slate-500">{subject.name}</p>}
            </div>
          </div>
          <Link
            href="/teacher/bonus-points"
            className="rounded-xl border border-yellow-700 px-3 py-1.5 text-xs text-yellow-400 hover:border-yellow-600 hover:text-yellow-300 transition-all"
          >
            ⭐ ให้ Bonus
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {/* ── Tabs ── */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setActiveTab('score')}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'score'
                ? 'border-orange-600 bg-orange-950/30 text-orange-300'
                : 'border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            🔥 อันดับคะแนน
          </button>
          <button
            onClick={() => setActiveTab('level')}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'level'
                ? 'border-orange-600 bg-orange-950/30 text-orange-300'
                : 'border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            🔥 อันดับเลเวล
          </button>
        </div>

        {/* Class filter */}
        {classes.length > 1 && (
          <div className="mb-8 flex flex-wrap gap-2">
            <button
              onClick={() => setClassFilter('')}
              className={`rounded-xl border px-3 py-1.5 text-xs transition-all ${!classFilter ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
            >
              ทั้งหมด
            </button>
            {classes.map((c) => (
              <button
                key={c}
                onClick={() => setClassFilter(c)}
                className={`rounded-xl border px-3 py-1.5 text-xs transition-all ${classFilter === c ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {fetching ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-orange-400" />
          </div>
        ) : activeTab === 'score' ? (
          /* ─── Score Tab ─── */
          ranked.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 py-20 text-center">
              <p className="text-slate-400">ยังไม่มีข้อมูลคะแนน</p>
              <p className="mt-1 text-sm text-slate-500">นักเรียนต้องส่งงานและได้รับคะแนนก่อน</p>
            </div>
          ) : (
            <>
              {/* ─── Podium ─── */}
              {podiumEntries.length >= 1 && (
                <div className="mb-10">
                  <p className="mb-6 text-center text-xs font-bold uppercase tracking-widest text-orange-500/80">
                    🔥 อันดับสูงสุด 🔥
                  </p>
                  <div className={`grid gap-4 items-end ${podiumEntries.length === 3 ? 'grid-cols-3' : podiumEntries.length === 2 ? 'grid-cols-2' : 'grid-cols-1 max-w-xs mx-auto'}`}>
                    {podiumEntries.length === 3
                      ? podiumEntries.map((e, i) => (
                          <PodiumCard key={e.studentId} entry={e} size={podiumOrder[i]} />
                        ))
                      : podiumEntries.map((e) => (
                          <PodiumCard key={e.studentId} entry={e} size={e.rank === 1 ? 'large' : e.rank === 2 ? 'medium' : 'small'} />
                        ))}
                  </div>
                </div>
              )}

              {/* ─── Full ranking list ─── */}
              {rest.length > 0 && (
                <div className="rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="border-b border-slate-800 bg-slate-900 px-5 py-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">อันดับถัดไป</p>
                  </div>
                  <div className="divide-y divide-slate-800">
                    {rest.map((e) => (
                      <div key={e.studentId}
                        className="flex items-center gap-4 bg-slate-950 px-5 py-3.5 hover:bg-slate-900 transition-colors">
                        <div className="w-10 flex-shrink-0 text-center">
                          <span className="text-sm font-bold text-slate-500">#{e.rank}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-200 truncate">{e.studentName}</p>
                          <p className="text-xs text-slate-500">{e.classId} · ส่งงาน {e.submittedCount} ชิ้น</p>
                        </div>
                        {e.medals.length > 0 && (
                          <div className="hidden sm:flex gap-0.5 shrink-0">
                            {e.medals.slice(0, 3).map((m, i) => (
                              <span key={i} title={m.reason} className="text-sm">{m.icon}</span>
                            ))}
                          </div>
                        )}
                        <div className="shrink-0 text-right">
                          <p className={`text-lg font-bold ${scoreColor(e.totalScore)}`}>{e.totalScore}</p>
                          {e.bonusPoints > 0 && (
                            <p className="text-[10px] text-yellow-600">+{e.bonusPoints} bonus</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        ) : (
          /* ─── Level Tab ─── */
          filteredLevel.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 py-20 text-center">
              <p className="text-slate-400">ยังไม่มีข้อมูล XP</p>
              <p className="mt-1 text-sm text-slate-500">นักเรียนต้องส่งงานเพื่อสะสม XP</p>
            </div>
          ) : (
            <>
              {/* Top 3 level cards */}
              {filteredLevel.length >= 1 && (
                <div className="mb-8">
                  <p className="mb-5 text-center text-xs font-bold uppercase tracking-widest text-orange-500/80">
                    🔥 เลเวลสูงสุด 🔥
                  </p>
                  <div className={`grid gap-4 items-end ${filteredLevel.length >= 3 ? 'grid-cols-3' : filteredLevel.length === 2 ? 'grid-cols-2' : 'grid-cols-1 max-w-xs mx-auto'}`}>
                    {filteredLevel.slice(0, 3).map((e, i) => {
                      const medals = ['👑', '🥈', '🥉'];
                      const rings = [
                        'border-orange-500/70 ring-2 ring-orange-500/40 bg-gradient-to-b from-orange-950/80 via-violet-950/40 to-slate-900 animate-fire-glow-1',
                        'border-amber-600/50 ring-1 ring-amber-600/20 bg-gradient-to-b from-slate-800/80 to-slate-900 animate-fire-glow-2',
                        'border-amber-700/40 bg-gradient-to-b from-slate-800/50 to-slate-900 animate-fire-glow-3',
                      ];
                      const initials = e.displayName.slice(0, 2).toUpperCase() || '??';
                      const fireRank = (i + 1) as 1 | 2 | 3;
                      return (
                        <div key={e.uid} className="flex flex-col items-center">
                          <FireDecor rank={fireRank} />
                          {i === 0 && <div className="mt-1 text-3xl animate-bounce">👑</div>}
                          <div className={`w-full rounded-2xl border p-5 text-center ${rings[i] ?? rings[2]}`}>
                            {i === 0 && (
                              <div className="-mt-1 mb-2 flex justify-center">
                                <span className="animate-pulse rounded-full border border-orange-700/50 bg-orange-950/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-400">
                                  🔥 ON FIRE
                                </span>
                              </div>
                            )}
                            <div className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 border ${i === 0 ? 'border-orange-700/60' : 'border-slate-700'} text-xl font-bold text-slate-300`}>
                              {initials}
                            </div>
                            <div className="mb-1 text-xl">{medals[i]}</div>
                            <p className="text-sm font-semibold text-slate-100 leading-tight truncate">{e.displayName}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500">{e.classId}</p>
                            <p className={`mt-3 text-4xl font-black ${levelColor(e.level)}`}>Lv.{e.level}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{e.title}</p>
                            <div className="mt-3 px-2">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className={`h-full rounded-full ${levelBarColor(e.level)} transition-all`}
                                  style={{ width: `${e.progress}%` }}
                                />
                              </div>
                              <p className="mt-1 text-[9px] text-slate-600">{e.currentXp}/{e.nextLevelXp} XP · รวม {e.xp} XP</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Level ranking list */}
              {filteredLevel.length > 3 && (
                <div className="rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="border-b border-slate-800 bg-slate-900 px-5 py-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">อันดับเลเวลทั้งหมด</p>
                  </div>
                  <div className="divide-y divide-slate-800">
                    {filteredLevel.slice(3).map((e, i) => (
                      <div key={e.uid}
                        className="flex items-center gap-4 bg-slate-950 px-5 py-3 hover:bg-slate-900 transition-colors">
                        <div className="w-8 flex-shrink-0 text-center">
                          <span className="text-sm font-bold text-slate-600">#{i + 4}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-200 truncate">{e.displayName}</p>
                          <p className="text-xs text-slate-500">{e.classId}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-3">
                          <div className="text-right">
                            <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-800">
                              <div
                                className={`h-full rounded-full ${levelBarColor(e.level)}`}
                                style={{ width: `${e.progress}%` }}
                              />
                            </div>
                            <p className="mt-0.5 text-[9px] text-slate-600">{e.xp} XP</p>
                          </div>
                          <p className={`text-base font-bold ${levelColor(e.level)}`}>Lv.{e.level}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
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
