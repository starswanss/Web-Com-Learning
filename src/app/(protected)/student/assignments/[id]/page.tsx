'use client';

import { useEffect, useState, useRef, FormEvent, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import type { FormBlock, InfographicColor } from '@/types';

interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate?: { _seconds: number } | null;
  driveWebViewLink?: string;
  blocks?: FormBlock[];
  timeLimit?: number;
  contentType?: string;
  isOpen?: boolean;
  isGroupWork?: boolean;
}

interface GroupMember { uid: string; displayName: string; photoURL?: string }
interface MyGroup {
  id: string;
  name: string;
  memberIds: string[];
  members: GroupMember[];
}
interface GroupSub {
  id: string;
  status: 'submitted' | 'reviewed';
  score?: number;
  feedback?: string;
  submittedAt?: { _seconds: number };
}

interface Submission {
  id: string;
  content?: string;
  answers?: Record<string, string | string[]>;
  driveWebViewLink?: string;
  score?: number;
  feedback?: string;
  plagiarismSuspicion?: number;
  status: string;
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400 border-emerald-700 bg-emerald-950/40';
  if (score >= 60) return 'text-amber-400 border-amber-700 bg-amber-950/40';
  if (score >= 40) return 'text-orange-400 border-orange-700 bg-orange-950/40';
  return 'text-red-400 border-red-700 bg-red-950/40';
}

// Group consecutive half-width blocks into pairs
function groupBlocks(blocks: FormBlock[]): Array<FormBlock | [FormBlock, FormBlock]> {
  const result: Array<FormBlock | [FormBlock, FormBlock]> = [];
  let i = 0;
  while (i < blocks.length) {
    if (blocks[i].half && i + 1 < blocks.length && blocks[i + 1].half) {
      result.push([blocks[i], blocks[i + 1]]);
      i += 2;
    } else {
      result.push(blocks[i]);
      i++;
    }
  }
  return result;
}

export default function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<Submission | null | undefined>(undefined);
  // Answers keyed by block id
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [content, setContent] = useState('');
  const [attachedImageUrl, setAttachedImageUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ score: number; feedback: string } | null>(null);
  const [pasteBlocked, setPasteBlocked] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [tabWarning, setTabWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [selfScore, setSelfScore] = useState(70);
  const [quizStarted, setQuizStarted] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [xpGain, setXpGain] = useState<number | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLeftRef = useRef(false);
  const tabSwitchRef = useRef(0);
  const autoSubmitRef = useRef(false);
  const [myGroup, setMyGroup] = useState<MyGroup | null | undefined>(undefined);
  const [groupSubmission, setGroupSubmission] = useState<GroupSub | null>(null);

  function blockPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    setPasteBlocked(true);
    setTimeout(() => setPasteBlocked(false), 2500);
  }

  function blockDrop(e: React.DragEvent) {
    e.preventDefault();
    setPasteBlocked(true);
    setTimeout(() => setPasteBlocked(false), 2500);
  }

  useEffect(() => {
    if (!loading && profile?.role !== 'student') router.push('/dashboard');
  }, [loading, profile, router]);

  // Track tab switches — only for quizzes, and only after the quiz has started
  useEffect(() => {
    if (submission !== null && submission !== undefined) return;
    if (assignment?.contentType !== 'quiz' || !quizStarted) return;

    function handleVisibility() {
      if (document.hidden) {
        hasLeftRef.current = true;
        tabSwitchRef.current += 1;
        setTabSwitchCount(tabSwitchRef.current);
      } else if (hasLeftRef.current) {
        setTabWarning(true);
        setTimeout(() => setTabWarning(false), 3000);
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [submission, assignment, quizStarted]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/submissions/${id}`)
      .then((r) => r.json())
      .then((data: Submission | null) => {
        setSubmission(data);
        // Restore draft only when no submission exists
        if (!data) {
          const raw = localStorage.getItem(`lms_draft_${id}`);
          if (raw) {
            try {
              const { answers: a, content: c } = JSON.parse(raw);
              if (a && Object.keys(a).length > 0) { setAnswers(a); setDraftRestored(true); }
              if (c) { setContent(c); setDraftRestored(true); }
            } catch { /* ignore malformed */ }
          }
        }
      });
    fetch(`/api/assignments/student/${id}`)
      .then((r) => r.json())
      .then((data: Assignment) => { setAssignment(data ?? null); });
  }, [id]);

  // Fetch group info for group assignments
  useEffect(() => {
    if (!assignment?.isGroupWork) return;
    fetch(`/api/student/my-group?assignmentId=${id}`)
      .then(r => r.json())
      .then(data => {
        setMyGroup(data?.group ?? null);
        setGroupSubmission(data?.submission ?? null);
      })
      .catch(() => setMyGroup(null));
  }, [assignment?.isGroupWork, id]);

  // Auto-save answers + content to localStorage (debounced 1.5 s)
  useEffect(() => {
    if (submission) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const hasAnswers = Object.keys(answers).length > 0;
      const hasContent = content.trim().length > 0;
      if (!hasAnswers && !hasContent) return;
      localStorage.setItem(`lms_draft_${id}`, JSON.stringify({ answers, content }));
      setLastSavedAt(new Date());
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 2000);
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [answers, content, id, submission]);

  // Warn before closing if there are unsaved draft answers
  useEffect(() => {
    if (submission) return;
    const hasAnswers = Object.keys(answers).length > 0;
    const hasContent = content.trim().length > 0;
    if (!hasAnswers && !hasContent) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [answers, content, submission]);

  // Countdown timer + auto-submit
  useEffect(() => {
    if (timeLeft === null || submission !== null && submission !== undefined) return;
    if (timeLeft <= 0) {
      if (!autoSubmitRef.current) {
        autoSubmitRef.current = true;
        document.getElementById('submit-btn')?.click();
      }
      return;
    }
    const t = setTimeout(() => setTimeLeft((prev) => (prev !== null ? prev - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, submission]);

  function setAnswer(blockId: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [blockId]: value }));
  }

  function toggleCheckbox(blockId: string, option: string) {
    setAnswers((prev) => {
      const current = (prev[blockId] as string[]) ?? [];
      return {
        ...prev,
        [blockId]: current.includes(option)
          ? current.filter((v) => v !== option)
          : [...current, option],
      };
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (assignment?.isGroupWork) {
      if (!myGroup) return setError('ยังไม่มีกลุ่ม — รอครูจัดกลุ่มก่อน');
      const gbHasBlocks = (assignment?.blocks?.length ?? 0) > 0;
      if (gbHasBlocks) {
        const requiredMissing = (assignment!.blocks ?? []).some((b) => {
          if (!('required' in b) || !b.required) return false;
          const ans = answers[b.id];
          return !ans || (Array.isArray(ans) ? ans.length === 0 : ans.trim() === '');
        });
        if (requiredMissing) return setError('กรุณาตอบคำถามที่จำเป็นให้ครบ');
      } else {
        if (!content.trim()) return setError('กรุณาพิมพ์คำตอบ');
      }
      setSubmitting(true);
      try {
        const fd = new FormData();
        fd.append('assignmentId', id);
        if (gbHasBlocks) fd.append('answers', JSON.stringify(answers));
        else fd.append('content', content);
        if (attachedImageUrl) fd.append('fileUrl', attachedImageUrl);
        const res = await fetch('/api/group-submissions', { method: 'POST', body: fd });
        if (res.status === 409) { setError('กลุ่มของคุณส่งงานนี้ไปแล้ว'); return; }
        if (!res.ok) throw new Error();
        const data = await res.json();
        localStorage.removeItem(`lms_draft_${id}`);
        setGroupSubmission({ id: data.id, status: 'submitted' });
      } catch {
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const hasBlocks = (assignment?.blocks?.length ?? 0) > 0;

    if (hasBlocks) {
      // Validate required blocks
      const requiredMissing = (assignment!.blocks ?? []).some((b) => {
        if (!('required' in b) || !b.required) return false;
        const ans = answers[b.id];
        return !ans || (Array.isArray(ans) ? ans.length === 0 : ans.trim() === '');
      });
      if (requiredMissing) return setError('กรุณาตอบคำถามที่จำเป็นให้ครบ');
    } else {
      if (!content.trim() && !attachedImageUrl) return setError('กรุณาพิมพ์คำตอบหรืออัปโหลดรูปภาพ');
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('assignmentId', id);
      fd.append('tabSwitchCount', String(tabSwitchCount));
      fd.append('selfScore', String(selfScore));
      if (hasBlocks) {
        fd.append('answers', JSON.stringify(answers));
      } else {
        fd.append('content', content);
      }
      if (attachedImageUrl) fd.append('fileUrl', attachedImageUrl);

      const res = await fetch('/api/submissions', { method: 'POST', body: fd });
      if (res.status === 409) return setError('คุณส่งงานนี้ไปแล้ว');
      if (!res.ok) throw new Error();

      const data = await res.json();
      if (data.graded && typeof data.score === 'number') {
        setResult({ score: data.score, feedback: data.feedback });
      }
      if (typeof data.xpGain === 'number' && data.xpGain > 0) {
        setXpGain(data.xpGain);
        setTimeout(() => setXpGain(null), 4000);
      }
      // Clear saved draft after successful submission
      localStorage.removeItem(`lms_draft_${id}`);
      setSubmission({
        id: data.id,
        content,
        answers,
        score: data.graded ? data.score : undefined,
        feedback: data.graded ? data.feedback : undefined,
        status: data.graded ? 'graded' : 'submitted',
      });
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  function startQuiz() {
    setQuizStarted(true);
    if (assignment?.timeLimit && assignment.timeLimit > 0) {
      setTimeLeft(assignment.timeLimit * 60);
    }
  }

  if (loading || !profile || submission === undefined) return <Spinner />;

  const hasBlocks = (assignment?.blocks?.length ?? 0) > 0;
  const isLocked = assignment?.isOpen === false && !submission;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/student" className="mb-6 inline-block text-sm text-slate-400 hover:text-slate-200">
          ← กลับ
        </Link>

        {/* Assignment header */}
        {assignment ? (
          <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h1 className="text-xl font-semibold text-slate-100">{assignment.title}</h1>
            {assignment.description && (
              <p className="mt-2 text-sm text-slate-400">{assignment.description}</p>
            )}
            {assignment.dueDate && (
              <p className="mt-3 text-xs text-slate-500">
                กำหนดส่ง:{' '}
                {new Date(assignment.dueDate._seconds * 1000).toLocaleDateString('th-TH', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
            {assignment.driveWebViewLink && (
              <a
                href={assignment.driveWebViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
              >
                📎 ดูไฟล์ประกอบ
              </a>
            )}
          </div>
        ) : (
          <div className="mb-6 h-32 animate-pulse rounded-2xl bg-slate-900" />
        )}

        {/* AI grade result (shown right after submit) */}
        {result && (
          <div className={`mb-6 rounded-2xl border p-6 ${scoreColor(result.score)}`}>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold">ผลการตรวจ (AI)</p>
              <span className="text-2xl font-bold">{result.score}/100</span>
            </div>
            <p className="text-sm opacity-90">{result.feedback}</p>
          </div>
        )}

        {/* XP gain toast */}
        {xpGain !== null && (
          <div className="mb-4 animate-bounce-in flex items-center gap-3 rounded-2xl border border-yellow-700/60 bg-gradient-to-r from-yellow-950/80 to-amber-950/60 px-5 py-3">
            <span className="text-2xl">⭐</span>
            <div>
              <p className="text-sm font-bold text-yellow-300">+{xpGain} XP !</p>
              <p className="text-[11px] text-yellow-600">คุณได้รับ XP จากการส่งงานนี้</p>
            </div>
          </div>
        )}

        {isLocked ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-10 text-center">
            <p className="text-5xl mb-4">🔒</p>
            <p className="text-base font-semibold text-slate-200">
              {assignment?.contentType === 'quiz' ? 'แบบทดสอบยังไม่เปิด' : 'ยังไม่เปิดให้เข้า'}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {assignment?.contentType === 'quiz'
                ? 'รอครูเปิดการสอบก่อนนะ'
                : 'ครูจะเปิดให้เข้าในเร็วๆ นี้'}
            </p>
          </div>
        ) : assignment?.contentType === 'quiz' && !quizStarted && !submission ? (
          <QuizRulesScreen assignment={assignment} onStart={startQuiz} />
        ) : submission ? (
          <SubmissionView submission={submission} assignment={assignment} />
        ) : assignment?.isGroupWork && myGroup === undefined ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : assignment?.isGroupWork && myGroup === null ? (
          <div className="rounded-2xl border border-amber-800/60 bg-amber-950/30 p-8 text-center">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-sm font-semibold text-amber-300">ยังไม่ได้รับมอบหมายกลุ่ม</p>
            <p className="mt-1.5 text-xs text-amber-600">รอครูจัดกลุ่มก่อนจึงจะส่งงานได้</p>
          </div>
        ) : assignment?.isGroupWork && groupSubmission ? (
          <GroupSubmissionView submission={groupSubmission} group={myGroup!} assignment={assignment} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {assignment?.isGroupWork && myGroup && (
              <GroupInfoPanel group={myGroup} />
            )}
            {/* Countdown timer */}
            {timeLeft !== null && (
              <div className={`rounded-xl border px-4 py-2.5 text-center text-sm font-semibold ${
                timeLeft <= 60
                  ? 'border-red-800 bg-red-950/50 text-red-400 animate-pulse'
                  : timeLeft <= 300
                  ? 'border-orange-800 bg-orange-950/50 text-orange-400'
                  : 'border-slate-700 bg-slate-800 text-slate-300'
              }`}>
                ⏱ เวลาคงเหลือ{' '}
                {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
                {timeLeft <= 60 && ' — ใกล้หมดเวลาแล้ว!'}
              </div>
            )}
            {/* Anti-paste toast */}
            {pasteBlocked && (
              <div className="rounded-xl border border-amber-800 bg-amber-950/50 px-4 py-2.5 text-sm text-amber-400">
                ⚠ ไม่อนุญาตให้วางข้อความ — กรุณาพิมพ์คำตอบด้วยตัวเอง
              </div>
            )}
            {/* Tab-switch warning */}
            {tabWarning && (
              <div className="rounded-xl border border-orange-800 bg-orange-950/50 px-4 py-2.5 text-sm text-orange-400">
                ⚠ ตรวจพบการออกจากหน้านี้ ({tabSwitchCount} ครั้ง) — ระบบบันทึกไว้แล้ว
              </div>
            )}

            {/* Draft restored notice */}
            {draftRestored && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-800/60 bg-emerald-950/30 px-4 py-2.5 text-sm text-emerald-400">
                <span>💾</span>
                <span>โหลดคำตอบที่บันทึกไว้ก่อนหน้าแล้ว</span>
                <button
                  type="button"
                  onClick={() => { setDraftRestored(false); setAnswers({}); setContent(''); localStorage.removeItem(`lms_draft_${id}`); }}
                  className="ml-auto text-xs text-emerald-600 hover:text-emerald-400"
                >
                  ล้างทิ้ง
                </button>
              </div>
            )}

            {/* Block-based form */}
            {hasBlocks && assignment ? (
              <BlockForm
                blocks={assignment.blocks!}
                answers={answers}
                setAnswer={setAnswer}
                toggleCheckbox={toggleCheckbox}
                onPaste={blockPaste}
                onDrop={blockDrop}
              />
            ) : (
              /* Legacy plain-text form */
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">คำตอบของคุณ</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={blockPaste}
                  onDrop={blockDrop}
                  onDragOver={(e) => e.preventDefault()}
                  rows={8}
                  placeholder="พิมพ์คำตอบที่นี่..."
                  className="input resize-none"
                />
              </div>
            )}

            <DriveImageAttachment
              url={attachedImageUrl}
              onUrl={setAttachedImageUrl}
            />

            {error && (
              <div className="rounded-xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Self-assessment */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-300">🪞 ประเมินตัวเอง</p>
                <span className={`text-xl font-bold ${selfScore >= 80 ? 'text-emerald-400' : selfScore >= 60 ? 'text-amber-400' : selfScore >= 40 ? 'text-orange-400' : 'text-red-400'}`}>
                  {selfScore}
                </span>
              </div>
              <p className="mb-3 text-xs text-slate-500">คิดว่าคำตอบของคุณควรได้คะแนนเท่าไหร่? (ไม่กระทบคะแนนจริง)</p>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={selfScore}
                onChange={(e) => setSelfScore(parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-600">
                <span>0</span>
                <span className="text-slate-400 font-medium">
                  {selfScore >= 80 ? '😊 ทำได้ดีมาก!' : selfScore >= 60 ? '🙂 ทำได้พอใช้' : selfScore >= 40 ? '😐 ยังพอไปได้' : '😟 ต้องปรับปรุง'}
                </span>
                <span>100</span>
              </div>
            </div>

            {/* Auto-save indicator */}
            {lastSavedAt && (
              <div className="flex items-center justify-end gap-1.5 text-[11px]">
                <span className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${autoSaved ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                <span className={`transition-colors duration-300 ${autoSaved ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {autoSaved ? 'บันทึกอัตโนมัติแล้ว' : `บันทึกล่าสุด ${lastSavedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`}
                </span>
              </div>
            )}

            <button
              id="submit-btn"
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95"
            >
              {submitting ? 'กำลังส่งและตรวจงาน…' : 'ส่งงาน'}
            </button>
          </form>
        )}
      </div>

    </div>
  );
}

// ── Block form renderer ────────────────────────────────────────────────────────

function BlockForm({
  blocks,
  answers,
  setAnswer,
  toggleCheckbox,
  onPaste,
  onDrop,
}: {
  blocks: FormBlock[];
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, v: string | string[]) => void;
  toggleCheckbox: (id: string, option: string) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const grouped = groupBlocks(blocks);
  return (
    <div className="space-y-4">
      {grouped.map((item, idx) => {
        if (Array.isArray(item)) {
          return (
            <div key={idx} className="grid grid-cols-2 gap-4">
              {item.map((block) => (
                <BlockRenderer key={block.id} block={block} answers={answers}
                  setAnswer={setAnswer} toggleCheckbox={toggleCheckbox} onPaste={onPaste} onDrop={onDrop} />
              ))}
            </div>
          );
        }
        return (
          <BlockRenderer key={item.id} block={item} answers={answers}
            setAnswer={setAnswer} toggleCheckbox={toggleCheckbox} onPaste={onPaste} onDrop={onDrop} />
        );
      })}
    </div>
  );
}

function BlockRenderer({
  block,
  answers,
  setAnswer,
  toggleCheckbox,
  onPaste,
  onDrop,
}: {
  block: FormBlock;
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, v: string | string[]) => void;
  toggleCheckbox: (id: string, option: string) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  switch (block.type) {
    case 'heading':
      return <h2 className="text-lg font-semibold text-slate-100 pt-2">{block.text}</h2>;

    case 'paragraph':
      return <p className="text-sm text-slate-400 whitespace-pre-wrap">{block.text}</p>;

    case 'image':
      return (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.url}
            alt={block.caption ?? ''}
            className="w-full rounded-xl border border-slate-800 object-contain"
          />
          {block.caption && (
            <p className="mt-1.5 text-center text-xs text-slate-500">{block.caption}</p>
          )}
        </div>
      );

    case 'pdf': {
      const pdfBlock = block as Extract<FormBlock, { type: 'pdf' }>;
      return (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/60 px-3 py-2">
            <span className="text-xs font-medium text-slate-300">
              📄 {pdfBlock.caption || 'เอกสาร PDF'}
            </span>
            <a
              href={pdfBlock.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-600 px-2.5 py-1 text-[10px] text-blue-400 hover:border-blue-600 hover:text-blue-300 transition-all"
            >
              เปิดในแท็บใหม่ ↗
            </a>
          </div>
          <iframe
            src={pdfBlock.url}
            title={pdfBlock.caption || 'PDF'}
            className="w-full bg-white"
            style={{ height: `${pdfBlock.height ?? 600}px` }}
          />
        </div>
      );
    }

    case 'infographic': {
      const COLORS: Record<InfographicColor, { bg: string; border: string; bar: string; text: string }> = {
        blue:   { bg: 'bg-blue-950/50',    border: 'border-blue-700',    bar: 'bg-blue-500',    text: 'text-blue-300'    },
        green:  { bg: 'bg-emerald-950/50', border: 'border-emerald-700', bar: 'bg-emerald-500', text: 'text-emerald-300' },
        purple: { bg: 'bg-purple-950/50',  border: 'border-purple-700',  bar: 'bg-purple-500',  text: 'text-purple-300'  },
        orange: { bg: 'bg-orange-950/50',  border: 'border-orange-700',  bar: 'bg-orange-500',  text: 'text-orange-300'  },
        red:    { bg: 'bg-red-950/50',     border: 'border-red-700',     bar: 'bg-red-500',     text: 'text-red-300'     },
        slate:  { bg: 'bg-slate-800/50',   border: 'border-slate-600',   bar: 'bg-slate-400',   text: 'text-slate-200'   },
      };
      const c = COLORS[(block as Extract<FormBlock, { type: 'infographic' }>).color] ?? COLORS.blue;
      const b = block as Extract<FormBlock, { type: 'infographic' }>;
      return (
        <div className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden`}>
          <div className={`h-1 ${c.bar}`} />
          <div className="px-4 py-3 flex items-start gap-3">
            <span className="text-2xl shrink-0 mt-0.5">{b.icon}</span>
            <div className="min-w-0">
              <p className={`font-bold text-sm ${c.text}`}>{b.title}</p>
              {b.body && <p className="mt-1 text-xs text-slate-400 whitespace-pre-wrap">{b.body}</p>}
            </div>
          </div>
        </div>
      );
    }

    case 'short-answer':
      return (
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            {block.question}
            {block.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <input
            type="text"
            value={(answers[block.id] as string) ?? ''}
            onChange={(e) => setAnswer(block.id, e.target.value)}
            onPaste={onPaste}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            placeholder="คำตอบสั้น..."
            className="input"
          />
        </div>
      );

    case 'long-answer':
      return (
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            {block.question}
            {block.required && <span className="ml-1 text-red-400">*</span>}
          </label>
          <textarea
            value={(answers[block.id] as string) ?? ''}
            onChange={(e) => setAnswer(block.id, e.target.value)}
            onPaste={onPaste}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            rows={5}
            placeholder="คำตอบยาว..."
            className="input resize-none"
          />
        </div>
      );

    case 'multiple-choice': {
      const selected = (answers[block.id] as string) ?? '';
      return (
        <div>
          <p className="mb-3 text-sm font-medium text-slate-300">
            {block.question}
            {block.required && <span className="ml-1 text-red-400">*</span>}
          </p>
          <div className="space-y-2">
            {block.options.map((opt, i) => {
              const imgSrc = block.optionImages?.[i];
              return (
                <label
                  key={opt}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all ${
                    selected === opt
                      ? 'border-blue-600 bg-blue-950/40 text-blue-300'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name={block.id}
                    value={opt}
                    checked={selected === opt}
                    onChange={() => setAnswer(block.id, opt)}
                    className="sr-only"
                  />
                  <span
                    className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                      selected === opt ? 'border-blue-500' : 'border-slate-600'
                    }`}
                  >
                    {selected === opt && (
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                    )}
                  </span>
                  {imgSrc && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgSrc} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-slate-700 object-cover" />
                  )}
                  {opt}
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    case 'checkbox': {
      const checked = (answers[block.id] as string[]) ?? [];
      return (
        <div>
          <p className="mb-3 text-sm font-medium text-slate-300">
            {block.question}
            {block.required && <span className="ml-1 text-red-400">*</span>}
          </p>
          <div className="space-y-2">
            {block.options.map((opt, i) => {
              const isChecked = checked.includes(opt);
              const imgSrc = block.optionImages?.[i];
              return (
                <label
                  key={opt}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all ${
                    isChecked
                      ? 'border-blue-600 bg-blue-950/40 text-blue-300'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCheckbox(block.id, opt)}
                    className="sr-only"
                  />
                  <span
                    className={`h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center ${
                      isChecked ? 'border-blue-500 bg-blue-500' : 'border-slate-600'
                    }`}
                  >
                    {isChecked && (
                      <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-white">
                        <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  {imgSrc && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgSrc} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-slate-700 object-cover" />
                  )}
                  {opt}
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    case 'ordering':
      return (
        <OrderingBlockRenderer block={block} answers={answers} setAnswer={setAnswer} />
      );

    case 'image-upload':
      return (
        <ImageUploadBlockRenderer block={block as Extract<FormBlock, { type: 'image-upload' }>} answers={answers} setAnswer={setAnswer} />
      );

    case 'true-false': {
      const tfBlock = block as Extract<FormBlock, { type: 'true-false' }>;
      const tfAnswers = (answers[block.id] as string[]) ?? [];
      return (
        <div>
          <p className="mb-3 text-sm font-medium text-slate-300">
            {tfBlock.question}
            {tfBlock.required && <span className="ml-1 text-red-400">*</span>}
          </p>
          <div className="space-y-2">
            {tfBlock.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 gap-3">
                <span className="text-sm text-slate-300 flex-1">{item.statement}</span>
                <div className="flex gap-2 shrink-0">
                  <button type="button"
                    onClick={() => { const n = [...tfAnswers]; n[i] = 'true'; setAnswer(block.id, n); }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                      tfAnswers[i] === 'true'
                        ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300'
                        : 'border-slate-600 text-slate-400 hover:border-emerald-700'
                    }`}>ถูก</button>
                  <button type="button"
                    onClick={() => { const n = [...tfAnswers]; n[i] = 'false'; setAnswer(block.id, n); }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                      tfAnswers[i] === 'false'
                        ? 'border-red-600 bg-red-950/60 text-red-300'
                        : 'border-slate-600 text-slate-400 hover:border-red-700'
                    }`}>ผิด</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'matching': {
      const mBlock = block as Extract<FormBlock, { type: 'matching' }>;
      const mAnswers = (answers[block.id] as string[]) ?? [];
      return (
        <div>
          <p className="mb-3 text-sm font-medium text-slate-300">
            {mBlock.question}
            {mBlock.required && <span className="ml-1 text-red-400">*</span>}
          </p>
          <div className="space-y-2">
            {mBlock.leftItems.map((leftItem, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-300">
                  {leftItem}
                </div>
                <span className="text-slate-600 text-sm shrink-0">→</span>
                <select
                  value={mAnswers[i] ?? ''}
                  onChange={e => { const n = [...mAnswers]; n[i] = e.target.value; setAnswer(block.id, n); }}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-600"
                >
                  <option value="">-- เลือก --</option>
                  {mBlock.rightItems.map((rightItem, j) => (
                    <option key={j} value={rightItem}>{rightItem}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'fill-blank': {
      const fbBlock = block as Extract<FormBlock, { type: 'fill-blank' }>;
      const fbAnswers = (answers[block.id] as string[]) ?? [];
      const parts = fbBlock.question.split('___');
      return (
        <div>
          <p className="mb-3 text-sm font-medium text-slate-300">
            {fbBlock.required && <span className="mr-1 text-red-400">*</span>}
            เติมคำในช่องว่าง
          </p>
          <div className="text-sm text-slate-300 flex flex-wrap items-center gap-y-2 gap-x-1">
            {parts.map((part, i) => (
              <span key={i} className="contents">
                <span className="whitespace-pre-wrap">{part}</span>
                {i < parts.length - 1 && (
                  <input
                    type="text"
                    value={fbAnswers[i] ?? ''}
                    onChange={e => { const n = [...fbAnswers]; n[i] = e.target.value; setAnswer(block.id, n); }}
                    onPaste={onPaste}
                    onDrop={onDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="inline-block border-b-2 border-blue-500 bg-transparent px-1 text-blue-300 placeholder:text-slate-600 focus:outline-none"
                    style={{ minWidth: '80px', maxWidth: '160px' }}
                    placeholder={`ช่อง ${i + 1}`}
                  />
                )}
              </span>
            ))}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

function ImageUploadBlockRenderer({
  block, answers, setAnswer,
}: {
  block: Extract<FormBlock, { type: 'image-upload' }>;
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, v: string | string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentUrl = (answers[block.id] as string) ?? '';

  async function handleFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/student/upload-image', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'อัปโหลดไม่สำเร็จ');
      setAnswer(block.id, data.url as string);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const f = item.getAsFile();
        if (f) handleFile(f);
        break;
      }
    }
  }

  return (
    <div onPaste={handlePaste}>
      <label className="mb-2 block text-sm font-medium text-slate-300">
        {block.question}
        {block.required && <span className="ml-1 text-red-400">*</span>}
      </label>

      {currentUrl ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt="คำตอบที่อัปโหลด"
            className="max-h-64 w-full rounded-xl border border-emerald-800/50 bg-slate-800/40 object-contain"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-400">✓ อัปโหลดสำเร็จ</span>
            <button
              type="button"
              onClick={() => { setAnswer(block.id, ''); setUploadError(null); }}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors"
            >
              เปลี่ยนรูป
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-center transition-all ${
            uploading
              ? 'border-blue-700 bg-blue-950/20'
              : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
          }`}
          onClick={() => !uploading && fileRef.current?.click()}
        >
          {uploading ? (
            <>
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />
              <p className="text-xs text-slate-400">กำลังอัปโหลด...</p>
            </>
          ) : (
            <>
              <span className="text-4xl">📸</span>
              <p className="text-sm font-medium text-slate-300">คลิกเพื่อเลือกรูปภาพ</p>
              <p className="text-xs text-slate-500">
                หรือ <span className="text-blue-400">วางจากคลิปบอร์ด (Ctrl+V)</span>
              </p>
              <p className="text-[10px] text-slate-600">JPG · PNG · GIF · WebP — สูงสุด 10 MB</p>
            </>
          )}
        </div>
      )}

      {uploadError && <p className="mt-1.5 text-xs text-red-400">⚠ {uploadError}</p>}

      <input
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        ref={fileRef}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f); }}
      />
    </div>
  );
}

function OrderingBlockRenderer({
  block,
  answers,
  setAnswer,
}: {
  block: Extract<import('@/types').FormBlock, { type: 'ordering' }>;
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, v: string | string[]) => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const shuffled = [...block.items].sort(() => Math.random() - 0.5);
    setAnswer(block.id, shuffled);
    setReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  const order = (answers[block.id] as string[] | undefined) ?? [];

  function move(from: number, to: number) {
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setAnswer(block.id, next);
  }

  return (
    <div>
      <p className="mb-3 text-sm font-medium text-slate-300">
        {block.question}
        {block.required && <span className="ml-1 text-red-400">*</span>}
      </p>
      <p className="mb-2 text-[10px] text-slate-500">ใช้ลูกศรเพื่อเรียงลำดับจากบนลงล่าง</p>
      {!ready ? (
        <div className="space-y-2">
          {block.items.map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-xl bg-slate-800" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {order.map((item, i) => (
            <div
              key={item}
              className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-300"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-400">
                {i + 1}
              </span>
              <span className="flex-1">{item}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  className="flex h-6 w-6 items-center justify-center rounded border border-slate-600 bg-slate-700 text-[10px] text-slate-400 transition-colors hover:bg-slate-600 disabled:opacity-20"
                >▲</button>
                <button
                  type="button"
                  disabled={i === order.length - 1}
                  onClick={() => move(i, i + 1)}
                  className="flex h-6 w-6 items-center justify-center rounded border border-slate-600 bg-slate-700 text-[10px] text-slate-400 transition-colors hover:bg-slate-600 disabled:opacity-20"
                >▼</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Submission view (after submit) ─────────────────────────────────────────────

function SubmissionView({
  submission: s,
  assignment,
}: {
  submission: Submission;
  assignment: Assignment | null;
}) {
  const hasScore = typeof s.score === 'number';
  const hasAnswers = s.answers && Object.keys(s.answers).length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
          คำตอบที่ส่ง
        </p>
        {hasAnswers && assignment?.blocks ? (
          <AnswerReview blocks={assignment.blocks} answers={s.answers!} />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-slate-300">{s.content || '—'}</p>
        )}
        {s.driveWebViewLink && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-slate-500">รูปภาพที่แนบ</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.driveWebViewLink}
              alt="รูปที่แนบ"
              className="max-h-64 w-full rounded-xl border border-slate-700 object-contain"
            />
            <a
              href={s.driveWebViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              ↗ เปิดใน Drive
            </a>
          </div>
        )}
      </div>

      {hasScore && (
        <div className={`rounded-2xl border p-6 ${scoreColor(s.score!)}`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {s.status === 'reviewed' ? 'คะแนน (ครูตรวจแล้ว)' : 'คะแนน (AI)'}
            </p>
            <span className="text-2xl font-bold">{s.score}/100</span>
          </div>
          {s.feedback && <p className="text-sm opacity-90">{s.feedback}</p>}
          {(s.plagiarismSuspicion ?? 0) > 60 && s.status !== 'reviewed' && (
            <p className="mt-2 text-xs opacity-70">
              ⚠ ระบบตรวจพบความเสี่ยงการคัดลอก ({s.plagiarismSuspicion}%) — รอครูตรวจสอบ
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AnswerReview({
  blocks,
  answers,
}: {
  blocks: FormBlock[];
  answers: Record<string, string | string[]>;
}) {
  const questionBlocks = blocks.filter((b) =>
    ['short-answer', 'long-answer', 'multiple-choice', 'checkbox', 'ordering', 'image-upload', 'true-false', 'matching', 'fill-blank'].includes(b.type)
  );
  if (questionBlocks.length === 0) return null;

  return (
    <div className="space-y-4">
      {questionBlocks.map((block, i) => {
        const answer = answers[block.id];
        const q = 'question' in block ? block.question : '';
        return (
          <div key={block.id}>
            <p className="text-xs font-medium text-slate-500 mb-1">
              ข้อ {i + 1}. {q}
            </p>
            {answer === undefined ? (
              <p className="text-sm text-slate-600 italic">ไม่ได้ตอบ</p>
            ) : block.type === 'image-upload' && typeof answer === 'string' && answer ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={answer} alt="คำตอบ" className="max-h-48 rounded-xl border border-slate-700 object-contain" />
            ) : block.type === 'image-upload' ? (
              <p className="text-sm text-slate-600 italic">ไม่ได้อัปโหลดรูป</p>
            ) : block.type === 'true-false' && Array.isArray(answer) ? (() => {
              const tfBlock = block as Extract<FormBlock, { type: 'true-false' }>;
              return (
                <div className="space-y-1">
                  {tfBlock.items.map((item, j) => (
                    <div key={j} className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">{item.statement}</span>
                      <span className={`ml-2 text-xs font-semibold shrink-0 ${
                        answer[j] === 'true' ? 'text-emerald-400' : answer[j] === 'false' ? 'text-red-400' : 'text-slate-600'
                      }`}>{answer[j] === 'true' ? 'ถูก' : answer[j] === 'false' ? 'ผิด' : '—'}</span>
                    </div>
                  ))}
                </div>
              );
            })() : block.type === 'matching' && Array.isArray(answer) ? (() => {
              const mBlock = block as Extract<FormBlock, { type: 'matching' }>;
              return (
                <div className="space-y-1">
                  {mBlock.leftItems.map((left, j) => (
                    <div key={j} className="flex items-center gap-2 text-sm text-slate-300">
                      <span>{left}</span>
                      <span className="text-slate-600">→</span>
                      <span>{(answer as string[])[j] ?? '—'}</span>
                    </div>
                  ))}
                </div>
              );
            })() : block.type === 'fill-blank' ? (() => {
              const fbBlock = block as Extract<FormBlock, { type: 'fill-blank' }>;
              const fbAns = Array.isArray(answer) ? answer : [];
              const parts = fbBlock.question.split('___');
              return (
                <p className="text-sm text-slate-300 flex flex-wrap items-baseline gap-x-0.5">
                  {parts.map((part, j) => (
                    <span key={j} className="contents">
                      <span className="whitespace-pre-wrap">{part}</span>
                      {j < parts.length - 1 && (
                        <span className="border-b border-slate-500 text-blue-300 px-1">[{fbAns[j] ?? '—'}]</span>
                      )}
                    </span>
                  ))}
                </p>
              );
            })() : block.type === 'ordering' && Array.isArray(answer) ? (
              <div className="space-y-1">
                {(answer as string[]).map((a, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-slate-300">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-400">
                      {idx + 1}
                    </span>
                    {a}
                  </div>
                ))}
              </div>
            ) : Array.isArray(answer) ? (
              <div className="flex flex-wrap gap-2">
                {answer.map((a) => (
                  <span
                    key={a}
                    className="rounded-full border border-blue-800 bg-blue-950/40 px-3 py-0.5 text-xs text-blue-300"
                  >
                    {a}
                  </span>
                ))}
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-slate-300">{answer}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Quiz rules / confirmation screen ────────────────────────────────────────── */

function QuizRulesScreen({
  assignment,
  onStart,
}: {
  assignment: Assignment;
  onStart: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  function handleStart() {
    if (!checked) return;
    // 3-second countdown before quiz begins
    setCountdown(3);
  }

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { onStart(); return; }
    const t = setTimeout(() => setCountdown(c => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [countdown, onStart]);

  const rules = [
    {
      icon: '⏱',
      title: 'เวลาทำแบบทดสอบ',
      desc: assignment.timeLimit
        ? `${assignment.timeLimit} นาที — เมื่อหมดเวลาระบบจะส่งงานให้อัตโนมัติทันที`
        : 'ไม่จำกัดเวลา — แต่ควรทำให้เสร็จในคาบเรียน',
      accent: 'border-l-amber-500 bg-amber-500/5',
      iconBg: 'bg-amber-950/60 text-amber-400 border-amber-800',
      urgent: !!assignment.timeLimit,
    },
    {
      icon: '🚫',
      title: 'ห้ามออกจากหน้านี้',
      desc: 'ระบบตรวจจับทุกครั้งที่สลับหน้าต่าง (Tab/App) และบันทึกส่งให้ครูโดยอัตโนมัติ',
      accent: 'border-l-red-500 bg-red-500/5',
      iconBg: 'bg-red-950/60 text-red-400 border-red-800',
      urgent: true,
    },
    {
      icon: '📋',
      title: 'ห้าม Copy-Paste',
      desc: 'ระบบบล็อกการวางข้อความจากภายนอก — กรุณาพิมพ์คำตอบด้วยตัวเอง',
      accent: 'border-l-orange-500 bg-orange-500/5',
      iconBg: 'bg-orange-950/60 text-orange-400 border-orange-800',
      urgent: true,
    },
    {
      icon: '✉️',
      title: 'ส่งได้เพียงครั้งเดียว',
      desc: 'เมื่อกด "ส่งงาน" แล้วไม่สามารถแก้ไขได้ — ตรวจทานคำตอบให้ครบก่อนส่ง',
      accent: 'border-l-blue-500 bg-blue-500/5',
      iconBg: 'bg-blue-950/60 text-blue-400 border-blue-800',
      urgent: false,
    },
    {
      icon: '🧘',
      title: 'ซื่อสัตย์ต่อตนเอง',
      desc: 'ทำด้วยความรู้ของตัวเอง — ผลที่ได้จะสะท้อนความเข้าใจจริงของคุณ',
      accent: 'border-l-emerald-500 bg-emerald-500/5',
      iconBg: 'bg-emerald-950/60 text-emerald-400 border-emerald-800',
      urgent: false,
    },
  ];

  if (countdown !== null && countdown > 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 py-24 text-center">
        <p className="mb-4 text-sm text-slate-400">แบบทดสอบจะเริ่มใน...</p>
        <div className="relative flex h-28 w-28 items-center justify-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 112 112">
            <circle cx="56" cy="56" r="50" fill="none" stroke="#1e293b" strokeWidth="6" />
            <circle
              cx="56" cy="56" r="50" fill="none"
              stroke="#7c3aed" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 50}`}
              strokeDashoffset={`${2 * Math.PI * 50 * (countdown / 3)}`}
              style={{ transition: 'stroke-dashoffset 0.9s linear' }}
            />
          </svg>
          <span className="text-6xl font-black text-violet-300">{countdown}</span>
        </div>
        <p className="mt-6 text-base font-semibold text-slate-200">เตรียมพร้อม!</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl border border-purple-800/60 bg-gradient-to-br from-purple-950/60 via-slate-900 to-slate-950 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-purple-700 bg-purple-950 text-2xl">
            ✏️
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-purple-500 mb-1">แบบทดสอบ</p>
            <h2 className="text-lg font-bold text-slate-100 leading-tight">{assignment.title}</h2>
            {assignment.description && (
              <p className="mt-1 text-sm text-slate-400">{assignment.description}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {assignment.timeLimit ? (
                <span className="flex items-center gap-1.5 rounded-full border border-amber-800/60 bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-400">
                  ⏱ {assignment.timeLimit} นาที
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-400">
                  ⏱ ไม่จำกัดเวลา
                </span>
              )}
              <span className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-400">
                📤 ส่งได้ 1 ครั้ง
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Rules */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-800 px-5 py-3.5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">📋 กฎระเบียบการสอบ</h3>
        </div>
        <div className="divide-y divide-slate-800/60">
          {rules.map((r, i) => (
            <div key={i} className={`flex gap-4 border-l-2 px-5 py-4 ${r.accent}`}>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-base ${r.iconBg}`}>
                {r.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-200">{r.title}</p>
                  {r.urgent && (
                    <span className="rounded-full border border-red-900/60 bg-red-950/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-400">
                      สำคัญ
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Time warning banner */}
      {assignment.timeLimit && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-800/60 bg-amber-950/30 px-5 py-4">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="text-sm font-bold text-amber-300">เหลือเวลาทำ {assignment.timeLimit} นาที</p>
            <p className="text-xs text-amber-500/80">นาฬิกาจะเริ่มนับถอยหลังทันทีที่กดเริ่มทำ — ไม่สามารถหยุดได้</p>
          </div>
        </div>
      )}

      {/* Confirm checkbox */}
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 transition hover:border-slate-600">
        <div className="mt-0.5 flex-shrink-0">
          <input
            type="checkbox"
            checked={checked}
            onChange={e => setChecked(e.target.checked)}
            className="h-4 w-4 accent-violet-500"
          />
        </div>
        <p className="text-sm text-slate-300">
          ข้าพเจ้าอ่านกฎระเบียบครบแล้ว และยืนยันว่าจะทำแบบทดสอบด้วยความซื่อสัตย์โดยไม่ใช้วิธีทุจริตใดๆ
        </p>
      </label>

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={!checked}
        className={`w-full rounded-2xl py-4 text-base font-bold transition-all active:scale-95 ${
          checked
            ? 'bg-gradient-to-r from-violet-600 to-violet-500 text-white shadow-lg shadow-violet-950/40 hover:from-violet-500 hover:to-violet-400'
            : 'cursor-not-allowed bg-slate-800 text-slate-600'
        }`}
      >
        {checked ? '▶ เริ่มทำแบบทดสอบ' : 'กรุณายืนยันว่าอ่านกฎแล้ว'}
      </button>
    </div>
  );
}

function DriveImageAttachment({
  url,
  onUrl,
}: {
  url: string | null;
  onUrl: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/student/upload-image', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'อัปโหลดไม่สำเร็จ');
      onUrl(data.url as string);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="mb-1 block text-sm font-medium text-slate-300">
        แนบรูปภาพ (ถ้ามี)
        <span className="ml-2 text-[10px] font-normal text-slate-500">อัปโหลดไปยัง Google Drive ทันที</span>
      </label>
      {url ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="รูปที่แนบ" className="max-h-48 w-full rounded-xl border border-emerald-800/50 bg-slate-800/40 object-contain" />
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.283 10.356h-8.327v3.451h4.792c-.446 2.193-2.313 3.453-4.792 3.453a5.27 5.27 0 0 1-5.279-5.28 5.27 5.27 0 0 1 5.279-5.279c1.259 0 2.397.447 3.29 1.178l2.6-2.599c-1.584-1.381-3.615-2.233-5.89-2.233a8.908 8.908 0 0 0-8.934 8.934 8.908 8.908 0 0 0 8.934 8.934c4.467 0 8.529-3.249 8.529-8.934 0-.528-.081-1.097-.202-1.625z"/></svg>
              อัปโหลดสำเร็จแล้วบน Drive
            </span>
            <button
              type="button"
              onClick={() => { onUrl(null); setUploadError(null); }}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors"
            >
              ลบ
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-6 text-center transition-all ${
            uploading ? 'border-blue-700 bg-blue-950/20' : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
          }`}
          onClick={() => !uploading && fileRef.current?.click()}
        >
          {uploading ? (
            <>
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />
              <p className="text-xs text-slate-400">กำลังอัปโหลดไปยัง Drive...</p>
            </>
          ) : (
            <>
              <span className="text-2xl">📷</span>
              <p className="text-sm font-medium text-slate-300">คลิกเพื่อเลือกรูปภาพ</p>
              <p className="text-xs text-slate-500">JPG · PNG · GIF · WebP — สูงสุด 10 MB</p>
            </>
          )}
        </div>
      )}
      {uploadError && <p className="text-xs text-red-400">⚠ {uploadError}</p>}
      <input
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        ref={fileRef}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f); }}
      />
    </div>
  );
}

function GroupInfoPanel({ group }: { group: MyGroup }) {
  return (
    <div className="rounded-2xl border border-blue-800/60 bg-blue-950/20 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">👥</span>
        <p className="text-sm font-semibold text-blue-300">{group.name}</p>
        <span className="ml-auto text-xs text-blue-500">{group.members.length} คน</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {group.members.map(m => (
          <div key={m.uid} className="flex items-center gap-1.5 rounded-full border border-blue-800/40 bg-slate-800 px-3 py-1 text-xs text-slate-300">
            {m.displayName}
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupSubmissionView({
  submission,
  group,
  assignment,
}: {
  submission: GroupSub;
  group: MyGroup;
  assignment: Assignment | null;
}) {
  const hasScore = typeof submission.score === 'number';
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">👥</span>
          <p className="text-sm font-semibold text-slate-200">{group.name}</p>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {group.members.map(m => (
            <span key={m.uid} className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300">
              {m.displayName}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-emerald-800/60 bg-emerald-950/30 px-4 py-3">
          <span className="text-emerald-400 text-lg">✓</span>
          <div>
            <p className="text-sm font-medium text-emerald-300">กลุ่มส่งงานแล้ว</p>
            {submission.submittedAt && (
              <p className="text-xs text-emerald-600">
                เมื่อ {new Date(submission.submittedAt._seconds * 1000).toLocaleString('th-TH')}
              </p>
            )}
          </div>
        </div>
      </div>
      {hasScore ? (
        <div className={`rounded-2xl border p-6 ${scoreColor(submission.score!)}`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">คะแนนกลุ่ม (ครูตรวจแล้ว)</p>
            <span className="text-2xl font-bold">{submission.score}/100</span>
          </div>
          {submission.feedback && <p className="text-sm opacity-90">{submission.feedback}</p>}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center">
          <p className="text-sm text-slate-400">รอครูตรวจงาน</p>
        </div>
      )}
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
