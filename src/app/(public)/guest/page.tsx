'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface GuestAssignment {
  id: string;
  title: string;
  contentType: string;
  subjectId: string | null;
  unit: string | null;
  classIds: string[];
  isGroupWork: boolean;
  dueDate?: { _seconds: number } | null;
  createdAt?: { _seconds: number } | null;
}

const TYPE_META: Record<string, { label: string; icon: string; cls: string }> = {
  worksheet: { label: 'ใบงาน', icon: '📝', cls: 'border-blue-800 bg-blue-950/40 text-blue-300' },
  quiz:      { label: 'แบบทดสอบ', icon: '🧪', cls: 'border-purple-800 bg-purple-950/40 text-purple-300' },
  knowledge: { label: 'ใบความรู้', icon: '📖', cls: 'border-emerald-800 bg-emerald-950/40 text-emerald-300' },
};

export default function GuestHome() {
  const [assignments, setAssignments] = useState<GuestAssignment[] | null>(null);
  const [error, setError] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/guest/assignments')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: GuestAssignment[]) => setAssignments(Array.isArray(d) ? d : []))
      .catch(() => setError(true));
  }, []);

  const allClasses = assignments
    ? Array.from(new Set(assignments.flatMap((a) => a.classIds))).sort()
    : [];

  const visible = (assignments ?? []).filter(
    (a) =>
      (!typeFilter || a.contentType === typeFilter) &&
      (!classFilter || a.classIds.includes(classFilter))
  );

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Guest banner */}
      <div className="border-b border-amber-900/50 bg-amber-950/30 px-4 py-2.5">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="text-xs text-amber-300">
            👁 โหมดผู้เยี่ยมชม — ดูได้อย่างเดียว ไม่สามารถแก้ไขอะไรได้ และชื่อนักเรียนถูกซ่อนไว้
          </p>
          <Link
            href="/login"
            className="shrink-0 rounded-lg border border-amber-700 bg-amber-950/50 px-3 py-1 text-xs text-amber-200 transition-all hover:border-amber-500"
          >
            เข้าสู่ระบบ →
          </Link>
        </div>
      </div>

      <header className="border-b border-slate-800 bg-slate-900 px-4 py-5">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-lg font-semibold text-slate-100">Computing Science &amp; IT — ม.3</h1>
          <p className="text-sm text-slate-500">รายการงานทั้งหมด — คลิกเพื่อดูงานที่นักเรียนส่ง</p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {error ? (
          <div className="rounded-xl border border-dashed border-slate-800 py-16 text-center">
            <p className="text-sm text-slate-500">โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่</p>
          </div>
        ) : assignments === null ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="mb-5 space-y-2">
              <div className="flex flex-wrap gap-2">
                <FilterChip active={!typeFilter} onClick={() => setTypeFilter(null)}>ทุกประเภท</FilterChip>
                {Object.entries(TYPE_META).map(([key, m]) => (
                  <FilterChip key={key} active={typeFilter === key} onClick={() => setTypeFilter(typeFilter === key ? null : key)}>
                    {m.icon} {m.label}
                  </FilterChip>
                ))}
              </div>
              {allClasses.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <FilterChip active={!classFilter} onClick={() => setClassFilter(null)}>ทุกห้อง</FilterChip>
                  {allClasses.map((c) => (
                    <FilterChip key={c} active={classFilter === c} onClick={() => setClassFilter(classFilter === c ? null : c)}>
                      {c}
                    </FilterChip>
                  ))}
                </div>
              )}
            </div>

            {visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 py-16 text-center">
                <p className="text-sm text-slate-500">ไม่มีงานที่ตรงกับตัวกรอง</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {visible.map((a) => {
                  const meta = TYPE_META[a.contentType] ?? TYPE_META.worksheet;
                  return (
                    <Link
                      key={a.id}
                      href={`/guest/assignments/${a.id}`}
                      className="group rounded-2xl border border-slate-800 bg-slate-900 p-4 transition-all hover:border-slate-600"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${meta.cls}`}>
                          {meta.icon} {meta.label}
                        </span>
                        {a.isGroupWork && (
                          <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">👥 กลุ่ม</span>
                        )}
                      </div>
                      <p className="font-medium text-slate-100 group-hover:text-white">{a.title}</p>
                      {a.unit && <p className="mt-0.5 text-xs text-slate-500">{a.unit}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {a.classIds.map((c) => (
                          <span key={c} className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[10px] text-slate-500">{c}</span>
                        ))}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="mt-10 text-center">
          <p className="text-[11px] text-slate-500">
            พัฒนาโดย <span className="font-semibold text-slate-300">นายวชิรวิทย์ วงษ์รักษา</span>
          </p>
          <p className="mt-0.5 text-[10px] text-slate-600">โรงเรียนราชสีมาวิทยาลัย</p>
        </div>
      </main>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${
        active
          ? 'border-blue-600 bg-blue-950/50 text-blue-300'
          : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
      }`}
    >
      {children}
    </button>
  );
}
