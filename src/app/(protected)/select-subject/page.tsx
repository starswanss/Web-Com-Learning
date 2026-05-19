'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface Subject { id: string; name: string; classIds: string[] }

const SUBJECT_COLORS = [
  'border-blue-700 bg-blue-950/40 hover:border-blue-500',
  'border-emerald-700 bg-emerald-950/40 hover:border-emerald-500',
  'border-purple-700 bg-purple-950/40 hover:border-purple-500',
  'border-amber-700 bg-amber-950/40 hover:border-amber-500',
  'border-rose-700 bg-rose-950/40 hover:border-rose-500',
  'border-cyan-700 bg-cyan-950/40 hover:border-cyan-500',
];

export default function SelectSubjectPage() {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [studentClassId, setStudentClassId] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!profile) return;
    if (!profile.onboardingComplete) { router.push('/onboarding'); return; }

    if (profile.role === 'teacher') {
      fetch('/api/subjects')
        .then((r) => r.json())
        .then((data) => setSubjects(Array.isArray(data) ? data : []))
        .catch(() => setFetchError('โหลดวิชาไม่ได้ กรุณาลองใหม่'))
        .finally(() => setFetching(false));
    } else {
      fetch('/api/subjects/student')
        .then((r) => r.json())
        .then((data) => {
          if (data?.error === 'Unauthorized') {
            setFetchError('เซสชันหมดอายุ กรุณาล็อกอินใหม่');
            return;
          }
          if (data?.error === 'no_class') {
            setFetchError('ยังไม่มีข้อมูลห้องเรียน กรุณาทำ Onboarding ใหม่');
            return;
          }
          if (data?.subjects) {
            setSubjects(Array.isArray(data.subjects) ? data.subjects : []);
            setStudentClassId(data.classId ?? null);
          } else if (Array.isArray(data)) {
            // Legacy format fallback
            setSubjects(data);
          }
        })
        .catch(() => setFetchError('โหลดวิชาไม่ได้ กรุณาลองใหม่'))
        .finally(() => setFetching(false));
    }
  }, [loading, profile, router]);

  function selectSubject(subject: Subject) {
    localStorage.setItem('lms_subject', JSON.stringify({ id: subject.id, name: subject.name }));
    router.push(profile?.role === 'teacher' ? '/teacher' : '/student');
  }

  if (loading || !profile) return <Spinner />;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-100">เลือกวิชา</h1>
          <p className="mt-1 text-sm text-slate-400">Computing Science & IT — ม.3</p>
          {profile.role === 'teacher' && (
            <Link
              href="/teacher/subjects"
              className="mt-3 inline-block rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-all"
            >
              + จัดการวิชา
            </Link>
          )}
        </div>

        {fetching ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : fetchError ? (
          <div className="rounded-2xl border border-red-800/60 bg-red-950/30 py-12 text-center px-6">
            <p className="text-sm font-medium text-red-400">{fetchError}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg border border-red-800 px-4 py-2 text-xs text-red-400 hover:bg-red-950/40 transition-all"
            >
              ลองใหม่
            </button>
          </div>
        ) : subjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 py-12 text-center px-6 space-y-3">
            <p className="text-2xl">📚</p>
            <p className="text-slate-300 font-medium">ยังไม่มีวิชาที่กำหนดให้ห้องคุณ</p>
            {profile.role === 'teacher' && (
              <>
                <p className="text-sm text-slate-500">เพิ่มวิชาและเลือกห้องที่ต้องการได้เลย</p>
                <Link
                  href="/teacher/subjects"
                  className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 transition-all"
                >
                  + สร้างวิชาแรก
                </Link>
              </>
            )}
            {profile.role === 'student' && (
              <div className="space-y-2">
                <p className="text-sm text-slate-500">
                  รอครูเพิ่มวิชาให้ห้องของคุณ
                </p>
                {studentClassId && (
                  <div className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2">
                    <span className="text-xs text-slate-400">ห้องของคุณ:</span>
                    <span className="rounded-lg bg-blue-900/40 border border-blue-700/60 px-2 py-0.5 text-xs font-bold text-blue-300">
                      {studentClassId}
                    </span>
                  </div>
                )}
                <p className="text-xs text-slate-600">บอกครูให้เพิ่มห้อง {studentClassId ?? profile.classId ?? '?'} ในวิชา</p>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-200 transition-all"
                >
                  รีเฟรช
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {subjects.map((subject, i) => (
              <button
                key={subject.id}
                onClick={() => selectSubject(subject)}
                className={`rounded-2xl border p-6 text-left transition-all active:scale-95 ${SUBJECT_COLORS[i % SUBJECT_COLORS.length]}`}
              >
                <p className="text-lg font-semibold text-slate-100">{subject.name}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {subject.classIds.length} ห้อง
                </p>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={signOut}
          className="mt-8 w-full rounded-xl border border-slate-800 py-2.5 text-xs text-slate-500 hover:text-slate-400 transition-all"
        >
          Logout
        </button>
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
