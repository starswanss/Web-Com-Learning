'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { GuestFooter, GuestTopBar, Spinner, TYPE_META, scoreTone, typeMeta } from './_shared';

interface GuestAssignment {
  id: string;
  title: string;
  contentType: string;
  subjectId: string;
  unit: string | null;
  isGroupWork: boolean;
  submissionCount: number;
  avgScore: number | null;
}

interface GuestSubject {
  id: string;
  name: string;
  classCount: number;
  assignmentCount: number;
  submissionCount: number;
}

interface GuestData {
  logoUrl: string | null;
  stats: { subjects: number; worksheets: number; knowledge: number; submissions: number; students: number; avgScore: number | null };
  subjects: GuestSubject[];
  assignments: GuestAssignment[];
}

const NO_UNIT = 'งานอื่น ๆ';

export default function GuestHome() {
  const [data, setData] = useState<GuestData | null>(null);
  const [error, setError] = useState(false);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/guest/assignments')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: GuestData) => {
        setData(d);
        setSubjectId(d.subjects[0]?.id ?? null);
      })
      .catch(() => setError(true));
  }, []);

  // The selected subject's work, filtered, grouped by unit in display order.
  const units = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const list = data.assignments.filter(
      (a) =>
        a.subjectId === subjectId &&
        (!typeFilter || a.contentType === typeFilter) &&
        (!q || a.title.toLowerCase().includes(q) || (a.unit ?? '').toLowerCase().includes(q)),
    );
    const groups = new Map<string, GuestAssignment[]>();
    for (const a of list) {
      const key = a.unit?.trim() || NO_UNIT;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }
    return Array.from(groups.entries()).sort(([x], [y]) =>
      x === NO_UNIT ? 1 : y === NO_UNIT ? -1 : x.localeCompare(y, 'th', { numeric: true }),
    );
  }, [data, subjectId, typeFilter, query]);

  const shownCount = units.reduce((n, [, items]) => n + items.length, 0);

  return (
    <div className="min-h-screen bg-slate-950">
      <GuestTopBar logoUrl={data?.logoUrl} />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-slate-800/80">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(59,130,246,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.16),transparent_55%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">ห้องเรียนออนไลน์ · มัธยมศึกษาปีที่ 3</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-50 sm:text-4xl">
            ผลงานและบทเรียนของนักเรียน ม.3
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
            ใบงาน ใบความรู้ และผลงานจริงของนักเรียนในรายวิชาวิทยาการคำนวณและเทคโนโลยีสารสนเทศ
            เปิดให้ผู้ปกครองและผู้สนใจเข้าชมได้ โดยไม่แสดงชื่อนักเรียน
          </p>

          {data && (
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile icon="📚" value={data.stats.worksheets + data.stats.knowledge} label="บทเรียนและใบงาน" sub={`${data.stats.subjects} รายวิชา`} />
              <StatTile icon="📥" value={data.stats.submissions} label="ผลงานที่นักเรียนส่ง" />
              <StatTile icon="🎓" value={data.stats.students} label="นักเรียนที่ส่งงาน" />
              <StatTile icon="⭐" value={data.stats.avgScore ?? '—'} label="คะแนนเฉลี่ย" sub={data.stats.avgScore != null ? 'จาก 100' : undefined} />
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {error ? (
          <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center">
            <p className="text-sm text-slate-500">โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>
          </div>
        ) : !data ? (
          <Spinner />
        ) : (
          <>
            {/* ── Subject tabs ── */}
            <div className="grid gap-3 sm:grid-cols-2">
              {data.subjects.map((s) => {
                const active = s.id === subjectId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSubjectId(s.id)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      active
                        ? 'border-blue-600/80 bg-gradient-to-br from-blue-950/70 to-slate-900 shadow-lg shadow-blue-950/40'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                    }`}
                  >
                    <p className={`font-semibold ${active ? 'text-white' : 'text-slate-200'}`}>{s.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {s.assignmentCount} บทเรียน/ใบงาน · {s.submissionCount.toLocaleString()} ผลงาน
                    </p>
                  </button>
                );
              })}
            </div>

            {/* ── Toolbar ── */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">🔍</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ค้นหาชื่อใบงานหรือหน่วยการเรียนรู้"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Chip active={!typeFilter} onClick={() => setTypeFilter(null)}>ทั้งหมด</Chip>
                {Object.entries(TYPE_META).map(([key, m]) => (
                  <Chip key={key} active={typeFilter === key} onClick={() => setTypeFilter(typeFilter === key ? null : key)}>
                    {m.icon} {m.label}
                  </Chip>
                ))}
              </div>
            </div>

            {/* ── Units ── */}
            {shownCount === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-slate-800 py-16 text-center">
                <p className="text-sm text-slate-500">ไม่พบงานที่ตรงกับการค้นหา</p>
              </div>
            ) : (
              <div className="mt-8 space-y-10">
                {units.map(([unit, items]) => (
                  <section key={unit}>
                    <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-slate-800/80 pb-2">
                      <h2 className="text-sm font-semibold text-slate-200 sm:text-base">{unit}</h2>
                      <span className="shrink-0 text-xs text-slate-500">{items.length} รายการ</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((a) => <AssignmentCard key={a.id} a={a} />)}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}

        <GuestFooter />
      </main>
    </div>
  );
}

function StatTile({ icon, value, label, sub }: { icon: string; value: number | string; label: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4 backdrop-blur">
      <p className="text-lg">{icon}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-50">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-slate-400">{label}</p>
      {sub && <p className="text-[10px] text-slate-600">{sub}</p>}
    </div>
  );
}

function AssignmentCard({ a }: { a: GuestAssignment }) {
  const meta = typeMeta(a.contentType);
  const isKnowledge = a.contentType === 'knowledge';
  return (
    <Link
      href={`/guest/assignments/${a.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-4 transition-all hover:-translate-y-0.5 hover:border-slate-600 hover:shadow-lg hover:shadow-black/30"
    >
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${meta.accent} opacity-70 group-hover:opacity-100`} />
      <div className="flex items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${meta.badge}`}>{meta.icon} {meta.label}</span>
        {a.isGroupWork && <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">👥 งานกลุ่ม</span>}
      </div>
      <p className="mt-2.5 line-clamp-2 font-medium leading-snug text-slate-100 group-hover:text-white">{a.title}</p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs">
        {isKnowledge ? (
          <span className="text-emerald-400/90">อ่านเนื้อหา</span>
        ) : (
          <span className="text-slate-400">
            <span className="font-semibold text-slate-200">{a.submissionCount.toLocaleString()}</span> ผลงาน
          </span>
        )}
        <span className="flex items-center gap-2">
          {!isKnowledge && a.avgScore != null && (
            <span className={`rounded-full border px-2 py-0.5 font-semibold ${scoreTone(a.avgScore)}`}>เฉลี่ย {a.avgScore}</span>
          )}
          <span className="text-slate-600 transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </Link>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
        active ? 'border-blue-600 bg-blue-950/60 text-blue-200' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-600'
      }`}
    >
      {children}
    </button>
  );
}
