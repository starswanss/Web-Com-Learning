'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { DEFAULT_SETTINGS, LevelSettings, LevelTier } from '@/lib/xp';

export default function LevelSettingsPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [settings, setSettings] = useState<LevelSettings>(DEFAULT_SETTINGS);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
                  <input
                    type="number"
                    min="1"
                    value={settings.xpPerLevel}
                    onChange={e => setSettings(s => ({ ...s, xpPerLevel: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="input w-full"
                  />
                  <p className="mt-1 text-[10px] text-slate-600">ค่าปัจจุบัน: {settings.xpPerLevel} XP/เลเวล</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">เพดานเลเวล (เว้นว่าง = ไม่จำกัด)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="ไม่จำกัด"
                    value={settings.maxLevel ?? ''}
                    onChange={e => {
                      const v = e.target.value;
                      setSettings(s => ({ ...s, maxLevel: v === '' ? null : Math.max(1, parseInt(v) || 1) }));
                    }}
                    className="input w-full"
                  />
                  <p className="mt-1 text-[10px] text-slate-600">
                    {settings.maxLevel ? `จำกัดที่ Lv.${settings.maxLevel}` : 'ไม่จำกัดเพดาน'}
                  </p>
                </div>
              </div>

              {/* XP preview */}
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
                <button
                  onClick={addTier}
                  className="rounded-lg border border-blue-800 bg-blue-950/40 px-3 py-1.5 text-xs text-blue-300 hover:border-blue-700 transition-all"
                >
                  + เพิ่มระดับ
                </button>
              </div>
              <p className="text-[11px] text-slate-500">แต่ละระดับจะใช้กับ Lv.{'{fromLevel}'} ขึ้นไป — เรียงจากน้อยไปมาก</p>

              <div className="space-y-2">
                {[...settings.tiers]
                  .sort((a, b) => a.fromLevel - b.fromLevel)
                  .map((tier, i) => {
                    const origIdx = settings.tiers.findIndex(t => t === tier);
                    return (
                      <div key={i} className="grid grid-cols-[80px_1fr_1fr_36px] gap-2 items-center">
                        <div>
                          <label className="mb-0.5 block text-[9px] text-slate-600">จาก Lv.</label>
                          <input
                            type="number"
                            min="1"
                            value={tier.fromLevel}
                            onChange={e => updateTier(origIdx, 'fromLevel', e.target.value)}
                            className="input w-full text-center"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[9px] text-slate-600">ชื่อระดับ</label>
                          <input
                            type="text"
                            value={tier.name}
                            maxLength={20}
                            onChange={e => updateTier(origIdx, 'name', e.target.value)}
                            className="input w-full"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[9px] text-slate-600">สัญลักษณ์ (emoji)</label>
                          <input
                            type="text"
                            value={tier.icon}
                            maxLength={4}
                            onChange={e => updateTier(origIdx, 'icon', e.target.value)}
                            className="input w-full text-lg"
                          />
                        </div>
                        <button
                          onClick={() => removeTier(origIdx)}
                          className="mt-4 flex h-8 w-8 items-center justify-center rounded-lg border border-red-900/50 text-red-500 hover:border-red-700 hover:bg-red-950/30 transition-all text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
              </div>

              {settings.tiers.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-600">ยังไม่มีระดับ กดเพิ่มระดับด้านบน</p>
              )}
            </div>

            {/* Preview */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="mb-3 text-sm font-bold text-slate-200">👁️ Preview</h2>
              <div className="flex flex-wrap gap-2">
                {[1, 3, 5, 7, 9, 11, 15].map(lv => {
                  const sorted = [...settings.tiers].sort((a, b) => b.fromLevel - a.fromLevel);
                  const tier = sorted.find(t => lv >= t.fromLevel);
                  return (
                    <div key={lv} className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2">
                      <span className="text-base">{tier?.icon ?? '🌱'}</span>
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
            <button
              onClick={save}
              disabled={saving}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95"
            >
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
