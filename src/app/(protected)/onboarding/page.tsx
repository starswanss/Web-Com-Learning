'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

const CLASSES = Array.from({ length: 18 }, (_, i) => `ม.3/${i + 1}`);

interface Subject { id: string; name: string }

export default function OnboardingPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<'class' | 'subject'>('class');
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && profile?.onboardingComplete) {
      router.push('/dashboard');
    }
  }, [loading, profile, router]);

  async function handleClassNext() {
    if (!selectedClass) return;
    setSubjectLoading(true);
    try {
      const res = await fetch(`/api/subjects/by-class?classId=${encodeURIComponent(selectedClass)}`);
      const data = await res.json();
      setSubjects(Array.isArray(data) ? data : []);
    } finally {
      setSubjectLoading(false);
    }
    setStep('subject');
  }

  async function handleConfirm() {
    if (!selectedClass || !user) return;
    setSaving(true);
    try {
      const res = await fetch('/api/auth/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: selectedClass, subjectId: selectedSubject?.id ?? null }),
      });
      if (!res.ok) throw new Error('onboarding failed');
      if (selectedSubject) {
        localStorage.setItem('lms_subject', JSON.stringify({ id: selectedSubject.id, name: selectedSubject.name }));
      }
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

        {/* Step indicator */}
        <div className="mb-8 flex items-center gap-3">
          <StepDot active={step === 'class'} done={step === 'subject'} label="เลือกห้อง" />
          <div className="h-px flex-1 bg-slate-800" />
          <StepDot active={step === 'subject'} done={false} label="เลือกวิชา" />
        </div>

        {step === 'class' ? (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-slate-100">เลือกห้องเรียนของคุณ</h1>
              <p className="mt-1 text-sm text-slate-400">ไม่สามารถเปลี่ยนแปลงได้ภายหลัง</p>
            </div>

            <div className="mb-8 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {CLASSES.map((cls) => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={`rounded-xl border py-4 text-sm font-medium transition-all ${
                    selectedClass === cls
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                  }`}
                >
                  {cls}
                </button>
              ))}
            </div>

            {selectedClass && (
              <button
                onClick={handleClassNext}
                disabled={subjectLoading}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95"
              >
                {subjectLoading ? 'กำลังโหลดวิชา…' : `ถัดไป — เลือกวิชา →`}
              </button>
            )}
          </>
        ) : (
          <>
            <div className="mb-8">
              <button onClick={() => setStep('class')} className="mb-3 text-xs text-slate-500 hover:text-slate-300">
                ← ห้อง {selectedClass}
              </button>
              <h1 className="text-2xl font-semibold text-slate-100">เลือกวิชาของคุณ</h1>
              <p className="mt-1 text-sm text-slate-400">
                วิชาที่คุณลงทะเบียนใน{selectedClass}
              </p>
            </div>

            {subjects.length === 0 ? (
              <div className="mb-8 rounded-2xl border border-dashed border-slate-800 py-12 text-center">
                <p className="text-slate-400">ยังไม่มีวิชาสำหรับห้องนี้</p>
                <p className="mt-1 text-sm text-slate-500">รอครูเพิ่มวิชาก่อนได้เลย</p>
              </div>
            ) : (
              <div className="mb-8 grid gap-3 sm:grid-cols-2">
                {subjects.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSubject(s)}
                    className={`rounded-2xl border p-5 text-left transition-all active:scale-95 ${
                      selectedSubject?.id === s.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                    }`}
                  >
                    <p className="font-semibold text-slate-100">{s.name}</p>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleConfirm}
                disabled={saving || (!selectedSubject && subjects.length > 0)}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95"
              >
                {saving ? 'กำลังบันทึก…' : selectedSubject ? `ยืนยัน — ${selectedSubject.name}` : 'ยืนยัน'}
              </button>
              {subjects.length === 0 && (
                <button
                  onClick={handleConfirm}
                  disabled={saving}
                  className="w-full rounded-xl border border-slate-700 py-2.5 text-xs text-slate-400 hover:text-slate-300 transition-all disabled:opacity-50"
                >
                  ข้ามไปก่อน (เลือกวิชาทีหลัง)
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`h-7 w-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
        done ? 'border-emerald-500 bg-emerald-500 text-white' :
        active ? 'border-blue-500 bg-blue-500/20 text-blue-400' :
        'border-slate-700 text-slate-600'
      }`}>
        {done ? '✓' : ''}
      </div>
      <span className={`text-xs ${active ? 'text-slate-300' : done ? 'text-emerald-400' : 'text-slate-600'}`}>
        {label}
      </span>
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
