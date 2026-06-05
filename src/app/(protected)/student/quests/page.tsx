'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { calcLevel, levelBarColor, levelColor, DEFAULT_SETTINGS, type LevelSettings } from '@/lib/xp';

interface Quest {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  icon: string;
  resetType: 'daily' | 'once';
  isClaimed: boolean;
  subjectId?: string | null;
  subjectName?: string | null;
}

function Spinner() {
  return <div className="flex items-center justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-violet-500" /></div>;
}

function MiniXpBar({ xp, levelSettings }: { xp: number; levelSettings: LevelSettings }) {
  const { level, title, currentXp, nextLevelXp, progress, totalXp } = calcLevel(xp, levelSettings);
  const bar = levelBarColor(level);
  const txt = levelColor(level);
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-base font-black ${txt}`}>
        {level}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-xs font-bold ${txt}`}>Lv.{level} {title}</span>
          <span className="text-[10px] text-slate-500">{totalXp} XP รวม</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className={`h-full rounded-full transition-all duration-700 ${bar}`} style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-0.5 text-[10px] text-slate-600">{currentXp}/{nextLevelXp} XP ถึง Lv.{level + 1}</p>
      </div>
    </div>
  );
}

export default function StudentQuestsPage() {
  const { profile, loading, refreshProfile } = useAuth();
  const router = useRouter();

  const [quests, setQuests] = useState<Quest[]>([]);
  const [fetching, setFetching] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [justClaimed, setJustClaimed] = useState<{ id: string; xp: number } | null>(null);
  const [localXp, setLocalXp] = useState<number>(0);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [levelSettings, setLevelSettings] = useState<LevelSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!loading && profile?.role !== 'student') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile) setLocalXp(profile.xp ?? 0);
  }, [profile]);

  const loadQuests = useCallback(() => {
    fetch('/api/student/quests')
      .then((r) => r.json())
      .then((d) => setQuests(Array.isArray(d) ? d : []))
      .finally(() => setFetching(false));
  }, []);

  useEffect(() => {
    if (profile?.role === 'student') {
      loadQuests();
      fetch('/api/teacher/level-settings')
        .then((r) => r.json())
        .then((d) => setLevelSettings((s) => ({ ...s, ...d })))
        .catch(() => {});
    }
  }, [profile, loadQuests]);

  async function handleClaim(quest: Quest) {
    if (quest.isClaimed || claiming) return;
    setClaiming(quest.id);
    try {
      const res = await fetch(`/api/student/quests/${quest.id}/claim`, { method: 'POST' });
      if (res.status === 409) {
        setQuests((prev) => prev.map((q) => q.id === quest.id ? { ...q, isClaimed: true } : q));
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const gained = data.xpAwarded as number;
      setLocalXp((prev) => prev + gained);
      setQuests((prev) => prev.map((q) => q.id === quest.id ? { ...q, isClaimed: true } : q));
      setJustClaimed({ id: quest.id, xp: gained });
      setTimeout(() => setJustClaimed(null), 3500);
      // Silently refresh profile in background to sync XP
      refreshProfile().catch(() => {});
    } finally {
      setClaiming(null);
    }
  }

  if (loading || !profile) return <Spinner />;

  // Derive unique subjects from quest list
  const subjectMap = new Map<string, string>();
  quests.forEach((q) => { if (q.subjectId && q.subjectName) subjectMap.set(q.subjectId, q.subjectName); });
  const availableSubjects = Array.from(subjectMap.entries()).map(([id, name]) => ({ id, name }));

  const visibleQuests = subjectFilter
    ? quests.filter((q) => q.subjectId === subjectFilter)
    : quests;

  const available = visibleQuests.filter((q) => !q.isClaimed);
  const claimed = visibleQuests.filter((q) => q.isClaimed);

  // Time until midnight reset
  const now = new Date();
  const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
  const hUntil = Math.floor(msUntilMidnight / 3600000);
  const mUntil = Math.floor((msUntilMidnight % 3600000) / 60000);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-5 py-4">
          <Link href="/student" className="text-sm text-slate-400 hover:text-slate-200 shrink-0">← กลับ</Link>
          <div className="flex-1">
            <h1 className="text-base font-bold text-slate-100">⚡ เควสรายวัน</h1>
            <p className="text-[11px] text-slate-500">reset ใน {hUntil} ชม. {mUntil} นาที</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-5 space-y-5">

        {/* XP Summary Card */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-900/60 p-5">
          <MiniXpBar xp={localXp} levelSettings={levelSettings} />
        </div>

        {/* Subject filter tabs — only shown when there are multiple subjects */}
        {!fetching && availableSubjects.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSubjectFilter(null)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                subjectFilter === null
                  ? 'border-violet-600 bg-violet-950/60 text-violet-300'
                  : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              ทั้งหมด
            </button>
            {availableSubjects.map((s) => (
              <button
                key={s.id}
                onClick={() => setSubjectFilter(subjectFilter === s.id ? null : s.id)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                  subjectFilter === s.id
                    ? 'border-violet-600 bg-violet-950/60 text-violet-300'
                    : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* XP gain toast */}
        {justClaimed && (
          <div className="animate-bounce-in flex items-center gap-3 rounded-2xl border border-yellow-700/60 bg-gradient-to-r from-yellow-950/80 to-amber-950/60 px-5 py-3">
            <span className="text-2xl">⭐</span>
            <div>
              <p className="text-sm font-bold text-yellow-300">+{justClaimed.xp} XP !</p>
              <p className="text-[11px] text-yellow-600">รับ XP สำเร็จ — เลเวลอัปเดตแล้ว</p>
            </div>
          </div>
        )}

        {fetching ? <Spinner /> : (
          <>
            {/* Available quests */}
            {available.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-4 w-0.5 rounded-full bg-violet-500" />
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-violet-400">รับ XP ได้เลย</h2>
                  <span className="rounded-full bg-violet-950/60 border border-violet-800/60 px-2 py-0.5 text-[10px] text-violet-400">{available.length}</span>
                </div>
                <div className="space-y-2.5">
                  {available.map((q) => (
                    <QuestCard
                      key={q.id}
                      quest={q}
                      isClaiming={claiming === q.id}
                      justClaimed={justClaimed?.id === q.id}
                      onClaim={() => handleClaim(q)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {available.length === 0 && claimed.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <span className="text-5xl">⚡</span>
                <p className="font-medium text-slate-400">
                  {subjectFilter ? 'ไม่มีเควสสำหรับวิชานี้' : 'ยังไม่มีเควสสำหรับวันนี้'}
                </p>
                <p className="text-sm text-slate-600">
                  {subjectFilter ? 'ลองเลือกวิชาอื่น หรือดูทั้งหมด' : 'ครูจะเพิ่มเควสให้เร็วๆ นี้'}
                </p>
              </div>
            )}

            {available.length === 0 && claimed.length > 0 && (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-800/40 bg-emerald-950/20 py-8">
                <span className="text-4xl">🎉</span>
                <p className="font-semibold text-emerald-400">รับ XP ครบทุกเควสแล้ว!</p>
                <p className="text-xs text-slate-600">กลับมาอีกครั้งพรุ่งนี้</p>
              </div>
            )}

            {/* Claimed quests */}
            {claimed.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-4 w-0.5 rounded-full bg-emerald-600" />
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-emerald-600">รับแล้ววันนี้</h2>
                  <span className="rounded-full bg-emerald-950/40 border border-emerald-900/60 px-2 py-0.5 text-[10px] text-emerald-600">{claimed.length}</span>
                </div>
                <div className="space-y-2">
                  {claimed.map((q) => (
                    <QuestCard
                      key={q.id}
                      quest={q}
                      isClaiming={false}
                      justClaimed={false}
                      onClaim={() => {}}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function QuestCard({
  quest, isClaiming, justClaimed, onClaim,
}: {
  quest: Quest;
  isClaiming: boolean;
  justClaimed: boolean;
  onClaim: () => void;
}) {
  const claimed = quest.isClaimed;

  return (
    <div className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
      claimed
        ? 'border-slate-800/60 bg-slate-900/40'
        : justClaimed
        ? 'border-yellow-600/60 bg-yellow-950/20 animate-pulse-glow'
        : 'border-slate-700/80 bg-slate-900 hover:border-violet-700/60'
    }`}>
      {!claimed && <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-violet-600 to-blue-500" />}

      <div className="flex items-center gap-4 p-4">
        {/* Icon */}
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${
          claimed ? 'bg-slate-800/60' : 'bg-slate-800'
        }`}>
          {claimed ? '✅' : quest.icon}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-semibold ${claimed ? 'text-slate-500 line-through' : 'text-slate-100'}`}>
              {quest.title}
            </p>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
              quest.resetType === 'daily'
                ? 'bg-blue-950/60 text-blue-400 border border-blue-800/50'
                : 'bg-amber-950/60 text-amber-400 border border-amber-800/50'
            }`}>
              {quest.resetType === 'daily' ? '🔄 รายวัน' : '🏅 ครั้งเดียว'}
            </span>
          </div>
          {quest.description && (
            <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{quest.description}</p>
          )}
          <span className={`mt-1 inline-flex items-center gap-1 text-xs font-bold ${
            claimed ? 'text-emerald-600' : 'text-yellow-400'
          }`}>
            {claimed ? '✓ ได้รับ' : '+'}{quest.xpReward} XP
          </span>
        </div>

        {/* Claim button */}
        {claimed ? (
          <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-800/40 bg-emerald-950/30 text-emerald-500">
            ✓
          </div>
        ) : (
          <button
            onClick={onClaim}
            disabled={isClaiming}
            className="shrink-0 rounded-xl border border-violet-600/70 bg-violet-600 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-violet-500 active:scale-95 disabled:opacity-60"
          >
            {isClaiming ? '…' : 'รับ XP'}
          </button>
        )}
      </div>
    </div>
  );
}
