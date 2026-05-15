'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { CONTENT_TYPE_LABELS, type ContentType } from '@/types';
import type { FormBlock } from '@/types';

interface Template {
  id: string;
  name: string;
  contentType: ContentType;
  unit: string | null;
  blocks: FormBlock[];
  rubric: string | null;
  createdAt: { _seconds: number };
}

export default function TemplatesPage() {
  const { profile, loading } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fetching, setFetching] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role !== 'teacher') return;
    fetch('/api/teacher/templates')
      .then((r) => r.json())
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .finally(() => setFetching(false));
  }, [profile]);

  async function handleDelete(id: string) {
    if (!confirm('ลบ Template นี้?')) return;
    setDeleting(id);
    await fetch('/api/teacher/templates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setDeleting(null);
  }

  if (loading || !profile) return <Spinner />;

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/teacher" className="text-xs text-slate-500 hover:text-slate-300">←</Link>
            <h1 className="text-base font-semibold text-slate-100">📝 Template ใบงาน</h1>
          </div>
          <Link href="/teacher/assignments/new"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-all">
            + ใช้ใน Assignment ใหม่
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {fetching ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 py-20 text-center">
            <p className="text-slate-400">ยังไม่มี Template</p>
            <p className="mt-1 text-sm text-slate-500">
              บันทึก Template จากหน้าสร้างใบงาน เพื่อใช้ซ้ำในครั้งหน้า
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => {
              const ctMeta = CONTENT_TYPE_LABELS[t.contentType] ?? CONTENT_TYPE_LABELS.worksheet;
              const questionBlocks = t.blocks.filter((b) =>
                ['short-answer', 'long-answer', 'multiple-choice', 'checkbox'].includes(b.type)
              );
              return (
                <div key={t.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${ctMeta.color}`}>
                          {ctMeta.icon} {ctMeta.label}
                        </span>
                        {t.unit && (
                          <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                            {t.unit}
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-slate-100 truncate">{t.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {t.blocks.length} บล็อก · {questionBlocks.length} คำถาม
                        {t.rubric && ' · มี Rubric'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={deleting === t.id}
                      className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:border-red-700 transition-all disabled:opacity-50"
                    >
                      {deleting === t.id ? '…' : 'ลบ'}
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
