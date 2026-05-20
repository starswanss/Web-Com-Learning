export interface LevelTier {
  fromLevel: number;
  name: string;
  icon: string;
}

export interface LevelSettings {
  xpPerLevel: number;
  maxLevel: number | null;
  tiers: LevelTier[];
}

export const DEFAULT_SETTINGS: LevelSettings = {
  xpPerLevel: 100,
  maxLevel: null,
  tiers: [
    { fromLevel: 1,  name: 'ผู้เริ่มต้น', icon: '🌱' },
    { fromLevel: 3,  name: 'นักเรียนใหม่', icon: '📖' },
    { fromLevel: 5,  name: 'นักเรียนดี',   icon: '⭐' },
    { fromLevel: 7,  name: 'เก่งมาก',       icon: '🔥' },
    { fromLevel: 9,  name: 'ยอดเยี่ยม',     icon: '💎' },
    { fromLevel: 11, name: 'อัจฉริยะ',      icon: '🧠' },
  ],
};

export function levelTitle(level: number, tiers?: LevelTier[]): string {
  const t = tiers ?? DEFAULT_SETTINGS.tiers;
  const sorted = [...t].sort((a, b) => b.fromLevel - a.fromLevel);
  return sorted.find(tier => level >= tier.fromLevel)?.name ?? 'ผู้เริ่มต้น';
}

export function levelIcon(level: number, tiers?: LevelTier[]): string {
  const t = tiers ?? DEFAULT_SETTINGS.tiers;
  const sorted = [...t].sort((a, b) => b.fromLevel - a.fromLevel);
  return sorted.find(tier => level >= tier.fromLevel)?.icon ?? '🌱';
}

export interface LevelInfo {
  level: number;
  title: string;
  icon: string;
  currentXp: number;
  nextLevelXp: number;
  progress: number;
  totalXp: number;
}

export function calcLevel(xp: number, settings?: LevelSettings): LevelInfo {
  const s = settings ?? DEFAULT_SETTINGS;
  const totalXp = Math.max(0, xp);
  const xpPerLevel = Math.max(1, s.xpPerLevel);
  let level = Math.floor(totalXp / xpPerLevel) + 1;
  if (s.maxLevel !== null) level = Math.min(level, s.maxLevel);
  const currentXp = totalXp % xpPerLevel;
  const progress = Math.round((currentXp / xpPerLevel) * 100);
  return {
    level,
    title: levelTitle(level, s.tiers),
    icon: levelIcon(level, s.tiers),
    currentXp,
    nextLevelXp: xpPerLevel,
    progress,
    totalXp,
  };
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

export function levelColor(level: number, tiers?: LevelTier[]): string {
  const t = tiers ?? DEFAULT_SETTINGS.tiers;
  const sorted = [...t].sort((a, b) => b.fromLevel - a.fromLevel);
  const idx = sorted.findIndex(tier => level >= tier.fromLevel);
  const COLORS = ['text-yellow-400', 'text-violet-400', 'text-blue-400', 'text-emerald-400', 'text-sky-400', 'text-slate-400'];
  return COLORS[Math.min(idx, COLORS.length - 1)] ?? 'text-slate-400';
}

export function levelBarColor(level: number, tiers?: LevelTier[]): string {
  const t = tiers ?? DEFAULT_SETTINGS.tiers;
  const sorted = [...t].sort((a, b) => b.fromLevel - a.fromLevel);
  const idx = sorted.findIndex(tier => level >= tier.fromLevel);
  const COLORS = ['bg-yellow-400', 'bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-sky-500', 'bg-slate-500'];
  return COLORS[Math.min(idx, COLORS.length - 1)] ?? 'bg-slate-500';
}
