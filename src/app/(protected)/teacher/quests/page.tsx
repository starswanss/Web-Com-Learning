'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface Quest {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  icon: string;
  resetType: 'daily' | 'once';
  classIds: string[];
  isActive: boolean;
  claimedCount: number;
  totalStudents: number;
  /** Worksheet students must submit this term before they can claim. */
  requiredAssignmentTitle?: string | null;
}

interface Subject {
  id: string;
  name: string;
  classIds: string[];
}

const ICON_OPTIONS = ['⭐','⚡','🎯','🔥','💡','🚀','🏆','🎓','📚','💎','🌟','✅','🎮','🧩','💪','🎁','🌈','🦋'];
const RESET_LABELS = { daily: 'รายวัน (reset ทุกเที่ยงคืน)', once: 'ครั้งเดียว (claim ได้ 1 ครั้งตลอดกาล)' };

function Spinner() {
  return <div className="flex items-center justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-violet-500" /></div>;
}

export default function TeacherQuestsPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [quests, setQuests] = useState<Quest[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [fetching, setFetching] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [xpReward, setXpReward] = useState(50);
  const [icon, setIcon] = useState('⭐');
  const [resetType, setResetType] = useState<'daily' | 'once'>('daily');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    Promise.all([
      fetch('/api/teacher/quests').then((r) => r.json()),
      fetch('/api/subjects').then((r) => r.json()),
    ]).then(([q, s]) => {
      setQuests(Array.isArray(q) ? q : []);
      setSubjects(Array.isArray(s) ? s : []);
    }).finally(() => setFetching(false));
  }, [profile]);

  // Collect all unique classIds across subjects
  const allClassIds = Array.from(new Set(subjects.flatMap((s) => s.classIds ?? []))).sort();

  function openCreate() {
    setEditId(null);
    setTitle(''); setDescription(''); setXpReward(50); setIcon('⭐');
    setResetType('daily'); setSelectedClassIds(allClassIds);
    setShowModal(true);
  }

  function openEdit(q: Quest) {
    setEditId(q.id);
    setTitle(q.title); setDescription(q.description ?? '');
    setXpReward(q.xpReward); setIcon(q.icon); setResetType(q.resetType);
    setSelectedClassIds(q.classIds ?? []);
    setShowModal(true);
  }

  function toggleClass(classId: string) {
    setSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((c) => c !== classId) : [...prev, classId]
    );
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await fetch('/api/teacher/quests', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editId, title, description, xpReward, icon, resetType, classIds: selectedClassIds }),
        });
        setQuests((prev) => prev.map((q) =>
          q.id === editId ? { ...q, title, description, xpReward, icon, resetType, classIds: selectedClassIds } : q
        ));
      } else {
        const res = await fetch('/api/teacher/quests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description, xpReward, icon, resetType, classIds: selectedClassIds }),
        });
        const data = await res.json();
        setQuests((prev) => [
          { id: data.id, title, description, xpReward, icon, resetType, classIds: selectedClassIds, isActive: true, claimedCount: 0, totalStudents: 0 },
          ...prev,
        ]);
      }
      setShowModal(false);
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('ลบเควสนี้?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/teacher/quests?id=${id}`, { method: 'DELETE' });
      setQuests((prev) => prev.filter((q) => q.id !== id));
    } finally { setDeleting(null); }
  }

  async function handleToggle(q: Quest) {
    setToggling(q.id);
    try {
      await fetch('/api/teacher/quests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: q.id, isActive: !q.isActive }),
      });
      setQuests((prev) => prev.map((x) => x.id === q.id ? { ...x, isActive: !x.isActive } : x));
    } finally { setToggling(null); }
  }

  if (loading || !profile) return <Spinner />;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <Link href="/teacher" className="text-sm text-slate-400 hover:text-slate-200">← ย้อนกลับ</Link>
          <div className="flex-1">
            <h1 className="text-base font-bold text-slate-100">⚡ จัดการเควส</h1>
            <p className="text-[11px] text-slate-500">กำหนดเควสรายวันและ XP ที่นักเรียนจะได้รับ</p>
          </div>
          <button
            onClick={openCreate}
            className="rounded-xl border border-violet-700/60 bg-violet-950/50 px-4 py-2 text-sm font-semibold text-violet-300 transition-all hover:border-violet-600 hover:bg-violet-900/50"
          >
            + สร้างเควส
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        {fetching ? <Spinner /> : quests.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <span className="text-5xl">⚡</span>
            <p className="text-slate-400 font-medium">ยังไม่มีเควส</p>
            <p className="text-sm text-slate-600">กดปุ่ม "สร้างเควส" เพื่อเพิ่มเควสแรก</p>
            <button onClick={openCreate}
              className="mt-2 rounded-xl border border-violet-700/60 bg-violet-950/50 px-5 py-2.5 text-sm font-semibold text-violet-300 hover:border-violet-600">
              + สร้างเควส
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quests.map((q) => (
              <QuestCard
                key={q.id}
                quest={q}
                toggling={toggling === q.id}
                deleting={deleting === q.id}
                onEdit={() => openEdit(q)}
                onToggle={() => handleToggle(q)}
                onDelete={() => handleDelete(q.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h2 className="font-semibold text-slate-100">{editId ? 'แก้ไขเควส' : 'สร้างเควสใหม่'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="space-y-4 p-6">

              {/* Icon picker */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-400">ไอคอน</label>
                <div className="flex flex-wrap gap-2">
                  {ICON_OPTIONS.map((em) => (
                    <button
                      key={em}
                      onClick={() => setIcon(em)}
                      className={`h-9 w-9 rounded-lg border text-xl transition-all ${
                        icon === em
                          ? 'border-violet-500 bg-violet-950/60 scale-110'
                          : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-400">ชื่อเควส *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น เข้าเรียนครบวันนี้"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-violet-500 focus:outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-400">รายละเอียด</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="เงื่อนไขหรือคำอธิบายเพิ่มเติม..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-violet-500 focus:outline-none resize-none"
                />
              </div>

              {/* XP Reward */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-400">XP ที่ได้รับ *</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number" min={1} max={1000}
                    value={xpReward}
                    onChange={(e) => setXpReward(Math.max(1, Math.min(1000, Number(e.target.value))))}
                    className="w-28 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-yellow-300 font-bold focus:border-violet-500 focus:outline-none"
                  />
                  <span className="text-sm text-slate-500">XP</span>
                  <div className="flex gap-2 ml-auto">
                    {[10, 25, 50, 100, 200].map((v) => (
                      <button key={v} onClick={() => setXpReward(v)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
                          xpReward === v ? 'border-yellow-600 bg-yellow-950/50 text-yellow-300' : 'border-slate-700 text-slate-500 hover:border-slate-600'
                        }`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Reset type */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-400">ประเภทเควส</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['daily', 'once'] as const).map((rt) => (
                    <button
                      key={rt}
                      onClick={() => setResetType(rt)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                        resetType === rt
                          ? 'border-violet-600 bg-violet-950/50'
                          : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <p className={`text-xs font-bold ${resetType === rt ? 'text-violet-300' : 'text-slate-400'}`}>
                        {rt === 'daily' ? '🔄 รายวัน' : '🏅 ครั้งเดียว'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-600">
                        {rt === 'daily' ? 'reset ทุกเที่ยงคืน' : 'claim ได้ 1 ครั้งตลอดกาล'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Class selection */}
              {allClassIds.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-400">ห้องที่เห็นเควสนี้</label>
                  <div className="flex flex-wrap gap-2">
                    {allClassIds.map((c) => (
                      <button
                        key={c}
                        onClick={() => toggleClass(c)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
                          selectedClassIds.includes(c)
                            ? 'border-emerald-700 bg-emerald-950/50 text-emerald-300'
                            : 'border-slate-700 text-slate-500 hover:border-slate-600'
                        }`}
                      >
                        ม.3/{c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 px-6 py-4">
              <button onClick={() => setShowModal(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !title.trim()}
                className="rounded-xl border border-violet-700/60 bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-violet-500 disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก…' : editId ? 'บันทึก' : 'สร้างเควส'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestCard({
  quest, toggling, deleting, onEdit, onToggle, onDelete,
}: {
  quest: Quest;
  toggling: boolean;
  deleting: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const pct = quest.totalStudents > 0
    ? Math.round((quest.claimedCount / quest.totalStudents) * 100)
    : 0;

  const claimColor = quest.totalStudents === 0
    ? 'text-slate-500'
    : quest.claimedCount >= quest.totalStudents
      ? 'text-emerald-400'
      : quest.claimedCount > 0
        ? 'text-amber-400'
        : 'text-slate-500';

  const barColor = quest.claimedCount >= quest.totalStudents && quest.totalStudents > 0
    ? 'bg-emerald-500'
    : quest.claimedCount > 0
      ? 'bg-amber-500'
      : 'bg-slate-700';

  return (
    <div className={`group relative overflow-hidden rounded-2xl border transition-all ${
      quest.isActive
        ? 'border-slate-700/80 bg-slate-900 hover:border-slate-600'
        : 'border-slate-800/60 bg-slate-900/50 opacity-60'
    }`}>
      {/* Active indicator */}
      <div className={`absolute inset-x-0 top-0 h-[2px] ${quest.isActive ? 'bg-violet-500' : 'bg-slate-700'}`} />

      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none">{quest.icon}</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-100 truncate">{quest.title}</h3>
            {quest.description && (
              <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">{quest.description}</p>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 rounded-full border border-yellow-700/60 bg-yellow-950/40 px-2.5 py-0.5 text-xs font-bold text-yellow-300">
            ⭐ +{quest.xpReward} XP
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
            {quest.resetType === 'daily' ? '🔄 รายวัน' : '🏅 ครั้งเดียว'}
          </span>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            quest.isActive ? 'bg-emerald-950/60 text-emerald-400' : 'bg-slate-800 text-slate-500'
          }`}>
            {quest.isActive ? '● เปิด' : '○ ปิด'}
          </span>
        </div>

        {/* Acceptance progress */}
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-800/40 px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-slate-500">
              {quest.resetType === 'daily' ? 'รับเควสวันนี้' : 'รับเควสแล้ว'}
            </span>
            <span className={`text-xs font-bold ${claimColor}`}>
              {quest.claimedCount}/{quest.totalStudents} คน
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {quest.requiredAssignmentTitle && (
          <p className="mt-2 text-[10px] text-violet-400/80 line-clamp-1">
            📝 รับได้เมื่อส่ง: {quest.requiredAssignmentTitle}
          </p>
        )}
        {quest.classIds?.length > 0 && (
          <p className="mt-2 text-[10px] text-slate-600">
            ห้อง: {quest.classIds.map((c) => (c.startsWith('ม.') ? c : `ม.3/${c}`)).join(', ')}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center border-t border-slate-800/60 px-3 py-2.5 gap-1">
        <button
          onClick={onToggle}
          disabled={toggling}
          className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
            quest.isActive
              ? 'border border-slate-700 text-slate-400 hover:border-red-800/60 hover:text-red-400'
              : 'border border-emerald-800/60 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-950/50'
          }`}
        >
          {toggling ? '…' : quest.isActive ? '⏸ ปิด' : '▶ เปิด'}
        </button>
        <button onClick={onEdit}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-200">
          ✏️ แก้ไข
        </button>
        <button onClick={onDelete} disabled={deleting}
          className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-600 hover:border-red-900/60 hover:text-red-400">
          {deleting ? '…' : '🗑'}
        </button>
      </div>
    </div>
  );
}
