'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Image from 'next/image';
import Link from 'next/link';
import { CONTENT_TYPE_LABELS, type ContentType } from '@/types';

interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate: { _seconds: number };
  classIds: string[];
  driveWebViewLink?: string;
  contentType?: ContentType;
  unit?: string;
}

/** Returns traffic-light color class based on time left until due date */
function dueDateStatus(seconds: number): { dot: string; text: string; label: string } {
  const now = Date.now();
  const diff = seconds * 1000 - now;
  const days = diff / 86400000;
  if (diff < 0)    return { dot: 'bg-red-600',    text: 'text-red-500',    label: 'เกินกำหนด' };
  if (days < 1)    return { dot: 'bg-red-500',    text: 'text-red-400',    label: 'วันนี้!' };
  if (days < 3)    return { dot: 'bg-orange-500', text: 'text-orange-400', label: `${Math.ceil(days)} วัน` };
  if (days < 7)    return { dot: 'bg-amber-400',  text: 'text-amber-400',  label: `${Math.ceil(days)} วัน` };
  return             { dot: 'bg-emerald-500', text: 'text-emerald-400', label: `${Math.ceil(days)} วัน` };
}

export default function TeacherPage() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [fetching, setFetching] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    const saved = localStorage.getItem('lms_subject');
    const sub = saved ? JSON.parse(saved) : null;
    setSubject(sub);
    const url = sub ? `/api/assignments?subject=${sub.id}` : '/api/assignments';
    fetch(url)
      .then((r) => r.json())
      .then((data) => setAssignments(Array.isArray(data) ? data : []))
      .finally(() => setFetching(false));
  }, [profile]);

  async function handleDelete(id: string) {
    setDeleting(id);
    await fetch('/api/assignments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setAssignments((prev) => prev.filter((a) => a.id !== id));
    setDeleting(null);
  }

  if (loading || !profile) return <Spinner />;

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { localStorage.removeItem('lms_subject'); router.push('/select-subject'); }}
                className="text-xs text-slate-500 hover:text-slate-300 transition-all"
                title="เปลี่ยนวิชา"
              >
                ←
              </button>
              <h1 className="text-lg font-semibold text-slate-100 truncate">
                {subject ? subject.name : 'Teacher Dashboard'}
              </h1>
            </div>
            <p className="text-xs text-slate-400">Computing Science & IT — ม.3</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/teacher/analytics"
              className="hidden sm:inline-flex rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition-all hover:border-slate-600 hover:text-slate-100">
              📊 Analytics
            </Link>
            {user?.photoURL && (
              <Image src={user.photoURL} alt="" width={32} height={32} className="rounded-full" />
            )}
            <span className="hidden text-sm text-slate-400 sm:block">{user?.displayName}</span>
            <button onClick={signOut}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition-all hover:border-slate-600 hover:text-slate-100">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-base font-medium text-slate-200">รายการใบงาน</h2>
          <Link href="/teacher/assignments/new"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-blue-500 active:scale-95">
            + สร้างใบงาน
          </Link>
        </div>

        {fetching ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 py-20 text-center">
            <p className="text-slate-400">ยังไม่มีใบงาน</p>
            <p className="mt-1 text-sm text-slate-500">กดปุ่ม &ldquo;สร้างใบงาน&rdquo; เพื่อเพิ่มใบงานแรก</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {assignments.map((a) => (
              <AssignmentCard key={a.id} assignment={a} onDelete={handleDelete} deleting={deleting === a.id} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function AssignmentCard({
  assignment: a, onDelete, deleting,
}: {
  assignment: Assignment;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const due = a.dueDate?._seconds;
  const dueStr = due
    ? new Date(due * 1000).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const status = due ? dueDateStatus(due) : null;
  const ctMeta = a.contentType ? CONTENT_TYPE_LABELS[a.contentType] : null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {ctMeta && (
              <span className={`rounded-full border px-2 py-0.5 text-xs ${ctMeta.color}`}>
                {ctMeta.icon} {ctMeta.label}
              </span>
            )}
            {a.unit && (
              <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                {a.unit}
              </span>
            )}
          </div>
          <h3 className="mt-1.5 font-medium text-slate-100 truncate">{a.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Due date traffic light */}
            {status && (
              <span className={`flex items-center gap-1.5 text-xs ${status.text}`}>
                <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                กำหนดส่ง {dueStr} · {status.label}
              </span>
            )}
            <span className="text-slate-700">·</span>
            <div className="flex flex-wrap gap-1">
              {a.classIds.slice(0, 4).map((cls) => (
                <span key={cls} className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{cls}</span>
              ))}
              {a.classIds.length > 4 && <span className="text-xs text-slate-500">+{a.classIds.length - 4}</span>}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {a.driveWebViewLink && (
            <a href={a.driveWebViewLink} target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition-all hover:border-slate-600">
              Drive
            </a>
          )}
          <Link href={`/teacher/assignments/${a.id}/edit`}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition-all hover:border-slate-600 hover:text-slate-200">
            แก้ไข
          </Link>
          <Link href={`/teacher/assignments/${a.id}/submissions`}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition-all hover:border-slate-500 hover:bg-slate-700">
            ตรวจงาน
          </Link>
          <button onClick={() => onDelete(a.id)} disabled={deleting}
            className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 transition-all hover:border-red-700 disabled:opacity-50">
            {deleting ? '…' : 'ลบ'}
          </button>
        </div>
      </div>
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
