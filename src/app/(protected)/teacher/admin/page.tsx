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

// ── Knowledge-submission cleanup types ───────────────────────────────────────────
interface KnCleanupResult { knowledgeSheets: number; straySubmissions: number; xpReversed: number; applied: boolean }

function currentThaiYear() {
  return new Date().getFullYear() + 543;
}

export default function TeacherAdminPage() {
  const { profile, loading } = useAuth();
  const [year, setYear] = useState(currentThaiYear());
  const [term, setTerm] = useState<1 | 2>(1);
  const [wipeStudents, setWipeStudents] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [dueClearing, setDueClearing] = useState(false);
  const [dueResult, setDueResult] = useState<number | null>(null);

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
  const [aiAvailable, setAiAvailable] = useState<string[]>([]);
  const [aiEnvLocked, setAiEnvLocked] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [aiBusy, setAiBusy] = useState<'test' | 'save' | null>(null);
  const [aiStyle, setAiStyle] = useState<'strict' | 'balanced' | 'lenient'>('balanced');
  const [styleSaving, setStyleSaving] = useState(false);
  const [aiProvider, setAiProvider] = useState<'groq' | 'claude'>('groq');
  const [claudeModel, setClaudeModel] = useState('claude-haiku-5-5');
  const [anthropicReady, setAnthropicReady] = useState(false);
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerMsg, setProviderMsg] = useState<string | null>(null);

  // Backfill group-score state
  const [gsPreview, setGsPreview] = useState<GroupBackfillResult | null>(null);
  const [gsResult, setGsResult] = useState<GroupBackfillResult | null>(null);
  const [gsFetching, setGsFetching] = useState(false);
  const [gsApplying, setGsApplying] = useState(false);
  const [gsError, setGsError] = useState<string | null>(null);

  // Knowledge-submission cleanup state
  const [knPreview, setKnPreview] = useState<KnCleanupResult | null>(null);
  const [knResult, setKnResult] = useState<KnCleanupResult | null>(null);
  const [knFetching, setKnFetching] = useState(false);
  const [knApplying, setKnApplying] = useState(false);
  const [knError, setKnError] = useState<string | null>(null);
  const [result, setResult] = useState<{ reset: number; year: number; term?: number; wipedStudents?: boolean; yearFolderId: string | null } | null>(null);
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
        setAiAvailable(Array.isArray(d.available) ? d.available : []);
        setAiEnvLocked(!!d.envLocked);
        if (d.gradingStyle === 'strict' || d.gradingStyle === 'balanced' || d.gradingStyle === 'lenient') setAiStyle(d.gradingStyle);
        if (d.provider === 'groq' || d.provider === 'claude') setAiProvider(d.provider);
        if (typeof d.claudeModel === 'string' && d.claudeModel) setClaudeModel(d.claudeModel);
        setAnthropicReady(!!d.anthropicConfigured);
      });
  }, []);

  async function handleProviderSave(provider: 'groq' | 'claude') {
    const prev = aiProvider;
    setProviderSaving(true); setProviderMsg(null);
    setAiProvider(provider);
    try {
      const res = await fetch('/api/teacher/ai-model', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const d = await res.json();
      if (!res.ok) { setAiProvider(prev); setProviderMsg(d.error ?? 'สลับไม่สำเร็จ'); }
      else setProviderMsg(provider === 'claude' ? 'ใช้ Claude ตรวจงานแล้ว' : 'ใช้ Groq ตรวจงานแล้ว');
    } catch { setAiProvider(prev); setProviderMsg('สลับไม่สำเร็จ'); }
    finally { setProviderSaving(false); }
  }

  async function handleStyleSave(style: 'strict' | 'balanced' | 'lenient') {
    const prev = aiStyle;
    setAiStyle(style); setStyleSaving(true);
    try {
      const res = await fetch('/api/teacher/ai-model', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradingStyle: style }),
      });
      if (!res.ok) setAiStyle(prev);
    } catch { setAiStyle(prev); }
    finally { setStyleSaving(false); }
  }

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

  async function handleKnPreview() {
    setKnFetching(true); setKnError(null); setKnPreview(null); setKnResult(null);
    try {
      const res = await fetch('/api/admin/cleanup-knowledge-submissions');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'ไม่สำเร็จ');
      setKnPreview(data);
    } catch (e) { setKnError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'); }
    finally { setKnFetching(false); }
  }

  async function handleKnApply() {
    if (!knPreview || knPreview.straySubmissions === 0) return;
    if (!confirm(`ยืนยัน: ลบงานที่ส่งผิดในใบความรู้ ${knPreview.straySubmissions} รายการ และคืน XP ${knPreview.xpReversed}?`)) return;
    setKnApplying(true); setKnError(null);
    try {
      const res = await fetch('/api/admin/cleanup-knowledge-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'ไม่สำเร็จ');
      setKnResult(data); setKnPreview(null);
    } catch (e) { setKnError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'); }
    finally { setKnApplying(false); }
  }

  async function handleClearDue() {
    if (!confirm('ล้างวันกำหนดส่งออกจากงานเก่าทั้งหมด? (ใบงานยังอยู่ ลบแค่วันที่)')) return;
    setDueClearing(true); setDueResult(null);
    try {
      const res = await fetch('/api/admin/clear-due-dates', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setDueResult(data.cleared ?? 0);
    } catch { setError('ล้างวันกำหนดส่งไม่สำเร็จ'); }
    finally { setDueClearing(false); }
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
        body: JSON.stringify({ year, term, wipeStudents }),
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

          {/* Provider — which AI service grades. Groq (llama, default) or
              Claude (smarter; needs ANTHROPIC_API_KEY). */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <p className="text-sm font-semibold text-slate-200">ผู้ให้บริการตรวจงาน</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Claude ฉลาดกว่าในการให้คะแนนบางส่วน/จับเหตุผล — ตั้ง <code className="text-slate-300">ANTHROPIC_API_KEY</code> ใน Vercel ก่อนใช้
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([
                { id: 'groq',   title: 'Groq (llama)', desc: 'เร็ว ฟรี — ค่าเริ่มต้นเดิม' },
                { id: 'claude', title: 'Claude',        desc: `ฉลาดกว่า · ${claudeModel}${anthropicReady ? '' : ' · ยังไม่ได้ตั้ง key'}` },
              ] as const).map((o) => {
                const disabled = providerSaving || (o.id === 'claude' && !anthropicReady);
                return (
                  <button key={o.id} onClick={() => handleProviderSave(o.id)} disabled={disabled}
                    className={`rounded-xl border p-3 text-left transition-all disabled:opacity-50 ${
                      aiProvider === o.id ? 'border-violet-500 bg-violet-950/40 ring-1 ring-violet-500/40' : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                    }`}>
                    <p className={`text-sm font-bold ${aiProvider === o.id ? 'text-violet-300' : 'text-slate-200'}`}>
                      {aiProvider === o.id ? '✓ ' : ''}{o.title}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">{o.desc}</p>
                  </button>
                );
              })}
            </div>
            {providerMsg && <p className="mt-2 text-xs text-slate-400">{providerMsg}</p>}
          </div>

          {/* Grading style — how generous the AI is; applies to all grading,
              independent of which model / env lock is in use. */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <p className="text-sm font-semibold text-slate-200">โหมดการให้คะแนนของ AI</p>
            <p className="mt-0.5 text-xs text-slate-500">ใช้กับการตรวจทุกแบบทั้งระบบ — ปรับได้ทันที ไม่ต้อง redeploy</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                { id: 'strict',   title: 'เข้มงวด',  desc: 'เน้นถูกต้อง/ตรงคำถาม ตอบสั้น/ผิด = คะแนนต่ำ' },
                { id: 'balanced', title: 'สมดุล',    desc: 'ถูกต้องสำคัญ แต่ให้คะแนนบางส่วนตามความเข้าใจ' },
                { id: 'lenient',  title: 'ผ่อนปรน',  desc: 'ให้เครดิตเหตุผลที่ดี แม้ตอบไม่ตรงคำถามเป๊ะ' },
              ] as const).map((o) => (
                <button key={o.id} onClick={() => handleStyleSave(o.id)} disabled={styleSaving}
                  className={`rounded-xl border p-3 text-left transition-all disabled:opacity-60 ${
                    aiStyle === o.id ? 'border-violet-500 bg-violet-950/40 ring-1 ring-violet-500/40' : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                  }`}>
                  <p className={`text-sm font-bold ${aiStyle === o.id ? 'text-violet-300' : 'text-slate-200'}`}>
                    {aiStyle === o.id ? '✓ ' : ''}{o.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-slate-500">{o.desc}</p>
                </button>
              ))}
            </div>
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

              {/* Models this Groq account can actually use (live). */}
              {aiAvailable.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-emerald-400">✓ model ที่บัญชีคุณใช้ได้ ({aiAvailable.length}) — คลิกเพื่อเลือก</p>
                  <div className="flex flex-wrap gap-2">
                    {aiAvailable.map((m) => (
                      <button key={m} onClick={() => setAiModelInput(m)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                          aiModelInput === m ? 'border-violet-600 bg-violet-950/50 text-violet-300' : 'border-emerald-800/60 bg-emerald-950/20 text-emerald-300 hover:border-emerald-600'
                        }`}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 px-4 py-2.5 text-xs text-amber-400">
                  ดึงรายชื่อ model จาก Groq ไม่ได้ — อาจเป็นเพราะ API key ผิด/หมดสิทธิ์ ลองพิมพ์ชื่อเองด้านล่างแล้วกดทดสอบ
                </div>
              )}

              {aiSuggestions.length > 0 && aiAvailable.length === 0 && (
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

        {/* Cleanup accidental knowledge-sheet submissions */}
        <section className="rounded-2xl border border-amber-900/60 bg-amber-950/10 p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-amber-400">📖 ลบงานที่นักเรียนเผลอส่งในใบความรู้</h2>
            <p className="mt-1 text-sm text-slate-400">
              ใบความรู้ให้<strong className="text-white">ดูอย่างเดียว</strong> ไม่ต้องส่งงาน — แต่ก่อนหน้านี้มีนักเรียนบางคนเผลอกดส่งมา
              สแกนแล้วลบงานที่ส่งผิดเหล่านั้น พร้อม<strong className="text-white">คืน XP</strong> ที่ได้ไปโดยไม่ตั้งใจ
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-xs text-slate-400 space-y-1">
            <ul className="list-disc list-inside space-y-0.5">
              <li>กด <strong className="text-slate-200">Preview</strong> เพื่อดูก่อน — ยังไม่ลบข้อมูล</li>
              <li>กด <strong className="text-slate-200">Apply</strong> เพื่อลบจริง + คืน XP (ทำซ้ำได้)</li>
              <li>นับเฉพาะงานที่ส่งในใบความรู้ของครูเท่านั้น — ไม่แตะใบงาน/แบบทดสอบ</li>
            </ul>
          </div>

          {!knResult && (
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleKnPreview}
                disabled={knFetching || knApplying}
                className="rounded-xl border border-blue-700 bg-blue-950/40 px-5 py-2 text-sm font-medium text-blue-300 hover:border-blue-500 disabled:opacity-50 transition-all"
              >
                {knFetching ? 'กำลังสแกน…' : '🔍 Preview'}
              </button>
              {knPreview && knPreview.straySubmissions > 0 && (
                <button
                  onClick={handleKnApply}
                  disabled={knApplying}
                  className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 transition-all"
                >
                  {knApplying ? 'กำลังลบ…' : `🗑 ลบ (${knPreview.straySubmissions} รายการ)`}
                </button>
              )}
            </div>
          )}

          {knError && <p className="text-sm text-red-400">{knError}</p>}

          {knPreview && knPreview.straySubmissions === 0 && (
            <p className="text-sm text-emerald-400">✅ ไม่พบงานที่ส่งผิดในใบความรู้ — สะอาดแล้ว</p>
          )}

          {knPreview && knPreview.straySubmissions > 0 && (
            <p className="text-xs text-slate-400">
              ใบความรู้ <strong className="text-white">{knPreview.knowledgeSheets}</strong> ใบ
              · พบงานที่ส่งผิด <strong className="text-amber-400">{knPreview.straySubmissions}</strong> รายการ
              · จะคืน XP <strong className="text-white">{knPreview.xpReversed}</strong>
            </p>
          )}

          {knResult && (
            <div className="rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm text-amber-400">
              ✅ ลบสำเร็จ — {knResult.straySubmissions} รายการ · คืน XP {knResult.xpReversed}
            </div>
          )}
        </section>

        {/* Clear due dates on old assignments */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-200">🗓 ล้างวันกำหนดส่งของงานเก่า</h2>
            <p className="mt-1 text-sm text-slate-400">
              ระบบใหม่ไม่ใช้วันกำหนดส่งแล้ว — งานเก่าที่เคยตั้งวันไว้จะยัง<strong className="text-slate-300">แสดงวันเวลาอยู่</strong>
              กดเพื่อลบวันกำหนดส่งออกจากงานเก่าทั้งหมด (ตัว<strong className="text-slate-300">ใบงานยังอยู่ครบ</strong> ลบแค่วันที่)
            </p>
          </div>
          <button
            onClick={handleClearDue}
            disabled={dueClearing}
            className="rounded-xl border border-slate-600 bg-slate-800 px-5 py-2 text-sm font-medium text-slate-200 hover:border-slate-500 disabled:opacity-50 transition-all"
          >
            {dueClearing ? 'กำลังล้าง…' : '🗓 ล้างวันกำหนดส่งทั้งหมด'}
          </button>
          {dueResult !== null && (
            <p className="text-sm text-emerald-400">✅ ล้างวันกำหนดส่งแล้ว {dueResult} งาน</p>
          )}
        </section>

        {/* Reset Term */}
        <section className="rounded-2xl border border-red-900/60 bg-red-950/10 p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-red-400">🔄 เริ่มเทอมใหม่ / รีเซ็ต</h2>
            <p className="mt-1 text-sm text-slate-400">
              ตั้ง<strong className="text-slate-200">เทอมที่กำลังสอน</strong> — ใบงานที่สร้างใหม่จะถูกบันทึกเป็นของเทอมนี้ และดูงานแยกตามเทอมได้ที่หน้าภาพรวม
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">ปีการศึกษา (พ.ศ.)</label>
              <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))}
                min={2560} max={2599} className="input w-36 text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">เทอม</label>
              <div className="flex gap-2">
                {([1, 2] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTerm(t)}
                    className={`rounded-xl border px-5 py-2 text-sm font-semibold transition-all ${
                      term === t ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}>
                    เทอม {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-800/60 bg-amber-950/20 p-3">
            <input type="checkbox" checked={wipeStudents} onChange={(e) => setWipeStudents(e.target.checked)} className="mt-0.5 accent-amber-500 h-4 w-4" />
            <span className="text-sm text-amber-300">
              ล้างข้อมูลนักเรียน (ขึ้นปีการศึกษาใหม่ / รับรุ่นใหม่)
              <span className="mt-0.5 block text-xs text-amber-400/70">นักเรียนทุกคนต้องเลือกห้อง+วิชาใหม่ · <strong>ไม่ต้องติ๊ก</strong>ถ้าแค่เปลี่ยนจากเทอม 1 เป็นเทอม 2 (นักเรียนเดิม) · งาน/คะแนนเดิมยังอยู่เสมอ</span>
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="accent-red-500 h-4 w-4" />
            <span className="text-sm text-slate-300">
              ยืนยันตั้งเทอมปัจจุบันเป็น <strong className="text-slate-100">ปี {year} เทอม {term}</strong>{wipeStudents ? ' และล้างข้อมูลนักเรียนทั้งหมด' : ''}
            </span>
          </label>

          <button
            onClick={handleReset}
            disabled={!confirmed || resetting}
            className="rounded-xl bg-red-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {resetting ? 'กำลังดำเนินการ…' : `ตั้งเป็นเทอม ${term}${wipeStudents ? ' + รีเซ็ตนักเรียน' : ''}`}
          </button>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {result && (
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/20 p-4 text-sm text-emerald-300 space-y-1">
              <p className="font-semibold">✓ สำเร็จ — เทอมปัจจุบัน: ปี {result.year} เทอม {result.term ?? term}</p>
              {result.wipedStudents && <p>รีเซ็ตนักเรียนแล้ว: <strong>{result.reset} คน</strong></p>}
              {result.yearFolderId && (
                <p>โฟลเดอร์ Drive: <span className="text-slate-400 text-xs">{result.yearFolderId}</span></p>
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
