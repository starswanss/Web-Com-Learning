'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Image from 'next/image';

export default function DashboardPage() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!profile) return;
    if (!profile.onboardingComplete) {
      router.push('/onboarding');
      return;
    }
    // Students pick their class + subject once at onboarding. After that, every
    // login goes straight to their dashboard — never re-prompt for a subject
    // (previously a cleared localStorage sent them back to /select-subject).
    if (profile.role === 'student') {
      router.push('/student');
      return;
    }
    // Teachers teach several subjects — route through subject selection unless
    // one was already chosen this session.
    const savedSubject = localStorage.getItem('lms_subject');
    router.push(savedSubject ? '/teacher' : '/select-subject');
  }, [loading, profile, router]);

  if (loading || !profile) return <Spinner />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center gap-4">
            {user?.photoURL && (
              <Image
                src={user.photoURL}
                alt={user.displayName ?? 'User'}
                width={48}
                height={48}
                className="rounded-full"
              />
            )}
            <div>
              <p className="font-medium text-slate-100">{user?.displayName}</p>
              <p className="text-xs text-slate-400">{user?.email}</p>
            </div>
            <span className="ml-auto rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 capitalize">
              {profile.role === 'teacher' ? 'ครู' : 'นักเรียน'}
            </span>
          </div>

          {profile.classId && (
            <p className="text-sm text-slate-400">
              ห้อง: <span className="font-medium text-slate-200">{profile.classId}</span>
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="mb-4 text-sm text-slate-400">ยินดีต้อนรับสู่ LMS — Computing Science & IT</p>
          <p className="text-xs text-slate-500">ระบบกำลังพัฒนา — ฟีเจอร์เพิ่มเติมจะมาเร็ว ๆ นี้</p>
        </div>

        <button
          onClick={signOut}
          className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-400 transition-all hover:bg-slate-700 hover:text-slate-100 active:scale-95"
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
