import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from '@/lib/db';
import { invalidateLeaderboards } from '@/lib/leaderboard-cache';
import { addSubmitters } from '@/lib/assignment-stats';

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

type Target = 'submitted' | 'not-submitted' | 'all';

/**
 * Give one score to a whole group at once. `target` chooses the group:
 *   submitted     — students who already submitted
 *   not-submitted — students who haven't (a submission is created for them)
 *   all           — everyone in the assignment's classes
 * `classId` (optional) narrows to a single class; otherwise all of the
 * assignment's classes are used. XP is awarded/adjusted like normal grading.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assignmentId } = await params;
  const { score, target, classId } = await req.json() as { score?: number; target?: Target; classId?: string | null };

  if (typeof score !== 'number' || score < 0 || score > 100) {
    return NextResponse.json({ error: 'คะแนนต้องอยู่ระหว่าง 0–100' }, { status: 400 });
  }
  if (!['submitted', 'not-submitted', 'all'].includes(target ?? '')) {
    return NextResponse.json({ error: 'target ไม่ถูกต้อง' }, { status: 400 });
  }

  const assignmentSnap = await adminDb.collection('assignments').doc(assignmentId).get();
  if (!assignmentSnap.exists || assignmentSnap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const assignment = assignmentSnap.data()!;
  let classIds: string[] = (assignment.classIds as string[]) ?? [];
  if (classId) {
    if (!classIds.includes(classId)) return NextResponse.json({ error: 'ห้องไม่อยู่ในงานนี้' }, { status: 400 });
    classIds = [classId];
  }
  if (classIds.length === 0) return NextResponse.json({ graded: 0, created: 0 });

  // Roster: students in those classes.
  const roster: Array<{ uid: string; name: string; classId: string }> = [];
  for (let i = 0; i < classIds.length; i += 10) {
    const chunk = classIds.slice(i, i + 10);
    const snap = await adminDb.collection('users')
      .where('classId', 'in', chunk).where('role', '==', 'student').get();
    snap.docs.forEach((d) => roster.push({
      uid: d.id,
      name: (d.data().displayName as string) ?? '',
      classId: (d.data().classId as string) ?? '',
    }));
  }

  // Existing submissions for this assignment → studentId → { id, xpAwarded }.
  const subsSnap = await adminDb.collection('submissions').where('assignmentId', '==', assignmentId).get();
  const existing = new Map<string, { id: string; xpAwarded: number }>();
  subsSnap.docs.forEach((d) => {
    const data = d.data();
    existing.set(data.studentId as string, { id: d.id, xpAwarded: (data.xpAwarded as number) ?? 0 });
  });

  // Pick the target students.
  const targets = roster.filter((s) => {
    const has = existing.has(s.uid);
    if (target === 'submitted') return has;
    if (target === 'not-submitted') return !has;
    return true; // 'all'
  });

  const newXp = score * 10;
  let graded = 0, created = 0;
  const createdIds: string[] = [];

  const CHUNK = 200; // each student = up to 2 ops (doc + user xp)
  let batch = adminDb.batch();
  let ops = 0;
  const flush = async () => { if (ops > 0) { await batch.commit(); batch = adminDb.batch(); ops = 0; } };

  for (const s of targets) {
    const ex = existing.get(s.uid);
    if (ex) {
      batch.update(adminDb.collection('submissions').doc(ex.id), {
        score, status: 'reviewed', reviewedAt: FieldValue.serverTimestamp(), xpAwarded: newXp,
      });
      ops++;
      const delta = newXp - ex.xpAwarded;
      if (delta !== 0) { batch.update(adminDb.collection('users').doc(s.uid), { xp: FieldValue.increment(delta) }); ops++; }
      graded++;
    } else {
      batch.set(adminDb.collection('submissions').doc(), {
        assignmentId,
        studentId: s.uid,
        studentName: s.name,
        classId: s.classId,
        content: null,
        answers: null,
        driveWebViewLink: null,
        score,
        feedback: null,
        plagiarismSuspicion: 0,
        tabSwitchCount: 0,
        status: 'reviewed',
        xpAwarded: newXp,
        submittedAt: FieldValue.serverTimestamp(),
        reviewedAt: FieldValue.serverTimestamp(),
      });
      ops++;
      if (newXp !== 0) { batch.update(adminDb.collection('users').doc(s.uid), { xp: FieldValue.increment(newXp) }); ops++; }
      created++;
      createdIds.push(s.uid);
    }
    if (ops >= CHUNK) await flush();
  }
  await flush();

  // New submissions were created for these students — record them.
  if (createdIds.length > 0) await addSubmitters(assignmentId, createdIds).catch(() => {});

  invalidateLeaderboards();
  return NextResponse.json({ graded, created, total: graded + created });
}
