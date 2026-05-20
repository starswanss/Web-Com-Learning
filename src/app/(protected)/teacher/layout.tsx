'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

const NAV_LINKS = [
  { href: '/teacher/overview',      icon: '📊', label: 'ภาพรวม' },
  { href: '/teacher/students',      icon: '🎓', label: 'นักเรียน' },
  { href: '/teacher/members',       icon: '👥', label: 'สมาชิก' },
  { href: '/teacher/milestones',    icon: '🏁', label: 'Milestone' },
  { href: '/teacher/quests',        icon: '⚡', label: 'เควส' },
  { href: '/teacher/leaderboard',   icon: '🏆', label: 'Rank' },
  { href: '/teacher/analytics',     icon: '📈', label: 'Analytics' },
  { href: '/teacher/timetable',     icon: '🗓', label: 'ตารางสอน' },
  { href: '/teacher/question-bank', icon: '❓', label: 'Q-Bank' },
  { href: '/teacher/templates',     icon: '📋', label: 'Template' },
  { href: '/teacher/export-report', icon: '📤', label: 'Export' },
  { href: '/teacher/admin',         icon: '⚙️', label: 'Admin' },
];

const BOTTOM_SHORTCUTS = [
  { href: '/teacher/overview',    icon: '📊', label: 'ภาพรวม' },
  { href: '/teacher/members',     icon: '👥', label: 'สมาชิก' },
  { href: '/teacher/leaderboard', icon: '🏆', label: 'Rank' },
  { href: '/teacher/timetable',   icon: '🗓', label: 'ตารางสอน' },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Page content — extra bottom padding on mobile to clear the nav bar */}
      <div className="xl:pb-0 pb-20">
        {children}
      </div>

      {/* ── Full-menu overlay (mobile) ── */}
      {menuOpen && (
        <div className="xl:hidden fixed inset-0 z-50 flex flex-col">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-slate-800 bg-slate-900 px-4 pt-4 pb-8 z-10">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-200">เมนูทั้งหมด</p>
              <button
                onClick={() => setMenuOpen(false)}
                className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-slate-200"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {NAV_LINKS.map(n => (
                <Link key={n.href} href={n.href} onClick={() => setMenuOpen(false)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-800/60 px-2 py-4 text-center text-slate-300 transition-all active:bg-slate-700">
                  <span className="text-xl leading-none">{n.icon}</span>
                  <span className="text-[11px] font-semibold leading-tight">{n.label}</span>
                </Link>
              ))}
            </div>
            <button
              onClick={signOut}
              className="mt-4 w-full rounded-xl border border-red-900/50 py-3 text-sm text-red-400 active:bg-red-950/30"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom nav bar (mobile) ── */}
      <nav className="xl:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-800/70 bg-slate-950/95 backdrop-blur-md grid grid-cols-5">
        {BOTTOM_SHORTCUTS.map(({ href, icon, label }) => (
          <Link key={href} href={href}
            className="flex flex-col items-center gap-0.5 py-2.5 text-slate-500 transition-colors active:bg-slate-800/40">
            <span className="text-base leading-none">{icon}</span>
            <span className="text-[9px] font-semibold">{label}</span>
          </Link>
        ))}
        <button
          onClick={() => setMenuOpen(true)}
          className="flex flex-col items-center gap-0.5 py-2.5 text-slate-400 transition-colors active:bg-slate-800/40"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
          <span className="text-[9px] font-semibold">เมนู</span>
        </button>
      </nav>
    </>
  );
}
