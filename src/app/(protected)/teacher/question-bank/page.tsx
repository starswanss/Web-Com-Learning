'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type QType = 'short-answer' | 'long-answer' | 'multiple-choice' | 'checkbox';

interface Question {
  id: string;
  type: QType;
  question: string;
  options: string[];
  tags: string[];
  createdAt?: { _seconds: number };
}

const TYPE_LABELS: Record<QType, { label: string; icon: string }> = {
  'short-answer':    { label: 'ตอบสั้น',      icon: '—' },
  'long-answer':     { label: 'ตอบยาว',       icon: '¶' },
  'multiple-choice': { label: 'ตัวเลือก',     icon: '◎' },
  'checkbox':        { label: 'เลือกหลายข้อ', icon: '☑' },
};

export default function QuestionBankPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [fetching, setFetching] = useState(true);
  const [filterType, setFilterType] = useState<QType | 'all'>('all');
  const [filterTag, setFilterTag] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [newType, setNewType] = useState<QType>('short-answer');
  const [newQuestion, setNewQuestion] = useState('');
  const [newOptions, setNewOptions] = useState(['', '', '', '']);
  const [newTag, setNewTag] = useState('');
  const [newTags, setNewTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    fetch('/api/teacher/question-bank')
      .then((r) => r.json())
      .then((d) => setQuestions(Array.isArray(d) ? d : []))
      .finally(() => setFetching(false));
  }, [profile]);

  async function handleDelete(id: string) {
    if (!confirm('ลบคำถามนี้?')) return;
    setDeleting(id);
    await fetch('/api/teacher/question-bank', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    setDeleting(null);
  }

  async function handleAdd() {
    if (!newQuestion.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/teacher/question-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newType,
          question: newQuestion,
          options: ['multiple-choice', 'checkbox'].includes(newType)
            ? newOptions.filter((o) => o.trim())
            : [],
          tags: newTags,
        }),
      });
      const data = await res.json();
      setQuestions((prev) => [
        { id: data.id, type: newType, question: newQuestion, options: newOptions.filter((o) => o.trim()), tags: newTags },
        ...prev,
      ]);
      setNewQuestion(''); setNewOptions(['', '', '', '']); setNewTags([]); setNewTag('');
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  function addTag() {
    const t = newTag.trim();
    if (t && !newTags.includes(t)) setNewTags((p) => [...p, t]);
    setNewTag('');
  }

  const allTags = Array.from(new Set(questions.flatMap((q) => q.tags)));
  const filtered = questions.filter((q) => {
    if (filterType !== 'all' && q.type !== filterType) return false;
    if (filterTag && !q.tags.includes(filterTag)) return false;
    return true;
  });

  if (loading || !profile) return <Spinner />;

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/teacher" className="text-xs text-slate-500 hover:text-slate-300">←</Link>
            <h1 className="text-base font-semibold text-slate-100">📦 Question Bank</h1>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{questions.length}</span>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 transition-all"
          >
            + เพิ่มคำถาม
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">
        {/* Add form */}
        {showForm && (
          <section className="rounded-2xl border border-blue-800/50 bg-blue-950/10 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-blue-300">เพิ่มคำถามใหม่</h2>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">ประเภทคำถาม</label>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(TYPE_LABELS) as [QType, { label: string; icon: string }][]).map(([t, m]) => (
                  <button key={t} onClick={() => setNewType(t)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                      newType === t ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">คำถาม *</label>
              <textarea
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                rows={3}
                placeholder="พิมพ์คำถามที่นี่..."
                className="input resize-none text-sm w-full"
              />
            </div>

            {['multiple-choice', 'checkbox'].includes(newType) && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">ตัวเลือก</label>
                <div className="space-y-2">
                  {newOptions.map((opt, i) => (
                    <input key={i} value={opt}
                      onChange={(e) => setNewOptions((p) => p.map((o, j) => j === i ? e.target.value : o))}
                      placeholder={`ตัวเลือก ${i + 1}`}
                      className="input text-sm w-full" />
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">แท็ก</label>
              <div className="flex gap-2">
                <input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder="พิมพ์แท็กแล้วกด Enter"
                  className="input flex-1 text-sm"
                />
                <button onClick={addTag} className="rounded-xl border border-slate-700 px-3 text-xs text-slate-400 hover:text-slate-200">เพิ่ม</button>
              </div>
              {newTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {newTags.map((t) => (
                    <span key={t} className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                      {t}
                      <button onClick={() => setNewTags((p) => p.filter((x) => x !== t))} className="text-slate-500 hover:text-red-400">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={saving || !newQuestion.trim()}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                {saving ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
              <button onClick={() => setShowForm(false)} className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:text-slate-200">
                ยกเลิก
              </button>
            </div>
          </section>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterType('all')}
            className={`rounded-full border px-3 py-1 text-xs ${filterType === 'all' ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
            ทั้งหมด ({questions.length})
          </button>
          {(Object.entries(TYPE_LABELS) as [QType, { label: string; icon: string }][]).map(([t, m]) => {
            const count = questions.filter((q) => q.type === t).length;
            if (!count) return null;
            return (
              <button key={t} onClick={() => setFilterType(t)}
                className={`rounded-full border px-3 py-1 text-xs ${filterType === t ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                {m.icon} {m.label} ({count})
              </button>
            );
          })}
          {allTags.map((tag) => (
            <button key={tag} onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
              className={`rounded-full border px-3 py-1 text-xs ${filterTag === tag ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
              #{tag}
            </button>
          ))}
        </div>

        {/* Question list */}
        {fetching ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center">
            <p className="text-slate-400">ยังไม่มีคำถาม</p>
            <p className="mt-1 text-sm text-slate-500">กด "+ เพิ่มคำถาม" เพื่อเริ่ม</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((q) => {
              const meta = TYPE_LABELS[q.type];
              return (
                <div key={q.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                          {meta.icon} {meta.label}
                        </span>
                        {q.tags.map((t) => (
                          <span key={t} className="rounded-full border border-amber-800/50 bg-amber-950/20 px-2 py-0.5 text-xs text-amber-400">#{t}</span>
                        ))}
                      </div>
                      <p className="text-sm text-slate-100">{q.question}</p>
                      {q.options.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {q.options.map((opt, i) => (
                            <li key={i} className="text-xs text-slate-500">
                              {String.fromCharCode(65 + i)}. {opt}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(q.id)}
                      disabled={deleting === q.id}
                      className="shrink-0 rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:border-red-700 disabled:opacity-50"
                    >
                      {deleting === q.id ? '…' : 'ลบ'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
