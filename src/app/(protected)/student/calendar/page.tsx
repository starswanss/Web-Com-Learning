'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { CONTENT_TYPE_LABELS, type ContentType } from '@/types';

interface Assignment {
  id: string;
  title: string;
  dueDate?: { _seconds: number };
  contentType?: ContentType;
  submission?: { status: string; score?: number } | null;
}

function dueDateColor(seconds: number): string {
  const diff = seconds * 1000 - Date.now();
  const days = diff / 86400000;
  if (diff < 0) return 'bg-red-600';
  if (days < 1) return 'bg-red-500';
  if (days < 3) return 'bg-orange-500';
  if (days < 7) return 'bg-amber-400';
  return 'bg-emerald-500';
}

export default function StudentCalendarPage() {
  const { profile, loading } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [fetching, setFetching] = useState(true);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    if (profile?.role !== 'student') return;
    const saved = localStorage.getItem('lms_subject');
    const sub = saved ? JSON.parse(saved) : null;
    const url = sub ? `/api/assignments/student?subject=${sub.id}` : '/api/assignments/student';
    fetch(url)
      .then((r) => r.json())
      .then((data) => setAssignments(Array.isArray(data) ? data : []))
      .finally(() => setFetching(false));
  }, [profile]);

  if (loading || !profile) return <Spinner />;

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Map day → assignments due that day
  const dayMap = new Map<number, Assignment[]>();
  assignments.forEach((a) => {
    if (!a.dueDate) return;
    const d = new Date(a.dueDate._seconds * 1000);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(a);
    }
  });

  const selectedAssignments = selectedDay !== null ? (dayMap.get(selectedDay) ?? []) : [];

  const monthNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const dayNames = ['อา','จ','อ','พ','พฤ','ศ','ส'];

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
    setSelectedDay(null);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/student" className="text-xs text-slate-500 hover:text-slate-300">←</Link>
            <h1 className="text-base font-semibold text-slate-100">ปฏิทินกำหนดส่ง</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {fetching ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Month navigation */}
            <div className="flex items-center justify-between">
              <button onClick={prevMonth} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:border-slate-600 hover:text-slate-200 transition-all">←</button>
              <h2 className="text-sm font-semibold text-slate-200">{monthNames[month]} {year + 543}</h2>
              <button onClick={nextMonth} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:border-slate-600 hover:text-slate-200 transition-all">→</button>
            </div>

            {/* Day name header */}
            <div className="grid grid-cols-7 gap-1">
              {dayNames.map((d) => (
                <div key={d} className="py-1 text-center text-xs font-medium text-slate-600">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (!day) return <div key={`empty-${i}`} />;
                const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                const dayAssignments = dayMap.get(day) ?? [];
                const isSelected = selectedDay === day;

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={`relative min-h-[56px] rounded-xl border p-1.5 text-left transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-950/40'
                        : isToday
                        ? 'border-slate-600 bg-slate-800'
                        : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                    }`}
                  >
                    <span className={`text-xs font-medium ${isToday ? 'text-blue-400' : 'text-slate-400'}`}>{day}</span>
                    <div className="mt-1 flex flex-wrap gap-0.5">
                      {dayAssignments.slice(0, 3).map((a) => (
                        <span
                          key={a.id}
                          className={`h-1.5 w-1.5 rounded-full ${a.submission ? 'bg-slate-600' : dueDateColor(a.dueDate!._seconds)}`}
                        />
                      ))}
                      {dayAssignments.length > 3 && (
                        <span className="text-[9px] text-slate-600">+{dayAssignments.length - 3}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected day detail */}
            {selectedDay !== null && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {selectedDay} {monthNames[month]} {year + 543}
                </p>
                {selectedAssignments.length === 0 ? (
                  <p className="text-sm text-slate-600">ไม่มีใบงานกำหนดส่งวันนี้</p>
                ) : (
                  <div className="space-y-3">
                    {selectedAssignments.map((a) => {
                      const ctMeta = a.contentType ? CONTENT_TYPE_LABELS[a.contentType] : null;
                      return (
                        <Link
                          key={a.id}
                          href={`/student/assignments/${a.id}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 hover:border-slate-700 transition-all"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {ctMeta && <span className="text-base">{ctMeta.icon}</span>}
                            <span className="text-sm text-slate-200 truncate">{a.title}</span>
                          </div>
                          {a.submission ? (
                            <span className="shrink-0 rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-xs text-emerald-400">ส่งแล้ว</span>
                          ) : (
                            <span className="shrink-0 rounded-full border border-blue-800 bg-blue-950/40 px-2 py-0.5 text-xs text-blue-400">ยังไม่ส่ง</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-600" />เกินกำหนด/วันนี้</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-500" />{'<'} 3 วัน</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />3–7 วัน</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />7+ วัน</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-600" />ส่งแล้ว</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
    </div>
  );
}
