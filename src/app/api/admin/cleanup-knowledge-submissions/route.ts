import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from '@/lib/db';
import { cookies } from 'next/headers';
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

/**
 * Knowledge sheets (ใบความรู้) are read-only, but before that rule was enforced
 * some students accidentally "submitted" them. This removes those stray
 * submissions and reverses the XP they were mistakenly awarded.
 *
 * GET  — preview (no writes)
 * POST { apply: true } — delete the stray submissions + reverse XP
 */
export async function GET() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return buildResult(uid, false);
}

export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.apply !== true) {
    return NextResponse.json({ error: 'Pass { apply: true } to confirm' }, { status: 400 });
  }
  return buildResult(uid, true);
}

async function buildResult(uid: string, apply: boolean) {
  // 1. This teacher's knowledge assignments.
  const assignmentsSnap = await adminDb
    .collection('assignments')
    .where('teacherId', '==', uid)
    .where('contentType', '==', 'knowledge')
    .get();

  const knowledgeIds = assignmentsSnap.docs.map((d) => d.id);
  if (knowledgeIds.length === 0) {
    return NextResponse.json({ knowledgeSheets: 0, straySubmissions: 0, xpReversed: 0, applied: apply });
  }

  // 2. Submissions on those assignments (Firestore 'in' limit is 30 → chunk).
  const straySubs: Array<{ id: string; studentId: string; xpAwarded: number }> = [];
  for (let i = 0; i < knowledgeIds.length; i += 30) {
    const chunk = knowledgeIds.slice(i, i + 30);
    const snap = await adminDb
      .collection('submissions')
      .where('assignmentId', 'in', chunk)
      .get();
    snap.docs.forEach((d) => {
      const data = d.data();
      straySubs.push({
        id: d.id,
        studentId: (data.studentId as string) ?? '',
        xpAwarded: (data.xpAwarded as number) ?? 0,
      });
    });
  }

  const xpReversed = straySubs.reduce((sum, s) => sum + s.xpAwarded, 0);

  if (apply && straySubs.length > 0) {
    // Sum XP to remove per student (a student may have >1 stray submission).
    const xpPerStudent = new Map<string, number>();
    for (const s of straySubs) {
      if (s.studentId && s.xpAwarded) {
        xpPerStudent.set(s.studentId, (xpPerStudent.get(s.studentId) ?? 0) + s.xpAwarded);
      }
    }

    const CHUNK = 400; // stay under the 500-op batch limit
    let batch = adminDb.batch();
    let count = 0;
    const flush = async () => { if (count > 0) { await batch.commit(); batch = adminDb.batch(); count = 0; } };

    for (const s of straySubs) {
      batch.delete(adminDb.collection('submissions').doc(s.id));
      if (++count >= CHUNK) await flush();
    }
    await flush();

    for (const [studentId, xp] of xpPerStudent) {
      batch.update(adminDb.collection('users').doc(studentId), { xp: FieldValue.increment(-xp) });
      if (++count >= CHUNK) await flush();
    }
    await flush();

    invalidateLeaderboards();
  }

  return NextResponse.json({
    knowledgeSheets: knowledgeIds.length,
    straySubmissions: straySubs.length,
    xpReversed,
    applied: apply,
  });
}
