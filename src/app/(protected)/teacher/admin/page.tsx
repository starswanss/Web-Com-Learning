'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import Image from 'next/image';

// ── Backfill XP types ──────────────────────────────────────────────────────────
interface StudentFixed { studentId: string; displayName: string; xpAdded: number }
interface BackfillResult { fixed: number; totalXpAwarded: number; studentsFixed: StudentFixed[]; applied: boolean }

// ── Backfill group-score types ──────────────────────────────────────────────────
interface GroupStudent { studentId: string; displayName: string; count: number }
interface GroupBackfillResult { groupSubmissions: number; recordsCreated: number; students: GroupStudent[]; applied: boolean }

function currentThaiYear() {
  return new Date().getFullYear() + 543;
}

export default function TeacherAdminPage() {
  const { profile, loading } = useAuth();
  const [year, setYear] = useState(currentThaiYear());
  const [resetting, setResetting] = useState(false);

  // Backfill XP state
  const [bfPreview, setBfPreview] = useState<BackfillResult | null>(null);
  const [bfResult, setBfResult] = useState<BackfillResult | null>(null);
  const [bfFetching, setBfFetching] = useState(false);
  const [bfApplying, setBfApplying] = useState(false);
  const [bfError, setBfError] = useState<string | null>(null);

  // AI model state
  const [aiModel, setAiModel] = useState('');
  const [aiModelInput, setAiModelInput] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiEnvLocked, setAiEnvLocked] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [aiBusy, setAiBusy] = useState<'test' | 'save' | null>(null);

  // Backfill group-score state
  const [gsPreview, setGsPreview] = useState<GroupBackfillResult | null>(null);
  const [gsResult, setGsResult] = useState<GroupBackfillResult | null>(null);
  const [gsFetching, setGsFetching] = useState(false);
  const [gsApplying, setGsApplying] = useState(false);
  const [gsError, setGsError] = useState<string | null>(null);
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
    fetch('/api/teacher/ai-model')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setAiModel(d.model ?? ''); setAiModelInput(d.model ?? '');
        setAiSuggestions(Array.isArray(d.suggestions) ? d.suggestions : []);
        setAiEnvLocked(!!d.envLocked);
      });
  }, []);

  async function handleAiTest() {
    setAiBusy('test'); setAiMsg(null);
    try {
      const res = await fetch('/api/teacher/ai-model', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: aiModelInput }),
      });
      const d = await res.json();
      setAiMsg(d.ok ? { ok: true, text: 'ใช้งานได้ ✓' } : { ok: false, text: d.error ?? 'ใช้ไม่ได้' });
    } catch { setAiMsg({ ok: false, text: 'ทดสอบไม่สำเร็จ' }); }
    finally { setAiBusy(null); }
  }

  async function handleAiSave() {
    setAiBusy('save'); setAiMsg(null);
    try {
      const res = await fetch('/api/teacher/ai-model', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: aiModelInput }),
      });
      const d = await res.json();
      if (res.ok) { setAiModel(d.model); setAiMsg({ ok: true, text: `บันทึกแล้ว — ใช้ ${d.model}` }); }
      else setAiMsg({ ok: false, text: d.error ?? 'บันทึกไม่สำเร็จ' });
    } catch { setAiMsg({ ok: false, text: 'บันทึกไม่สำเร็จ' }); }
    finally { setAiBusy(null); }
  }

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

  async function handleBfPreview() {
    setBfFetching(true); setBfError(null); setBfPreview(null); setBfResult(null);
    try {
      const res = await fetch('/api/admin/backfill-xp');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'ไม่สำเร็จ');
      setBfPreview(data);
    } catch (e) { setBfError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'); }
    finally { setBfFetching(false); }
  }

  async function handleBfApply() {
    if (!bfPreview || bfPreview.fixed === 0) return;
    if (!confirm(`ยืนยัน: เพิ่ม EXP ให้นักเรียน ${bfPreview.studentsFixed.length} คน รวม ${bfPreview.totalXpAwarded.toLocaleString()} XP?`)) return;
    setBfApplying(true); setBfError(null);
    try {
      const res = await fetch('/api/admin/backfill-xp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'ไม่สำเร็จ');
      setBfResult(data); setBfPreview(null);
    } catch (e) { setBfError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'); }
    finally { setBfApplying(false); }
  }

  async function handleGsPreview() {
    setGsFetching(true); setGsError(null); setGsPreview(null); setGsResult(null);
    try {
      const res = await fetch('/api/admin/backfill-group-scores');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'ไม่สำเร็จ');
      setGsPreview(data);
    } catch (e) { setGsError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'); }
    finally { setGsFetching(false); }
  }

  async function handleGsApply() {
    if (!gsPreview || gsPreview.recordsCreated === 0) return;
    if (!confirm(`ยืนยัน: ลิงก์คะแนนงานกลุ่มให้นักเรียน ${gsPreview.students.length} คน (${gsPreview.recordsCreated} รายการ)?`)) return;
    setGsApplying(true); setGsError(null);
    try {
      const res = await fetch('/api/admin/backfill-group-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'ไม่สำเร็จ');
      setGsResult(data); setGsPreview(null);
    } catch (e) { setGsError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'); }
    finally { setGsApplying(false); }
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

        {/* AI grading model */}
        <section className="rounded-2xl border border-violet-900/60 bg-violet-950/10 p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-violet-300">🤖 AI ตรวจงาน (Groq model)</h2>
            <p className="mt-1 text-sm text-slate-400">
              เปลี่ยน model ที่ใช้ตรวจงานได้ที่นี่ — ถ้า Groq เลิก model เดิม (error <code className="text-slate-300">model_not_found</code>)
              ให้เลือก/พิมพ์ model ใหม่แล้วกดทดสอบ · ดูรายชื่อได้ที่{' '}
              <a href="https://console.groq.com/docs/models" target="_blank" rel="noopener noreferrer" className="text-violet-400 underline">console.groq.com/docs/models</a>
            </p>
          </div>

          {aiEnvLocked ? (
            <div className="rounded-xl border border-amber-800 bg-amber-950/20 px-4 py-3 text-sm text-amber-400">
              model ถูกกำหนดจาก env <code>GROQ_MODEL</code> = <strong className="text-white">{aiModel}</strong> — แก้ที่ Vercel Environment Variables
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-2.5 text-xs text-slate-400">
                กำลังใช้: <strong className="text-slate-100">{aiModel || '—'}</strong>
              </div>

              {aiSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {aiSuggestions.map((m) => (
                    <button key={m} onClick={() => setAiModelInput(m)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                        aiModelInput === m ? 'border-violet-600 bg-violet-950/50 text-violet-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}>
                      {m}
                    </button>
                  ))}
                </div>
              )}

              <input
                value={aiModelInput}
                onChange={(e) => setAiModelInput(e.target.value)}
                placeholder="ชื่อ model เช่น llama-3.1-8b-instant"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-violet-500 focus:outline-none"
              />

              <div className="flex flex-wrap items-center gap-3">
                <button onClick={handleAiTest} disabled={!aiModelInput.trim() || aiBusy !== null}
                  className="rounded-xl border border-blue-700 bg-blue-950/40 px-5 py-2 text-sm font-medium text-blue-300 hover:border-blue-500 disabled:opacity-50 transition-all">
                  {aiBusy === 'test' ? 'กำลังทดสอบ…' : '🧪 ทดสอบ'}
                </button>
                <button onClick={handleAiSave} disabled={!aiModelInput.trim() || aiBusy !== null || aiModelInput.trim() === aiModel}
                  className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 transition-all">
                  {aiBusy === 'save' ? 'กำลังบันทึก…' : 'บันทึก & ใช้ model นี้'}
                </button>
                {aiMsg && <span className={`text-sm ${aiMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{aiMsg.text}</span>}
              </div>
              <p className="text-[11px] text-slate-600">💡 กด "บันทึก" จะทดสอบ model ให้อัตโนมัติก่อน — ถ้าใช้ไม่ได้จะไม่บันทึก</p>
            </>
          )}
        </section>

        {/* Backfill XP */}
        <section className="rounded-2xl border border-yellow-900/60 bg-yellow-950/10 p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-yellow-400">⭐ กู้ EXP จากงานที่ตรวจแล้ว</h2>
            <p className="mt-1 text-sm text-slate-400">
              สแกนหา submissions ที่ครูตรวจแล้วแต่นักเรียนไม่ได้รับ EXP (งานเก่าก่อนระบบ XP tracking)
              แล้วเพิ่ม <strong className="text-white">คะแนน × 10</strong> ให้อัตโนมัติ
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-xs text-slate-400 space-y-1">
            <ul className="list-disc list-inside space-y-0.5">
              <li>กด <strong className="text-slate-200">Preview</strong> เพื่อดูรายชื่อก่อน — ยังไม่แก้ข้อมูล</li>
              <li>กด <strong className="text-slate-200">Apply</strong> เพื่อเขียนจริง (ทำได้ซ้ำได้อย่างปลอดภัย — ระบบ skip งานที่ได้ EXP แล้ว)</li>
              <li>ระบบตรวจงานปกติยังทำงานเหมือนเดิม</li>
            </ul>
          </div>

          {!bfResult && (
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleBfPreview}
                disabled={bfFetching || bfApplying}
                className="rounded-xl border border-blue-700 bg-blue-950/40 px-5 py-2 text-sm font-medium text-blue-300 hover:border-blue-500 disabled:opacity-50 transition-all"
              >
                {bfFetching ? 'กำลังสแกน…' : '🔍 Preview'}
              </button>
              {bfPreview && bfPreview.fixed > 0 && (
                <button
                  onClick={handleBfApply}
                  disabled={bfApplying}
                  className="rounded-xl bg-yellow-600 px-5 py-2 text-sm font-medium text-white hover:bg-yellow-500 disabled:opacity-50 transition-all"
                >
                  {bfApplying ? 'กำลังอัปเดต…' : `⭐ Apply (${bfPreview.fixed} submissions)`}
                </button>
              )}
            </div>
          )}

          {bfError && <p className="text-sm text-red-400">{bfError}</p>}

          {bfPreview && bfPreview.fixed === 0 && (
            <p className="text-sm text-emerald-400">✅ ไม่พบงานที่ต้องกู้ EXP — นักเรียนทุกคนได้ EXP ครบแล้ว</p>
          )}

          {bfPreview && bfPreview.fixed > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">
                พบ <strong className="text-white">{bfPreview.fixed}</strong> submissions
                · นักเรียน <strong className="text-white">{bfPreview.studentsFixed.length}</strong> คน
                · รวม <strong className="text-yellow-400">+{bfPreview.totalXpAwarded.toLocaleString()} XP</strong>
              </p>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-700 divide-y divide-slate-800">
                {bfPreview.studentsFixed.map((s) => (
                  <div key={s.studentId} className="flex items-center justify-between px-4 py-2">
                    <p className="text-sm text-slate-300">{s.displayName}</p>
                    <span className="text-sm font-semibold text-yellow-400">+{s.xpAdded.toLocaleString()} XP</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bfResult && (
            <div className="space-y-2">
              <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-400">
                ✅ อัปเดตสำเร็จ — {bfResult.fixed} submissions · +{bfResult.totalXpAwarded.toLocaleString()} XP · {bfResult.studentsFixed.length} คน
              </div>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-700 divide-y divide-slate-800">
                {bfResult.studentsFixed.map((s) => (
                  <div key={s.studentId} className="flex items-center justify-between px-4 py-2">
                    <p className="text-sm text-slate-300">{s.displayName}</p>
                    <span className="text-sm font-semibold text-emerald-400">+{s.xpAdded.toLocaleString()} XP</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Backfill group scores */}
        <section className="rounded-2xl border border-emerald-900/60 bg-emerald-950/10 p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-emerald-400">👥 ลิงก์คะแนนงานกลุ่มที่ตรวจแล้ว</h2>
            <p className="mt-1 text-sm text-slate-400">
              งานกลุ่มที่ตรวจไปแล้ว<strong className="text-white">ก่อนการแก้ไข</strong> คะแนนยังไม่โผล่ในหน้านักเรียนรายคน/Gradebook/Rank
              — สแกนแล้วสร้าง record คะแนนให้สมาชิกแต่ละคน (XP ได้รับตั้งแต่ตอนตรวจอยู่แล้ว ไม่แจกซ้ำ)
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-xs text-slate-400 space-y-1">
            <ul className="list-disc list-inside space-y-0.5">
              <li>กด <strong className="text-slate-200">Preview</strong> เพื่อดูก่อน — ยังไม่แก้ข้อมูล</li>
              <li>กด <strong className="text-slate-200">Apply</strong> เพื่อเขียนจริง (ปลอดภัย ทำซ้ำได้ — skip คนที่มี record แล้ว)</li>
              <li>ลิงก์เฉพาะ <strong className="text-slate-200">คะแนน</strong> · ไม่แตะ XP (กันแจกซ้ำ)</li>
            </ul>
          </div>

          {!gsResult && (
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleGsPreview}
                disabled={gsFetching || gsApplying}
                className="rounded-xl border border-blue-700 bg-blue-950/40 px-5 py-2 text-sm font-medium text-blue-300 hover:border-blue-500 disabled:opacity-50 transition-all"
              >
                {gsFetching ? 'กำลังสแกน…' : '🔍 Preview'}
              </button>
              {gsPreview && gsPreview.recordsCreated > 0 && (
                <button
                  onClick={handleGsApply}
                  disabled={gsApplying}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-all"
                >
                  {gsApplying ? 'กำลังอัปเดต…' : `👥 Apply (${gsPreview.recordsCreated} รายการ)`}
                </button>
              )}
            </div>
          )}

          {gsError && <p className="text-sm text-red-400">{gsError}</p>}

          {gsPreview && gsPreview.recordsCreated === 0 && (
            <p className="text-sm text-emerald-400">✅ ไม่พบงานกลุ่มที่ต้องลิงก์คะแนน — ครบแล้ว</p>
          )}

          {gsPreview && gsPreview.recordsCreated > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">
                งานกลุ่มที่ตรวจแล้ว <strong className="text-white">{gsPreview.groupSubmissions}</strong>
                · ต้องสร้าง <strong className="text-white">{gsPreview.recordsCreated}</strong> รายการ
                · นักเรียน <strong className="text-emerald-400">{gsPreview.students.length}</strong> คน
              </p>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-700 divide-y divide-slate-800">
                {gsPreview.students.map((s) => (
                  <div key={s.studentId} className="flex items-center justify-between px-4 py-2">
                    <p className="text-sm text-slate-300">{s.displayName}</p>
                    <span className="text-sm font-semibold text-emerald-400">{s.count} งาน</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {gsResult && (
            <div className="space-y-2">
              <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-400">
                ✅ ลิงก์คะแนนสำเร็จ — {gsResult.recordsCreated} รายการ · {gsResult.students.length} คน
              </div>
            </div>
          )}
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
