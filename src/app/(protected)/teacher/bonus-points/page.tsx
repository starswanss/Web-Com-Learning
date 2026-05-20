'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface StudentResult {
  studentId: string;
  displayName: string;
  email: string;
  classId: string;
}

interface BonusEntry {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  points: number;
  medal: string;
  reason: string;
  createdAt?: { _seconds: number };
}

interface MedalType {
  id: string;
  icon: string;
  label: string;
  desc: string;
  color: string;
  isDefault?: boolean;
}

const PRESET_COLORS = [
  { label: 'ทอง',    value: 'border-yellow-600 bg-yellow-950/40 text-yellow-300' },
  { label: 'ฟ้า',    value: 'border-cyan-600 bg-cyan-950/40 text-cyan-300' },
  { label: 'ม่วง',   value: 'border-purple-600 bg-purple-950/40 text-purple-300' },
  { label: 'เขียว',  value: 'border-emerald-600 bg-emerald-950/40 text-emerald-300' },
  { label: 'แดง',    value: 'border-rose-600 bg-rose-950/40 text-rose-300' },
  { label: 'น้ำเงิน', value: 'border-blue-600 bg-blue-950/40 text-blue-300' },
];

function isUrl(s: string) { return s.startsWith('http') || s.startsWith('data:'); }

function MedalIcon({ icon, className = 'h-6 w-6' }: { icon: string; className?: string }) {
  if (isUrl(icon)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className={`${className} rounded object-contain`} />;
  }
  return <span className="text-xl leading-none">{icon}</span>;
}

export default function BonusPointsPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [searchEmail, setSearchEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState<StudentResult | null>(null);
  const [searchError, setSearchError] = useState('');

  const [medalTypes, setMedalTypes] = useState<MedalType[]>([]);
  const [selectedMedal, setSelectedMedal] = useState<string>('gold');
  const [points, setPoints] = useState('10');
  const [reason, setReason] = useState('');
  const [awarding, setAwarding] = useState(false);
  const [awarded, setAwarded] = useState(false);

  const [history, setHistory] = useState<BonusEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Medal management state
  const [showMedalMgmt, setShowMedalMgmt] = useState(false);
  const [newIcon, setNewIcon] = useState('🏆');
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0].value);
  const [editingMedal, setEditingMedal] = useState<MedalType | null>(null);
  const [savingMedal, setSavingMedal] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [uploadIconError, setUploadIconError] = useState<string | null>(null);
  const iconFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    fetch('/api/teacher/medal-types')
      .then(r => r.json())
      .then((d: MedalType[]) => { if (Array.isArray(d)) setMedalTypes(d); })
      .catch(() => {});
    fetch('/api/teacher/bonus-points')
      .then(r => r.json())
      .then(d => setHistory(Array.isArray(d) ? d : []))
      .finally(() => setLoadingHistory(false));
  }, [profile]);

  async function handleIconFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingIcon(true);
    setUploadIconError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/teacher/upload-icon', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'upload failed');
      setNewIcon(json.url as string);
    } catch (err) {
      setUploadIconError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploadingIcon(false);
    }
  }

  async function searchStudent() {
    const q = searchEmail.trim();
    if (!q) return;
    setSearching(true); setSearchError(''); setStudent(null); setAwarded(false);
    try {
      const res = await fetch(`/api/teacher/bonus-points/search?email=${encodeURIComponent(q)}`);
      if (!res.ok) { setSearchError('ไม่พบนักเรียนในระบบ'); return; }
      setStudent(await res.json());
    } catch { setSearchError('เกิดข้อผิดพลาด'); }
    finally { setSearching(false); }
  }

  async function awardBonus() {
    if (!student || !points) return;
    setAwarding(true);
    try {
      const medal = medalTypes.find(m => m.id === selectedMedal);
      const res = await fetch('/api/teacher/bonus-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.studentId,
          points: parseInt(points),
          medal: selectedMedal,
          icon: medal?.icon,
          reason,
        }),
      });
      if (!res.ok) throw new Error();
      const { id } = await res.json();
      setHistory(prev => [{
        id, studentId: student.studentId, studentName: student.displayName,
        classId: student.classId, points: parseInt(points), medal: selectedMedal, reason,
      }, ...prev]);
      setAwarded(true); setReason(''); setPoints('10');
    } catch { /* ignore */ }
    finally { setAwarding(false); }
  }

  async function revokeBonus(id: string) {
    if (!confirm('ยืนยันการลบ bonus นี้?')) return;
    await fetch('/api/teacher/bonus-points', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setHistory(prev => prev.filter(e => e.id !== id));
  }

  async function saveMedal() {
    if (!newLabel.trim()) return;
    setSavingMedal(true);
    try {
      if (editingMedal) {
        await fetch('/api/teacher/medal-types', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingMedal.id, icon: newIcon, label: newLabel, desc: newDesc, color: newColor }),
        });
        setMedalTypes(prev => prev.map(m => m.id === editingMedal.id
          ? { ...m, icon: newIcon, label: newLabel, desc: newDesc, color: newColor } : m));
        setEditingMedal(null);
      } else {
        const res = await fetch('/api/teacher/medal-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ icon: newIcon, label: newLabel, desc: newDesc, color: newColor }),
        });
        const created: MedalType = await res.json();
        setMedalTypes(prev => [...prev, created]);
      }
      setNewIcon('🏆'); setNewLabel(''); setNewDesc(''); setNewColor(PRESET_COLORS[0].value);
    } finally { setSavingMedal(false); }
  }

  async function deleteMedal(id: string) {
    if (!confirm('ลบประเภทรางวัลนี้?')) return;
    await fetch('/api/teacher/medal-types', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setMedalTypes(prev => prev.filter(m => m.id !== id));
    if (selectedMedal === id) setSelectedMedal(medalTypes[0]?.id ?? 'gold');
  }

  function startEdit(m: MedalType) {
    setEditingMedal(m);
    setNewIcon(m.icon); setNewLabel(m.label); setNewDesc(m.desc); setNewColor(m.color);
    setShowMedalMgmt(true);
  }

  if (loading || !profile) return <Spinner />;

  const medalObj = medalTypes.find(m => m.id === selectedMedal);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      {/* hidden file input for icon upload */}
      <input
        ref={iconFileRef}
        type="file"
        accept="image/png,image/gif,image/webp,image/jpeg"
        style={{ display: 'none' }}
        onChange={handleIconFile}
      />

      <div className="mx-auto max-w-3xl space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/teacher/leaderboard" className="text-sm text-slate-400 hover:text-slate-200">← กลับ</Link>
          <div>
            <h1 className="text-xl font-bold text-slate-100">⭐ ให้ Bonus Points</h1>
            <p className="text-xs text-slate-500">ค้นหานักเรียนด้วยอีเมล แล้วมอบเหรียญรางวัล</p>
          </div>
        </div>

        {/* Medal Management Panel */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          <button
            onClick={() => setShowMedalMgmt(v => !v)}
            className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-slate-800/40"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-200">⚙️ จัดการประเภทรางวัล</span>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                {medalTypes.length} ประเภท
              </span>
            </div>
            <span className="text-slate-500 text-xs">{showMedalMgmt ? '▲' : '▼'}</span>
          </button>

          {showMedalMgmt && (
            <div className="border-t border-slate-800 p-5 space-y-4">
              {/* Existing medals */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {medalTypes.map(m => (
                  <div key={m.id} className={`relative rounded-xl border p-3 ${m.color}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-7 w-7 shrink-0 flex items-center justify-center">
                        <MedalIcon icon={m.icon} className="h-7 w-7" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{m.label}</p>
                        <p className="text-[9px] opacity-70 truncate">{m.desc}</p>
                      </div>
                    </div>
                    {!m.isDefault && (
                      <div className="flex gap-1 mt-2">
                        <button
                          onClick={() => startEdit(m)}
                          className="flex-1 rounded-lg border border-current/20 py-0.5 text-[9px] font-semibold opacity-70 hover:opacity-100 transition-opacity"
                        >
                          แก้ไข
                        </button>
                        <button
                          onClick={() => deleteMedal(m.id)}
                          className="flex-1 rounded-lg border border-red-800/40 py-0.5 text-[9px] font-semibold text-red-400 hover:border-red-700 transition-colors"
                        >
                          ลบ
                        </button>
                      </div>
                    )}
                    {m.isDefault && (
                      <p className="mt-1.5 text-[9px] opacity-40 text-center">default</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Add / Edit form */}
              <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-3">
                <p className="text-xs font-bold text-slate-300">
                  {editingMedal ? `✏️ แก้ไข: ${editingMedal.label}` : '+ เพิ่มประเภทรางวัลใหม่'}
                </p>

                {/* Icon picker — full width row */}
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500">สัญลักษณ์ (emoji หรืออัปโหลดรูป PNG/GIF)</p>
                  <div className="flex items-center gap-3">
                    {/* Large clickable preview — click to upload */}
                    <button
                      type="button"
                      onClick={() => { setUploadIconError(null); iconFileRef.current?.click(); }}
                      disabled={uploadingIcon}
                      className="group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-700 bg-slate-800 transition-all hover:border-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                      title="คลิกเพื่ออัปโหลดรูป"
                    >
                      <MedalIcon icon={newIcon} className="h-9 w-9" />
                      <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-xl bg-slate-900/85 text-[9px] font-medium text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
                        {uploadingIcon
                          ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />
                          : <><span className="text-base">📁</span><span>อัปโหลด</span></>}
                      </span>
                    </button>

                    {/* Separator */}
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="h-4 w-px bg-slate-800" />
                      <span className="text-[9px] text-slate-700">หรือ</span>
                      <div className="h-4 w-px bg-slate-800" />
                    </div>

                    {/* Emoji text input — no .input class to avoid width:100% override */}
                    <div>
                      <p className="mb-0.5 text-[9px] text-slate-600">พิมพ์ emoji</p>
                      <input
                        type="text"
                        value={isUrl(newIcon) ? '' : newIcon}
                        onChange={e => { if (e.target.value) setNewIcon(e.target.value); }}
                        maxLength={4}
                        placeholder="🏆"
                        style={{ width: '3.5rem' }}
                        className="rounded-xl border border-slate-700 bg-slate-900 py-2 text-center text-xl text-slate-100 outline-none transition-colors focus:border-slate-500"
                        title="พิมพ์ emoji โดยตรง"
                      />
                    </div>

                    <p className="text-[9px] leading-relaxed text-slate-700">PNG / GIF / WebP<br />สูงสุด 2 MB</p>
                  </div>
                  {uploadIconError && (
                    <p className="text-[10px] text-red-400">⚠ {uploadIconError}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-[10px] text-slate-500">ชื่อรางวัล</label>
                  <input
                    value={newLabel} onChange={e => setNewLabel(e.target.value)} maxLength={30}
                    placeholder="เช่น Gold Star"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-slate-500">คำอธิบาย (ไม่บังคับ)</label>
                  <input
                    value={newDesc} onChange={e => setNewDesc(e.target.value)} maxLength={60}
                    placeholder="เช่น ผลงานดีเยี่ยม"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-slate-500">สีพื้นหลัง</label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setNewColor(c.value)}
                        className={`rounded-lg border px-3 py-1.5 text-[10px] font-semibold transition-all ${c.value} ${
                          newColor === c.value ? 'ring-2 ring-current' : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveMedal}
                    disabled={savingMedal || !newLabel.trim()}
                    className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-40 transition-all"
                  >
                    {savingMedal ? 'กำลังบันทึก…' : editingMedal ? 'บันทึกการแก้ไข' : 'เพิ่มรางวัล'}
                  </button>
                  {editingMedal && (
                    <button
                      onClick={() => { setEditingMedal(null); setNewIcon('🏆'); setNewLabel(''); setNewDesc(''); }}
                      className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-all"
                    >
                      ยกเลิก
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">

          {/* ─── Search & Award panel ─── */}
          <div className="space-y-5">
            {/* Email search */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-300">🔍 ค้นหานักเรียน</h2>
              <div className="flex gap-2">
                <input
                  value={searchEmail}
                  onChange={e => setSearchEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchStudent()}
                  placeholder="พิมพ์อีเมลหรือชื่อนักเรียน..."
                  className="input flex-1 text-sm"
                />
                <button
                  onClick={searchStudent} disabled={searching}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  {searching ? '…' : 'ค้นหา'}
                </button>
              </div>
              {searchError && <p className="mt-2 text-xs text-red-400">{searchError}</p>}

              {student && (
                <div className="mt-4 rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-900/50 text-xl font-bold text-emerald-300">
                      {student.displayName.slice(0, 2).toUpperCase() || '??'}
                    </div>
                    <div>
                      <p className="font-semibold text-emerald-300">{student.displayName}</p>
                      <p className="text-xs text-slate-400">{student.email}</p>
                      <span className="mt-0.5 inline-block rounded-full border border-slate-600 px-2 py-0.5 text-[10px] text-slate-300">{student.classId}</span>
                    </div>
                  </div>
                  {awarded && <p className="mt-3 text-center text-xs font-medium text-emerald-400">✅ มอบเหรียญรางวัลแล้ว!</p>}
                </div>
              )}
            </div>

            {/* Medal & points selection */}
            {student && !awarded && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-slate-300">🏅 เลือกรางวัล</h2>

                <div className="grid grid-cols-2 gap-2">
                  {medalTypes.map(m => (
                    <button
                      key={m.id} type="button"
                      onClick={() => setSelectedMedal(m.id)}
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-all ${
                        selectedMedal === m.id ? m.color + ' ring-1 ring-current' : 'border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <div className="h-8 w-8 shrink-0 flex items-center justify-center">
                        <MedalIcon icon={m.icon} className="h-8 w-8" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{m.label}</p>
                        <p className="text-[10px] opacity-70">{m.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">คะแนน Bonus</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {[5, 10, 15, 20, 30].map(n => (
                      <button
                        key={n} type="button" onClick={() => setPoints(String(n))}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                          points === String(n) ? 'border-yellow-600 bg-yellow-950/40 text-yellow-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                      >+{n}</button>
                    ))}
                    <input
                      type="number" min="1" max="100" value={points}
                      onChange={e => setPoints(e.target.value)}
                      className="w-16 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-center text-xs text-slate-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">เหตุผล (ไม่บังคับ)</label>
                  <input
                    value={reason} onChange={e => setReason(e.target.value)}
                    placeholder="เช่น ช่วยเหลือเพื่อน, ตอบคำถามได้ถูก..."
                    className="input text-sm"
                  />
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center">
                  <div className="flex justify-center">
                    <div className="h-10 w-10 flex items-center justify-center">
                      <MedalIcon icon={medalObj?.icon ?? '🏅'} className="h-10 w-10" />
                    </div>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-200">{medalObj?.label} · +{points} คะแนน</p>
                  <p className="text-xs text-slate-400">→ {student.displayName}</p>
                </div>

                <button
                  onClick={awardBonus} disabled={awarding || !points}
                  className="w-full rounded-xl bg-yellow-600 py-3 text-sm font-bold text-slate-950 hover:bg-yellow-500 disabled:opacity-40 transition-all active:scale-95"
                >
                  {awarding ? 'กำลังมอบรางวัล…' : `🎁 มอบ ${isUrl(medalObj?.icon ?? '') ? '' : medalObj?.icon} ${medalObj?.label} +${points} ให้ ${student.displayName}`}
                </button>
              </div>
            )}
          </div>

          {/* ─── History panel ─── */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="border-b border-slate-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-300">📋 ประวัติการมอบรางวัล</h2>
            </div>
            {loadingHistory ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
              </div>
            ) : history.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-slate-600">ยังไม่มีการมอบรางวัล</div>
            ) : (
              <div className="divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
                {history.map(entry => {
                  const m = medalTypes.find(x => x.id === entry.medal);
                  const icon = m?.icon ?? '🏅';
                  return (
                    <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="h-8 w-8 shrink-0 flex items-center justify-center">
                        <MedalIcon icon={icon} className="h-8 w-8" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-200 truncate">{entry.studentName}</p>
                        <p className="text-[10px] text-slate-500">
                          {entry.classId} · {m?.label ?? entry.medal} · +{entry.points} pts
                        </p>
                        {entry.reason && <p className="text-[10px] text-slate-600 italic truncate">{entry.reason}</p>}
                      </div>
                      <button
                        onClick={() => revokeBonus(entry.id)}
                        className="shrink-0 rounded-lg border border-red-900/50 px-2 py-1 text-[10px] text-red-600 hover:border-red-700 hover:text-red-400 transition-all"
                      >
                        ลบ
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
