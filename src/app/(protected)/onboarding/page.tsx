'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

const CLASSES = Array.from({ length: 18 }, (_, i) => `ม.3/${i + 1}`);

export default function OnboardingPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && profile?.onboardingComplete) {
      router.push('/dashboard');
    }
  }, [loading, profile, router]);

  async function handleConfirm() {
    if (!selected || !user) return;
    setSaving(true);
    try {
      const res = await fetch('/api/auth/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: selected }),
      });
      if (!res.ok) throw new Error('onboarding failed');
      await refreshProfile();
      router.push('/dashboard');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="flex min-h-screen items-start justify-center px-4 py-16">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-100">เลือกห้องเรียนของคุณ</h1>
          <p className="mt-1 text-sm text-slate-400">
            เลือกห้องเรียนที่คุณสังกัดอยู่ ไม่สามารถเปลี่ยนแปลงได้ภายหลัง
          </p>
        </div>

        <div className="mb-8 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {CLASSES.map((cls) => (
            <button
              key={cls}
              onClick={() => setSelected(cls)}
              className={`rounded-xl border py-4 text-sm font-medium transition-all ${
                selected === cls
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
              }`}
            >
              {cls}
            </button>
          ))}
        </div>

        {selected && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="mb-4 text-sm text-slate-400">
              คุณเลือก: <span className="font-semibold text-slate-100">{selected}</span>
            </p>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95"
            >
              {saving ? 'กำลังบันทึก…' : 'ยืนยัน'}
            </button>
          </div>
        )}
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
