import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';

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

interface Unit { id: string; name: string; k: number; p: number; a: number }

function defaultUnits(): Unit[] {
  return [{ id: 'u1', name: 'หน่วยที่ 1', k: 10, p: 10, a: 10 }];
}

function subjectKey(subjectId: string | null): string {
  return subjectId && subjectId.trim() ? subjectId.trim() : 'all';
}

/** รหัสประจำตัว: the school email's local-part (best available student id). */
function studentCodeFromEmail(email: string): string {
  return (email ?? '').split('@')[0] ?? '';
}

// ── GET: config + saved scores + per-student per-unit auto percentages ────────────
export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subjectId = new URL(req.url).searchParams.get('subject');
  const key = subjectKey(subjectId);

  // Config + saved manual scores.
  const [configSnap, scoresSnap] = await Promise.all([
    adminDb.collection('gradeConfigs').doc(`${uid}__${key}`).get(),
    adminDb.collection('gradeScores').doc(`${uid}__${key}`).get(),
  ]);
  const units: Unit[] = configSnap.exists && Array.isArray(configSnap.data()?.units)
    ? (configSnap.data()!.units as Unit[])
    : defaultUnits();
  const savedScores: Record<string, Record<string, { k: number; p: number; a: number }>> =
    scoresSnap.exists ? (scoresSnap.data()?.scores ?? {}) : {};

  // Assignments (worksheet/quiz only), optionally by subject.
  let aQuery = adminDb.collection('assignments').where('teacherId', '==', uid);
  if (subjectId) aQuery = aQuery.where('subjectId', '==', subjectId);
  const assignmentsSnap = await aQuery.get();
  const assignments = assignmentsSnap.docs
    .map((d): { id: string } & Record<string, unknown> => ({ id: d.id, ...d.data() }))
    .filter((a) => ['worksheet', 'quiz'].includes((a.contentType as string) ?? 'worksheet'));

  // Map assignmentId → normalised unit name (for grouping by unit).
  const assignmentUnit = new Map<string, string>();
  assignments.forEach((a) => assignmentUnit.set(a.id, String((a.unit as string) ?? '').trim()));

  const allClassIds = Array.from(new Set(assignments.flatMap((a) => (a.classIds as string[]) ?? [])));

  // Students in those classes.
  const students: Array<{ uid: string; displayName: string; email: string; classId: string }> = [];
  const CHUNK = 10;
  for (let i = 0; i < allClassIds.length; i += CHUNK) {
    const chunk = allClassIds.slice(i, i + CHUNK);
    if (chunk.length === 0) break;
    const usersSnap = await adminDb
      .collection('users')
      .where('classId', 'in', chunk)
      .where('role', '==', 'student')
      .get();
    usersSnap.docs.forEach((d) => {
      const data = d.data();
      students.push({
        uid: d.id,
        displayName: (data.displayName as string) ?? '',
        email: (data.email as string) ?? '',
        classId: (data.classId as string) ?? '',
      });
    });
  }

  // Reviewed submissions: studentId → assignmentId → score.
  const assignmentIds = assignments.map((a) => a.id);
  const subIndex = new Map<string, Map<string, number>>();
  for (let i = 0; i < assignmentIds.length; i += 30) {
    const chunk = assignmentIds.slice(i, i + 30);
    if (chunk.length === 0) break;
    const snap = await adminDb.collection('submissions').where('assignmentId', 'in', chunk).get();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.status !== 'reviewed' || typeof data.score !== 'number') return;
      const sid = data.studentId as string;
      if (!subIndex.has(sid)) subIndex.set(sid, new Map());
      subIndex.get(sid)!.set(data.assignmentId as string, data.score as number);
    });
  }

  // How many assignments are tied to each unit name (informational for the UI).
  const unitMatched: Record<string, number> = {};
  for (const u of units) {
    const uname = u.name.trim();
    unitMatched[u.id] = assignments.filter((a) => assignmentUnit.get(a.id) === uname).length;
  }

  // Build rows with per-unit percentage (0..1) used by "เกลี่ยอัตโนมัติ".
  const rows = students.map((s) => {
    const scored = subIndex.get(s.uid) ?? new Map<string, number>();
    const allScores = Array.from(scored.values());
    const overallPct = allScores.length > 0
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length / 100
      : 0;

    const unitPct: Record<string, number> = {};
    for (const u of units) {
      const uname = u.name.trim();
      const unitScores = assignments
        .filter((a) => assignmentUnit.get(a.id) === uname)
        .map((a) => scored.get(a.id))
        .filter((v): v is number => typeof v === 'number');
      unitPct[u.id] = unitScores.length > 0
        ? unitScores.reduce((a, b) => a + b, 0) / unitScores.length / 100
        : overallPct; // fallback when no assignment is tagged with this unit
    }

    return {
      uid: s.uid,
      studentCode: studentCodeFromEmail(s.email),
      name: s.displayName,
      email: s.email,
      classId: s.classId,
      unitPct,
      saved: savedScores[s.uid] ?? {},
    };
  });

  rows.sort((a, b) => {
    const c = a.classId.localeCompare(b.classId);
    if (c !== 0) return c;
    return a.name.localeCompare(b.name, 'th');
  });

  return NextResponse.json({ units, unitMatched, students: rows });
}

// ── PUT: save the unit config ────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subjectId = new URL(req.url).searchParams.get('subject');
  const body = await req.json().catch(() => ({}));
  const units = body?.units;
  if (!Array.isArray(units)) return NextResponse.json({ error: 'Missing units' }, { status: 400 });

  // Sanitise.
  const clean: Unit[] = units.slice(0, 30).map((u: Record<string, unknown>, i: number) => ({
    id: typeof u.id === 'string' && u.id ? u.id : `u${i + 1}`,
    name: String(u.name ?? `หน่วยที่ ${i + 1}`).slice(0, 100),
    k: clampNum(u.k), p: clampNum(u.p), a: clampNum(u.a),
  }));

  await adminDb.collection('gradeConfigs').doc(`${uid}__${subjectKey(subjectId)}`)
    .set({ units: clean }, { merge: true });
  return NextResponse.json({ ok: true, units: clean });
}

// ── POST: save the manual (edited/distributed) scores ─────────────────────────────
export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subjectId = new URL(req.url).searchParams.get('subject');
  const body = await req.json().catch(() => ({}));
  const scores = body?.scores;
  if (!scores || typeof scores !== 'object') {
    return NextResponse.json({ error: 'Missing scores' }, { status: 400 });
  }

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

  await adminDb.collection('gradeScores').doc(`${uid}__${subjectKey(subjectId)}`)
    .set({ scores: clean }, { merge: false });
  return NextResponse.json({ ok: true });
}

function clampNum(v: unknown): number {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100; // allow .5 marks
}
