import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { cachedGlobal } from '@/lib/server-cache';
import { termKeyOf } from '@/lib/term';

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

/** The distinct terms present in this teacher's assignments + the active term. */
export async function GET() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await cachedGlobal(`terms:${uid}`, 60_000, async () => {
    const [assignSnap, cfgSnap] = await Promise.all([
      adminDb.collection('assignments').where('teacherId', '==', uid).get(),
      adminDb.collection('system').doc('config').get(),
    ]);
    const terms = Array.from(new Set(
      assignSnap.docs.map((d) => termKeyOf({ academicYear: d.data().academicYear, term: d.data().term })).filter(Boolean)
    )).sort((x, y) => y.localeCompare(x, undefined, { numeric: true }));

    const cfg = cfgSnap.exists ? cfgSnap.data() : null;
    const cy = (cfg?.currentTerm?.year as number) ?? (cfg?.academicYear as number) ?? null;
    const ct = (cfg?.currentTerm?.term as number) ?? null;
    const current = cy && ct ? `${cy}/${ct}` : '';
    const hasUntagged = assignSnap.docs.some((d) => !termKeyOf({ academicYear: d.data().academicYear, term: d.data().term }));

    return { current, terms, hasUntagged };
  });

  return NextResponse.json(result);
}
