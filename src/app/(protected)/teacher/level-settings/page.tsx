'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { DEFAULT_SETTINGS, LevelSettings, LevelTier } from '@/lib/xp';

function isUrl(s: string) { return s.startsWith('http') || s.startsWith('data:'); }

/* Shared icon picker used for every tier row */
function IconPicker({
  icon,
  uploading,
  error,
  onEmojiChange,
  onUploadClick,
}: {
  icon: string;
  uploading: boolean;
  error?: string | null;
  onEmojiChange: (v: string) => void;
  onUploadClick: () => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[9px] text-slate-600">สัญลักษณ์ (emoji หรืออัปโหลดรูป PNG/GIF)</p>
      <div className="flex items-center gap-3">

        {/* Large clickable preview — click to upload */}
        <button
          type="button"
          onClick={onUploadClick}
          disabled={uploading}
          className="group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-700 bg-slate-800 transition-all hover:border-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          title="คลิกเพื่ออัปโหลดรูป PNG/GIF"
        >
          {/* current icon */}
          {isUrl(icon)
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={icon} alt="" className="h-10 w-10 rounded object-contain" />
            : <span className="text-3xl leading-none">{icon || '?'}</span>}
          {/* hover overlay */}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-xl bg-slate-900/85 text-[9px] font-medium text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
            {uploading
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

        {/* Emoji text input — intentionally NOT using .input class to avoid width:100% override */}
        <div>
          <p className="mb-0.5 text-[9px] text-slate-600">พิมพ์ emoji</p>
          <input
            type="text"
            value={isUrl(icon) ? '' : icon}
            maxLength={4}
            placeholder="🎯"
            onChange={e => { if (e.target.value) onEmojiChange(e.target.value); }}
            style={{ width: '3.5rem' }}
            className="rounded-xl border border-slate-700 bg-slate-900 py-2 text-center text-xl text-slate-100 outline-none transition-colors focus:border-slate-500"
            title="พิมพ์ emoji โดยตรง"
          />
        </div>

        {/* Info note */}
        <p className="text-[9px] leading-relaxed text-slate-700">PNG / GIF / WebP<br />สูงสุด 2 MB</p>
      </div>
      {error && (
        <p className="text-[10px] text-red-400">⚠ {error}</p>
      )}
    </div>
  );
}

export default function LevelSettingsPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [settings, setSettings] = useState<LevelSettings>(DEFAULT_SETTINGS);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [uploadingTierIdx, setUploadingTierIdx] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const pendingUploadIdx = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    fetch('/api/teacher/level-settings')
      .then(r => r.json())
      .then((d: LevelSettings) => setSettings({ ...DEFAULT_SETTINGS, ...d }))
      .finally(() => setFetching(false));
  }, [profile]);

  function updateTier(idx: number, field: keyof LevelTier, value: string | number) {
    setSettings(s => {
      const tiers = [...s.tiers];
      tiers[idx] = { ...tiers[idx], [field]: field === 'fromLevel' ? Number(value) : value };
      return { ...s, tiers };
    });
  }

  function addTier() {
    const lastLevel = settings.tiers.length > 0
      ? Math.max(...settings.tiers.map(t => t.fromLevel)) + 2
      : 1;
    setSettings(s => ({
      ...s,
      tiers: [...s.tiers, { fromLevel: lastLevel, name: 'เลเวลใหม่', icon: '🎯' }],
    }));
  }

  function removeTier(idx: number) {
    setSettings(s => ({ ...s, tiers: s.tiers.filter((_, i) => i !== idx) }));
  }

  function triggerIconUpload(origIdx: number) {
    setUploadError(null);
    pendingUploadIdx.current = origIdx;
    fileInputRef.current?.click();
  }

  async function handleIconFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const idx = pendingUploadIdx.current;
    e.target.value = '';
    if (!file || idx === null) return;

    setUploadingTierIdx(idx);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/teacher/upload-icon', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'upload failed');
      updateTier(idx, 'icon', json.url as string);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploadingTierIdx(null);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/teacher/level-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    } finally { setSaving(false); }
  }

  if (loading || !profile) return <Spinner />;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/gif,image/webp,image/jpeg"
        style={{ display: 'none' }}
        onChange={handleIconFile}
      />

      <div className="mx-auto max-w-2xl">
        <Link href="/teacher" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
          ← กลับ
        </Link>

        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-100">⚙️ ตั้งค่าระบบเลเวล</h1>
          <p className="mt-1 text-sm text-slate-400">กำหนดเพดานเลเวล XP ต่อเลเวล และชื่อ/สัญลักษณ์ของแต่ละระดับ</p>
        </div>

        {fetching ? (
          <div className="flex justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" /></div>
        ) : (
          <div className="space-y-6">

            {/* XP per level + max level */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-200">📊 ค่าพื้นฐาน</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">XP ต่อเลเวล</label>
                  <input type="number" min="1" value={settings.xpPerLevel}
                    onChange={e => setSettings(s => ({ ...s, xpPerLevel: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="input w-full" />
                  <p className="mt-1 text-[10px] text-slate-600">{settings.xpPerLevel} XP/เลเวล</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">เพดานเลเวล (เว้นว่าง = ไม่จำกัด)</label>
                  <input type="number" min="1" placeholder="ไม่จำกัด" value={settings.maxLevel ?? ''}
                    onChange={e => {
                      const v = e.target.value;
                      setSettings(s => ({ ...s, maxLevel: v === '' ? null : Math.max(1, parseInt(v) || 1) }));
                    }}
                    className="input w-full" />
                  <p className="mt-1 text-[10px] text-slate-600">
                    {settings.maxLevel ? `จำกัดที่ Lv.${settings.maxLevel}` : 'ไม่จำกัดเพดาน'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">ตัวอย่าง XP ที่ต้องการ</p>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 5, 10, 20].map(lv => (
                    <div key={lv} className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-center">
                      <p className="text-[10px] text-slate-500">Lv.{lv}</p>
                      <p className="text-sm font-bold text-slate-200">{((lv - 1) * settings.xpPerLevel).toLocaleString()} XP</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Level tiers */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-200">🏷️ ระดับชั้นเลเวล</h2>
                <button onClick={addTier}
                  className="rounded-lg border border-blue-800 bg-blue-950/40 px-3 py-1.5 text-xs text-blue-300 hover:border-blue-700 transition-all">
                  + เพิ่มระดับ
                </button>
              </div>

              <div className="space-y-3">
                {[...settings.tiers]
                  .sort((a, b) => a.fromLevel - b.fromLevel)
                  .map((tier, i) => {
                    const origIdx = settings.tiers.findIndex(t => t === tier);
                    return (
                      <div key={i} className="rounded-xl border border-slate-800 bg-slate-800/20 p-3 space-y-3">
                        {/* Row 1: Level + Name + Delete */}
                        <div className="flex items-end gap-2">
                          <div className="w-20 shrink-0">
                            <label className="mb-0.5 block text-[9px] text-slate-600">จาก Lv.</label>
                            <input type="number" min="1" value={tier.fromLevel}
                              onChange={e => updateTier(origIdx, 'fromLevel', e.target.value)}
                              className="input w-full text-center" />
                          </div>
                          <div className="flex-1">
                            <label className="mb-0.5 block text-[9px] text-slate-600">ชื่อระดับ</label>
                            <input type="text" value={tier.name} maxLength={20}
                              onChange={e => updateTier(origIdx, 'name', e.target.value)}
                              className="input w-full" />
                          </div>
                          <button onClick={() => removeTier(origIdx)}
                            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-900/50 text-red-500 hover:border-red-700 hover:bg-red-950/30 transition-all text-xs">
                            ✕
                          </button>
                        </div>

                        {/* Row 2: Icon picker */}
                        <IconPicker
                          icon={tier.icon}
                          uploading={uploadingTierIdx === origIdx}
                          error={uploadingTierIdx === null && uploadError && pendingUploadIdx.current === origIdx ? uploadError : null}
                          onEmojiChange={v => updateTier(origIdx, 'icon', v)}
                          onUploadClick={() => triggerIconUpload(origIdx)}
                        />
                      </div>
                    );
                  })}
              </div>

              {settings.tiers.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-600">ยังไม่มีระดับ กดเพิ่มระดับด้านบน</p>
              )}

              {/* Global upload error */}
              {uploadError && uploadingTierIdx === null && (
                <p className="rounded-lg border border-red-800 bg-red-950/20 px-3 py-2 text-xs text-red-400">⚠ {uploadError}</p>
              )}
            </div>

            {/* Preview */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="mb-3 text-sm font-bold text-slate-200">👁️ Preview</h2>
              <div className="flex flex-wrap gap-2">
                {[1, 3, 5, 7, 9, 11, 15].map(lv => {
                  const sorted = [...settings.tiers].sort((a, b) => b.fromLevel - a.fromLevel);
                  const tier = sorted.find(t => lv >= t.fromLevel);
                  const icon = tier?.icon ?? '🌱';
                  return (
                    <div key={lv} className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2">
                      {isUrl(icon)
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={icon} alt="" className="h-5 w-5 rounded object-contain" />
                        : <span className="text-lg">{icon}</span>}
                      <div>
                        <p className="text-[10px] font-bold text-slate-300">Lv.{lv}</p>
                        <p className="text-[9px] text-slate-500">{tier?.name ?? 'ผู้เริ่มต้น'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Save */}
            <button onClick={save} disabled={saving}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95">
              {saving ? 'กำลังบันทึก…' : saved ? '✓ บันทึกสำเร็จ' : 'บันทึกการตั้งค่า'}
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
