'use client';

import type {
  FormBlock, BlockType,
  HeadingBlock, ParagraphBlock, ImageBlock,
  ShortAnswerBlock, LongAnswerBlock,
  MultipleChoiceBlock, CheckboxBlock,
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
    case 'multiple-choice': return { id: uid(), type, question: '', options: ['', ''], required: false };
    case 'checkbox':        return { id: uid(), type, question: '', options: ['', ''], required: false };
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
  { type: 'heading',         label: 'หัวข้อ',              icon: 'H' },
  { type: 'paragraph',       label: 'ข้อความ',             icon: '¶' },
  { type: 'image',           label: 'รูปภาพ',              icon: '🖼' },
  { type: 'short-answer',    label: 'ตอบสั้น',             icon: '—' },
  { type: 'long-answer',     label: 'ตอบยาว',              icon: '≡' },
  { type: 'multiple-choice', label: 'ตัวเลือก',            icon: '◉' },
  { type: 'checkbox',        label: 'ช่องกาเครื่องหมาย',  icon: '☑' },
];

// ── Sub-editors ───────────────────────────────────────────────────────────────

function HeadingEditor({ block, onChange }: { block: HeadingBlock; onChange: (b: FormBlock) => void }) {
  return (
    <input
      value={block.text}
      onChange={(e) => onChange({ ...block, text: e.target.value })}
      placeholder="หัวข้อ..."
      className="w-full bg-transparent text-lg font-semibold text-slate-100 placeholder:text-slate-600 focus:outline-none"
    />
  );
}

function ParagraphEditor({ block, onChange }: { block: ParagraphBlock; onChange: (b: FormBlock) => void }) {
  return (
    <textarea
      value={block.text}
      onChange={(e) => onChange({ ...block, text: e.target.value })}
      placeholder="เนื้อหา / คำอธิบาย..."
      rows={3}
      className="w-full resize-none bg-transparent text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none"
    />
  );
}

function ImageEditor({ block, onChange }: { block: ImageBlock; onChange: (b: FormBlock) => void }) {
  return (
    <div className="space-y-2">
      <input
        value={block.url}
        onChange={(e) => onChange({ ...block, url: e.target.value })}
        placeholder="URL รูปภาพ (https://...)"
        className="input text-sm"
      />
      {block.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.url} alt="preview" className="max-h-48 rounded-lg object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      )}
      <input
        value={block.caption ?? ''}
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
        placeholder="คำบรรยายภาพ (ไม่บังคับ)"
        className="input text-xs"
      />
    </div>
  );
}

function QuestionHeader({
  question, required, onQuestion, onRequired,
}: {
  question: string; required?: boolean;
  onQuestion: (v: string) => void; onRequired: (v: boolean) => void;
}) {
  return (
    <div className="mb-3 flex items-start gap-2">
      <input
        value={question}
        onChange={(e) => onQuestion(e.target.value)}
        placeholder="คำถาม..."
        className="input flex-1 text-sm"
      />
      <label className="flex shrink-0 items-center gap-1 pt-2 text-xs text-slate-400">
        <input type="checkbox" checked={!!required} onChange={(e) => onRequired(e.target.checked)} className="accent-blue-500" />
        จำเป็น
      </label>
    </div>
  );
}

function OptionsEditor({ options, onChange }: { options: string[]; onChange: (opts: string[]) => void }) {
  return (
    <div className="space-y-2">
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-slate-500">•</span>
          <input
            value={opt}
            onChange={(e) => { const next = [...options]; next[i] = e.target.value; onChange(next); }}
            placeholder={`ตัวเลือก ${i + 1}`}
            className="input flex-1 text-sm"
          />
          {options.length > 2 && (
            <button type="button" onClick={() => onChange(options.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-400">×</button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...options, ''])} className="text-xs text-blue-400 hover:text-blue-300">
        + เพิ่มตัวเลือก
      </button>
    </div>
  );
}

export function BlockEditor({ block, onChange }: { block: FormBlock; onChange: (b: FormBlock) => void }) {
  switch (block.type) {
    case 'heading':   return <HeadingEditor block={block} onChange={onChange} />;
    case 'paragraph': return <ParagraphEditor block={block} onChange={onChange} />;
    case 'image':     return <ImageEditor block={block} onChange={onChange} />;
    case 'short-answer':
      return (
        <div>
          <QuestionHeader question={(block as ShortAnswerBlock).question} required={block.required}
            onQuestion={(v) => onChange({ ...block, question: v } as ShortAnswerBlock)}
            onRequired={(v) => onChange({ ...block, required: v } as ShortAnswerBlock)} />
          <div className="rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-500">คำตอบสั้น (1 บรรทัด)</div>
        </div>
      );
    case 'long-answer':
      return (
        <div>
          <QuestionHeader question={(block as LongAnswerBlock).question} required={block.required}
            onQuestion={(v) => onChange({ ...block, question: v } as LongAnswerBlock)}
            onRequired={(v) => onChange({ ...block, required: v } as LongAnswerBlock)} />
          <div className="rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-500">คำตอบยาว (หลายบรรทัด)</div>
        </div>
      );
    case 'multiple-choice': {
      const b = block as MultipleChoiceBlock;
      return (
        <div>
          <QuestionHeader question={b.question} required={b.required}
            onQuestion={(v) => onChange({ ...b, question: v })}
            onRequired={(v) => onChange({ ...b, required: v })} />
          <OptionsEditor options={b.options} onChange={(opts) => onChange({ ...b, options: opts })} />
          <p className="mt-2 text-xs text-slate-500">เลือกได้ 1 ข้อ</p>
        </div>
      );
    }
    case 'checkbox': {
      const b = block as CheckboxBlock;
      return (
        <div>
          <QuestionHeader question={b.question} required={b.required}
            onQuestion={(v) => onChange({ ...b, question: v })}
            onRequired={(v) => onChange({ ...b, required: v })} />
          <OptionsEditor options={b.options} onChange={(opts) => onChange({ ...b, options: opts })} />
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
  const typeLabel = BLOCK_LABELS.find((l) => l.type === block.type);
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
