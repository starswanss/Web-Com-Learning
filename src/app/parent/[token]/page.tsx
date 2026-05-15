'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface AssignmentRow {
  id: string;
  title: string;
  contentType: string;
  unit: string | null;
  dueDate: { _seconds: number } | null;
  submission: null | {
    status: string;
    score: number | null;
    feedback: string | null;
    submittedAt: { _seconds: number } | null;
  };
}

interface ReportData {
  student: { name: string; classId: string };
  expiresAt: number;
  stats: { total: number; submitted: number; graded: number; avgScore: number | null };
  assignments: AssignmentRow[];
}

function fmt(seconds?: number | null) {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
  if (score >= 40) return 'text-orange-600 bg-orange-50 border-orange-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

const CT_LABELS: Record<string, string> = {
  knowledge: '📖 ใบความรู้',
  worksheet: '📝 ใบงาน',
  quiz: '✏️ แบบทดสอบ',
};

export default function ParentReportPage() {
  const params = useParams();
  const token = params?.token as string;

  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/parent/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('ไม่สามารถโหลดข้อมูลได้'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  if (error || !data) {
    const msg =
      error === 'Link expired' ? 'ลิงก์หมดอายุแล้ว กรุณาขอลิงก์ใหม่จากครู'
      : error === 'Link not found' ? 'ไม่พบลิงก์นี้'
      : 'ไม่สามารถโหลดข้อมูลได้';
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
        <p className="text-4xl">🔒</p>
        <p className="text-lg font-semibold text-slate-700">{msg}</p>
        <p className="text-sm text-slate-400">ลิงก์นี้ใช้ได้ 30 วัน</p>
      </div>
    );
  }

  const { student, stats, assignments, expiresAt } = data;
  const submissionRate = Math.round((stats.submitted / (stats.total || 1)) * 100);

  const unitMap = new Map<string, AssignmentRow[]>();
  assignments.forEach((a) => {
    const key = a.unit ?? 'ไม่ระบุหน่วย';
    if (!unitMap.has(key)) unitMap.set(key, []);
    unitMap.get(key)!.push(a);
  });

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-3xl font-bold text-slate-800">{student.name}</p>
          <p className="mt-1 text-slate-500">ห้อง {student.classId} · Computing Science & IT ม.3</p>
          <p className="mt-1 text-xs text-slate-400">
            รายงานนี้ใช้ได้ถึง {new Date(expiresAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'ใบงานทั้งหมด', value: stats.total, unit: 'ใบ', color: 'text-slate-700' },
            { label: 'ส่งแล้ว', value: stats.submitted, unit: `${submissionRate}%`, color: 'text-blue-600' },
            { label: 'ตรวจแล้ว', value: stats.graded, unit: 'ใบ', color: 'text-emerald-600' },
            { label: 'คะแนนเฉลี่ย', value: stats.avgScore ?? '—', unit: stats.avgScore !== null ? '/100' : '', color: stats.avgScore !== null ? (stats.avgScore >= 80 ? 'text-emerald-600' : stats.avgScore >= 60 ? 'text-amber-600' : 'text-red-600') : 'text-slate-400' },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
              {s.unit && <p className="text-xs text-slate-400">{s.unit}</p>}
            </div>
          ))}
        </div>

        {/* Score bar */}
        {stats.avgScore !== null && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-500">ความคืบหน้าคะแนนเฉลี่ย</span>
              <span className="font-semibold text-slate-700">{stats.avgScore}/100</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${stats.avgScore >= 80 ? 'bg-emerald-500' : stats.avgScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${stats.avgScore}%` }}
              />
            </div>
          </div>
        )}

        {/* Assignments by unit */}
        {Array.from(unitMap.entries()).map(([unit, items]) => (
          <div key={unit} className="mb-6">
            <h2 className="mb-3 text-sm font-semibold text-slate-600">{unit}</h2>
            <div className="space-y-2">
              {items.map((a) => {
                const sub = a.submission;
                const hasScore = sub && typeof sub.score === 'number';
                return (
                  <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{a.title}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                        <span>{CT_LABELS[a.contentType] ?? a.contentType}</span>
                        {a.dueDate && <span>· กำหนดส่ง {fmt(a.dueDate._seconds)}</span>}
                        {sub?.submittedAt && <span>· ส่ง {fmt(sub.submittedAt._seconds)}</span>}
                      </div>
                      {sub?.feedback && (
                        <p className="mt-1 text-xs text-slate-500 italic line-clamp-1">{sub.feedback}</p>
                      )}
                    </div>
                    {hasScore ? (
                      <span className={`shrink-0 rounded-xl border px-3 py-1.5 text-sm font-bold ${scoreColor(sub!.score!)}`}>
                        {sub!.score}
                      </span>
                    ) : sub ? (
                      <span className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-600">รอตรวจ</span>
                    ) : (
                      <span className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-400">ยังไม่ส่ง</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <p className="mt-8 text-center text-xs text-slate-300">
          รายงานนี้สร้างโดยระบบ LMS — ข้อมูลอัปเดตแบบ real-time
        </p>
      </div>
    </div>
  );
}
