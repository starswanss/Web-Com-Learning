'use client';

import { useEffect, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { driveThumb } from '@/lib/img';

interface Submission {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  classId: string;
  content?: string;
  driveWebViewLink?: string;
  answers?: Record<string, string | string[]>;
  score?: number;
  feedback?: string;
  questionComments?: Record<string, string>;
  questionScores?: Record<string, number>;
  attitudeScore?: number;
  plagiarismSuspicion?: number;
  tabSwitchCount?: number;
  burstInsertCount?: number;
  status: string;
  submittedAt?: { _seconds: number };
  reviewedAt?: { _seconds: number };
}

interface AssignmentBlock {
  id: string;
  type: string;
  text?: string;
  question?: string;
  options?: string[];
  url?: string;
  caption?: string;
  height?: number;
  title?: string;
  body?: string;
  icon?: string;
  color?: string;
  scoreMax?: number;
  scoreKind?: 'K' | 'P';
}

interface Assignment {
  id: string;
  title: string;
  description: string;
  contentType?: string;
  dueDate?: { _seconds: number };
  blocks?: AssignmentBlock[];
  isGroupWork?: boolean;
  attitudeMax?: number;
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400 border-emerald-700 bg-emerald-950/40';
  if (score >= 60) return 'text-amber-400 border-amber-700 bg-amber-950/40';
  if (score >= 40) return 'text-orange-400 border-orange-700 bg-orange-950/40';
  return 'text-red-400 border-red-700 bg-red-950/40';
}

function statusBadge(status: string) {
  if (status === 'reviewed') return 'bg-emerald-950/60 text-emerald-400 border-emerald-800';
  if (status === 'graded')   return 'bg-blue-950/60 text-blue-400 border-blue-800';
  if (status === 'submitted') return 'bg-amber-950/60 text-amber-400 border-amber-800';
  return 'bg-slate-800 text-slate-500 border-slate-700';
}

function statusLabel(status: string) {
  if (status === 'reviewed')  return 'ตรวจแล้ว';
  if (status === 'graded')    return 'รอบันทึกคะแนน';
  if (status === 'submitted') return 'รอตรวจ';
  return 'ยังไม่ส่ง';
}

function exportCSV(assignment: Assignment | null, submissions: Submission[]) {
  const header = ['ชื่อนักเรียน', 'ห้อง', 'คะแนน', 'สถานะ', 'Feedback', 'วันที่ส่ง'];
  const rows = submissions.map((s) => [
    s.studentName,
    s.classId,
    s.score !== undefined ? String(s.score) : '',
    statusLabel(s.status),
    (s.feedback ?? '').replace(/,/g, '，'),
    s.submittedAt ? new Date(s.submittedAt._seconds * 1000).toLocaleDateString('th-TH') : '',
  ]);
  const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `คะแนน_${assignment?.title ?? 'assignment'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

// The print window opens on about:blank, so relative URLs (e.g. /api/drive-image)
// won't load — make them absolute against the app origin.
function absUrl(u: string): string {
  if (!u) return u;
  if (/^(https?:|data:)/i.test(u)) return u;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return origin + (u.startsWith('/') ? u : '/' + u);
}

// Fetch an (authenticated, same-origin) URL and return it as a data: URL so it
// renders inside the about:blank print window (which won't send our cookie).
async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

/** Render one student's answer for a question block as print-friendly HTML. */
function answerHtml(block: AssignmentBlock, answer: string | string[] | undefined, imgMap: Map<string, string>): string {
  if (answer === undefined || (Array.isArray(answer) && answer.length === 0)) {
    return '<span class="muted">— ไม่ได้ตอบ —</span>';
  }
  const q = block.question ?? '';
  switch (block.type) {
    case 'image-upload':
      return typeof answer === 'string' && answer
        ? `<img src="${esc(imgMap.get(answer) ?? absUrl(driveThumb(answer, 800)))}" alt="คำตอบ" />`
        : '<span class="muted">ไม่ได้อัปโหลดรูป</span>';
    case 'true-false': {
      const items = (block as AssignmentBlock & { items?: Array<{ statement: string }> }).items ?? [];
      const ans = Array.isArray(answer) ? answer : [];
      return '<ul>' + items.map((it, j) =>
        `<li>${esc(it.statement)} — <b>${ans[j] === 'true' ? 'ถูก' : ans[j] === 'false' ? 'ผิด' : '—'}</b></li>`).join('') + '</ul>';
    }
    case 'matching': {
      const left = (block as AssignmentBlock & { leftItems?: string[] }).leftItems ?? [];
      const ans = Array.isArray(answer) ? answer : [];
      return '<ul>' + left.map((l, j) => `<li>${esc(l)} → <b>${esc(ans[j] ?? '—')}</b></li>`).join('') + '</ul>';
    }
    case 'fill-blank': {
      const parts = q.split('___');
      const ans = Array.isArray(answer) ? answer : [];
      return parts.map((p, j) => esc(p) + (j < parts.length - 1 ? `<u>&nbsp;${esc(ans[j] ?? '—')}&nbsp;</u>` : '')).join('');
    }
    case 'ordering':
      return '<ol>' + (Array.isArray(answer) ? answer : []).map((a) => `<li>${esc(a)}</li>`).join('') + '</ol>';
    case 'link':
      return typeof answer === 'string' ? `<a href="${esc(answer)}">${esc(answer)}</a>` : '';
    default:
      return Array.isArray(answer) ? answer.map(esc).join(', ') : `<span class="pre">${esc(answer)}</span>`;
  }
}

/**
 * Build a printable HTML report and open it in a new window for "Save as PDF".
 * Using the browser's print renders Thai perfectly with no font embedding.
 * Each student: name · รหัส (email local-part) · email, then every question with
 * the student's answer and the teacher's per-question comment beside it.
 */
async function exportPDF(assignment: Assignment | null, submissions: Submission[], classLabel: string, sig: { img: string | null; name: string }) {
  if (!assignment) return;
  // Open the window synchronously (user gesture) so the popup isn't blocked;
  // we fill it after fetching images.
  const win = window.open('', '_blank');
  if (!win) { alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาต popup แล้วลองใหม่'); return; }
  win.document.write('<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:28px;color:#334">⏳ กำลังเตรียมรายงานและโหลดรูปภาพ…</body>');

  const imgUrls = new Set<string>();
  // Images embedded in the worksheet itself (image blocks / question diagrams)
  for (const b of assignment.blocks ?? []) {
    if (b.type === 'image' && typeof b.url === 'string' && b.url) imgUrls.add(b.url);
  }
  // Images uploaded by students as answers
  const qBlocksForImg = (assignment.blocks ?? []).filter((b) => b.type === 'image-upload');
  for (const s of submissions) {
    for (const b of qBlocksForImg) {
      const a = s.answers?.[b.id];
      if (typeof a === 'string' && a) imgUrls.add(a);
    }
  }
  // Embed student images as data URLs (the print window can't send our cookie).
  const imgMap = new Map<string, string>();
  await Promise.all([...imgUrls].map(async (a) => {
    const d = await urlToDataUrl(driveThumb(a, 800));
    if (d) imgMap.set(a, d);
  }));

  const sigBlock = `<div class="sign">
      ${sig.img ? `<img class="sigimg" src="${esc(sig.img)}" alt="ลายเซ็น" />` : '<div class="sigspace"></div>'}
      <div class="sigln">ลงชื่อ ....................................................... ผู้ตรวจ</div>
      <div class="signm">( ${esc(sig.name || '.........................................')} )</div>
      <div class="sigrole">ครูผู้สอน</div>
    </div>`;
  const qBlocks = (assignment.blocks ?? []).filter((b) =>
    ['short-answer', 'long-answer', 'multiple-choice', 'checkbox', 'ordering', 'image-upload', 'true-false', 'matching', 'fill-blank', 'link'].includes(b.type)
  );
  // Per-question KPA scoring config for the horizontal score table
  const numMap = new Map(qBlocks.map((b, i) => [b.id, i + 1]));
  const scoredBlocks = qBlocks.filter((b) => typeof b.scoreMax === 'number' && (b.scoreMax ?? 0) > 0);
  const aMax = assignment.attitudeMax;
  const hasA = typeof aMax === 'number' && aMax > 0;

  const students = submissions.map((s) => {
    const code = (s.studentEmail ?? '').split('@')[0];
    // Horizontal score table: one column per scored question + A + total
    let kpaTable = '';
    if (scoredBlocks.length > 0 || hasA) {
      const qs = s.questionScores ?? {};
      const av = s.attitudeScore;
      const total = scoredBlocks.reduce((t, b) => t + (Number(qs[b.id]) || 0), 0) + (Number(av) || 0);
      const maxTotal = scoredBlocks.reduce((t, b) => t + (b.scoreMax || 0), 0) + (hasA ? (aMax ?? 0) : 0);
      const head = scoredBlocks.map((b) => `<th>ข้อ ${numMap.get(b.id)}<br><span class="sm">${b.scoreKind ?? ''} /${b.scoreMax}</span></th>`).join('')
        + (hasA ? `<th>A<br><span class="sm">/${aMax}</span></th>` : '') + `<th>รวม<br><span class="sm">/${maxTotal}</span></th>`;
      const cells = scoredBlocks.map((b) => `<td>${qs[b.id] != null ? esc(qs[b.id]) : '-'}</td>`).join('')
        + (hasA ? `<td>${av != null ? esc(av) : '-'}</td>` : '') + `<td><b>${total}</b></td>`;
      kpaTable = `<table class="kpa"><thead><tr><th class="lbl">ข้อ</th>${head}</tr></thead><tbody><tr><td class="lbl">คะแนน</td>${cells}</tr></tbody></table>`;
    }
    // Render the whole worksheet in order: content blocks (incl. images that are
    // part of a question) full-width, question blocks with answer + teacher comment.
    const QT = ['short-answer', 'long-answer', 'multiple-choice', 'checkbox', 'ordering', 'image-upload', 'true-false', 'matching', 'fill-blank', 'link'];
    const bodyHtml = (assignment.blocks ?? []).map((b) => {
      switch (b.type) {
        case 'heading':   return `<h3 class="bk-h">${esc(b.text)}</h3>`;
        case 'paragraph': return `<p class="bk-p">${esc(b.text)}</p>`;
        case 'image':     return b.url ? `<div class="bk-img"><img src="${esc(imgMap.get(b.url) ?? absUrl(driveThumb(b.url, 1000)))}" alt="" />${b.caption ? `<div class="cap">${esc(b.caption)}</div>` : ''}</div>` : '';
        case 'infographic': return `<div class="bk-info"><b>${esc(b.icon ?? '')} ${esc(b.title ?? '')}</b><div>${esc(b.body ?? '')}</div></div>`;
        case 'pdf':       return `<p class="muted">[ไฟล์ PDF${b.caption ? `: ${esc(b.caption)}` : ''}]</p>`;
        default: {
          if (!QT.includes(b.type)) return '';
          const comment = s.questionComments?.[b.id] ?? '';
          return `<div class="qrow">
            <div class="qmain">
              <div class="qtext">${numMap.get(b.id)}. ${esc(b.question ?? '')}</div>
              <div class="ans">${answerHtml(b, s.answers?.[b.id], imgMap)}</div>
            </div>
            <div class="qcm">${comment ? `<span class="cmt">💬 ${esc(comment)}</span>` : '<span class="muted">—</span>'}</div>
          </div>`;
        }
      }
    }).join('');
    const scoreLine = typeof s.score === 'number' ? ` · คะแนน: <b>${s.score}/100</b>` : '';
    return `<section class="stu">
      <div class="hd">
        <div class="nm">${esc(s.studentName || '—')}</div>
        <div class="meta">รหัสประจำตัว: <b>${esc(code || '—')}</b> · อีเมล: ${esc(s.studentEmail || '—')} · ห้อง: ${esc(s.classId)}${scoreLine}</div>
      </div>
      ${kpaTable}
      ${(assignment.blocks ?? []).length ? bodyHtml : `<p class="muted">${s.content ? esc(s.content) : 'ไม่มีคำตอบแบบข้อ'}</p>`}
      ${s.feedback ? `<p class="fb"><b>Feedback รวม:</b> ${esc(s.feedback)}</p>` : ''}
      ${sigBlock}
    </section>`;
  }).join('');

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8" />
    <title>${esc(assignment.title)} — ${esc(classLabel)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>
      *{box-sizing:border-box} body{font-family:'Sarabun','TH Sarabun New',system-ui,'Segoe UI',sans-serif;color:#111;margin:14px;font-size:13px;line-height:1.4}
      h1{font-size:16px;margin:0 0 2px} .sub{color:#555;margin:0 0 8px;font-size:11px}
      /* each student starts on a new page but flows across pages if long (no forced empty page) */
      .stu{border:1px solid #ddd;border-radius:6px;padding:10px;margin-bottom:10px;display:flex;flex-direction:column;min-height:0}
      .stu + .stu{page-break-before:always}
      .hd{border-bottom:2px solid #333;padding-bottom:4px;margin-bottom:6px}
      .nm{font-size:14px;font-weight:700} .meta{font-size:11px;color:#444;margin-top:1px}
      table{width:100%;border-collapse:collapse;margin-top:3px} th,td{border:1px solid #ccc;padding:4px 6px;vertical-align:top;text-align:left}
      th{background:#f3f4f6;font-size:11px}
      /* worksheet content blocks */
      .bk-h{font-size:14px;font-weight:700;margin:8px 0 2px} .bk-p{margin:3px 0;white-space:pre-wrap}
      .bk-img{margin:6px 0;text-align:center} .bk-img img{max-width:100%;max-height:260px;border:1px solid #ccc;border-radius:5px}
      .bk-img .cap{font-size:11px;color:#666;margin-top:1px} .bk-info{border:1px solid #c7d2fe;background:#eef2ff;border-radius:5px;padding:6px;margin:5px 0}
      /* question row: answer left, teacher comment right */
      .qrow{display:flex;gap:8px;border:1px solid #ccc;border-radius:5px;padding:6px 8px;margin:5px 0;page-break-inside:avoid}
      .qmain{flex:1 1 66%;min-width:0} .qcm{flex:0 0 32%;border-left:1px solid #ddd;padding-left:8px}
      .qtext{font-weight:600;margin-bottom:2px} .ans{color:#1d4ed8;white-space:pre-wrap}
      .ans img{max-width:100%;max-height:170px;border:1px solid #ccc;border-radius:5px} .pre{white-space:pre-wrap}
      .cmt{color:#b45309} .muted{color:#999} .fb{margin-top:5px;font-size:12px}
      table.kpa{width:auto;margin:4px 0 8px} table.kpa th,table.kpa td{text-align:center;padding:3px 7px;min-width:34px}
      table.kpa th{background:#eef2ff} table.kpa .lbl{background:#f3f4f6;font-weight:700} table.kpa .sm{font-size:9px;color:#666;font-weight:400}
      ul,ol{margin:1px 0;padding-left:16px} u{text-decoration:underline;color:#1d4ed8}
      /* signature pinned to the bottom-right of the student's page */
      .sign{margin-top:auto;align-self:flex-end;padding-top:14px;max-width:300px;text-align:center;page-break-inside:avoid}
      .sign .sigimg{max-height:52px;max-width:200px;display:block;margin:0 auto} .sign .sigspace{height:30px}
      .sigln{margin-bottom:1px;font-size:12px} .sigrole{color:#444}
      /* margin:0 on the page removes the browser's own header/footer (date, title, url, page no.) */
      @media print{@page{margin:0} body{margin:0;padding:11mm} .stu{border:none;border-radius:0;padding:0;min-height:calc(100vh - 34mm)}}
    </style></head><body>
    <h1>${esc(assignment.title)}</h1>
    <p class="sub">${esc(classLabel)} · ${submissions.length} คน</p>
    ${students || '<p class="muted">ไม่มีงานที่จะออก</p>'}
    <script>window.onload=function(){var f=(document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve();f.then(function(){setTimeout(function(){window.print();},400);});};<\/script>
  </body></html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

export default function SubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoSubId = searchParams.get('sub');

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [classStats, setClassStats] = useState<{ classId: string; submitted: number; total: number }[]>([]);
  const [fetching, setFetching] = useState(true);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [qComments, setQComments] = useState<Record<string, string>>({});
  const [qScores, setQScores] = useState<Record<string, string>>({});
  const [aScore, setAScore] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [quickGrading, setQuickGrading] = useState(false);
  const [detailedGrading, setDetailedGrading] = useState(false);
  const [batchGrading, setBatchGrading] = useState(false);
  const [autoGrading, setAutoGrading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [viewAll, setViewAll] = useState(false);

  // PDF export dialog (signature shows only in the exported report)
  const [pdfModal, setPdfModal] = useState(false);
  const [sigImg, setSigImg] = useState<string | null>(null);
  const [signer, setSigner] = useState('');

  useEffect(() => {
    try {
      setSigImg(localStorage.getItem('lms_report_sig'));
      setSigner(localStorage.getItem('lms_report_signer') ?? profile?.displayName ?? '');
    } catch { /* ignore */ }
  }, [profile]);

  function handleSigUpload(file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setSigImg(url);
      try { localStorage.setItem('lms_report_sig', url); } catch { /* quota */ }
    };
    reader.readAsDataURL(file);
  }
  function clearSig() {
    setSigImg(null);
    try { localStorage.removeItem('lms_report_sig'); } catch { /* ignore */ }
  }
  function runExportPDF() {
    try { localStorage.setItem('lms_report_signer', signer); } catch { /* ignore */ }
    void exportPDF(assignment, visible, classFilter ? `ห้อง ${classFilter}` : 'ทุกห้อง', { img: sigImg, name: signer });
    setPdfModal(false);
  }

  // Review-all mode: centralised score/feedback drafts so "save all" can grade
  // everyone at once.
  const [gradeDraft, setGradeDraft] = useState<Record<string, { score: string; feedback: string }>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [saveAllMsg, setSaveAllMsg] = useState<string | null>(null);
  const [bulkScore, setBulkScore] = useState('');
  const [bulkTarget, setBulkTarget] = useState<'submitted' | 'not-submitted' | 'all'>('submitted');
  const [bulkApplying, setBulkApplying] = useState(false);

  // Give one score to a whole group at once (server-side, so students who
  // haven't submitted get a submission created for them). Respects the class
  // filter as the scope.
  async function applyBulkScore() {
    const parsed = Number(bulkScore);
    if (bulkScore === '' || isNaN(parsed) || parsed < 0 || parsed > 100) {
      setSaveAllMsg('กรอกคะแนน 0–100 ก่อนใส่คะแนน');
      return;
    }
    const targetLabel = bulkTarget === 'submitted' ? 'คนที่ส่งแล้ว'
      : bulkTarget === 'not-submitted' ? 'คนที่ยังไม่ส่ง' : 'ทุกคน';
    const scopeLabel = classFilter ? `ห้อง ${classFilter}` : 'ทุกห้อง';
    if (!confirm(`ใส่คะแนน ${parsed} ให้ "${targetLabel}" (${scopeLabel})?\nจะเขียนทับคะแนนเดิมของกลุ่มนี้`)) return;

    setBulkApplying(true); setSaveAllMsg(null);
    try {
      const res = await fetch(`/api/teacher/bulk-score/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: parsed, target: bulkTarget, classId: classFilter || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '');
      // Reload so new/updated submissions show.
      const reload = await fetch(`/api/teacher/submissions/${id}`).then((r) => r.json());
      const subs: Submission[] = Array.isArray(reload.submissions) ? reload.submissions : [];
      setSubmissions(subs);
      setClassStats(Array.isArray(reload.classStats) ? reload.classStats : []);
      setGradeDraft({});
      setSaveAllMsg(`ใส่คะแนน ${parsed} สำเร็จ — อัปเดต ${data.graded ?? 0} คน, เพิ่มใหม่ ${data.created ?? 0} คน`);
    } catch (e) {
      setSaveAllMsg(e instanceof Error && e.message ? e.message : 'ใส่คะแนนไม่สำเร็จ');
    } finally {
      setBulkApplying(false);
    }
  }

  function updateSubmission(updated: Submission) {
    setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    if (selected?.id === updated.id) setSelected(updated);
  }

  // Seed drafts for any submission not yet edited (without clobbering edits).
  useEffect(() => {
    if (!viewAll) return;
    setGradeDraft((prev) => {
      const next = { ...prev };
      for (const s of submissions) {
        if (!(s.id in next)) {
          next[s.id] = { score: s.score != null ? String(s.score) : '', feedback: s.feedback ?? '' };
        }
      }
      return next;
    });
  }, [viewAll, submissions]);

  function setDraft(id: string, patch: Partial<{ score: string; feedback: string }>) {
    setGradeDraft((d) => {
      const cur = d[id] ?? { score: '', feedback: '' };
      return { ...d, [id]: { ...cur, ...patch } };
    });
  }

  // Grade one submission from its draft. Returns the updated Submission on
  // success, or null on validation/network failure.
  async function gradeFromDraft(sub: Submission): Promise<Submission | null> {
    const d = gradeDraft[sub.id] ?? { score: '', feedback: '' };
    const parsed = Number(d.score);
    if (d.score === '' || isNaN(parsed) || parsed < 0 || parsed > 100) {
      setRowErr((e) => ({ ...e, [sub.id]: 'คะแนน 0–100' }));
      return null;
    }
    setRowErr((e) => { const n = { ...e }; delete n[sub.id]; return n; });
    try {
      const res = await fetch(`/api/teacher/grade/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: parsed, feedback: d.feedback }),
      });
      if (!res.ok) throw new Error();
      return { ...sub, score: parsed, feedback: d.feedback, status: 'reviewed' };
    } catch {
      setRowErr((e) => ({ ...e, [sub.id]: 'บันทึกไม่สำเร็จ' }));
      return null;
    }
  }

  async function saveOne(sub: Submission) {
    setSavingIds((s) => new Set(s).add(sub.id));
    const updated = await gradeFromDraft(sub);
    if (updated) {
      updateSubmission(updated);
      setSavedIds((s) => new Set(s).add(sub.id));
      setTimeout(() => setSavedIds((s) => { const n = new Set(s); n.delete(sub.id); return n; }), 2000);
    }
    setSavingIds((s) => { const n = new Set(s); n.delete(sub.id); return n; });
  }

  async function saveAll(targets: Submission[]) {
    // Only rows with a filled-in score are graded; blanks are skipped.
    const toGrade = targets.filter((s) => (gradeDraft[s.id]?.score ?? '') !== '');
    if (toGrade.length === 0) { setSaveAllMsg('ยังไม่มีคะแนนที่จะบันทึก'); return; }
    setSavingAll(true); setSaveAllMsg(null);
    setSavingIds(new Set(toGrade.map((s) => s.id)));

    const results = await Promise.all(toGrade.map((s) => gradeFromDraft(s)));
    const updates = results.filter((r): r is Submission => r !== null);
    if (updates.length > 0) {
      const map = new Map(updates.map((u) => [u.id, u]));
      setSubmissions((prev) => prev.map((s) => map.get(s.id) ?? s));
    }
    const failed = toGrade.length - updates.length;
    setSaveAllMsg(`บันทึกสำเร็จ ${updates.length} คน${failed > 0 ? ` · ไม่สำเร็จ ${failed}` : ''}`);
    setSavingIds(new Set());
    setSavingAll(false);
  }

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher' || !id) return;
    fetch(`/api/teacher/submissions/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setAssignment(data.assignment ?? null);
        const subs: Submission[] = Array.isArray(data.submissions) ? data.submissions : [];
        setSubmissions(subs);
        setClassStats(Array.isArray(data.classStats) ? data.classStats : []);
        // Auto-open submission from ?sub= query param (e.g. coming from Gradebook)
        if (autoSubId) {
          const target = subs.find((s) => s.id === autoSubId);
          if (target) {
            setSelected(target);
            setScore(target.score !== undefined ? String(target.score) : '');
            setFeedback(target.feedback ?? '');
            setQComments(target.questionComments ?? {});
            seedKpa(target);
          }
        }
      })
      .finally(() => setFetching(false));
  }, [profile, id]);

  function seedKpa(sub: Submission) {
    setQScores(Object.fromEntries(Object.entries(sub.questionScores ?? {}).map(([k, v]) => [k, String(v)])));
    setAScore(sub.attitudeScore != null ? String(sub.attitudeScore) : '');
  }

  function openSubmission(sub: Submission) {
    setSelected(sub);
    setScore(sub.score !== undefined ? String(sub.score) : '');
    setFeedback(sub.feedback ?? '');
    setQComments(sub.questionComments ?? {});
    seedKpa(sub);
    setSaveError(null);
    setBatchResult(null);
  }

  // Build the per-question KPA score map (blockId → number) from the string drafts.
  function buildQScores(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(qScores)) {
      if (v !== '' && !isNaN(Number(v))) out[k] = Number(v);
    }
    return out;
  }

  async function handleSave() {
    if (!selected) return;
    const parsed = Number(score);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) { setSaveError('คะแนนต้องอยู่ระหว่าง 0–100'); return; }
    setSaving(true); setSaveError(null);
    try {
      const qs = buildQScores();
      const att = aScore !== '' && !isNaN(Number(aScore)) ? Number(aScore) : undefined;
      const res = await fetch(`/api/teacher/grade/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: parsed, feedback, questionComments: qComments, questionScores: qs, attitudeScore: att }),
      });
      if (!res.ok) throw new Error();
      const updated: Submission = { ...selected, score: parsed, feedback, questionComments: qComments, questionScores: qs, attitudeScore: att, status: 'reviewed' };
      setSubmissions((prev) => prev.map((s) => (s.id === selected.id ? updated : s)));
      setSelected(updated);
    } catch { setSaveError('บันทึกไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setSaving(false); }
  }

  async function handleQuickGrade() {
    if (!selected) return;
    setQuickGrading(true); setSaveError(null);
    try {
      const res = await fetch(`/api/teacher/quick-grade/${selected.id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400) { setSaveError('ไม่มีเนื้อหาที่จะตรวจ (งานนี้ไม่มีคำตอบ)'); return; }
        if (res.status === 429) { setSaveError(`โควต้า AI เต็มชั่วคราว: ${data.detail ?? 'กรุณาลองใหม่ใน 1 นาที'}`); return; }
        setSaveError(`ตรวจ AI ไม่สำเร็จ: ${data.detail ?? data.error ?? 'กรุณาลองใหม่'}`);
        return;
      }
      const updated: Submission = { ...selected, score: data.score, feedback: data.feedback, plagiarismSuspicion: data.plagiarismSuspicion, status: 'graded' };
      setSubmissions((prev) => prev.map((s) => (s.id === selected.id ? updated : s)));
      setSelected(updated);
      setScore(String(data.score));
      setFeedback(data.feedback);
    } catch { setSaveError('ตรวจ AI ไม่สำเร็จ: ไม่สามารถเชื่อมต่อได้'); }
    finally { setQuickGrading(false); }
  }

  // AI ตรวจรายข้อ: เติมคอมเมนต์รายข้อ + คะแนน KPA ลงในฟอร์ม (ครูปรับแก้แล้วกด "บันทึกคะแนน")
  async function handleDetailedGrade() {
    if (!selected) return;
    setDetailedGrading(true); setSaveError(null);
    try {
      const res = await fetch(`/api/teacher/ai-grade-detailed/${selected.id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400) { setSaveError('ไม่มีข้อคำถามที่จะตรวจ'); return; }
        if (res.status === 429) { setSaveError(`โควต้า AI เต็มชั่วคราว: ${data.detail ?? 'กรุณาลองใหม่ใน 1 นาที'}`); return; }
        setSaveError(`ตรวจละเอียด AI ไม่สำเร็จ: ${data.detail ?? data.error ?? 'กรุณาลองใหม่'}`);
        return;
      }
      // Fill the grade form; teacher reviews then "บันทึกคะแนน".
      const qc = (data.questionComments ?? {}) as Record<string, string>;
      const qsNum = (data.questionScores ?? {}) as Record<string, number>;
      setQComments((prev) => ({ ...prev, ...qc }));
      setQScores((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(qsNum).map(([k, v]) => [k, String(v)])) }));
      const updated: Submission = { ...selected, questionComments: { ...(selected.questionComments ?? {}), ...qc }, questionScores: { ...(selected.questionScores ?? {}), ...qsNum } };
      setSubmissions((prev) => prev.map((s) => (s.id === selected.id ? updated : s)));
      setSelected(updated);
      setSaveError(null);
      setBatchResult('🤖 AI เติมคอมเมนต์รายข้อ + คะแนน KPA แล้ว — ตรวจ/แก้ไข แล้วกด “บันทึกคะแนน”');
    } catch { setSaveError('ตรวจละเอียด AI ไม่สำเร็จ: ไม่สามารถเชื่อมต่อได้'); }
    finally { setDetailedGrading(false); }
  }

  async function handleApproveAll() {
    setApproving(true); setBatchResult(null);
    try {
      const res = await fetch(`/api/teacher/approve-all/${id}`, { method: 'POST' });
      const data = await res.json();
      setBatchResult(`บันทึกคะแนน AI สำเร็จ ${data.approved} คน`);
      setSubmissions((prev) => prev.map((s) => s.status === 'graded' ? { ...s, status: 'reviewed' } : s));
      if (selected?.status === 'graded') setSelected((prev) => prev ? { ...prev, status: 'reviewed' } : prev);
    } catch { setBatchResult('ไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setApproving(false); }
  }

  async function handleDeleteSubmission(subId: string) {
    if (!confirm('ลบงานของนักเรียนคนนี้? นักเรียนจะสามารถส่งงานใหม่ได้')) return;
    setDeleting(subId);
    try {
      await fetch(`/api/teacher/submission/${subId}`, { method: 'DELETE' });
      setSubmissions((prev) => prev.filter((s) => s.id !== subId));
      if (selected?.id === subId) setSelected(null);
    } finally {
      setDeleting(null);
    }
  }

  async function handleAutoGrade() {
    setAutoGrading(true); setBatchResult(null);
    try {
      const res = await fetch(`/api/teacher/auto-grade/${id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setBatchResult(`ตรวจเฉลยไม่สำเร็จ: ${data.error ?? 'กรุณาลองใหม่'}`); return; }
      setBatchResult(`ตรวจเฉลยสำเร็จ ${data.graded} คน${data.errors ? ` · ผิดพลาด ${data.errors}` : ''}`);
      const reload = await fetch(`/api/teacher/submissions/${id}`).then((r) => r.json());
      setSubmissions(Array.isArray(reload.submissions) ? reload.submissions : []);
      if (selected) {
        const refreshed = reload.submissions?.find((s: Submission) => s.id === selected.id);
        if (refreshed) { setSelected(refreshed); setScore(String(refreshed.score ?? '')); setFeedback(refreshed.feedback ?? ''); setQComments(refreshed.questionComments ?? {}); }
      }
    } catch { setBatchResult('ตรวจเฉลยไม่สำเร็จ: ไม่สามารถเชื่อมต่อได้'); }
    finally { setAutoGrading(false); }
  }

  async function handleBatchGrade() {
    setBatchGrading(true); setBatchResult(null);
    try {
      // Grade in small bounded rounds — one request per round — so no single
      // call exceeds the serverless function timeout (which returned 504).
      // A round that fails doesn't discard the work already saved: we report
      // progress and let the teacher continue.
      let totalGraded = 0;
      let totalErrors = 0;
      let skipped = 0;
      let stoppedEarly = false;
      let aiError: string | null = null;

      for (let round = 0; round < 100; round++) {
        let data: { graded?: number; errors?: number; remaining?: number; skipped?: number; errorDetail?: string | null } | null = null;

        // Try the round; on failure retry once with a smaller slice.
        for (const limit of [5, 2]) {
          try {
            const res = await fetch(`/api/teacher/batch-grade/${id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ limit }),
            });
            if (!res.ok) throw new Error(String(res.status));
            data = await res.json();
            break;
          } catch {
            data = null; // try the smaller slice, then give up on this round
          }
        }

        if (!data) { stoppedEarly = true; break; }

        totalGraded += data.graded ?? 0;
        totalErrors += data.errors ?? 0;
        skipped = data.skipped ?? skipped;
        if (data.errorDetail) aiError = data.errorDetail;
        setBatchResult(`กำลังตรวจ… ${totalGraded} คน${data.remaining ? ` · เหลือ ${data.remaining}` : ''}`);

        // Done, or this round made no progress (avoid looping forever).
        if (!data.remaining || (data.graded ?? 0) === 0) break;

        // Small pause so we don't hammer the AI rate limit.
        await new Promise((r) => setTimeout(r, 800));
      }

      setBatchResult(
        totalGraded === 0 && aiError
          ? `ตรวจ AI ไม่สำเร็จ: ${aiError}`
          : stoppedEarly
          ? `ตรวจไปแล้ว ${totalGraded} คน — หยุดกลางคัน กรุณากด "ตรวจ AI" อีกครั้งเพื่อตรวจต่อ`
          : `ตรวจสำเร็จ ${totalGraded} คน, ข้าม ${skipped} คน${totalErrors ? `, ผิดพลาด ${totalErrors} คน` : ''}${aiError ? ` · (${aiError})` : ''}`
      );
      // Reload submissions to reflect new scores
      const reload = await fetch(`/api/teacher/submissions/${id}`).then((r) => r.json());
      setSubmissions(Array.isArray(reload.submissions) ? reload.submissions : []);
      if (selected) {
        const refreshed = reload.submissions?.find((s: Submission) => s.id === selected.id);
        if (refreshed) { setSelected(refreshed); setScore(String(refreshed.score ?? '')); setFeedback(refreshed.feedback ?? ''); setQComments(refreshed.questionComments ?? {}); }
      }
    } catch { setBatchResult('ตรวจ AI ไม่สำเร็จ: ไม่สามารถเชื่อมต่อได้'); }
    finally { setBatchGrading(false); }
  }

  if (loading || !profile) return <Spinner />;

  // Submissions shown, narrowed to the clicked class.
  const visible = classFilter ? submissions.filter((s) => s.classId === classFilter) : submissions;

  const pendingCount  = visible.filter((s) => s.status === 'submitted').length;
  const gradedCount   = visible.filter((s) => s.status === 'graded').length;
  const reviewedCount = visible.filter((s) => s.status === 'reviewed').length;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* PDF export dialog — signature only appears in the exported report */}
      {pdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPdfModal(false)}>
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-100">📄 ออกรายงาน PDF</h2>
            <p className="mt-1 text-xs text-slate-500">
              {classFilter ? `เฉพาะห้อง ${classFilter}` : 'ทุกห้อง'} · {visible.length} คน — จะเปิดหน้าต่างพิมพ์ให้เลือก “บันทึกเป็น PDF”
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">ชื่อผู้ลงนาม (ครูผู้สอน)</label>
                <input
                  value={signer}
                  onChange={(e) => setSigner(e.target.value)}
                  placeholder="ชื่อ-สกุล"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">ลายเซ็น (อัปโหลดรูป — ไม่บังคับ)</label>
                <div className="flex items-center gap-3">
                  {sigImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sigImg} alt="ลายเซ็น" className="h-14 rounded border border-slate-700 bg-white object-contain px-1" />
                  ) : (
                    <span className="text-xs text-slate-600">ยังไม่มีลายเซ็น</span>
                  )}
                  <label className="cursor-pointer rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500">
                    {sigImg ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleSigUpload(f); }} />
                  </label>
                  {sigImg && (
                    <button onClick={clearSig} className="text-xs text-red-400 hover:text-red-300">ลบ</button>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-slate-600">ลายเซ็นจะปรากฏที่มุมซ้ายล่างของแต่ละหน้า เฉพาะในไฟล์ PDF เท่านั้น</p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setPdfModal(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500">ยกเลิก</button>
              <button onClick={runExportPDF} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500">ออก PDF</button>
            </div>
          </div>
        </div>
      )}

      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-4 flex-wrap">
          <Link href="/teacher" className="text-sm text-slate-400 hover:text-slate-200">← ย้อนกลับ</Link>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-100">
              {assignment ? assignment.title : 'กำลังโหลด…'}
            </h1>
            <p className="text-xs text-slate-500">
              ตรวจงาน — {submissions.length} การส่ง
              {pendingCount > 0 && ` · รอตรวจ ${pendingCount}`}
              {gradedCount > 0 && ` · รอบันทึก ${gradedCount}`}
              {reviewedCount > 0 && ` · ตรวจแล้ว ${reviewedCount}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {batchResult && (
              <span className="text-xs text-emerald-400">{batchResult}</span>
            )}
            {assignment?.isGroupWork && (
              <Link
                href={`/teacher/assignments/${id}/groups`}
                className="rounded-lg border border-blue-700 bg-blue-950/40 px-3 py-1.5 text-xs text-blue-300 transition-all hover:border-blue-500"
              >
                👥 จัดกลุ่ม
              </Link>
            )}
            {assignment?.isGroupWork && (
              <Link
                href={`/teacher/assignments/${id}/group-submissions`}
                className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-3 py-1.5 text-xs text-emerald-300 transition-all hover:border-emerald-500"
              >
                📋 งานกลุ่ม
              </Link>
            )}
            {assignment?.contentType === 'quiz' && (
              <button
                onClick={handleAutoGrade}
                disabled={autoGrading || pendingCount === 0}
                className="rounded-lg border border-teal-700 bg-teal-950/40 px-3 py-1.5 text-xs text-teal-300 transition-all hover:border-teal-500 disabled:opacity-40"
              >
                {autoGrading ? 'กำลังตรวจเฉลย…' : `✅ ตรวจเฉลย (${pendingCount})`}
              </button>
            )}
            <button
              onClick={handleApproveAll}
              disabled={approving || submissions.filter((s) => s.status === 'graded').length === 0}
              className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-1.5 text-xs text-emerald-300 transition-all hover:border-emerald-600 disabled:opacity-40"
            >
              {approving ? '…' : `✓ บันทึกคะแนน AI (${submissions.filter((s) => s.status === 'graded').length})`}
            </button>
            <button
              onClick={handleBatchGrade}
              disabled={batchGrading || pendingCount === 0}
              className="rounded-lg border border-purple-700 bg-purple-950/40 px-3 py-1.5 text-xs text-purple-300 transition-all hover:border-purple-500 disabled:opacity-40"
            >
              {batchGrading ? 'กำลังตรวจ…' : `ตรวจ AI (${pendingCount} รอตรวจ)`}
            </button>
            <Link
              href={`/teacher/assignments/${id}/preview`}
              className="rounded-lg border border-cyan-700 bg-cyan-950/40 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-all hover:border-cyan-500"
            >
              👁 มุมมองนักเรียน
            </Link>
            <button
              onClick={() => setViewAll((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                viewAll
                  ? 'border-blue-600 bg-blue-950/50 text-blue-300'
                  : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500'
              }`}
            >
              {viewAll ? '📋 ตรวจทีละคน' : '📑 ดูงานทั้งหมด'}
            </button>
            <button
              onClick={() => setPdfModal(true)}
              disabled={visible.length === 0}
              className="rounded-lg border border-rose-700 bg-rose-950/40 px-3 py-1.5 text-xs text-rose-300 transition-all hover:border-rose-500 disabled:opacity-40"
              title="ออกเป็น PDF (พิมพ์/บันทึกเป็น PDF) — ตามห้องที่เลือก"
            >
              📄 Export PDF
            </button>
            <button
              onClick={() => exportCSV(assignment, submissions)}
              disabled={submissions.length === 0}
              className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition-all hover:border-slate-500 disabled:opacity-40"
            >
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Per-class submission cards — click to filter the list by class */}
        {!fetching && classStats.length > 0 && (
          <div className="mb-4 flex flex-wrap items-stretch gap-2">
            {/* "ทั้งหมด" — clears the filter */}
            <button
              onClick={() => setClassFilter(null)}
              className={`flex items-center rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                classFilter === null
                  ? 'border-blue-600 bg-blue-950/50 text-blue-300 ring-1 ring-blue-600/40'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
              }`}
            >
              ทั้งหมด
            </button>
            {classStats.map((cs) => {
              const pct = cs.total > 0 ? Math.round((cs.submitted / cs.total) * 100) : 0;
              const color = pct >= 100 ? 'border-emerald-800 bg-emerald-950/40 text-emerald-400'
                : pct >= 50 ? 'border-amber-800 bg-amber-950/40 text-amber-400'
                : 'border-red-900 bg-red-950/40 text-red-400';
              const active = classFilter === cs.classId;
              return (
                <button
                  key={cs.classId}
                  onClick={() => setClassFilter(active ? null : cs.classId)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${color} ${
                    active ? 'ring-2 ring-blue-500/70' : 'hover:brightness-125'
                  }`}
                >
                  <span className="text-xs font-bold">{cs.classId}</span>
                  <span className="text-xs opacity-80">
                    ส่ง {cs.submitted}{cs.total > 0 ? `/${cs.total}` : ''} คน
                  </span>
                  {cs.total > 0 && cs.submitted < cs.total && (
                    <span className="text-[10px] opacity-60">ค้าง {cs.total - cs.submitted}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {fetching ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : viewAll ? (
          /* ── Review-all mode: every student's work with an inline score box ── */
          visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 py-16 text-center">
              <p className="text-sm text-slate-500">
                {classFilter ? `ยังไม่มีการส่งงานจากห้อง ${classFilter}` : 'ยังไม่มีการส่งงาน'}
              </p>
            </div>
          ) : (() => {
            // Pending (รอตรวจ) first, then รอบันทึก, then ตรวจแล้ว
            const order: Record<string, number> = { submitted: 0, graded: 1, reviewed: 2 };
            const groups = [
              { key: 'submitted', label: 'รอตรวจ', color: 'amber' },
              { key: 'graded', label: 'รอบันทึกคะแนน', color: 'blue' },
              { key: 'reviewed', label: 'ตรวจแล้ว', color: 'emerald' },
            ];
            const byStatus = (st: string) => visible.filter((s) => s.status === st);
            const ungrouped = visible.filter((s) => !(s.status in order));
            return (
              <div className="space-y-5">
                {/* Save-all bar */}
                <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/95 px-4 py-2.5 backdrop-blur-sm">
                  <span className="text-xs text-slate-400">
                    {saveAllMsg ?? `กรอกคะแนนแล้วกดบันทึกทั้งหมด — ${visible.length} คน`}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Bulk-set one score for a chosen group */}
                    <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1">
                      <input
                        type="number" min={0} max={100} value={bulkScore}
                        onChange={(e) => setBulkScore(e.target.value)}
                        placeholder="คะแนน"
                        className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                      />
                      <span className="text-[11px] text-slate-500">ให้</span>
                      <select
                        value={bulkTarget}
                        onChange={(e) => setBulkTarget(e.target.value as typeof bulkTarget)}
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                      >
                        <option value="submitted">คนที่ส่งแล้ว</option>
                        <option value="not-submitted">คนที่ยังไม่ส่ง</option>
                        <option value="all">ทุกคน{classFilter ? '' : ' (ทุกห้อง)'}</option>
                      </select>
                      <button
                        onClick={applyBulkScore}
                        disabled={bulkApplying}
                        className="rounded-md border border-purple-700 bg-purple-950/40 px-3 py-1 text-xs font-semibold text-purple-300 transition-all hover:border-purple-500 disabled:opacity-50"
                      >
                        {bulkApplying ? 'กำลังใส่…' : 'ใส่คะแนน'}
                      </button>
                    </div>
                    <button
                      onClick={() => saveAll(visible)}
                      disabled={savingAll}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95"
                    >
                      {savingAll ? 'กำลังบันทึก…' : '💾 บันทึกคะแนนทั้งหมด'}
                    </button>
                  </div>
                </div>

                {groups.map((g) => {
                  const items = byStatus(g.key);
                  if (items.length === 0) return null;
                  return (
                    <div key={g.key} className="space-y-3">
                      <div className={`flex items-center gap-2 border-b pb-1.5 ${GROUP_COLORS[g.color].divider}`}>
                        <span className={`text-[11px] font-bold uppercase tracking-wider ${GROUP_COLORS[g.color].label}`}>{g.label}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${GROUP_COLORS[g.color].count}`}>{items.length}</span>
                      </div>
                      {items.map((sub) => (
                        <GradeAllRow
                          key={sub.id} sub={sub} assignment={assignment}
                          draft={gradeDraft[sub.id] ?? { score: '', feedback: '' }}
                          onChange={(field, value) => setDraft(sub.id, { [field]: value })}
                          onSave={() => saveOne(sub)}
                          saving={savingIds.has(sub.id)} saved={savedIds.has(sub.id)} err={rowErr[sub.id]}
                        />
                      ))}
                    </div>
                  );
                })}
                {ungrouped.map((sub) => (
                  <GradeAllRow
                    key={sub.id} sub={sub} assignment={assignment}
                    draft={gradeDraft[sub.id] ?? { score: '', feedback: '' }}
                    onChange={(field, value) => setDraft(sub.id, { [field]: value })}
                    onSave={() => saveOne(sub)}
                    saving={savingIds.has(sub.id)} saved={savedIds.has(sub.id)} err={rowErr[sub.id]}
                  />
                ))}
              </div>
            );
          })()
        ) : (
          <div className="flex gap-4 h-[calc(100vh-112px)]">
            {/* Submission list */}
            <div className="w-72 shrink-0 overflow-y-auto pr-1">
              {visible.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center">
                  <p className="text-sm text-slate-500">
                    {classFilter ? `ยังไม่มีการส่งงานจากห้อง ${classFilter}` : 'ยังไม่มีการส่งงาน'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* รอตรวจ */}
                  <SubmissionGroup
                    label="รอตรวจ"
                    color="amber"
                    items={visible.filter((s) => s.status === 'submitted')}
                    selected={selected}
                    deleting={deleting}
                    onOpen={openSubmission}
                    onDelete={handleDeleteSubmission}
                  />

                  {/* รอบันทึกคะแนน */}
                  <SubmissionGroup
                    label="รอบันทึกคะแนน"
                    color="blue"
                    items={visible.filter((s) => s.status === 'graded')}
                    selected={selected}
                    deleting={deleting}
                    onOpen={openSubmission}
                    onDelete={handleDeleteSubmission}
                  />

                  {/* ตรวจแล้ว */}
                  <SubmissionGroup
                    label="ตรวจแล้ว"
                    color="emerald"
                    items={visible.filter((s) => s.status === 'reviewed')}
                    selected={selected}
                    deleting={deleting}
                    onOpen={openSubmission}
                    onDelete={handleDeleteSubmission}
                  />
                </div>
              )}
            </div>

            {/* Detail panel */}
            <div className="flex-1 min-w-0 overflow-y-auto">
              {selected ? (
                <div className="space-y-4">
                  {/* Student info */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <p className="font-medium text-slate-100">{selected.studentName}</p>
                        <p className="text-sm text-slate-500">{selected.classId}</p>
                        {selected.submittedAt && (
                          <p className="mt-1 text-xs text-slate-600">
                            ส่งเมื่อ {new Date(selected.submittedAt._seconds * 1000).toLocaleString('th-TH', {
                              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        )}
                        {(selected.tabSwitchCount ?? 0) > 0 && (
                          <p className="mt-1 text-xs text-orange-400">🔍 ออกจากหน้านี้ระหว่างทำ {selected.tabSwitchCount} ครั้ง</p>
                        )}
                        {(selected.burstInsertCount ?? 0) > 0 && (
                          <p className="mt-1 text-xs text-amber-400">
                            🎤 ป้อนข้อความเป็นก้อน {selected.burstInsertCount} ครั้ง
                            <span className="ml-1 text-slate-500">(อาจมาจากเสียง/swipe — โปรดพิจารณา)</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs ${statusBadge(selected.status)}`}>
                          {statusLabel(selected.status)}
                        </span>
                        <button
                          onClick={handleQuickGrade}
                          disabled={quickGrading}
                          className="rounded-lg border border-blue-700 bg-blue-950/40 px-3 py-1.5 text-xs text-blue-300 transition-all hover:border-blue-500 disabled:opacity-40"
                        >
                          {quickGrading ? '…' : 'ตรวจเร็ว AI'}
                        </button>
                        <button
                          onClick={handleDetailedGrade}
                          disabled={detailedGrading}
                          title="AI ให้คอมเมนต์รายข้อ + คะแนน KPA รายข้อ (ปรับแก้ได้ก่อนบันทึก)"
                          className="rounded-lg border border-fuchsia-700 bg-fuchsia-950/40 px-3 py-1.5 text-xs text-fuchsia-300 transition-all hover:border-fuchsia-500 disabled:opacity-40"
                        >
                          {detailedGrading ? '…' : '🤖 ตรวจละเอียด AI (คอมเมนต์+KPA)'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Plagiarism alert */}
                  {(selected.plagiarismSuspicion ?? 0) > 60 && (
                    <div className="rounded-xl border border-amber-800 bg-amber-950/40 px-4 py-3">
                      <p className="text-sm font-medium text-amber-400">
                        ⚠ ระบบตรวจพบความเสี่ยงการคัดลอก {selected.plagiarismSuspicion}%
                      </p>
                      <p className="mt-1 text-xs text-amber-600">กรุณาตรวจสอบคำตอบอย่างละเอียดก่อนให้คะแนน</p>
                    </div>
                  )}

                  {/* Answer content */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">คำตอบของนักเรียน</p>
                    <p className="mb-3 text-[11px] text-slate-600">💬 พิมพ์คอมเมนต์ใต้แต่ละข้อได้ — จะถูกบันทึกพร้อมกับปุ่ม “บันทึกคะแนน”</p>
                    {selected.answers && Object.keys(selected.answers).length > 0 ? (
                      <BlockAnswers
                        assignment={assignment}
                        answers={selected.answers}
                        comments={qComments}
                        onCommentChange={(blockId, value) =>
                          setQComments((c) => ({ ...c, [blockId]: value }))
                        }
                      />
                    ) : selected.content ? (
                      <p className="whitespace-pre-wrap text-sm text-slate-300">{selected.content}</p>
                    ) : (
                      <p className="text-sm text-slate-500 italic">ไม่มีคำตอบ</p>
                    )}
                    {selected.driveWebViewLink && (
                      <a href={selected.driveWebViewLink} target="_blank" rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
                        📎 ดูไฟล์แนบ
                      </a>
                    )}
                  </div>

                  {/* AI score display (graded = waiting for teacher to finalize) */}
                  {typeof selected.score === 'number' && selected.status === 'graded' && (
                    <div className={`rounded-2xl border p-5 ${scoreColor(selected.score)}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">คะแนน AI — รอบันทึกคะแนน</p>
                        <span className="text-xl font-bold">{selected.score}/100</span>
                      </div>
                      {selected.feedback && <p className="mt-2 text-sm opacity-80">{selected.feedback}</p>}
                    </div>
                  )}
                  {/* Reviewed score display */}
                  {typeof selected.score === 'number' && selected.status === 'reviewed' && (
                    <div className={`rounded-2xl border p-5 ${scoreColor(selected.score)}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">คะแนนที่บันทึกแล้ว</p>
                        <span className="text-xl font-bold">{selected.score}/100</span>
                      </div>
                      {selected.feedback && <p className="mt-2 text-sm opacity-80">{selected.feedback}</p>}
                    </div>
                  )}

                  {/* Manual grade form */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
                    <p className="text-sm font-medium text-slate-200">ให้คะแนนและ Feedback (Manual)</p>
                    <div>
                      <label className="mb-1.5 block text-xs text-slate-400">คะแนน (0–100)</label>
                      <input type="number" min={0} max={100} value={score}
                        onChange={(e) => setScore(e.target.value)}
                        placeholder="เช่น 85" className="input w-32" />
                    </div>

                    {/* Per-question KPA scores */}
                    {(() => {
                      const QT = ['short-answer', 'long-answer', 'multiple-choice', 'checkbox', 'ordering', 'image-upload', 'true-false', 'matching', 'fill-blank', 'link'];
                      const allQ = (assignment?.blocks ?? []).filter((b) => QT.includes(b.type));
                      const numOf = new Map(allQ.map((b, i) => [b.id, i + 1]));
                      const scored = allQ.filter((b) => typeof b.scoreMax === 'number' && b.scoreMax > 0);
                      const hasA = typeof assignment?.attitudeMax === 'number' && assignment.attitudeMax > 0;
                      if (scored.length === 0 && !hasA) return null;
                      const sumBy = (kind: 'K' | 'P') => scored.filter((b) => b.scoreKind === kind).reduce((s, b) => s + (Number(qScores[b.id]) || 0), 0);
                      const maxBy = (kind: 'K' | 'P') => scored.filter((b) => b.scoreKind === kind).reduce((s, b) => s + (b.scoreMax || 0), 0);
                      return (
                        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2">
                          <p className="text-xs font-semibold text-slate-300">คะแนนรายข้อ (KPA)</p>
                          <div className="space-y-1.5">
                            {scored.map((b) => (
                              <div key={b.id} className="flex items-center gap-2">
                                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${b.scoreKind === 'K' ? 'bg-blue-950/60 text-blue-300' : b.scoreKind === 'P' ? 'bg-violet-950/60 text-violet-300' : 'bg-slate-800 text-slate-400'}`}>{b.scoreKind ?? '?'}</span>
                                <span className="flex-1 truncate text-xs text-slate-400">ข้อ {numOf.get(b.id)}. {b.question}</span>
                                <input type="number" min={0} max={b.scoreMax}
                                  value={qScores[b.id] ?? ''}
                                  onChange={(e) => setQScores((s) => ({ ...s, [b.id]: e.target.value }))}
                                  className="w-16 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-center text-xs text-slate-100" />
                                <span className="w-8 shrink-0 text-[10px] text-slate-600">/{b.scoreMax}</span>
                              </div>
                            ))}
                            {hasA && (
                              <div className="flex items-center gap-2 border-t border-slate-800 pt-1.5">
                                <span className="shrink-0 rounded bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">A</span>
                                <span className="flex-1 text-xs text-slate-400">คุณลักษณะ (รวม)</span>
                                <input type="number" min={0} max={assignment!.attitudeMax}
                                  value={aScore} onChange={(e) => setAScore(e.target.value)}
                                  className="w-16 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-center text-xs text-slate-100" />
                                <span className="w-8 shrink-0 text-[10px] text-slate-600">/{assignment!.attitudeMax}</span>
                              </div>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            รวม K {sumBy('K')}/{maxBy('K')} · P {sumBy('P')}/{maxBy('P')}{hasA ? ` · A ${Number(aScore) || 0}/${assignment!.attitudeMax}` : ''}
                          </p>
                        </div>
                      );
                    })()}

                    <div>
                      <label className="mb-1.5 block text-xs text-slate-400">Feedback ให้นักเรียน</label>
                      <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)}
                        rows={4} placeholder="เขียนความคิดเห็นหรือข้อแนะนำ..." className="input resize-none" />
                    </div>
                    {saveError && <p className="text-xs text-red-400">{saveError}</p>}
                    <button onClick={handleSave} disabled={saving}
                      className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95">
                      {saving ? 'กำลังบันทึก…' : 'บันทึกคะแนน'}
                    </button>
                  </div>
                </div>
              ) : assignment?.contentType === 'knowledge' ? (
                <KnowledgePreview assignment={assignment} />
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-800">
                  <p className="text-sm text-slate-500">เลือกนักเรียนเพื่อดูงาน</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const GROUP_COLORS: Record<string, { label: string; count: string; divider: string }> = {
  amber:   { label: 'text-amber-400',   count: 'bg-amber-950/60 border-amber-800 text-amber-400',   divider: 'bg-amber-800/40' },
  blue:    { label: 'text-blue-400',    count: 'bg-blue-950/60 border-blue-800 text-blue-400',       divider: 'bg-blue-800/40' },
  emerald: { label: 'text-emerald-400', count: 'bg-emerald-950/60 border-emerald-800 text-emerald-400', divider: 'bg-emerald-800/40' },
};

function GradeAllRow({
  sub, assignment, draft, onChange, onSave, saving, saved, err,
}: {
  sub: Submission;
  assignment: Assignment | null;
  draft: { score: string; feedback: string };
  onChange: (field: 'score' | 'feedback', value: string) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  err?: string;
}) {
  const score = draft.score;
  const feedback = draft.feedback;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      {/* Student header */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="font-medium text-slate-100">{sub.studentName}</p>
          <p className="text-xs text-slate-500">{sub.classId}</p>
        </div>
        <div className="flex items-center gap-2">
          {(sub.tabSwitchCount ?? 0) > 0 && (
            <span className="text-[11px] text-orange-400">🔍 {sub.tabSwitchCount}</span>
          )}
          {(sub.burstInsertCount ?? 0) > 0 && (
            <span className="text-[11px] text-amber-400">🎤 {sub.burstInsertCount}</span>
          )}
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${statusBadge(sub.status)}`}>
            {statusLabel(sub.status)}
          </span>
        </div>
      </div>

      {/* Answer */}
      <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        {sub.answers && Object.keys(sub.answers).length > 0 ? (
          <BlockAnswers assignment={assignment} answers={sub.answers} comments={sub.questionComments} />
        ) : sub.content ? (
          <p className="whitespace-pre-wrap text-sm text-slate-300">{sub.content}</p>
        ) : (
          <p className="text-sm text-slate-500 italic">ไม่มีคำตอบ</p>
        )}
        {sub.driveWebViewLink && (
          <a href={sub.driveWebViewLink} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
            📎 ดูไฟล์แนบ
          </a>
        )}
      </div>

      {/* Score + feedback row */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[11px] text-slate-400">คะแนน (0–100)</label>
          <input
            type="number" min={0} max={100} value={score}
            onChange={(e) => onChange('score', e.target.value)}
            placeholder="เช่น 85"
            className="w-24 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[11px] text-slate-400">Feedback</label>
          <input
            type="text" value={feedback}
            onChange={(e) => onChange('feedback', e.target.value)}
            placeholder="ความคิดเห็น (ถ้ามี)"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95"
        >
          {saving ? '…' : saved ? '✓ บันทึกแล้ว' : 'บันทึก'}
        </button>
        {err && <span className="text-xs text-red-400">{err}</span>}
      </div>
    </div>
  );
}

function SubmissionGroup({
  label, color, items, selected, deleting, onOpen, onDelete,
}: {
  label: string;
  color: string;
  items: Submission[];
  selected: Submission | null;
  deleting: string | null;
  onOpen: (s: Submission) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const c = GROUP_COLORS[color] ?? GROUP_COLORS.amber;
  return (
    <div>
      <div className={`mb-2 flex items-center gap-2 px-1 pb-1.5 border-b ${c.divider}`}>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${c.label}`}>{label}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${c.count}`}>{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((sub) => (
          <SubmissionCard
            key={sub.id}
            sub={sub}
            selected={selected}
            deleting={deleting}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function SubmissionCard({
  sub, selected, deleting, onOpen, onDelete,
}: {
  sub: Submission;
  selected: Submission | null;
  deleting: string | null;
  onOpen: (s: Submission) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={`rounded-xl border transition-all ${
      selected?.id === sub.id ? 'border-blue-700 bg-blue-950/30' : 'border-slate-800 bg-slate-900'
    }`}>
      <button
        onClick={() => onOpen(sub)}
        className="w-full p-3 text-left hover:bg-white/5 rounded-t-xl transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-200 truncate">{sub.studentName}</p>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${statusBadge(sub.status)}`}>
            {statusLabel(sub.status)}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{sub.classId}</p>
        {typeof sub.score === 'number' && (
          <p className={`mt-1 text-xs font-semibold ${sub.score >= 60 ? 'text-emerald-400' : 'text-red-400'}`}>
            {sub.score}/100
          </p>
        )}
        {(sub.plagiarismSuspicion ?? 0) > 60 && (
          <p className="mt-1 text-xs text-amber-500">⚠ เสี่ยงคัดลอก {sub.plagiarismSuspicion}%</p>
        )}
        {(sub.tabSwitchCount ?? 0) > 0 && (
          <p className="mt-1 text-xs text-orange-400">🔍 เปลี่ยนแท็บ {sub.tabSwitchCount} ครั้ง</p>
        )}
        {(sub.burstInsertCount ?? 0) > 0 && (
          <p className="mt-1 text-xs text-amber-400">🎤 ป้อนเป็นก้อน {sub.burstInsertCount} ครั้ง</p>
        )}
      </button>
      <div className="border-t border-slate-800 px-3 py-1.5">
        <button
          onClick={() => onDelete(sub.id)}
          disabled={deleting === sub.id}
          className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50 transition-colors"
        >
          {deleting === sub.id ? '…' : 'ลบงาน (ให้ส่งใหม่)'}
        </button>
      </div>
    </div>
  );
}

function BlockAnswers({
  assignment, answers, comments, onCommentChange,
}: {
  assignment: Assignment | null;
  answers: Record<string, string | string[]>;
  comments?: Record<string, string>;
  onCommentChange?: (blockId: string, value: string) => void;
}) {
  if (!assignment?.blocks) {
    return (
      <div className="space-y-3">
        {Object.entries(answers).map(([blockId, answer]) => (
          <div key={blockId}>
            <p className="text-xs text-slate-500 mb-1">{blockId}</p>
            <p className="text-sm text-slate-300">{Array.isArray(answer) ? answer.join(', ') : answer}</p>
          </div>
        ))}
      </div>
    );
  }
  const questionBlocks = (assignment.blocks as AssignmentBlock[]).filter((b) =>
    ['short-answer', 'long-answer', 'multiple-choice', 'checkbox', 'ordering', 'image-upload', 'true-false', 'matching', 'fill-blank', 'link'].includes(b.type)
  );
  return (
    <div className="space-y-5">
      {questionBlocks.map((block, i) => {
        const answer = answers[block.id];
        const q = 'question' in block ? (block as { question: string }).question : block.id;
        return (
          <div key={block.id}>
            <p className="mb-1 whitespace-pre-wrap text-xs font-medium text-slate-400">ข้อ {i + 1}. {q}</p>
            {answer === undefined ? (
              <p className="text-sm text-slate-600 italic">ไม่ได้ตอบ</p>
            ) : block.type === 'image-upload' && typeof answer === 'string' && answer ? (
              <div className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={driveThumb(answer, 800)} alt="คำตอบนักเรียน" className="max-h-64 rounded-xl border border-slate-700 object-contain bg-slate-800/30" />
                <a href={answer} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:text-blue-300">
                  เปิดภาพเต็ม ↗
                </a>
              </div>
            ) : block.type === 'image-upload' ? (
              <p className="text-sm text-slate-600 italic">ไม่ได้อัปโหลดรูป</p>
            ) : block.type === 'true-false' && Array.isArray(answer) ? (
              <div className="space-y-1">
                {((block as AssignmentBlock & { items?: Array<{ statement: string; correctAnswer: boolean }> }).items ?? []).map((item, j) => (
                  <div key={j} className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">{item.statement}</span>
                    <span className={`ml-2 text-xs font-semibold shrink-0 ${
                      answer[j] === 'true' ? 'text-emerald-400' : answer[j] === 'false' ? 'text-red-400' : 'text-slate-600'
                    }`}>{answer[j] === 'true' ? 'ถูก' : answer[j] === 'false' ? 'ผิด' : '—'}</span>
                  </div>
                ))}
              </div>
            ) : block.type === 'matching' && Array.isArray(answer) ? (
              <div className="space-y-1">
                {((block as AssignmentBlock & { leftItems?: string[] }).leftItems ?? []).map((left, j) => (
                  <div key={j} className="flex items-center gap-2 text-sm text-slate-300">
                    <span>{left}</span>
                    <span className="text-slate-600">→</span>
                    <span>{answer[j] ?? '—'}</span>
                  </div>
                ))}
              </div>
            ) : block.type === 'fill-blank' ? (() => {
              const fbAns = Array.isArray(answer) ? answer : [];
              const parts = q.split('___');
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
                {answer.map((a, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-slate-300">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-400">{idx + 1}</span>
                    {a}
                  </div>
                ))}
              </div>
            ) : block.type === 'link' && typeof answer === 'string' && answer ? (
              <a href={answer} target="_blank" rel="noopener noreferrer"
                className="text-sm text-cyan-400 underline break-all hover:text-cyan-300">
                🔗 {answer}
              </a>
            ) : Array.isArray(answer) ? (
              <div className="flex flex-wrap gap-2">
                {answer.map((a) => (
                  <span key={a} className="rounded-full border border-blue-800 bg-blue-950/40 px-3 py-0.5 text-xs text-blue-300">{a}</span>
                ))}
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-slate-300">{answer}</p>
            )}

            {/* Per-question teacher comment */}
            {onCommentChange ? (
              <input
                type="text"
                value={comments?.[block.id] ?? ''}
                onChange={(e) => onCommentChange(block.id, e.target.value)}
                placeholder="💬 คอมเมนต์ข้อนี้ (ถ้ามี)"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
              />
            ) : comments?.[block.id] ? (
              <p className="mt-2 rounded-lg border border-blue-900/60 bg-blue-950/30 px-3 py-1.5 text-xs text-blue-200">
                💬 {comments[block.id]}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const INFOGRAPHIC_COLORS: Record<string, string> = {
  blue:   'border-blue-700/60 bg-blue-950/30',
  green:  'border-emerald-700/60 bg-emerald-950/30',
  yellow: 'border-amber-700/60 bg-amber-950/30',
  red:    'border-red-700/60 bg-red-950/30',
  purple: 'border-violet-700/60 bg-violet-950/30',
};

function KnowledgePreview({ assignment }: { assignment: Assignment }) {
  const blocks = assignment.blocks ?? [];
  if (blocks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-emerald-900">
        <p className="text-sm text-slate-500">ไม่มีเนื้อหาในใบความรู้นี้</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-emerald-900/50 bg-slate-900 p-5 overflow-y-auto space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500">📖 เนื้อหาใบความรู้</p>
      {blocks.map((block) => {
        switch (block.type) {
          case 'heading':
            return <h3 key={block.id} className="text-base font-bold text-slate-100">{block.text}</h3>;
          case 'paragraph':
            return <p key={block.id} className="whitespace-pre-wrap text-sm text-slate-300 leading-relaxed">{block.text}</p>;
          case 'image':
            return block.url ? (
              <div key={block.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={driveThumb(block.url, 1000)} alt={block.caption ?? ''} className="max-h-80 w-full rounded-xl border border-slate-700 object-contain bg-slate-800/30" />
                {block.caption && <p className="mt-1 text-center text-xs text-slate-500">{block.caption}</p>}
              </div>
            ) : null;
          case 'pdf':
            return block.url ? (
              <div key={block.id}>
                <iframe src={block.url} className="w-full rounded-xl border border-slate-700" style={{ height: block.height ?? 500 }} />
                {block.caption && <p className="mt-1 text-center text-xs text-slate-500">{block.caption}</p>}
              </div>
            ) : null;
          case 'infographic':
            return (
              <div key={block.id} className={`rounded-xl border p-4 ${INFOGRAPHIC_COLORS[block.color ?? 'blue'] ?? INFOGRAPHIC_COLORS.blue}`}>
                <p className="mb-1 text-lg">{block.icon}</p>
                <p className="font-semibold text-slate-100">{block.title}</p>
                <p className="mt-1 text-sm text-slate-300 whitespace-pre-wrap">{block.body}</p>
              </div>
            );
          default:
            return null;
        }
      })}
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
