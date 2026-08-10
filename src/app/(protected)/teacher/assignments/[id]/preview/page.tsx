'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import type { FormBlock } from '@/types';
import { CONTENT_TYPE_LABELS, type ContentType } from '@/types';
import { BlockForm } from '@/app/(protected)/student/assignments/[id]/page';

interface AssignmentData {
  id: string;
  title: string;
  description?: string;
  contentType?: ContentType;
  blocks?: FormBlock[];
  driveWebViewLink?: string;
}

// Teacher-only preview of exactly what a student sees when opening the
// assignment — rendered with the student's own BlockForm, read-only (nothing is
// saved). The teacher can type into fields to feel the flow.
export default function AssignmentPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [assignment, setAssignment] = useState<AssignmentData | null>(null);
  const [fetching, setFetching] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher' || !id) return;
    fetch(`/api/assignments/${id}`)
      .then((r) => r.json())
      .then((d) => setAssignment(d?.id ? d : null))
      .finally(() => setFetching(false));
  }, [profile, id]);

  function setAnswer(bid: string, v: string | string[]) {
    setAnswers((prev) => ({ ...prev, [bid]: v }));
  }
  function toggleCheckbox(bid: string, option: string) {
    setAnswers((prev) => {
      const cur = (prev[bid] as string[]) ?? [];
      return { ...prev, [bid]: cur.includes(option) ? cur.filter((x) => x !== option) : [...cur, option] };
    });
  }
  const noop = (e: { preventDefault: () => void }) => e.preventDefault();

  if (loading || !profile) return <Spinner />;

  const isKnowledge = assignment?.contentType === 'knowledge';
  const meta = assignment?.contentType ? CONTENT_TYPE_LABELS[assignment.contentType] : null;

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href={`/teacher/assignments/${id}/submissions`} className="text-sm text-slate-400 hover:text-slate-200">← กลับ</Link>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">👁 มุมมองนักเรียน (พรีวิว)</p>
            <h1 className="truncate text-sm font-semibold text-slate-100">{assignment?.title ?? 'กำลังโหลด…'}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-6">
        {/* Preview banner */}
        <div className="mb-5 rounded-xl border border-blue-800/50 bg-blue-950/30 px-4 py-3 text-sm text-blue-300">
          นี่คือสิ่งที่นักเรียนเห็นเมื่อเปิดใบงานนี้ — เป็นการพรีวิวเท่านั้น ข้อมูลไม่ถูกบันทึก
        </div>

        {fetching ? (
          <Spinner />
        ) : !assignment ? (
          <p className="py-16 text-center text-sm text-slate-500">ไม่พบใบงาน</p>
        ) : (
          <>
            {/* Assignment header — mirrors the student view */}
            <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {meta && (
                  <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold ${meta.color}`}>
                    {meta.icon} {meta.label}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-slate-100">{assignment.title}</h2>
              {assignment.description && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-400">{assignment.description}</p>
              )}
              {assignment.driveWebViewLink && (
                <a href={assignment.driveWebViewLink} target="_blank" rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
                  📎 ดูไฟล์ประกอบ
                </a>
              )}
            </div>

            {/* Blocks — rendered with the student's own component */}
            {assignment.blocks && assignment.blocks.length > 0 ? (
              <BlockForm
                blocks={assignment.blocks}
                answers={answers}
                setAnswer={setAnswer}
                toggleCheckbox={toggleCheckbox}
                onPaste={noop}
                onDrop={noop}
              />
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-800 py-10 text-center text-sm text-slate-500">
                ใบงานนี้ยังไม่มีเนื้อหา/คำถาม
              </p>
            )}

            {/* Mock submit (worksheets/quizzes only) — disabled in preview */}
            {!isKnowledge ? (
              <button
                disabled
                className="mt-6 w-full cursor-not-allowed rounded-xl bg-blue-600/50 py-3 text-sm font-medium text-white/70"
              >
                ส่งงาน (พรีวิว — กดไม่ได้)
              </button>
            ) : (
              <div className="mt-6 rounded-xl border border-emerald-800/50 bg-emerald-950/20 px-4 py-3 text-center text-sm font-medium text-emerald-400">
                📖 ใบความรู้ — สำหรับอ่านศึกษา ไม่ต้องส่งงาน
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
    </div>
  );
}
