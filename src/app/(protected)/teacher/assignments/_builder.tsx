'use client';

import { useRef } from 'react';
import type {
  FormBlock, BlockType,
  HeadingBlock, ParagraphBlock, ImageBlock,
  ShortAnswerBlock, LongAnswerBlock,
  MultipleChoiceBlock, CheckboxBlock, OrderingBlock,
} from '@/types';

export { type FormBlock, type BlockType };

export const ALL_CLASSES = Array.from({ length: 18 }, (_, i) => `ม.3/${i + 1}`);

export function uid() { return Math.random().toString(36).slice(2, 9); }

export function makeBlock(type: BlockType): FormBlock {
  switch (type) {
    case 'heading':         return { id: uid(), type, text: 'หัวข้อใหม่' };
    case 'paragraph':       return { id: uid(), type, text: '' };
    case 'image':           return { id: uid(), type, url: '', caption: '' };
    case 'short-answer':    return { id: uid(), type, question: '', required: false };
    case 'long-answer':     return { id: uid(), type, question: '', required: false };
    case 'multiple-choice': return { id: uid(), type, question: '', options: ['', ''], optionImages: [null, null], required: false };
    case 'checkbox':        return { id: uid(), type, question: '', options: ['', ''], optionImages: [null, null], required: false };
    case 'ordering':        return { id: uid(), type, question: '', items: ['', '', ''], required: false };
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
  { type: 'short-answer',    label: 'ตอบสั้น',             icon: '—'  },
  { type: 'long-answer',     label: 'ตอบยาว',              icon: '≡'  },
  { type: 'multiple-choice', label: 'ตัวเลือก',            icon: '◉'  },
  { type: 'checkbox',        label: 'ช่องกาเครื่องหมาย',  icon: '☑'  },
  { type: 'ordering',        label: 'เรียงลำดับ',          icon: '⇅'  },
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
  return (
    <div className="space-y-2">
      <input
        value={block.url}
        onChange={e => onChange({ ...block, url: e.target.value })}
        placeholder="URL รูปภาพ (https://...)"
        className="input text-sm"
      />
      {block.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.url} alt="preview" className="max-h-48 rounded-lg object-cover"
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

/* Question header: textarea so multi-line questions are possible */
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

/* Options editor with per-option image upload */
function OptionsEditor({
  options, optionImages = [], onChange, onImagesChange, type,
}: {
  options: string[];
  optionImages?: (string | null)[];
  onChange: (opts: string[]) => void;
  onImagesChange?: (imgs: (string | null)[]) => void;
  type: 'multiple-choice' | 'checkbox';
}) {
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  function setImage(i: number, dataUrl: string | null) {
    const next = [...(optionImages.length >= options.length ? optionImages : Array(options.length).fill(null))];
    next[i] = dataUrl;
    onImagesChange?.(next);
  }

  function handleFile(i: number, file: File) {
    const reader = new FileReader();
    reader.onload = e => setImage(i, e.target?.result as string);
    reader.readAsDataURL(file);
  }

  const bulletIcon = type === 'multiple-choice' ? '◉' : '☑';

  return (
    <div className="space-y-2">
      {options.map((opt, i) => {
        const img = optionImages[i] ?? null;
        return (
          <div key={i} className="rounded-xl border border-slate-800 bg-slate-800/40 p-2">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-slate-500 text-xs">{bulletIcon}</span>
              <input
                value={opt}
                onChange={e => { const next = [...options]; next[i] = e.target.value; onChange(next); }}
                placeholder={`ตัวเลือก ${i + 1}`}
                className="input flex-1 text-sm"
              />
              {/* Image upload button */}
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
                  onClick={() => {
                    onChange(options.filter((_, j) => j !== i));
                    const imgs = [...(optionImages.length >= options.length ? optionImages : Array(options.length).fill(null))];
                    imgs.splice(i, 1);
                    onImagesChange?.(imgs);
                  }}
                  className="shrink-0 text-slate-600 hover:text-red-400 text-sm">×
                </button>
              )}
            </div>
            {/* Image preview */}
            {img && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={`option-${i}`}
                className="mt-2 max-h-32 rounded-lg object-contain border border-slate-700" />
            )}
          </div>
        );
      })}
      <button type="button"
        onClick={() => {
          onChange([...options, '']);
          const imgs = [...(optionImages.length >= options.length ? optionImages : Array(options.length).fill(null)), null];
          onImagesChange?.(imgs);
        }}
        className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
        + เพิ่มตัวเลือก
      </button>
    </div>
  );
}

/* Ordering (drag-to-rank) editor — teacher defines the CORRECT order */
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

/* ── Block editor dispatcher ────────────────────────────────────── */

export function BlockEditor({ block, onChange }: { block: FormBlock; onChange: (b: FormBlock) => void }) {
  switch (block.type) {
    case 'heading':   return <HeadingEditor block={block} onChange={onChange} />;
    case 'paragraph': return <ParagraphEditor block={block} onChange={onChange} />;
    case 'image':     return <ImageEditor block={block} onChange={onChange} />;
    case 'ordering':  return <OrderingEditor block={block as OrderingBlock} onChange={onChange} />;

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
            onChange={opts => onChange({ ...b, options: opts })}
            onImagesChange={imgs => onChange({ ...b, optionImages: imgs })}
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
            onChange={opts => onChange({ ...b, options: opts })}
            onImagesChange={imgs => onChange({ ...b, optionImages: imgs })}
          />
          <p className="mt-2 text-xs text-slate-500">เลือกได้หลายข้อ</p>
        </div>
      );
    }
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
