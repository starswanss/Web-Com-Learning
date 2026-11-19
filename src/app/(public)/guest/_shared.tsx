'use client';

import Link from 'next/link';
import { useEffect, useSyncExternalStore } from 'react';

/** Shared look for the public (guest) showcase pages. */

export const TYPE_META: Record<string, { label: string; icon: string; badge: string; accent: string }> = {
  worksheet: { label: 'ใบงาน', icon: '📝', badge: 'border-blue-800/70 bg-blue-950/50 text-blue-300', accent: 'from-blue-500 to-cyan-400' },
  quiz: { label: 'แบบทดสอบ', icon: '🧪', badge: 'border-violet-800/70 bg-violet-950/50 text-violet-300', accent: 'from-violet-500 to-fuchsia-400' },
  knowledge: { label: 'ใบความรู้', icon: '📖', badge: 'border-emerald-800/70 bg-emerald-950/50 text-emerald-300', accent: 'from-emerald-500 to-teal-400' },
};

export function typeMeta(contentType: string) {
  return TYPE_META[contentType] ?? TYPE_META.worksheet;
}

export function scoreTone(score: number) {
  if (score >= 80) return 'text-emerald-300 border-emerald-700/70 bg-emerald-950/50';
  if (score >= 60) return 'text-amber-300 border-amber-700/70 bg-amber-950/50';
  if (score >= 40) return 'text-orange-300 border-orange-700/70 bg-orange-950/50';
  return 'text-red-300 border-red-700/70 bg-red-950/50';
}

const LOGO_KEY = 'guest_logo';
const noopSubscribe = () => () => {};

/** Top bar. The home page passes the school logo; other pages reuse the copy it
 *  remembered for this tab, so the logo doesn't flicker to the fallback. */
export function GuestTopBar({ logoUrl: given }: { logoUrl?: string | null }) {
  // Remember the logo for this tab so pages without it don't flicker to the fallback.
  useEffect(() => {
    if (!given) return;
    try { sessionStorage.setItem(LOGO_KEY, given); } catch { /* storage full or blocked */ }
  }, [given]);
  const stored = useSyncExternalStore(
    noopSubscribe,
    () => { try { return sessionStorage.getItem(LOGO_KEY); } catch { return null; } },
    () => null,
  );
  const logoUrl = given ?? stored;
  return (
    <div className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/guest" className="flex min-w-0 items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 text-sm font-bold text-white">CS</span>
          )}
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-slate-100">Computing Science &amp; IT</p>
            <p className="truncate text-[11px] text-slate-500">โรงเรียนราชสีมาวิทยาลัย</p>
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded-full border border-amber-800/60 bg-amber-950/40 px-2.5 py-1 text-[11px] text-amber-300 sm:inline">
            👁 ผู้เยี่ยมชม · ดูได้อย่างเดียว
          </span>
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  );
}

export function GuestFooter() {
  return (
    <footer className="mt-16 border-t border-slate-800/80 py-8 text-center">
      <p className="text-xs text-slate-500">
        ชื่อนักเรียนทุกคนถูกซ่อนไว้เพื่อความเป็นส่วนตัว — ผลงานแสดงเป็น &ldquo;นักเรียนคนที่ N&rdquo;
      </p>
      <p className="mt-3 text-[11px] text-slate-500">
        พัฒนาโดย <span className="font-semibold text-slate-300">นายวชิรวิทย์ วงษ์รักษา</span>
      </p>
      <p className="mt-0.5 text-[10px] text-slate-600">โรงเรียนราชสีมาวิทยาลัย</p>
    </footer>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-blue-400" />
    </div>
  );
}
