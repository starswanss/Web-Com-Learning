import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import { ensureYearFolder } from '@/lib/google-drive';

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

function currentThaiYear(): number {
  return new Date().getFullYear() + 543;
}

export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const targetYear: number = body.year ?? currentThaiYear();

  // 1. Get all student users
  const usersSnap = await adminDb.collection('users').where('role', '==', 'student').get();
  if (usersSnap.empty) return NextResponse.json({ reset: 0, year: targetYear });

  // 2. Reset each student in batches of 500 (Firestore batch limit)
  const BATCH_SIZE = 500;
  const docs = usersSnap.docs;
  let reset = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = adminDb.batch();
    docs.slice(i, i + BATCH_SIZE).forEach((d) => {
      batch.update(d.ref, {
        onboardingComplete: false,
        classId: FieldValue.delete(),
        subjectId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      reset++;
    });
    await batch.commit();
  }

  // 3. Create new academic year folder in Drive
  let yearFolderId: string | null = null;
  try {
    yearFolderId = await ensureYearFolder(targetYear);
  } catch {
    // Drive creation failure should not block the reset
  }

  // 4. Log the reset in system config
  await adminDb.collection('system').doc('config').set({
    lastResetAt: FieldValue.serverTimestamp(),
    lastResetBy: uid,
    academicYear: targetYear,
    yearFolderDriveId: yearFolderId,
  }, { merge: true });

  return NextResponse.json({ reset, year: targetYear, yearFolderId });
}
