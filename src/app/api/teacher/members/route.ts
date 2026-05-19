import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
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

export async function GET() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const snap = await adminDb.collection('users').where('role', '==', 'student').get();

  const members = snap.docs.map(d => {
    const data = d.data();
    return {
      uid: d.id,
      displayName: (data.displayName as string) ?? '',
      email: (data.email as string) ?? '',
      classId: (data.classId as string) ?? '',
      onboardingComplete: !!(data.onboardingComplete),
      createdAt: data.createdAt?._seconds ?? null,
      xp: (data.xp as number) ?? 0,
    };
  }).sort((a, b) => {
    if (a.classId < b.classId) return -1;
    if (a.classId > b.classId) return 1;
    return a.displayName.localeCompare(b.displayName, 'th');
  });

  return NextResponse.json(members);
}

export async function PATCH(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { studentUid, classId } = await req.json() as { studentUid: string; classId: string };
  if (!studentUid || !classId) {
    return NextResponse.json({ error: 'Missing studentUid or classId' }, { status: 400 });
  }

  const studentDoc = await adminDb.collection('users').doc(studentUid).get();
  if (!studentDoc.exists || studentDoc.data()?.role !== 'student') {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  await adminDb.collection('users').doc(studentUid).update({
    classId,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
