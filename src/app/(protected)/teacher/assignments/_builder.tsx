'use client';

import { useRef, useState } from 'react';
import type {
  FormBlock, BlockType, InfographicColor,
  HeadingBlock, ParagraphBlock, ImageBlock, PdfBlock, InfographicBlock,
  ShortAnswerBlock, LongAnswerBlock,
  MultipleChoiceBlock, CheckboxBlock, OrderingBlock, ImageUploadBlock,
  TrueFalseBlock, TrueFalseItem, MatchingBlock, FillBlankBlock, LinkBlock,
} from '@/types';

export { type FormBlock, type BlockType };

export const ALL_CLASSES = Array.from({ length: 18 }, (_, i) => `ม.3/${i + 1}`);

export function uid() { return Math.random().toString(36).slice(2, 9); }

export function makeBlock(type: BlockType): FormBlock {
  switch (type) {
    case 'heading':         return { id: uid(), type, text: 'หัวข้อใหม่' };
    case 'paragraph':       return { id: uid(), type, text: '' };
    case 'image':           return { id: uid(), type, url: '', caption: '' };
    case 'pdf':             return { id: uid(), type, url: '', caption: '', height: 600 };
    case 'infographic':     return { id: uid(), type, title: 'หัวข้อ', body: '', icon: '💡', color: 'blue' };
    case 'short-answer':    return { id: uid(), type, question: '', required: false };
    case 'long-answer':     return { id: uid(), type, question: '', required: false };
    case 'multiple-choice': return { id: uid(), type, question: '', options: ['', ''], optionImages: [null, null], required: false };
    case 'checkbox':        return { id: uid(), type, question: '', options: ['', ''], optionImages: [null, null], required: false };
    case 'ordering':        return { id: uid(), type, question: '', items: ['', '', ''], required: false };
    case 'image-upload':   return { id: uid(), type, question: '', required: false };
    case 'true-false':     return { id: uid(), type, question: '', items: [{ statement: '', correctAnswer: true }, { statement: '', correctAnswer: false }], required: false };
    case 'matching':       return { id: uid(), type, question: '', leftItems: ['', ''], rightItems: ['', ''], correctPairs: [0, 1], required: false };
    case 'fill-blank':     return { id: uid(), type, question: '___ คือ ___', correctAnswers: ['', ''], required: false };
    case 'link':           return { id: uid(), type, question: '', required: false };
  }
}

export function groupBlocks(blocks: FormBlock[]): (FormBlock | [FormBlock, FormBlock])[] {
  const rows: (FormBlock | [FormBlock, FormBlock])[] = [];
  let i = 0;
  while (i < blocks.length) {
    const cur = blocks[i];
    const nxt = blocks[i + 1];
    if (cur.half && nxt?.half) { rows.push([cur, nxt]); i += 2; }
    else { rows.push(cur); i++; }
  }
  return rows;
}

export const BLOCK_LABELS: { type: BlockType; label: string; icon: string }[] = [
  { type: 'heading',         label: 'หัวข้อ',              icon: 'H'  },
  { type: 'paragraph',       label: 'ข้อความ',             icon: '¶'  },
  { type: 'image',           label: 'รูปภาพ',              icon: '🖼'  },
  { type: 'pdf',             label: 'ไฟล์ PDF',            icon: '📄'  },
  { type: 'infographic',     label: 'อินโฟกราฟิก',        icon: '🎨'  },
  { type: 'short-answer',    label: 'ตอบสั้น',             icon: '—'  },
  { type: 'long-answer',     label: 'ตอบยาว',              icon: '≡'  },
  { type: 'multiple-choice', label: 'ตัวเลือก',            icon: '◉'  },
  { type: 'checkbox',        label: 'ช่องกาเครื่องหมาย',  icon: '☑'  },
  { type: 'ordering',        label: 'เรียงลำดับ',          icon: '⇅'  },
  { type: 'image-upload',   label: 'อัปโหลดภาพ',          icon: '📸'  },
  { type: 'true-false',    label: 'ถูก/ผิด',             icon: '✓✗' },
  { type: 'matching',      label: 'จับคู่',               icon: '⟷'  },
  { type: 'fill-blank',    label: 'เติมคำ',               icon: '_'   },
  { type: 'link',          label: 'เพิ่มลิงก์ (วางได้)',  icon: '🔗'  },
];

/* ── Auto-grow textarea helper ─────────────────────────────────── */
function AutoTextarea({
  value, onChange, placeholder, className, minRows = 1,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; className?: string; minRows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      onInput={e => {
        const el = e.currentTarget;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      }}
      placeholder={placeholder}
      rows={minRows}
      className={`resize-none overflow-hidden ${className ?? ''}`}
      style={{ minHeight: `${minRows * 1.6}em` }}
    />
  );
}

/* ── Sub-editors ───────────────────────────────────────────────── */

function HeadingEditor({ block, onChange }: { block: HeadingBlock; onChange: (b: FormBlock) => void }) {
  return (
    <AutoTextarea
      value={block.text}
      onChange={v => onChange({ ...block, text: v })}
      placeholder="หัวข้อ..."
      minRows={1}
      className="w-full bg-transparent text-lg font-semibold text-slate-100 placeholder:text-slate-600 focus:outline-none"
    />
  );
}

function ParagraphEditor({ block, onChange }: { block: ParagraphBlock; onChange: (b: FormBlock) => void }) {
  return (
    <AutoTextarea
      value={block.text}
      onChange={v => onChange({ ...block, text: v })}
      placeholder="เนื้อหา / คำอธิบาย... (กด Enter เพื่อขึ้นบรรทัดใหม่)"
      minRows={3}
      className="w-full bg-transparent text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none"
    />
  );
}

function ImageEditor({ block, onChange }: { block: ImageBlock; onChange: (b: FormBlock) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => onChange({ ...block, url: e.target?.result as string });
    reader.readAsDataURL(file);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleFile(file);
        break;
      }
    }
  }

  return (
    <div className="space-y-2" onPaste={handlePaste}>
      <div className="flex gap-2">
        <input
          value={block.url.startsWith('data:') ? '' : block.url}
          onChange={e => onChange({ ...block, url: e.target.value })}
          placeholder="URL รูปภาพ (https://...) หรือวางภาพที่นี่ (Ctrl+V)"
          className="input flex-1 text-sm"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="shrink-0 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-all"
          title="อัปโหลดรูปจากเครื่อง"
        >
          📁 อัปโหลด
        </button>
        <input
          type="file" accept="image/*" className="hidden" ref={fileRef}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {/* Paste hint */}
      {!block.url && (
        <div
          className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-700 py-6 text-xs text-slate-600 hover:border-slate-500 hover:text-slate-400 transition-all"
          onClick={() => fileRef.current?.click()}
        >
          📋 วางภาพจากคลิปบอร์ด (Ctrl+V) หรือคลิกเพื่ออัปโหลด
        </div>
      )}

      {block.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.url} alt="preview" className="max-h-48 rounded-lg object-cover border border-slate-700"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      )}
      <input
        value={block.caption ?? ''}
        onChange={e => onChange({ ...block, caption: e.target.value })}
        placeholder="คำบรรยายภาพ (ไม่บังคับ)"
        className="input text-xs"
      />
    </div>
  );
}

function PdfEditor({ block, onChange }: { block: PdfBlock; onChange: (b: FormBlock) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Files above this go straight to Google Drive — the hosting platform rejects
  // request bodies larger than ~4.5 MB before they ever reach our API route.
  const DIRECT_UPLOAD_THRESHOLD = 4 * 1024 * 1024;

  async function handleFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      let url: string | undefined;

      if (file.size > DIRECT_UPLOAD_THRESHOLD) {
        // 1) ask our server for a pre-authorised Drive upload session
        const sessRes = await fetch('/api/teacher/upload-pdf/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, mimeType: file.type, size: file.size }),
        });
        const sess = await sessRes.json().catch(() => ({}));
        if (!sessRes.ok) throw new Error(sess.error ?? 'เริ่มอัปโหลดไม่สำเร็จ');

        // 2) upload the bytes straight to Google (bypasses our server)
        const putRes = await fetch(sess.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!putRes.ok) throw new Error('อัปโหลดไปยัง Google Drive ไม่สำเร็จ');
        const uploaded = await putRes.json().catch(() => ({}));
        if (!uploaded.id) throw new Error('ไม่ได้รับรหัสไฟล์จาก Google Drive');

        // 3) make it public and get the viewable URL
        const finRes = await fetch('/api/teacher/upload-pdf/session', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: uploaded.id }),
        });
        const fin = await finRes.json().catch(() => ({}));
        if (!finRes.ok) throw new Error(fin.error ?? 'ตั้งค่าไฟล์ไม่สำเร็จ');
        url = fin.url;
      } else {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/teacher/upload-pdf', { method: 'POST', body: form });
        let json: { url?: string; error?: string } = {};
        try { json = await res.json(); } catch { /* non-JSON error response */ }
        if (!res.ok) throw new Error(json.error ?? 'อัปโหลดไม่สำเร็จ กรุณาลองใหม่');
        url = json.url;
      }

      if (!url) throw new Error('ไม่ได้รับ URL จากเซิร์ฟเวอร์');
      onChange({ ...block, url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* URL input or upload */}
      <div className="flex gap-2">
        <input
          value={block.url}
          onChange={e => onChange({ ...block, url: e.target.value })}
          placeholder="URL ไฟล์ PDF (https://...) หรืออัปโหลดจากเครื่อง"
          className="input flex-1 text-sm"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="shrink-0 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-all disabled:opacity-50"
        >
          {uploading ? (
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
          ) : '📁 อัปโหลด PDF'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f); }}
        />
      </div>

      {uploadError && <p className="text-[10px] text-red-400">⚠ {uploadError}</p>}

      {/* Height control */}
      <div className="flex items-center gap-3">
        <label className="text-[10px] text-slate-500 shrink-0">ความสูง iframe (px)</label>
        <input
          type="number"
          min="300"
          max="1200"
          step="50"
          value={block.height ?? 600}
          onChange={e => onChange({ ...block, height: Math.max(300, parseInt(e.target.value) || 600) })}
          style={{ width: '5rem' }}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-center text-xs text-slate-300 outline-none focus:border-slate-500"
        />
        <span className="text-[10px] text-slate-600">แนะนำ 600–800 px</span>
      </div>

      {/* Caption */}
      <input
        value={block.caption ?? ''}
        onChange={e => onChange({ ...block, caption: e.target.value })}
        placeholder="หัวข้อ / คำอธิบายไฟล์ (ไม่บังคับ)"
        className="input text-xs"
      />

      {/* Preview */}
      {block.url && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-3 py-1.5">
            <span className="text-[10px] text-slate-400">📄 {block.caption || 'ตัวอย่าง PDF'}</span>
            <a href={block.url} target="_blank" rel="noreferrer"
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
              เปิดในแท็บใหม่ ↗
            </a>
          </div>
          <iframe
            src={block.url}
            title={block.caption || 'PDF preview'}
            className="w-full bg-white"
            style={{ height: `${Math.min(block.height ?? 600, 400)}px` }}
          />
        </div>
      )}
    </div>
  );
}

/* ── Infographic editor ────────────────────────────────────────── */

const INFOGRAPHIC_COLORS: Record<InfographicColor, { bg: string; border: string; bar: string; text: string }> = {
  blue:   { bg: 'bg-blue-950/50',    border: 'border-blue-700',    bar: 'bg-blue-500',    text: 'text-blue-300'    },
  green:  { bg: 'bg-emerald-950/50', border: 'border-emerald-700', bar: 'bg-emerald-500', text: 'text-emerald-300' },
  purple: { bg: 'bg-purple-950/50',  border: 'border-purple-700',  bar: 'bg-purple-500',  text: 'text-purple-300'  },
  orange: { bg: 'bg-orange-950/50',  border: 'border-orange-700',  bar: 'bg-orange-500',  text: 'text-orange-300'  },
  red:    { bg: 'bg-red-950/50',     border: 'border-red-700',     bar: 'bg-red-500',     text: 'text-red-300'     },
  slate:  { bg: 'bg-slate-800/50',   border: 'border-slate-600',   bar: 'bg-slate-400',   text: 'text-slate-200'   },
};

const COLOR_DOT: Record<InfographicColor, string> = {
  blue: 'bg-blue-500', green: 'bg-emerald-500', purple: 'bg-purple-500',
  orange: 'bg-orange-500', red: 'bg-red-500', slate: 'bg-slate-400',
};

function InfographicEditor({ block, onChange }: { block: InfographicBlock; onChange: (b: FormBlock) => void }) {
  const c = INFOGRAPHIC_COLORS[block.color] ?? INFOGRAPHIC_COLORS.blue;
  return (
    <div className="space-y-3">
      {/* Toolbar: color + icon */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {(Object.keys(INFOGRAPHIC_COLORS) as InfographicColor[]).map(color => (
            <button
              key={color} type="button"
              onClick={() => onChange({ ...block, color })}
              className={`h-5 w-5 rounded-full ${COLOR_DOT[color]} transition-all ${
                block.color === color ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-110' : 'opacity-60 hover:opacity-100'
              }`}
              title={color}
            />
          ))}
        </div>
        <input
          value={block.icon}
          onChange={e => onChange({ ...block, icon: e.target.value })}
          maxLength={2}
          placeholder="💡"
          className="w-12 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-center text-lg focus:outline-none focus:border-slate-500"
          title="ไอคอน (emoji)"
        />
      </div>

      <input
        value={block.title}
        onChange={e => onChange({ ...block, title: e.target.value })}
        placeholder="หัวข้อ..."
        className="input text-sm font-semibold"
      />
      <AutoTextarea
        value={block.body}
        onChange={v => onChange({ ...block, body: v })}
        placeholder="รายละเอียด / ข้อมูล... (รองรับหลายบรรทัด)"
        minRows={2}
        className="input w-full text-sm"
      />

      {/* Live preview */}
      <div className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden`}>
        <div className={`h-1 ${c.bar}`} />
        <div className="px-4 py-3 flex items-start gap-3">
          <span className="text-2xl shrink-0 mt-0.5">{block.icon || '💡'}</span>
          <div className="min-w-0">
            <p className={`font-bold text-sm ${c.text}`}>{block.title || 'หัวข้อ'}</p>
            {block.body && <p className="mt-1 text-xs text-slate-400 whitespace-pre-wrap">{block.body}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Question header ───────────────────────────────────────────── */
function QuestionHeader({
  question, required, onQuestion, onRequired,
}: {
  question: string; required?: boolean;
  onQuestion: (v: string) => void; onRequired: (v: boolean) => void;
}) {
  return (
    <div className="mb-3 flex items-start gap-2">
      <AutoTextarea
        value={question}
        onChange={onQuestion}
        placeholder="คำถาม... (กด Enter เพื่อขึ้นบรรทัดใหม่)"
        minRows={1}
        className="input flex-1 text-sm"
      />
      <label className="flex shrink-0 items-center gap-1 pt-2.5 text-xs text-slate-400">
        <input type="checkbox" checked={!!required} onChange={e => onRequired(e.target.checked)} className="accent-blue-500" />
        จำเป็น
      </label>
    </div>
  );
}

/* ── Options editor (multiple-choice / checkbox) ──────────────── */
function OptionsEditor({
  options, optionImages = [], onChange,
  correctIndex, correctIndexes, onCorrectChange,
  type,
}: {
  options: string[];
  optionImages?: (string | null)[];
  onChange: (opts: string[], imgs: (string | null)[]) => void;
  correctIndex?: number;
  correctIndexes?: number[];
  onCorrectChange?: (val: number | number[]) => void;
  type: 'multiple-choice' | 'checkbox';
}) {
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  const imgs = optionImages.length >= options.length
    ? optionImages
    : Array(options.length).fill(null);

  function setImage(i: number, dataUrl: string | null) {
    const next = [...imgs];
    next[i] = dataUrl;
    onChange(options, next);
  }

  function handleFile(i: number, file: File) {
    const reader = new FileReader();
    reader.onload = e => setImage(i, e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function updateText(i: number, val: string) {
    const next = [...options]; next[i] = val;
    onChange(next, imgs);
  }

  function addOption() {
    onChange([...options, ''], [...imgs, null]);
  }

  function removeOption(i: number) {
    const newOpts = options.filter((_, j) => j !== i);
    const newImgs = imgs.filter((_, j) => j !== i);
    onChange(newOpts, newImgs);
    // Update correct answer index if needed
    if (type === 'multiple-choice' && typeof correctIndex === 'number') {
      if (correctIndex === i) onCorrectChange?.(-1);
      else if (correctIndex > i) onCorrectChange?.(correctIndex - 1);
    }
    if (type === 'checkbox' && correctIndexes) {
      const updated = correctIndexes
        .filter(ci => ci !== i)
        .map(ci => ci > i ? ci - 1 : ci);
      onCorrectChange?.(updated);
    }
  }

  const bulletIcon = type === 'multiple-choice' ? '◉' : '☑';

  return (
    <div className="space-y-2">
      {/* Answer key legend */}
      <p className="text-[10px] text-slate-500 flex items-center gap-1">
        <span className="text-emerald-500">✓</span>
        คลิก{type === 'multiple-choice' ? 'วงกลม' : 'ช่องกาเครื่องหมาย'}ทางซ้ายเพื่อตั้งเฉลย
      </p>

      {options.map((opt, i) => {
        const img = imgs[i] ?? null;
        const isCorrectSingle = type === 'multiple-choice' && correctIndex === i;
        const isCorrectMulti  = type === 'checkbox' && (correctIndexes ?? []).includes(i);
        const isCorrect = type === 'multiple-choice' ? isCorrectSingle : isCorrectMulti;

        return (
          <div key={i} className={`rounded-xl border p-2 transition-all ${
            isCorrect ? 'border-emerald-700 bg-emerald-950/30' : 'border-slate-800 bg-slate-800/40'
          }`}>
            <div className="flex items-center gap-2">
              {/* Correct answer toggle */}
              {type === 'multiple-choice' ? (
                <button
                  type="button"
                  onClick={() => onCorrectChange?.(isCorrectSingle ? -1 : i)}
                  title="ตั้งเป็นคำตอบที่ถูก"
                  className={`shrink-0 h-4 w-4 rounded-full border-2 flex items-center justify-center transition-all ${
                    isCorrectSingle ? 'border-emerald-500 bg-emerald-500' : 'border-slate-600 hover:border-emerald-600'
                  }`}
                >
                  {isCorrectSingle && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const cur = correctIndexes ?? [];
                    onCorrectChange?.(cur.includes(i) ? cur.filter(ci => ci !== i) : [...cur, i]);
                  }}
                  title="ตั้งเป็นคำตอบที่ถูก"
                  className={`shrink-0 h-4 w-4 rounded border-2 flex items-center justify-center transition-all ${
                    isCorrectMulti ? 'border-emerald-500 bg-emerald-500' : 'border-slate-600 hover:border-emerald-600'
                  }`}
                >
                  {isCorrectMulti && (
                    <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-white">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )}

              <span className="shrink-0 text-slate-500 text-xs">{bulletIcon}</span>
              <input
                value={opt}
                onChange={e => updateText(i, e.target.value)}
                placeholder={`ตัวเลือก ${i + 1}`}
                className="input flex-1 text-sm"
              />
              {/* Image upload */}
              <button type="button"
                onClick={() => fileRefs.current[i]?.click()}
                title="อัปโหลดรูปประกอบตัวเลือก"
                className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] transition-all ${
                  img
                    ? 'border-blue-700 bg-blue-950/40 text-blue-400'
                    : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                }`}>
                🖼
              </button>
              <input
                type="file" accept="image/*" className="hidden"
                ref={el => { fileRefs.current[i] = el; }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(i, f); }}
              />
              {img && (
                <button type="button" onClick={() => setImage(i, null)}
                  className="shrink-0 rounded-lg border border-slate-700 px-1.5 py-1 text-[10px] text-red-500 hover:border-red-800 transition-all">
                  ✕
                </button>
              )}
              {options.length > 2 && (
                <button type="button"
                  onClick={() => removeOption(i)}
                  className="shrink-0 text-slate-600 hover:text-red-400 text-sm">×
                </button>
              )}
            </div>
            {img && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={`option-${i}`}
                className="mt-2 max-h-32 rounded-lg object-contain border border-slate-700" />
            )}
          </div>
        );
      })}
      <button type="button"
        onClick={addOption}
        className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
        + เพิ่มตัวเลือก
      </button>
    </div>
  );
}

/* ── Ordering editor ───────────────────────────────────────────── */
function OrderingEditor({ block, onChange }: { block: OrderingBlock; onChange: (b: FormBlock) => void }) {
  const items = block.items;

  function updateItem(i: number, v: string) {
    const next = [...items]; next[i] = v; onChange({ ...block, items: next });
  }
  function moveItem(i: number, dir: -1 | 1) {
    const next = [...items];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange({ ...block, items: next });
  }
  function addItem() { onChange({ ...block, items: [...items, ''] }); }
  function removeItem(i: number) {
    if (items.length <= 2) return;
    onChange({ ...block, items: items.filter((_, j) => j !== i) });
  }

  return (
    <div>
      <QuestionHeader question={block.question} required={block.required}
        onQuestion={v => onChange({ ...block, question: v })}
        onRequired={v => onChange({ ...block, required: v })} />
      <p className="mb-2 text-[10px] text-slate-500">กำหนดลำดับที่ถูกต้อง (นักเรียนจะเห็นแบบสุ่มและต้องเรียงให้ถูก)</p>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-500">{i + 1}</span>
            <input
              value={item}
              onChange={e => updateItem(i, e.target.value)}
              placeholder={`รายการที่ ${i + 1}`}
              className="input flex-1 text-sm"
            />
            <button type="button" onClick={() => moveItem(i, -1)} disabled={i === 0}
              className="rounded px-1 py-0.5 text-xs text-slate-500 hover:text-slate-200 disabled:opacity-30">↑</button>
            <button type="button" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}
              className="rounded px-1 py-0.5 text-xs text-slate-500 hover:text-slate-200 disabled:opacity-30">↓</button>
            {items.length > 2 && (
              <button type="button" onClick={() => removeItem(i)}
                className="rounded px-1 py-0.5 text-xs text-slate-500 hover:text-red-400">×</button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addItem} className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">
        + เพิ่มรายการ
      </button>
      <p className="mt-2 text-[10px] text-slate-600">ลำดับข้างบนคือ "คำตอบที่ถูกต้อง"</p>
    </div>
  );
}

/* ── Image Upload Block editor (teacher side) ──────────────────── */
function ImageUploadBlockEditor({ block, onChange }: { block: ImageUploadBlock; onChange: (b: FormBlock) => void }) {
  return (
    <div>
      <QuestionHeader
        question={block.question}
        required={block.required}
        onQuestion={(v) => onChange({ ...block, question: v })}
        onRequired={(v) => onChange({ ...block, required: v })}
      />
      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/30 px-4 py-5 text-center select-none">
        <p className="text-2xl mb-1.5">📸</p>
        <p className="text-xs text-slate-400 font-medium">นักเรียนจะอัปโหลดรูปภาพที่นี่</p>
        <p className="text-[10px] text-slate-600 mt-1">JPG · PNG · GIF · WebP — สูงสุด 10 MB</p>
      </div>
    </div>
  );
}

/* ── True/False editor ─────────────────────────────────────────── */
function TrueFalseEditor({ block, onChange }: { block: TrueFalseBlock; onChange: (b: FormBlock) => void }) {
  function updateItem(i: number, field: keyof TrueFalseItem, value: string | boolean) {
    const next = block.items.map((item, j) => j === i ? { ...item, [field]: value } : item);
    onChange({ ...block, items: next });
  }
  function addItem() {
    onChange({ ...block, items: [...block.items, { statement: '', correctAnswer: true }] });
  }
  function removeItem(i: number) {
    if (block.items.length <= 1) return;
    onChange({ ...block, items: block.items.filter((_, j) => j !== i) });
  }

  return (
    <div>
      <QuestionHeader question={block.question} required={block.required}
        onQuestion={v => onChange({ ...block, question: v })}
        onRequired={v => onChange({ ...block, required: v })} />
      <p className="mb-2 text-[10px] text-slate-500">ตั้งว่าแต่ละข้อความ "ถูก" หรือ "ผิด" เพื่อกำหนดเฉลย</p>
      <div className="space-y-2">
        {block.items.map((item, i) => (
          <div key={i} className={`flex items-center gap-2 rounded-xl border p-2 transition-all ${
            item.correctAnswer ? 'border-emerald-800/60 bg-emerald-950/20' : 'border-red-900/60 bg-red-950/20'
          }`}>
            <input
              value={item.statement}
              onChange={e => updateItem(i, 'statement', e.target.value)}
              placeholder={`ข้อความที่ ${i + 1}...`}
              className="input flex-1 text-sm"
            />
            <button type="button"
              onClick={() => updateItem(i, 'correctAnswer', !item.correctAnswer)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                item.correctAnswer
                  ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300'
                  : 'border-red-700 bg-red-950/60 text-red-300'
              }`}>
              {item.correctAnswer ? 'ถูก ✓' : 'ผิด ✗'}
            </button>
            {block.items.length > 1 && (
              <button type="button" onClick={() => removeItem(i)}
                className="shrink-0 text-slate-600 hover:text-red-400 text-sm">×</button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addItem} className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">
        + เพิ่มข้อความ
      </button>
    </div>
  );
}

/* ── Matching editor ────────────────────────────────────────────── */
function MatchingEditor({ block, onChange }: { block: MatchingBlock; onChange: (b: FormBlock) => void }) {
  function updateLeft(i: number, v: string) {
    const next = [...block.leftItems]; next[i] = v;
    onChange({ ...block, leftItems: next });
  }
  function updateRight(i: number, v: string) {
    const next = [...block.rightItems]; next[i] = v;
    onChange({ ...block, rightItems: next });
  }
  function addRow() {
    const nextLeft = [...block.leftItems, ''];
    const nextRight = [...block.rightItems, ''];
    const nextPairs = [...block.correctPairs, block.rightItems.length];
    onChange({ ...block, leftItems: nextLeft, rightItems: nextRight, correctPairs: nextPairs });
  }
  function removeRow(i: number) {
    if (block.leftItems.length <= 2) return;
    const nextLeft = block.leftItems.filter((_, j) => j !== i);
    const nextRight = block.rightItems.filter((_, j) => j !== i);
    const nextPairs = block.correctPairs.filter((_, j) => j !== i).map(p => p > i ? p - 1 : p);
    onChange({ ...block, leftItems: nextLeft, rightItems: nextRight, correctPairs: nextPairs });
  }
  function updatePair(leftIdx: number, rightIdx: number) {
    const next = [...block.correctPairs]; next[leftIdx] = rightIdx;
    onChange({ ...block, correctPairs: next });
  }

  return (
    <div>
      <QuestionHeader question={block.question} required={block.required}
        onQuestion={v => onChange({ ...block, question: v })}
        onRequired={v => onChange({ ...block, required: v })} />
      <p className="mb-2 text-[10px] text-slate-500">คอลัมน์ซ้าย = คำถาม, คอลัมน์ขวา = คำตอบ · เลือกคู่ที่ถูกต้องด้วยลูกศร</p>
      <div className="space-y-2">
        {block.leftItems.map((left, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="shrink-0 w-5 text-center text-xs text-slate-500">{i + 1}</span>
            <input value={left} onChange={e => updateLeft(i, e.target.value)}
              placeholder={`ด้านซ้าย ${i + 1}`} className="input flex-1 text-sm" />
            <span className="text-slate-600 text-sm shrink-0">→</span>
            <select
              value={block.correctPairs[i] ?? 0}
              onChange={e => updatePair(i, Number(e.target.value))}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-600"
            >
              {block.rightItems.map((_, j) => (
                <option key={j} value={j}>{block.rightItems[j] || `ด้านขวา ${j + 1}`}</option>
              ))}
            </select>
            <input value={block.rightItems[i] ?? ''} onChange={e => updateRight(i, e.target.value)}
              placeholder={`ด้านขวา ${i + 1}`} className="input flex-1 text-sm" />
            {block.leftItems.length > 2 && (
              <button type="button" onClick={() => removeRow(i)}
                className="shrink-0 text-slate-600 hover:text-red-400 text-sm">×</button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addRow} className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">
        + เพิ่มคู่
      </button>
    </div>
  );
}

/* ── Fill-blank editor ──────────────────────────────────────────── */
function FillBlankEditor({ block, onChange }: { block: FillBlankBlock; onChange: (b: FormBlock) => void }) {
  const blankCount = (block.question.match(/___/g) ?? []).length;
  const answers = block.correctAnswers;

  function syncAnswers(question: string) {
    const count = (question.match(/___/g) ?? []).length;
    const next = Array.from({ length: count }, (_, i) => answers[i] ?? '');
    onChange({ ...block, question, correctAnswers: next });
  }

  function updateAnswer(i: number, v: string) {
    const next = [...answers]; next[i] = v;
    onChange({ ...block, correctAnswers: next });
  }

  return (
    <div>
      <QuestionHeader question={block.question} required={block.required}
        onQuestion={syncAnswers}
        onRequired={v => onChange({ ...block, required: v })} />
      <p className="mb-2 text-[10px] text-slate-500">
        ใช้ <span className="font-mono text-amber-400">___</span> (3 ขีด) เพื่อระบุช่องว่าง · ตรวจพบ {blankCount} ช่อง
      </p>
      {blankCount > 0 && (
        <div className="space-y-1.5">
          {Array.from({ length: blankCount }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="shrink-0 text-[10px] text-slate-500 w-14">ช่องที่ {i + 1}:</span>
              <input
                value={answers[i] ?? ''}
                onChange={e => updateAnswer(i, e.target.value)}
                placeholder="เฉลย..."
                className="input flex-1 text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Block editor dispatcher ────────────────────────────────────── */

export function BlockEditor({ block, onChange }: { block: FormBlock; onChange: (b: FormBlock) => void }) {
  switch (block.type) {
    case 'heading':       return <HeadingEditor block={block} onChange={onChange} />;
    case 'paragraph':     return <ParagraphEditor block={block} onChange={onChange} />;
    case 'image':         return <ImageEditor block={block} onChange={onChange} />;
    case 'pdf':           return <PdfEditor block={block as PdfBlock} onChange={onChange} />;
    case 'infographic':   return <InfographicEditor block={block as InfographicBlock} onChange={onChange} />;
    case 'ordering':      return <OrderingEditor block={block as OrderingBlock} onChange={onChange} />;
    case 'image-upload':  return <ImageUploadBlockEditor block={block as ImageUploadBlock} onChange={onChange} />;

    case 'short-answer':
      return (
        <div>
          <QuestionHeader question={(block as ShortAnswerBlock).question} required={block.required}
            onQuestion={v => onChange({ ...block, question: v } as ShortAnswerBlock)}
            onRequired={v => onChange({ ...block, required: v } as ShortAnswerBlock)} />
          <div className="rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-500">คำตอบสั้น (1 บรรทัด)</div>
        </div>
      );

    case 'long-answer':
      return (
        <div>
          <QuestionHeader question={(block as LongAnswerBlock).question} required={block.required}
            onQuestion={v => onChange({ ...block, question: v } as LongAnswerBlock)}
            onRequired={v => onChange({ ...block, required: v } as LongAnswerBlock)} />
          <div className="rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-500">คำตอบยาว (หลายบรรทัด)</div>
        </div>
      );

    case 'multiple-choice': {
      const b = block as MultipleChoiceBlock;
      return (
        <div>
          <QuestionHeader question={b.question} required={b.required}
            onQuestion={v => onChange({ ...b, question: v })}
            onRequired={v => onChange({ ...b, required: v })} />
          <OptionsEditor
            type="multiple-choice"
            options={b.options}
            optionImages={b.optionImages}
            correctIndex={b.correctIndex}
            onChange={(opts, imgs) => onChange({ ...b, options: opts, optionImages: imgs })}
            onCorrectChange={val => onChange({ ...b, correctIndex: val as number })}
          />
          <p className="mt-2 text-xs text-slate-500">เลือกได้ 1 ข้อ</p>
        </div>
      );
    }

    case 'checkbox': {
      const b = block as CheckboxBlock;
      return (
        <div>
          <QuestionHeader question={b.question} required={b.required}
            onQuestion={v => onChange({ ...b, question: v })}
            onRequired={v => onChange({ ...b, required: v })} />
          <OptionsEditor
            type="checkbox"
            options={b.options}
            optionImages={b.optionImages}
            correctIndexes={b.correctIndexes}
            onChange={(opts, imgs) => onChange({ ...b, options: opts, optionImages: imgs })}
            onCorrectChange={val => onChange({ ...b, correctIndexes: val as number[] })}
          />
          <p className="mt-2 text-xs text-slate-500">เลือกได้หลายข้อ</p>
        </div>
      );
    }

    case 'true-false':
      return <TrueFalseEditor block={block as TrueFalseBlock} onChange={onChange} />;

    case 'matching':
      return <MatchingEditor block={block as MatchingBlock} onChange={onChange} />;

    case 'fill-blank':
      return <FillBlankEditor block={block as FillBlankBlock} onChange={onChange} />;

    case 'link':
      return (
        <div>
          <QuestionHeader question={(block as LinkBlock).question} required={block.required}
            onQuestion={v => onChange({ ...block, question: v } as LinkBlock)}
            onRequired={v => onChange({ ...block, required: v } as LinkBlock)} />
          <div className="rounded-lg border border-dashed border-cyan-800/60 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-400">
            🔗 ช่องใส่ลิงก์ — นักเรียน<strong>วางข้อความ (paste) ได้เฉพาะช่องนี้</strong>
          </div>
        </div>
      );
  }
}

export function BlockCard({
  block, index, total, onChange, onMove, onToggleHalf, onDelete,
}: {
  block: FormBlock; index: number; total: number;
  onChange: (b: FormBlock) => void; onMove: (dir: -1 | 1) => void;
  onToggleHalf: () => void; onDelete: () => void;
}) {
  const typeLabel = BLOCK_LABELS.find(l => l.type === block.type);
  return (
    <div className={`relative rounded-2xl border border-slate-800 bg-slate-900 p-4 ${block.half ? 'min-w-0' : ''}`}>
      <div className="mb-3 flex items-center gap-1">
        <span className="mr-auto rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
          {typeLabel?.icon} {typeLabel?.label}
        </span>
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0}
          className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:text-slate-200 disabled:opacity-30" title="เลื่อนขึ้น">↑</button>
        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1}
          className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:text-slate-200 disabled:opacity-30" title="เลื่อนลง">↓</button>
        <button type="button" onClick={onToggleHalf} title={block.half ? 'เปลี่ยนเป็นเต็มแถว' : 'แบ่งครึ่งแถว'}
          className={`rounded px-1.5 py-0.5 text-xs transition-all ${block.half ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-200'}`}>½</button>
        <button type="button" onClick={onDelete}
          className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:text-red-400" title="ลบ">×</button>
      </div>
      <BlockEditor block={block} onChange={onChange} />
    </div>
  );
}
