import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';

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

// GET  — preview: show what will be fixed without writing anything
// POST — apply: write the XP updates to Firestore
export async function GET() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return buildResult(false);
}

export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Safety: require explicit { apply: true } body
  const body = await req.json().catch(() => ({}));
  if (body?.apply !== true) {
    return NextResponse.json({ error: 'Pass { apply: true } to confirm' }, { status: 400 });
  }
  return buildResult(true);
}

async function buildResult(apply: boolean) {
  // Find every reviewed submission that never received grading XP
  // (xpAwarded == null means the field is absent or explicitly null)
  const snap = await adminDb
    .collection('submissions')
    .where('status', '==', 'reviewed')
    .where('xpAwarded', '==', null)
    .get();

  if (snap.empty) {
    return NextResponse.json({ fixed: 0, totalXpAwarded: 0, studentsFixed: [], applied: apply });
  }

  // Accumulate per-student deltas
  const userDeltas = new Map<string, number>();   // studentId → XP to add
  const subUpdates: { id: string; xpAwarded: number }[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const score = data.score;
    const studentId = data.studentId as string | undefined;
    if (typeof score !== 'number' || score < 0 || !studentId) continue;

    const xp = Math.round(score * 10);
    subUpdates.push({ id: doc.id, xpAwarded: xp });
    userDeltas.set(studentId, (userDeltas.get(studentId) ?? 0) + xp);
  }

  if (subUpdates.length === 0) {
    return NextResponse.json({ fixed: 0, totalXpAwarded: 0, studentsFixed: [], applied: apply });
  }

  if (apply) {
    // Firestore batch limit = 500 writes. Split across multiple batches.
    const CHUNK = 400;

    // Collect all write descriptors
    type WriteOp =
      | { kind: 'sub'; id: string; xp: number }
      | { kind: 'user'; id: string; delta: number };

    const ops: WriteOp[] = [
      ...subUpdates.map((u): WriteOp => ({ kind: 'sub', id: u.id, xp: u.xpAwarded })),
      ...Array.from(userDeltas.entries()).map(([id, delta]): WriteOp => ({ kind: 'user', id, delta })),
    ];

    for (let i = 0; i < ops.length; i += CHUNK) {
      const batch = adminDb.batch();
      for (const op of ops.slice(i, i + CHUNK)) {
        if (op.kind === 'sub') {
          batch.update(adminDb.collection('submissions').doc(op.id), { xpAwarded: op.xp });
        } else {
          batch.update(adminDb.collection('users').doc(op.id), { xp: FieldValue.increment(op.delta) });
        }
      }
      await batch.commit();
    }
  }

  // Resolve display names for the summary
  const studentIds = Array.from(userDeltas.keys());
  const nameMap = new Map<string, string>();
  for (let i = 0; i < studentIds.length; i += 30) {
    const chunk = studentIds.slice(i, i + 30);
    const usersSnap = await adminDb.collection('users').where('__name__', 'in', chunk).get();
    usersSnap.docs.forEach((d) => nameMap.set(d.id, (d.data().displayName as string) ?? d.id));
  }

  const studentsFixed = Array.from(userDeltas.entries())
    .map(([id, xpAdded]) => ({ studentId: id, displayName: nameMap.get(id) ?? id, xpAdded }))
    .sort((a, b) => b.xpAdded - a.xpAdded);

  const totalXpAwarded = Array.from(userDeltas.values()).reduce((a, b) => a + b, 0);

  return NextResponse.json({
    fixed: subUpdates.length,
    totalXpAwarded,
    studentsFixed,
    applied: apply,
  });
}
