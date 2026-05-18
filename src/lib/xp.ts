const LEVEL_TITLES: Record<number, string> = {
  1: 'ผู้เริ่มต้น',
  2: 'ผู้เริ่มต้น',
  3: 'นักเรียนใหม่',
  4: 'นักเรียนใหม่',
  5: 'นักเรียนดี',
  6: 'นักเรียนดี',
  7: 'เก่งมาก',
  8: 'เก่งมาก',
  9: 'ยอดเยี่ยม',
  10: 'ยอดเยี่ยม',
};

export function levelTitle(level: number): string {
  if (level >= 11) return 'อัจฉริยะ';
  return LEVEL_TITLES[level] ?? 'ผู้เริ่มต้น';
}

export interface LevelInfo {
  level: number;
  title: string;
  currentXp: number;   // XP earned within this level
  nextLevelXp: number; // XP needed to reach next level
  progress: number;    // 0-100 percent
  totalXp: number;
}

export function calcLevel(xp: number): LevelInfo {
  const totalXp = Math.max(0, xp);
  const XP_PER_LEVEL = 100;
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const currentXp = totalXp % XP_PER_LEVEL;
  const nextLevelXp = XP_PER_LEVEL;
  const progress = Math.round((currentXp / nextLevelXp) * 100);
  return { level, title: levelTitle(level), currentXp, nextLevelXp, progress, totalXp };
}

export function calcXpGain(score: number | null): number {
  const base = 10;
  if (score === null) return base;
  if (score >= 90) return base + 50;
  if (score >= 75) return base + 30;
  if (score >= 60) return base + 15;
  if (score >= 50) return base + 5;
  return base;
}

export function levelColor(level: number): string {
  if (level >= 11) return 'text-yellow-400';
  if (level >= 9)  return 'text-violet-400';
  if (level >= 7)  return 'text-blue-400';
  if (level >= 5)  return 'text-emerald-400';
  if (level >= 3)  return 'text-sky-400';
  return 'text-slate-400';
}

export function levelBarColor(level: number): string {
  if (level >= 11) return 'bg-yellow-400';
  if (level >= 9)  return 'bg-violet-500';
  if (level >= 7)  return 'bg-blue-500';
  if (level >= 5)  return 'bg-emerald-500';
  if (level >= 3)  return 'bg-sky-500';
  return 'bg-slate-500';
}
