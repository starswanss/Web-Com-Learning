import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { pacificDate } from '@/lib/read-tracker';
import { cachedGlobal } from '@/lib/server-cache';

/**
 * Per-student Firestore read counts for a given Pacific day, recorded by the
 * read-tracker. Teacher-only. Reads the day's `readStats/{date}/students`
 * shard docs (one small read per student) plus the students' names.
 */

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

export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const date = new URL(req.url).searchParams.get('date') || pacificDate();

  // Cache 60s — scanning the day's shard docs itself costs reads, so don't
  // re-scan on every dashboard load.
  const payload = await cachedGlobal(`read-stats:${date}`, 60_000, () => computeStats(date));
  return NextResponse.json(payload);
}

async function computeStats(date: string) {
  const snap = await adminDb.collection(`readStats/${date}/students`).get();

  const rows = snap.docs.map((d) => ({
    uid: d.id,
    reads: (d.data().reads as number) ?? 0,
    displayName: '' as string,
    classId: '' as string,
  }));

  // Resolve display names (chunked `in` queries, max 30 ids each).
  if (rows.length > 0) {
    const ids = rows.map((r) => r.uid);
    const nameMap = new Map<string, { displayName: string; classId: string }>();
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      const usersSnap = await adminDb.collection('users').where('__name__', 'in', chunk).get();
      usersSnap.docs.forEach((u) =>
        nameMap.set(u.id, {
          displayName: (u.data().displayName as string) ?? u.id,
          classId: (u.data().classId as string) ?? '',
        }),
      );
    }
    rows.forEach((r) => {
      const info = nameMap.get(r.uid);
      if (info) { r.displayName = info.displayName; r.classId = info.classId; }
    });
  }

  rows.sort((a, b) => b.reads - a.reads);
  const total = rows.reduce((sum, r) => sum + r.reads, 0);

  return { date, total, students: rows };
}
