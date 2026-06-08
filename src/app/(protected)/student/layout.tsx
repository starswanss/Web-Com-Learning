'use client';

import Link from 'next/link';
import DevToolsGuard from '@/components/DevToolsGuard';

const BOTTOM_NAV = [
  { href: '/student/quests',      icon: '⚡', label: 'เควส' },
  { href: '/student/milestones',  icon: '🏁', label: 'Milestone' },
  { href: '/student/leaderboard', icon: '🏆', label: 'อันดับ' },
  { href: '/student/profile',     icon: '📋', label: 'Portfolio' },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DevToolsGuard />

      <div className="sm:pb-0 pb-20">
        {children}
      </div>

      {/* ── Bottom nav bar (mobile) ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-800/70 bg-slate-950/95 backdrop-blur-md flex">
        {BOTTOM_NAV.map(({ href, icon, label }) => (
          <Link key={href} href={href}
            className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-slate-500 transition-colors active:bg-slate-800/40">
            <span className="text-base leading-none">{icon}</span>
            <span className="text-[9px] font-semibold">{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
