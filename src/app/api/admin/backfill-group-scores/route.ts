import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue, type DocumentData } from '@/lib/db';
import { invalidateLeaderboards } from '@/lib/leaderboard-cache';

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

// Backfill: every already-reviewed GROUP submission should have the score
// mirrored onto each member's individual `submissions` record (so gradebook,
// leaderboard and the student's own dashboard show it). XP was already awarded
// when the group was graded, so this only links the score — it does NOT touch
// user XP (records are written with xpAwarded set so the XP-backfill skips them).
//
// GET  — preview (no writes)
// POST { apply: true } — apply
export async function GET() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return buildResult(false);
}

export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.apply !== true) {
    return NextResponse.json({ error: 'Pass { apply: true } to confirm' }, { status: 400 });
  }
  return buildResult(true);
}

interface PlannedRecord {
  assignmentId: string;
  studentId: string;
  studentName: string;
  classId: string;
  content: unknown;
  answers: unknown;
  driveWebViewLink: unknown;
  score: number;
  feedback: string;
  xpAwarded: number;
  groupId: string;
  groupSubmissionId: string;
  submittedAt: unknown;
}

async function buildResult(apply: boolean) {
  const groupSubsSnap = await adminDb
    .collection('groupSubmissions')
    .where('status', '==', 'reviewed')
    .get();

  if (groupSubsSnap.empty) {
    return NextResponse.json({ groupSubmissions: 0, recordsCreated: 0, students: [], applied: apply });
  }

  // Resolve all referenced groups (member lists) in one pass.
  const groupIds = [...new Set(groupSubsSnap.docs.map((d) => d.data().groupId as string).filter(Boolean))];
  const groupMap = new Map<string, { memberIds: string[]; classId: string }>();
  await Promise.all(groupIds.map(async (gid) => {
    const g = await adminDb.collection('groups').doc(gid).get();
    if (g.exists) groupMap.set(gid, {
      memberIds: (g.data()!.memberIds as string[]) ?? [],
      classId: (g.data()!.classId as string) ?? '',
    });
  }));

  // Build the list of (groupSubmission, member) pairs and check which members
  // already have a submission record for that assignment.
  const planned: PlannedRecord[] = [];
  const checks: Array<{ gsId: string; data: DocumentData; memberId: string }> = [];
  for (const gsDoc of groupSubsSnap.docs) {
    const gs = gsDoc.data();
    const group = groupMap.get(gs.groupId as string);
    if (!group) continue;
    for (const memberId of group.memberIds) {
      checks.push({ gsId: gsDoc.id, data: gs, memberId });
    }
  }

  // Existence checks (one-time admin op — fine to fan out).
  const existing = await Promise.all(checks.map((c) =>
    adminDb.collection('submissions')
      .where('assignmentId', '==', c.data.assignmentId)
      .where('studentId', '==', c.memberId)
      .limit(1)
      .get(),
  ));

  const missing = checks.filter((_, i) => existing[i].empty);

  // Resolve member display names / classes for the records to create.
  const memberIds = [...new Set(missing.map((m) => m.memberId))];
  const nameMap = new Map<string, { displayName: string; classId: string }>();
  for (let i = 0; i < memberIds.length; i += 30) {
    const chunk = memberIds.slice(i, i + 30);
    if (chunk.length === 0) break;
    const snap = await adminDb.collection('users').where('__name__', 'in', chunk).get();
    snap.docs.forEach((d) => nameMap.set(d.id, {
      displayName: (d.data().displayName as string) ?? d.id,
      classId: (d.data().classId as string) ?? '',
    }));
  }

  for (const m of missing) {
    const gs = m.data;
    const group = groupMap.get(gs.groupId as string)!;
    const info = nameMap.get(m.memberId);
    planned.push({
      assignmentId: gs.assignmentId as string,
      studentId: m.memberId,
      studentName: info?.displayName ?? '',
      classId: info?.classId ?? group.classId,
      content: gs.content ?? null,
      answers: gs.answers ?? null,
      driveWebViewLink: gs.fileUrl ?? gs.driveWebViewLink ?? null,
      score: gs.score as number,
      feedback: (gs.feedback as string) ?? '',
      xpAwarded: ((gs.score as number) ?? 0) * 10,
      groupId: gs.groupId as string,
      groupSubmissionId: m.gsId,
      submittedAt: gs.submittedAt ?? null,
    });
  }

  if (apply && planned.length > 0) {
    const CHUNK = 400;
    for (let i = 0; i < planned.length; i += CHUNK) {
      const batch = adminDb.batch();
      for (const p of planned.slice(i, i + CHUNK)) {
        batch.set(adminDb.collection('submissions').doc(), {
          ...p,
          status: 'reviewed',
          plagiarismSuspicion: 0,
          tabSwitchCount: 0,
          submittedAt: p.submittedAt ?? FieldValue.serverTimestamp(),
          reviewedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
    invalidateLeaderboards();
  }

  // Summary of affected students.
  const studentAgg = new Map<string, { displayName: string; count: number }>();
  for (const p of planned) {
    const cur = studentAgg.get(p.studentId) ?? { displayName: p.studentName || p.studentId, count: 0 };
    cur.count += 1;
    studentAgg.set(p.studentId, cur);
  }
  const students = Array.from(studentAgg.entries())
    .map(([studentId, v]) => ({ studentId, displayName: v.displayName, count: v.count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    groupSubmissions: groupSubsSnap.size,
    recordsCreated: planned.length,
    students,
    applied: apply,
  });
}
