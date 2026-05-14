'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Image from 'next/image';
import Link from 'next/link';
import { CONTENT_TYPE_LABELS, type ContentType } from '@/types';

interface AssignmentWithSubmission {
  id: string;
  title: string;
  description: string;
  dueDate?: { _seconds: number };
  driveWebViewLink?: string;
  contentType?: ContentType;
  unit?: string;
  submission: null | {
    status: 'submitted' | 'graded' | 'reviewed';
    score?: number;
    feedback?: string;
  };
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400 border-emerald-800 bg-emerald-950/40';
  if (score >= 60) return 'text-amber-400 border-amber-800 bg-amber-950/40';
  if (score >= 40) return 'text-orange-400 border-orange-800 bg-orange-950/40';
  return 'text-red-400 border-red-800 bg-red-950/40';
}

function formatDate(seconds?: number) {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dueDateStatus(seconds?: number): { dot: string; text: string; label: string } | null {
  if (!seconds) return null;
  const diff = seconds * 1000 - Date.now();
  const days = diff / 86400000;
  if (diff < 0)  return { dot: 'bg-red-600',    text: 'text-red-500',    label: 'เกินกำหนด' };
  if (days < 1)  return { dot: 'bg-red-500',    text: 'text-red-400',    label: 'วันนี้!' };
  if (days < 3)  return { dot: 'bg-orange-500', text: 'text-orange-400', label: `${Math.ceil(days)} วัน` };
  if (days < 7)  return { dot: 'bg-amber-400',  text: 'text-amber-400',  label: `${Math.ceil(days)} วัน` };
  return           { dot: 'bg-emerald-500', text: 'text-emerald-400', label: `${Math.ceil(days)} วัน` };
}

export default function StudentPage() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const [assignments, setAssignments] = useState<AssignmentWithSubmission[]>([]);
  const [fetching, setFetching] = useState(true);
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!loading && profile?.role !== 'student') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'student') return;
    const saved = localStorage.getItem('lms_subject');
    const sub = saved ? JSON.parse(saved) : null;
    setSubject(sub);
    const url = sub ? `/api/assignments/student?subject=${sub.id}` : '/api/assignments/student';
    fetch(url)
      .then((r) => r.json())
      .then((data) => setAssignments(Array.isArray(data) ? data : []))
      .finally(() => setFetching(false));
  }, [profile]);

  if (loading || !profile) return <Spinner />;

  const pending = assignments.filter((a) => !a.submission);
  const submitted = assignments.filter((a) => a.submission && a.submission.status === 'submitted');
  const graded = assignments.filter((a) => a.submission && ['graded', 'reviewed'].includes(a.submission.status));

  // Group pending by unit
  const unitGroups = new Map<string, AssignmentWithSubmission[]>();
  pending.forEach((a) => {
    const key = a.unit ?? '';
    if (!unitGroups.has(key)) unitGroups.set(key, []);
    unitGroups.get(key)!.push(a);
  });

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { localStorage.removeItem('lms_subject'); router.push('/select-subject'); }}
                className="text-xs text-slate-500 hover:text-slate-300"
                title="เปลี่ยนวิชา"
              >←</button>
              <h1 className="text-base font-semibold text-slate-100">{user?.displayName}</h1>
            </div>
            <p className="text-xs text-slate-400">
              {subject ? subject.name : 'Computing Science & IT'} · ห้อง {profile.classId}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/student/profile"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-100 transition-all">
              Portfolio
            </Link>
            {user?.photoURL && <Image src={user.photoURL} alt="" width={32} height={32} className="rounded-full" />}
            <button onClick={signOut}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-100 transition-all">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {fetching ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Pending — grouped by unit */}
            <div>
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-blue-400">งานที่ต้องทำ</h2>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{pending.length}</span>
              </div>
              {pending.length === 0 ? (
                <p className="text-sm text-slate-500">ไม่มีงานค้าง 🎉</p>
              ) : (
                <div className="space-y-6">
                  {Array.from(unitGroups.entries()).map(([unit, items]) => (
                    <div key={unit}>
                      {unit && (
                        <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">{unit}</p>
                      )}
                      <div className="grid gap-3">
                        {items.map((a) => <AssignmentCard key={a.id} assignment={a} />)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submitted / awaiting review */}
            {submitted.length > 0 && (
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-amber-400">รอตรวจ</h2>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{submitted.length}</span>
                </div>
                <div className="grid gap-3">
                  {submitted.map((a) => <AssignmentCard key={a.id} assignment={a} />)}
                </div>
              </div>
            )}

            {/* Graded */}
            <div>
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-emerald-400">ตรวจแล้ว</h2>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{graded.length}</span>
              </div>
              {graded.length === 0 ? (
                <p className="text-sm text-slate-500">ยังไม่มีงานที่ถูกตรวจ</p>
              ) : (
                <div className="grid gap-3">
                  {graded.map((a) => <AssignmentCard key={a.id} assignment={a} />)}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function AssignmentCard({ assignment: a }: { assignment: AssignmentWithSubmission }) {
  const dueStatus = dueDateStatus(a.dueDate?._seconds);
  const ctMeta = a.contentType ? CONTENT_TYPE_LABELS[a.contentType] : null;
  const hasScore = a.submission && typeof a.submission.score === 'number';

  return (
    <Link href={`/student/assignments/${a.id}`}
      className="block rounded-2xl border border-slate-800 bg-slate-900 p-5 transition-all hover:border-slate-700">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Type badge */}
          {ctMeta && (
            <span className={`mb-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${ctMeta.color}`}>
              {ctMeta.icon} {ctMeta.label}
            </span>
          )}
          <p className="font-medium text-slate-100 truncate">{a.title}</p>
          <p className="mt-0.5 text-sm text-slate-500 line-clamp-1">{a.description}</p>
          {/* Due date traffic light */}
          {!a.submission && dueStatus && (
            <div className={`mt-2 flex items-center gap-1.5 text-xs ${dueStatus.text}`}>
              <span className={`h-2 w-2 rounded-full ${dueStatus.dot}`} />
              กำหนดส่ง {formatDate(a.dueDate?._seconds)} · เหลือ {dueStatus.label}
            </div>
          )}
          {a.submission && (
            <p className="mt-2 text-xs text-slate-500">ส่งแล้ว · {formatDate(a.dueDate?._seconds)}</p>
          )}
        </div>
        <div className="shrink-0">
          {hasScore && (
            <span className={`rounded-xl border px-3 py-1.5 text-sm font-semibold ${scoreColor(a.submission!.score!)}`}>
              {a.submission!.score}
            </span>
          )}
          {!a.submission && (
            <span className="rounded-xl border border-blue-800 bg-blue-950/40 px-3 py-1.5 text-xs text-blue-400">
              ส่งงาน →
            </span>
          )}
          {a.submission && !hasScore && (
            <span className="rounded-xl border border-amber-800 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-400">
              รอตรวจ
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
    </div>
  );
}
