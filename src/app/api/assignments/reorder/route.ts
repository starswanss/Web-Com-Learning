import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { FieldValue } from '@/lib/db';
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
  } catch {
    return null;
  }
}

/**
 * Persist a manual display order for assignments. The body is the full ordered
 * list of ids for ONE content-type section; each assignment's `order` is set to
 * its index. Only assignments owned by the requesting teacher are touched. The
 * student dashboard and teacher page both sort by this `order`.
 */
export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).map(String) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'Missing ids' }, { status: 400 });

  const refs = ids.map((id) => adminDb.collection('assignments').doc(id));
  const snaps = await adminDb.getAll(...refs);

  const batch = adminDb.batch();
  let updated = 0;
  snaps.forEach((snap, i) => {
    if (snap.exists && snap.data()?.teacherId === uid) {
      batch.update(snap.ref, { order: i, updatedAt: FieldValue.serverTimestamp() });
      updated++;
    }
  });
  if (updated > 0) await batch.commit();

  invalidateLeaderboards(); // drops cached dashboards / stats that embed the list
  return NextResponse.json({ ok: true, updated });
}
