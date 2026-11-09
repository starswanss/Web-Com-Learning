import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { parseTerm, submissionInTerm } from '@/lib/term';
import { getStudentsInClasses } from '@/lib/students-cache';
import { getRosterClassIds } from '@/lib/subject-classes';
import { cachedGlobal, invalidatePrefix } from '@/lib/server-cache';

async function getTeacherUid(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists || snap.data()?.role !== 'teacher') return null;
    return decoded.uid;
  } catch { return null; }
}

interface Unit { id: string; name: string; k: number; p: number; a: number; assignmentIds?: string[] }
interface Exam { midterm: number; final: number }

function defaultUnits(): Unit[] {
  return [{ id: 'u1', name: 'หน่วยที่ 1', k: 10, p: 10, a: 10, assignmentIds: [] }];
}

function cleanIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && !!x).slice(0, 200);
}

/**
 * Percentage over the given assignments → 0..1. Divides by the NUMBER OF
 * ASSIGNMENTS (not only the ones submitted), so a missing/ungraded assignment
 * counts as 0 — a student who did fewer gets a lower average. `ids` should be
 * pre-filtered to the assignments that apply to the student's class.
 */
function pctFromAssignments(ids: string[], scored: Map<string, number>): number {
  if (ids.length === 0) return 0;
  let sum = 0;
  for (const id of ids) sum += scored.get(id) ?? 0; // missing / ungraded = 0
  return sum / (ids.length * 100);
}
const DEFAULT_EXAM: Exam = { midterm: 20, final: 20 };

/** Sum of all full marks (units KPA + midterm + final). */
function fullMarks(units: Unit[], exam: Exam): number {
  const u = units.reduce((s, x) => s + (x.k || 0) + (x.p || 0) + (x.a || 0), 0);
  return u + (exam.midterm || 0) + (exam.final || 0);
}

function subjectKey(subjectId: string | null): string {
  return subjectId && subjectId.trim() ? subjectId.trim() : 'all';
}

// Config/scores are stored per (subject, term). No term keeps the legacy key so
// existing data still loads; a specific term gets its own document.
function docKey(subjectId: string | null, termStr: string | null): string {
  const s = subjectKey(subjectId);
  const t = parseTerm(termStr);
  return t ? `${s}__t${t.year}-${t.no}` : s;
}

/** รหัสประจำตัว: the school email's local-part (best available student id). */
function studentCodeFromEmail(email: string): string {
  return (email ?? '').split('@')[0] ?? '';
}

// ── GET: config + saved scores + per-student per-unit auto percentages ────────────
export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const subjectId = url.searchParams.get('subject');
  const termStr = url.searchParams.get('term');
  const termSel = parseTerm(termStr);
  const key = docKey(subjectId, termStr);

  const result = await cachedGlobal(`grades:${uid}:${key}`, 45_000, async () => {
  // Config + saved manual scores.
  const [configSnap, scoresSnap] = await Promise.all([
    adminDb.collection('gradeConfigs').doc(`${uid}__${key}`).get(),
    adminDb.collection('gradeScores').doc(`${uid}__${key}`).get(),
  ]);
  const cfg = configSnap.exists ? configSnap.data()! : null;
  const units: Unit[] = cfg && Array.isArray(cfg.units) ? (cfg.units as Unit[]) : defaultUnits();
  const exam: Exam = {
    midterm: typeof cfg?.midterm === 'number' ? cfg.midterm : DEFAULT_EXAM.midterm,
    final: typeof cfg?.final === 'number' ? cfg.final : DEFAULT_EXAM.final,
  };
  const midtermAssignments = cleanIds(cfg?.midtermAssignments);
  const finalAssignments = cleanIds(cfg?.finalAssignments);
  const savedScores: Record<string, Record<string, { k: number; p: number; a: number }>> =
    scoresSnap.exists ? (scoresSnap.data()?.scores ?? {}) : {};
  const savedExams: Record<string, Exam> =
    scoresSnap.exists ? (scoresSnap.data()?.exams ?? {}) : {};

  // Assignments (worksheet/quiz only), optionally by subject. Worksheets are a
  // permanent library reused every term, so we DON'T filter them by term —
  // instead we scope by the SUBMISSION's term below.
  let aQuery = adminDb.collection('assignments').where('teacherId', '==', uid);
  if (subjectId) aQuery = aQuery.where('subjectId', '==', subjectId);
  const assignmentsSnap = await aQuery.get();
  const allAssignments = assignmentsSnap.docs
    .map((d): { id: string } & Record<string, unknown> => ({ id: d.id, ...d.data() }))
    .filter((a) => ['worksheet', 'quiz'].includes((a.contentType as string) ?? 'worksheet'));

  // Reviewed scores (studentId → assignmentId → score) + which assignments have
  // any work in the chosen term (scopes the denominator to this term's work).
  const allAssignmentIds = allAssignments.map((a) => a.id);
  const subIndex = new Map<string, Map<string, number>>();
  const termActive = new Set<string>();
  for (let i = 0; i < allAssignmentIds.length; i += 30) {
    const chunk = allAssignmentIds.slice(i, i + 30);
    if (chunk.length === 0) break;
    const snap = await adminDb.collection('submissions').where('assignmentId', 'in', chunk).get();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (!submissionInTerm(data as { academicYear?: number | null; term?: number | null }, termStr)) return;
      termActive.add(data.assignmentId as string);
      if (data.status !== 'reviewed' || typeof data.score !== 'number') return;
      const sid = data.studentId as string;
      if (!subIndex.has(sid)) subIndex.set(sid, new Map());
      subIndex.get(sid)!.set(data.assignmentId as string, data.score as number);
    });
  }

  // Under a specific term, only that term's assignments count toward units /
  // denominators / pickers; under ทุกเทอม keep the whole library.
  const assignments = termSel ? allAssignments.filter((a) => termActive.has(a.id)) : allAssignments;

  // Map assignmentId → normalised unit name (for grouping by unit).
  const assignmentUnit = new Map<string, string>();
  assignments.forEach((a) => assignmentUnit.set(a.id, String((a.unit as string) ?? '').trim()));

  // Roster from the SUBJECT's rooms — assignments are subject-wide, so their
  // frozen classIds (often an old odd/even split) miss current students.
  const rosterClassIds = await getRosterClassIds(uid, subjectId);
  const students = await getStudentsInClasses(rosterClassIds);

  // Resolve each unit's bound assignment IDs. Prefer the explicit selection;
  // fall back to name-matching (older configs) so nothing breaks.
  const validId = new Set(assignments.map((a) => a.id));
  function unitAssignmentIds(u: Unit): string[] {
    const explicit = (u.assignmentIds ?? []).filter((id) => validId.has(id));
    if (explicit.length > 0) return explicit;
    const uname = u.name.trim();
    return assignments.filter((a) => assignmentUnit.get(a.id) === uname).map((a) => a.id);
  }

  // How many assignments are tied to each unit (informational for the UI).
  const unitMatched: Record<string, number> = {};
  for (const u of units) unitMatched[u.id] = unitAssignmentIds(u).length;

  // Assignments are subject-wide, so every one applies to every student in the
  // subject roster — the denominator base. (The old classId-membership check
  // dropped students sitting in rooms the worksheet didn't originally target,
  // making their whole grade compute as 0.)
  const applicable = assignments.map((a) => a.id);
  const appSet = new Set(applicable);

  // Build rows with per-unit / exam percentages (0..1) used by "เกลี่ยอัตโนมัติ".
  const rows = students.map((s) => {
    const scored = subIndex.get(s.uid) ?? new Map<string, number>();
    const overallPct = pctFromAssignments(applicable, scored);

    const unitPct: Record<string, number> = {};
    for (const u of units) {
      const bound = unitAssignmentIds(u).filter((id) => appSet.has(id));
      // No assignments bound to this unit → fall back to the overall average.
      unitPct[u.id] = unitAssignmentIds(u).length === 0 ? overallPct : pctFromAssignments(bound, scored);
    }

    return {
      uid: s.uid,
      studentCode: studentCodeFromEmail(s.email),
      name: s.displayName,
      email: s.email,
      classId: s.classId,
      unitPct,
      midtermPct: pctFromAssignments(midtermAssignments.filter((id) => appSet.has(id)), scored),
      finalPct: pctFromAssignments(finalAssignments.filter((id) => appSet.has(id)), scored),
      saved: savedScores[s.uid] ?? {},
      savedExam: savedExams[s.uid] ?? { midterm: 0, final: 0 },
    };
  });

  rows.sort((a, b) => {
    const c = a.classId.localeCompare(b.classId);
    if (c !== 0) return c;
    return a.name.localeCompare(b.name, 'th');
  });

  // Assignment list for the "bind assignments" pickers.
  const assignmentList = assignments
    .map((a) => ({
      id: a.id,
      title: (a.title as string) ?? '(ไม่มีชื่อ)',
      unit: String((a.unit as string) ?? '').trim(),
      contentType: (a.contentType as string) ?? 'worksheet',
    }))
    .sort((x, y) => x.title.localeCompare(y.title, 'th'));

    return {
      units, exam, midtermAssignments, finalAssignments,
      fullMarks: fullMarks(units, exam), unitMatched,
      assignments: assignmentList, students: rows,
    };
  });
  return NextResponse.json(result);
}

// ── PUT: save the unit config ────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const u2 = new URL(req.url);
  const subjectId = u2.searchParams.get('subject');
  const termStr = u2.searchParams.get('term');
  const body = await req.json().catch(() => ({}));
  const units = body?.units;
  if (!Array.isArray(units)) return NextResponse.json({ error: 'Missing units' }, { status: 400 });

  // Sanitise.
  const clean: Unit[] = units.slice(0, 30).map((u: Record<string, unknown>, i: number) => ({
    id: typeof u.id === 'string' && u.id ? u.id : `u${i + 1}`,
    name: String(u.name ?? `หน่วยที่ ${i + 1}`).slice(0, 100),
    k: clampNum(u.k), p: clampNum(u.p), a: clampNum(u.a),
    assignmentIds: cleanIds(u.assignmentIds),
  }));
  const exam: Exam = { midterm: clampNum(body?.midterm), final: clampNum(body?.final) };
  const midtermAssignments = cleanIds(body?.midtermAssignments);
  const finalAssignments = cleanIds(body?.finalAssignments);

  // Condition: total full marks (เก็บ KPA + กลางภาค + ปลายภาค) must not exceed 100.
  const total = fullMarks(clean, exam);
  if (total > 100) {
    return NextResponse.json(
      { error: `คะแนนเต็มรวมต้องไม่เกิน 100 (ตอนนี้ ${total})`, fullMarks: total },
      { status: 400 },
    );
  }

  await adminDb.collection('gradeConfigs').doc(`${uid}__${docKey(subjectId, termStr)}`)
    .set({ units: clean, midterm: exam.midterm, final: exam.final, midtermAssignments, finalAssignments }, { merge: true });
  invalidatePrefix(`grades:${uid}:`);
  return NextResponse.json({ ok: true, units: clean, exam, midtermAssignments, finalAssignments, fullMarks: total });
}

// ── POST: save the manual (edited/distributed) scores ─────────────────────────────
export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const u3 = new URL(req.url);
  const subjectId = u3.searchParams.get('subject');
  const termStr = u3.searchParams.get('term');
  const body = await req.json().catch(() => ({}));
  const scores = body?.scores;
  if (!scores || typeof scores !== 'object') {
    return NextResponse.json({ error: 'Missing scores' }, { status: 400 });
  }
  const exams = (body?.exams && typeof body.exams === 'object') ? body.exams as Record<string, unknown> : {};

  // Sanitise: { [studentUid]: { [unitId]: {k,p,a} } }
  const clean: Record<string, Record<string, { k: number; p: number; a: number }>> = {};
  for (const [studentUid, byUnit] of Object.entries(scores as Record<string, unknown>)) {
    if (!byUnit || typeof byUnit !== 'object') continue;
    clean[studentUid] = {};
    for (const [unitId, kpa] of Object.entries(byUnit as Record<string, unknown>)) {
      const v = kpa as Record<string, unknown>;
      clean[studentUid][unitId] = { k: clampNum(v?.k), p: clampNum(v?.p), a: clampNum(v?.a) };
    }
  }

  // Sanitise exam scores: { [studentUid]: { midterm, final } }
  const cleanExams: Record<string, Exam> = {};
  for (const [studentUid, e] of Object.entries(exams)) {
    const v = (e ?? {}) as Record<string, unknown>;
    cleanExams[studentUid] = { midterm: clampNum(v?.midterm), final: clampNum(v?.final) };
  }

  await adminDb.collection('gradeScores').doc(`${uid}__${docKey(subjectId, termStr)}`)
    .set({ scores: clean, exams: cleanExams }, { merge: false });
  invalidatePrefix(`grades:${uid}:`);
  return NextResponse.json({ ok: true });
}

function clampNum(v: unknown): number {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100; // allow .5 marks
}
