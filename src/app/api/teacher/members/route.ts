import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { FieldValue } from '@/lib/db';
import { cookies } from 'next/headers';
import { cachedGlobal } from '@/lib/server-cache';
import { invalidateLeaderboards } from '@/lib/leaderboard-cache';

const STATS_TTL = 120_000; // 2 min; invalidated on member changes

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

  const subjectId = new URL(req.url).searchParams.get('subject');

  // Same for every teacher (all students) — one shared cache entry.
  const members = await cachedGlobal('members:all', STATS_TTL, async () => {
    const snap = await adminDb.collection('users').where('role', '==', 'student').get();
    return snap.docs.map(d => {
      const data = d.data();
      return {
        uid: d.id,
        displayName: (data.displayName as string) ?? '',
        email: (data.email as string) ?? '',
        classId: (data.classId as string) ?? '',
        subjectId: (data.subjectId as string) ?? null,
        onboardingComplete: !!(data.onboardingComplete),
        createdAt: data.createdAt?._seconds ?? null,
        xp: (data.xp as number) ?? 0,
      };
    }).sort((a, b) => {
      if (a.classId < b.classId) return -1;
      if (a.classId > b.classId) return 1;
      return a.displayName.localeCompare(b.displayName, 'th');
    });
  });

  // Filter to the students ENROLLED in the chosen subject. (Both subjects share
  // every room, so filtering by the subject's rooms kept everyone.)
  if (subjectId) {
    return NextResponse.json(members.filter((m) => m.subjectId === subjectId));
  }
  return NextResponse.json(members);
}

export async function DELETE(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { studentUid } = await req.json() as { studentUid: string };
  if (!studentUid) return NextResponse.json({ error: 'Missing studentUid' }, { status: 400 });

  const studentDoc = await adminDb.collection('users').doc(studentUid).get();
  if (!studentDoc.exists || studentDoc.data()?.role !== 'student') {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  // Delete the user document (sign-in is Google OAuth, so there is no separate login account)
  await adminDb.collection('users').doc(studentUid).delete();

  // Clean up related collections
  const [submissionsSnap, bonusSnap, claimsSnap] = await Promise.all([
    adminDb.collection('submissions').where('studentId', '==', studentUid).get(),
    adminDb.collection('bonusPoints').where('studentId', '==', studentUid).get(),
    adminDb.collection('questClaims').where('studentId', '==', studentUid).get(),
  ]);

  const batch = adminDb.batch();
  submissionsSnap.docs.forEach(d => batch.delete(d.ref));
  bonusSnap.docs.forEach(d => batch.delete(d.ref));
  claimsSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();

  invalidateLeaderboards(); // roster + stats changed
  return NextResponse.json({ ok: true });
}

/**
 * Change a student's room and/or subject. Students pick their subject once at
 * onboarding and can't change it themselves, so a teacher fixes a wrong pick
 * here (e.g. a student who enrolled in the other subject before the split).
 */
export async function PATCH(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { studentUid, classId, subjectId } = await req.json() as {
    studentUid: string; classId?: string; subjectId?: string | null;
  };
  if (!studentUid || (classId === undefined && subjectId === undefined)) {
    return NextResponse.json({ error: 'Missing studentUid, classId or subjectId' }, { status: 400 });
  }

  const studentDoc = await adminDb.collection('users').doc(studentUid).get();
  if (!studentDoc.exists || studentDoc.data()?.role !== 'student') {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }
  const current = studentDoc.data()!;
  const newClassId = classId ?? (current.classId as string | undefined);

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (classId !== undefined) {
    if (!/^ม\.3\/([1-9]|1[0-8])$/.test(classId)) {
      return NextResponse.json({ error: 'ห้องไม่ถูกต้อง' }, { status: 400 });
    }
    updates.classId = classId;
  }
  if (subjectId !== undefined) {
    if (subjectId === null) {
      updates.subjectId = FieldValue.delete();
    } else {
      const subj = await adminDb.collection('subjects').doc(subjectId).get();
      if (!subj.exists) return NextResponse.json({ error: 'ไม่พบวิชานี้' }, { status: 404 });
      const rooms = (subj.data()?.classIds as string[]) ?? [];
      if (newClassId && !rooms.includes(newClassId)) {
        return NextResponse.json({ error: `วิชานี้ไม่ได้เปิดให้ห้อง ${newClassId}` }, { status: 400 });
      }
      updates.subjectId = subjectId;
      // Room + subject set by the teacher = enrolment done; skip onboarding.
      if (newClassId) updates.onboardingComplete = true;
    }
  }

  await adminDb.collection('users').doc(studentUid).update(updates);
  invalidateLeaderboards(); // roster, rankings and every per-subject view changed
  return NextResponse.json({ ok: true });
}
