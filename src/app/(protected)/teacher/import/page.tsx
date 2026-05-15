'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import type { FormBlock, BlockType } from '@/types';

/*
  Supported import format (JSON):
  {
    "title": "ชื่อใบงาน",
    "unit": "หน่วยที่ 1",
    "contentType": "quiz" | "worksheet" | "knowledge",
    "rubric": "เกณฑ์...",
    "questions": [
      { "type": "short-answer",    "question": "คำถาม", "required": true },
      { "type": "long-answer",     "question": "คำถาม" },
      { "type": "multiple-choice", "question": "คำถาม", "options": ["A","B","C","D"] },
      { "type": "checkbox",        "question": "คำถาม", "options": ["A","B"] },
      { "type": "heading",         "text": "หัวข้อ" },
      { "type": "paragraph",       "text": "เนื้อหา" }
    ]
  }
*/

function uid() { return Math.random().toString(36).slice(2, 9); }

const EXAMPLE_JSON = JSON.stringify({
  title: "แบบทดสอบหน่วยที่ 1 — อัลกอริทึม",
  unit: "หน่วยที่ 1",
  contentType: "quiz",
  rubric: "ให้คะแนนตามความถูกต้องและการอธิบาย",
  questions: [
    { type: "heading", text: "ส่วนที่ 1: ความรู้ทั่วไป" },
    { type: "multiple-choice", question: "อัลกอริทึมคืออะไร?", options: ["ภาษาโปรแกรม", "ขั้นตอนการแก้ปัญหา", "ฐานข้อมูล", "อินเทอร์เน็ต"], required: true },
    { type: "short-answer", question: "ยกตัวอย่างอัลกอริทึมในชีวิตประจำวัน 1 อย่าง", required: true },
    { type: "long-answer", question: "อธิบายขั้นตอนการทำงานของ Bubble Sort พร้อมตัวอย่าง" }
  ]
}, null, 2);

export default function ImportPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [jsonText, setJsonText] = useState('');
  const [parsed, setParsed] = useState<{
    title: string;
    unit: string;
    contentType: string;
    rubric: string;
    blocks: FormBlock[];
  } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  if (!loading && profile?.role !== 'teacher') { router.push('/dashboard'); return null; }

  function handleParse() {
    setParseError(null);
    try {
      const data = JSON.parse(jsonText);
      if (!data.title) throw new Error('ต้องมี field "title"');
      if (!Array.isArray(data.questions)) throw new Error('ต้องมี field "questions" เป็น array');

      const blocks: FormBlock[] = data.questions.map((q: Record<string, unknown>) => {
        const type = q.type as BlockType;
        switch (type) {
          case 'heading':
            return { id: uid(), type: 'heading', text: (q.text as string) ?? '' };
          case 'paragraph':
            return { id: uid(), type: 'paragraph', text: (q.text as string) ?? '' };
          case 'short-answer':
            return { id: uid(), type: 'short-answer', question: (q.question as string) ?? '', required: !!q.required };
          case 'long-answer':
            return { id: uid(), type: 'long-answer', question: (q.question as string) ?? '', required: !!q.required };
          case 'multiple-choice':
            return { id: uid(), type: 'multiple-choice', question: (q.question as string) ?? '', options: (q.options as string[]) ?? ['', ''], required: !!q.required };
          case 'checkbox':
            return { id: uid(), type: 'checkbox', question: (q.question as string) ?? '', options: (q.options as string[]) ?? ['', ''], required: !!q.required };
          default:
            return { id: uid(), type: 'paragraph', text: `[ไม่รู้จักประเภท: ${type}]` };
        }
      });

      setParsed({
        title: data.title,
        unit: data.unit ?? '',
        contentType: data.contentType ?? 'worksheet',
        rubric: data.rubric ?? '',
        blocks,
      });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'JSON ไม่ถูกต้อง');
      setParsed(null);
    }
  }

  function handleUse() {
    if (!parsed) return;
    // Store in sessionStorage for the new assignment page to pick up
    sessionStorage.setItem('lms_import', JSON.stringify(parsed));
    router.push('/teacher/assignments/new?from=import');
  }

  if (loading || !profile) return <Spinner />;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <Link href="/teacher" className="text-sm text-slate-400 hover:text-slate-200">← กลับ</Link>
          <h1 className="text-xl font-semibold text-slate-100">📤 Import ใบงานจาก JSON</h1>
        </div>

        <div className="space-y-6">
          {/* Format guide */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-400 uppercase tracking-wider">รูปแบบ JSON ที่รองรับ</h2>
            <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-400 leading-relaxed">
              {EXAMPLE_JSON}
            </pre>
            <button
              onClick={() => setJsonText(EXAMPLE_JSON)}
              className="mt-3 text-xs text-blue-400 hover:text-blue-300"
            >
              ใช้ตัวอย่างนี้
            </button>
          </div>

          {/* JSON input */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">วาง JSON ที่นี่</label>
            <textarea
              value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); setParsed(null); setParseError(null); }}
              rows={12}
              placeholder={`{\n  "title": "...",\n  "questions": [...]\n}`}
              className="input resize-y font-mono text-xs"
            />
          </div>

          {parseError && (
            <div className="rounded-xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-400">
              ⚠ {parseError}
            </div>
          )}

          <button
            onClick={handleParse}
            disabled={!jsonText.trim()}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100 disabled:opacity-40 transition-all"
          >
            ตรวจสอบและแปลง JSON
          </button>

          {/* Preview */}
          {parsed && (
            <div className="rounded-2xl border border-emerald-800 bg-emerald-950/20 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-emerald-400">✓ พร้อมนำเข้า</h2>
              <div className="space-y-1 text-sm">
                <p className="text-slate-300"><span className="text-slate-500">ชื่อ:</span> {parsed.title}</p>
                {parsed.unit && <p className="text-slate-300"><span className="text-slate-500">หน่วย:</span> {parsed.unit}</p>}
                <p className="text-slate-300"><span className="text-slate-500">ประเภท:</span> {parsed.contentType}</p>
                <p className="text-slate-300"><span className="text-slate-500">บล็อกทั้งหมด:</span> {parsed.blocks.length} รายการ</p>
              </div>
              <div className="space-y-1.5">
                {parsed.blocks.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-500">{b.type}</span>
                    <span className="truncate">
                      {'question' in b ? b.question : 'text' in b ? b.text : ''}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={handleUse}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-all"
              >
                ใช้ใน Assignment ใหม่ →
              </button>
            </div>
          )}
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
