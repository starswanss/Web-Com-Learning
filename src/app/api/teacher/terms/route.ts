import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
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

/** The distinct terms in this teacher's assignments and their submissions, + the active term. */
export async function GET() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await cachedGlobal(`terms:${uid}`, 60_000, async () => {
    const [assignSnap, cfgSnap] = await Promise.all([
      adminDb.collection('assignments').where('teacherId', '==', uid).get(),
      adminDb.collection('system').doc('config').get(),
    ]);
    const termSet = new Set(
      assignSnap.docs.map((d) => termKeyOf({ academicYear: d.data().academicYear, term: d.data().term })).filter(Boolean)
    );
    // Worksheets are reused every term and usually carry no term; the term
    // lives on each submission, so list every term work was submitted in.
    const ids = assignSnap.docs.map((d) => d.id);
    for (let i = 0; i < ids.length; i += 30) {
      const snap = await adminDb.collection('submissions').where('assignmentId', 'in', ids.slice(i, i + 30)).get();
      snap.docs.forEach((d) => {
        const k = termKeyOf({ academicYear: d.data().academicYear, term: d.data().term });
        if (k) termSet.add(k);
      });
    }

    const cfg = cfgSnap.exists ? cfgSnap.data() : null;
    const cy = (cfg?.currentTerm?.year as number) ?? (cfg?.academicYear as number) ?? null;
    const ct = (cfg?.currentTerm?.term as number) ?? null;
    const current = cy && ct ? `${cy}/${ct}` : '';
    // Always expose the active term so menus can default to it right after a
    // term switch, even before any assignment has been tagged for it.
    if (current) termSet.add(current);
    const terms = Array.from(termSet).sort((x, y) => y.localeCompare(x, undefined, { numeric: true }));

    const hasUntagged = assignSnap.docs.some((d) => !termKeyOf({ academicYear: d.data().academicYear, term: d.data().term }));

    return { current, terms, hasUntagged };
  });

  return NextResponse.json(result);
}
