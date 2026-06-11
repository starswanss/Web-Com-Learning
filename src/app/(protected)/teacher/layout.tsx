'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import Credit from '@/components/Credit';

const NAV_GROUPS = [
  {
    title: 'ภาพรวม',
    items: [
      { href: '/teacher/overview',         icon: '📊', label: 'ภาพรวม' },
      { href: '/teacher/analytics',        icon: '📈', label: 'Analytics' },
      { href: '/teacher/submission-stats', icon: '📋', label: 'การส่งงาน' },
    ],
  },
  {
    title: 'นักเรียน',
    items: [
      { href: '/teacher/students',    icon: '🎓', label: 'นักเรียน' },
      { href: '/teacher/members',     icon: '👥', label: 'สมาชิก' },
      { href: '/teacher/gradebook',   icon: '📒', label: 'Gradebook' },
      { href: '/teacher/leaderboard', icon: '🏆', label: 'อันดับ' },
    ],
  },
  {
    title: 'เกม & XP',
    items: [
      { href: '/teacher/quests',         icon: '⚡', label: 'เควส' },
      { href: '/teacher/milestones',     icon: '🏁', label: 'Milestone' },
      { href: '/teacher/level-settings', icon: '🎚️', label: 'ตั้งค่าเลเวล' },
    ],
  },
  {
    title: 'เนื้อหา & สอน',
    items: [
      { href: '/teacher/question-bank', icon: '🏦', label: 'คลังข้อสอบ' },
      { href: '/teacher/templates',     icon: '🧩', label: 'เทมเพลต' },
      { href: '/teacher/timetable',     icon: '🗓️', label: 'ตารางสอน' },
    ],
  },
  {
    title: 'เครื่องมือ',
    items: [
      { href: '/teacher/export-report', icon: '📤', label: 'Export รายงาน' },
      { href: '/teacher/admin',         icon: '⚙️', label: 'Admin' },
    ],
  },
];

const BOTTOM_SHORTCUTS = [
  { href: '/teacher/overview',    icon: '📊', label: 'ภาพรวม' },
  { href: '/teacher/members',     icon: '👥', label: 'สมาชิก' },
  { href: '/teacher/gradebook',   icon: '📒', label: 'Gradebook' },
  { href: '/teacher/leaderboard', icon: '🏆', label: 'Rank' },
];

interface ClassNote {
  classId: string;
  week: number;
  topic: string;
  note: string;
}

function ClassNotesPanel() {
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [notes, setNotes] = useState<Record<string, ClassNote>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load classes from assignments and existing notes
  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch('/api/assignments').then(r => r.json()),
      fetch('/api/teacher/class-notes').then(r => r.json()),
    ]).then(([assignments, rawNotes]) => {
      const classSet = new Set<string>();
      if (Array.isArray(assignments)) {
        assignments.forEach((a: { classIds?: string[] }) => a.classIds?.forEach(c => classSet.add(c)));
      }
      const classArr = Array.from(classSet).sort();
      setClasses(classArr);
      if (classArr.length > 0 && !selectedClass) setSelectedClass(classArr[0]);

      if (Array.isArray(rawNotes)) {
        const map: Record<string, ClassNote> = {};
        rawNotes.forEach((n: ClassNote & { classId: string }) => { map[n.classId] = n; });
        setNotes(map);
      }
    }).catch(() => {});
  }, [open]);

  const current: ClassNote = notes[selectedClass] ?? { classId: selectedClass, week: 1, topic: '', note: '' };

  const autoSave = useCallback((updated: ClassNote) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      setSaveError(false);
      try {
        const res = await fetch('/api/teacher/class-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        });
        if (!res.ok) setSaveError(true);
      } catch {
        setSaveError(true);
      } finally {
        setSaving(false);
      }
    }, 800);
  }, []);

  function update(field: keyof ClassNote, value: string | number) {
    const updated = { ...current, classId: selectedClass, [field]: value };
    setNotes(prev => ({ ...prev, [selectedClass]: updated }));
    autoSave(updated);
  }

  return (
    <div className="border-t border-slate-800 shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="w-5 text-center text-base">📝</span>
          <span>โน้ตห้องเรียน</span>
        </span>
        <span className="text-xs text-slate-600">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {classes.length === 0 ? (
            <p className="text-[11px] text-slate-600 text-center py-2">ยังไม่มีห้องในระบบ</p>
          ) : (
            <>
              {/* Class tabs */}
              <div className="flex flex-wrap gap-1">
                {classes.map(c => (
                  <button
                    key={c}
                    onClick={() => setSelectedClass(c)}
                    className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold transition-all ${
                      selectedClass === c
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {selectedClass && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-slate-500 shrink-0">สัปดาห์ที่</label>
                    <input
                      type="number"
                      min={1}
                      max={52}
                      value={current.week}
                      onChange={e => update('week', Number(e.target.value))}
                      className="w-14 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                    {saving && <span className="text-[10px] text-slate-600">บันทึก…</span>}
                    {!saving && saveError && <span className="text-[10px] text-red-500">บันทึกไม่สำเร็จ</span>}
                  </div>
                  <input
                    type="text"
                    placeholder="หัวข้อที่สอน"
                    value={current.topic}
                    onChange={e => update('topic', e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                  <textarea
                    placeholder="บันทึกเพิ่มเติม…"
                    value={current.note}
                    onChange={e => update('note', e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-56 flex-col border-r border-slate-800 bg-slate-900 z-30">
        {/* Brand */}
        <div className="px-5 py-5 border-b border-slate-800 shrink-0">
          <p className="text-sm font-bold text-slate-100">🎓 Teacher Portal</p>
          <p className="text-[11px] text-slate-500 mt-0.5">ระบบจัดการการเรียนรู้</p>
        </div>

        {/* Nav links — grouped by category */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-0.5">
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                {group.title}
              </p>
              {group.items.map((n) => {
                const isActive = pathname === n.href || pathname.startsWith(n.href + '/');
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-blue-950/70 text-blue-300 border border-blue-800/50 shadow-sm'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-base leading-none w-5 text-center">{n.icon}</span>
                    <span>{n.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Class Notes panel */}
        <ClassNotesPanel />

        {/* Sign out */}
        <div className="px-2 py-3 border-t border-slate-800 shrink-0">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-400 hover:bg-red-950/30 transition-all"
          >
            <span className="w-5 text-center">🚪</span>
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </aside>

      {/* Page content — offset by sidebar width on desktop, bottom pad on mobile */}
      <div className="md:ml-56 pb-20 md:pb-0">
        {children}
        <Credit />
      </div>

      {/* ── Full-menu overlay (mobile only) ── */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-slate-800 bg-slate-900 px-4 pt-4 pb-8 z-10">
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
            <div className="space-y-4">
              {NAV_GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                    {group.title}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {group.items.map((n) => (
                      <Link key={n.href} href={n.href} onClick={() => setMenuOpen(false)}
                        className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-800/60 px-2 py-4 text-center text-slate-300 transition-all active:bg-slate-700">
                        <span className="text-xl leading-none">{n.icon}</span>
                        <span className="text-[11px] font-semibold leading-tight">{n.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
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

      {/* ── Bottom nav bar (mobile only) ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-800/70 bg-slate-950/95 backdrop-blur-md grid grid-cols-5">
        {BOTTOM_SHORTCUTS.map(({ href, icon, label }) => (
          <Link key={href} href={href}
            className={`flex flex-col items-center gap-0.5 py-2.5 transition-colors active:bg-slate-800/40 ${
              pathname === href ? 'text-blue-400' : 'text-slate-500'
            }`}>
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
