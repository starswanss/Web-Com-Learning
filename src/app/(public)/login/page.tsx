'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const { user, loading, signInWithGoogle, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.push('/dashboard');
  }, [user, loading, router]);

  if (loading) return <Spinner />;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 text-3xl">
            💻
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Computing Science & IT
          </h1>
          <p className="mt-1 text-sm text-slate-400">ระบบจัดการการเรียนรู้ ม.3</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <h2 className="mb-1 text-lg font-medium text-slate-100">เข้าสู่ระบบ</h2>
          <p className="mb-6 text-sm text-slate-400">
            ใช้บัญชี Google ของโรงเรียนเพื่อเข้าสู่ระบบ
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={signInWithGoogle}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-slate-100 transition-all hover:border-slate-600 hover:bg-slate-700 active:scale-95"
          >
            <GoogleIcon />
            Sign in with Google
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          เฉพาะบัญชีอีเมลของโรงเรียนเท่านั้น
        </p>

        <div className="mt-8 text-center">
          <p className="text-[11px] text-slate-500">
            พัฒนาโดย <span className="font-semibold text-slate-300">นายวชิรวิทย์ วงษ์รักษา</span>
          </p>
          <p className="mt-0.5 text-[10px] text-slate-600">โรงเรียนราชสีมาวิทยาลัย</p>
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908C16.658 14.215 17.64 11.907 17.64 9.2z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A9.003 9.003 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
