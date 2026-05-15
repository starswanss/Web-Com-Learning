'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import Image from 'next/image';

function currentThaiYear() {
  return new Date().getFullYear() + 543;
}

export default function TeacherAdminPage() {
  const { profile, loading } = useAuth();
  const [year, setYear] = useState(currentThaiYear());
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<{ reset: number; year: number; yearFolderId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Logo state
  const [logoUrl, setLogoUrl] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoSaved, setLogoSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // LINE Notify state
  const [lineToken, setLineToken] = useState('');
  const [lineTokenSaving, setLineTokenSaving] = useState(false);
  const [lineTokenSaved, setLineTokenSaved] = useState(false);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') return;
  }, [loading, profile]);

  useEffect(() => {
    fetch('/api/teacher/logo')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.logoUrl) { setLogoUrl(d.logoUrl); setLogoPreview(d.logoUrl); } });
    fetch('/api/teacher/line-notify')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.lineNotifyToken) setLineToken(d.lineNotifyToken); });
  }, []);

  if (loading || !profile || profile.role !== 'teacher') return <Spinner />;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setLogoPreview(base64);
      setLogoUrl(base64);
    };
    reader.readAsDataURL(file);
  }

  async function handleLogoSave() {
    if (!logoUrl) return;
    setLogoSaving(true);
    setLogoSaved(false);
    try {
      await fetch('/api/teacher/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl }),
      });
      setLogoSaved(true);
      setTimeout(() => setLogoSaved(false), 2000);
    } finally {
      setLogoSaving(false);
    }
  }

  async function handleLineNotifySave() {
    setLineTokenSaving(true);
    setLineTokenSaved(false);
    try {
      await fetch('/api/teacher/line-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: lineToken }),
      });
      setLineTokenSaved(true);
      setTimeout(() => setLineTokenSaved(false), 2000);
    } finally {
      setLineTokenSaving(false);
    }
  }

  async function handleReset() {
    if (!confirmed) return;
    setResetting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/teacher/reset-term', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setResult(data);
      setConfirmed(false);
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/teacher" className="text-xs text-slate-500 hover:text-slate-300">←</Link>
          <h1 className="text-base font-semibold text-slate-100">⚙️ Admin — จัดการระบบ</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10 space-y-8">
        {/* Logo */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-100">🖼 โลโก้โรงเรียน</h2>
            <p className="mt-1 text-sm text-slate-400">แสดงบนหน้าหลักของระบบ</p>
          </div>

          <div className="flex items-center gap-4">
            {logoPreview ? (
              <div className="h-16 w-16 rounded-xl border border-slate-700 overflow-hidden bg-slate-800 flex items-center justify-center">
                <Image src={logoPreview} alt="logo" width={64} height={64} className="object-contain" unoptimized />
              </div>
            ) : (
              <div className="h-16 w-16 rounded-xl border border-dashed border-slate-700 bg-slate-800 flex items-center justify-center text-slate-600 text-2xl">
                🏫
              </div>
            )}
            <div className="flex-1 space-y-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:border-slate-600 transition-all text-left"
              >
                📁 เลือกไฟล์รูปภาพ
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <input
                value={logoUrl.startsWith('data:') ? '' : logoUrl}
                onChange={(e) => { setLogoUrl(e.target.value); setLogoPreview(e.target.value || null); }}
                placeholder="หรือวาง URL รูปภาพ..."
                className="input text-sm w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLogoSave}
              disabled={logoSaving || !logoUrl}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-all"
            >
              {logoSaving ? 'กำลังบันทึก…' : logoSaved ? '✓ บันทึกแล้ว' : 'บันทึกโลโก้'}
            </button>
            {logoUrl && (
              <button
                onClick={() => { setLogoUrl(''); setLogoPreview(null); }}
                className="text-xs text-slate-500 hover:text-red-400"
              >
                ลบโลโก้
              </button>
            )}
          </div>
        </section>

        {/* LINE Notify */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-100">📱 LINE Notify</h2>
            <p className="mt-1 text-sm text-slate-400">
              แจ้งเตือนผ่าน LINE เมื่อนักเรียนส่งงาน หรือมีการกรอกคะแนน
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 text-xs text-slate-400 space-y-1">
            <p className="font-medium text-slate-300">วิธีรับ Token:</p>
            <ol className="ml-4 list-decimal space-y-0.5">
              <li>ไปที่ <span className="text-blue-400">notify.line.me</span> → &quot;My page&quot;</li>
              <li>เลือก &quot;Generate token&quot; ตั้งชื่อและเลือกกลุ่ม LINE</li>
              <li>คัดลอก token มาวางด้านล่าง</li>
            </ol>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-300">LINE Notify Token</label>
            <input
              type="password"
              value={lineToken}
              onChange={(e) => setLineToken(e.target.value)}
              placeholder="วาง token ที่นี่..."
              className="input text-sm w-full font-mono"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleLineNotifySave}
                disabled={lineTokenSaving}
                className="rounded-xl bg-green-700 px-5 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-40 transition-all"
              >
                {lineTokenSaving ? 'กำลังบันทึก…' : lineTokenSaved ? '✓ บันทึกแล้ว' : 'บันทึก Token'}
              </button>
              {lineToken && (
                <button
                  onClick={() => setLineToken('')}
                  className="text-xs text-slate-500 hover:text-red-400"
                >
                  ล้าง Token
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Reset Term */}
        <section className="rounded-2xl border border-red-900/60 bg-red-950/10 p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-red-400">🔄 รีเซ็ตเทอมใหม่</h2>
            <p className="mt-1 text-sm text-slate-400">
              รีเซ็ตข้อมูลนักเรียนทั้งหมดให้พร้อมรับนักเรียนรุ่นใหม่ นักเรียนจะต้องเลือกห้องและวิชาใหม่เมื่อ login ครั้งหน้า
            </p>
          </div>

          <div className="rounded-xl border border-amber-800 bg-amber-950/20 p-4 space-y-1 text-sm text-amber-300">
            <p className="font-semibold">⚠ ผลที่จะเกิดขึ้น:</p>
            <ul className="ml-4 list-disc space-y-0.5 text-amber-400/80">
              <li>นักเรียนทุกคน จะต้องเลือกห้องและวิชาใหม่</li>
              <li>ข้อมูลการส่งงานและคะแนนเดิม<strong> ยังคงอยู่</strong> ในระบบ</li>
              <li>สร้างโฟลเดอร์ Google Drive ใหม่สำหรับปีการศึกษา {year}</li>
              <li>งานที่ส่งใหม่จะไปอยู่ในโฟลเดอร์ปีใหม่โดยอัตโนมัติ</li>
            </ul>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">ปีการศึกษา (พ.ศ.)</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              min={2560}
              max={2599}
              className="input w-40 text-sm"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="accent-red-500 h-4 w-4"
            />
            <span className="text-sm text-slate-300">
              ฉันเข้าใจและต้องการรีเซ็ตนักเรียนทั้งหมดสำหรับปีการศึกษา {year}
            </span>
          </label>

          <button
            onClick={handleReset}
            disabled={!confirmed || resetting}
            className="rounded-xl bg-red-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {resetting ? 'กำลังรีเซ็ต…' : 'รีเซ็ตเทอมใหม่'}
          </button>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {result && (
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/20 p-4 text-sm text-emerald-300 space-y-1">
              <p className="font-semibold">✓ รีเซ็ตสำเร็จ</p>
              <p>รีเซ็ตนักเรียนแล้ว: <strong>{result.reset} คน</strong></p>
              <p>ปีการศึกษา: <strong>{result.year}</strong></p>
              {result.yearFolderId && (
                <p>สร้างโฟลเดอร์ Drive ใหม่แล้ว: <span className="text-slate-400 text-xs">{result.yearFolderId}</span></p>
              )}
            </div>
          )}
        </section>

        {/* Info */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">ข้อมูลระบบ</h2>
          <div className="space-y-2 text-sm text-slate-400">
            <p>ปีการศึกษาปัจจุบัน (พ.ศ.): <span className="text-slate-200 font-medium">{currentThaiYear()}</span></p>
            <p>โครงสร้าง Drive ใหม่: <span className="text-slate-400 text-xs font-mono">Root / ปีการศึกษา {currentThaiYear()} / ม.3/X / Submissions / ชื่อนักเรียน</span></p>
          </div>
        </section>
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
