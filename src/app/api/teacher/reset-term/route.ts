import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { FieldValue } from '@/lib/db';
import { ensureYearFolder } from '@/lib/google-drive';
import { invalidateGlobal } from '@/lib/server-cache';
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

function currentThaiYear(): number {
  return new Date().getFullYear() + 543;
}

// Return the active term so the UI can show / default to it.
export async function GET() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const snap = await adminDb.collection('system').doc('config').get();
  const data = snap.exists ? snap.data() : null;
  const year = (data?.currentTerm?.year as number) ?? (data?.academicYear as number) ?? currentThaiYear();
  const term = (data?.currentTerm?.term as number) ?? 1;
  return NextResponse.json({ currentTerm: { year, term } });
}

export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const targetYear: number = body.year ?? currentThaiYear();
  const term: number = body.term === 2 ? 2 : 1; // เทอม 1 หรือ 2
  // Only wipe students (class/subject/onboarding) when explicitly asked — e.g. a
  // brand-new academic year. Switching term keeps the same students.
  const wipeStudents: boolean = body.wipeStudents === true;

  let reset = 0;
  if (wipeStudents) {
    const usersSnap = await adminDb.collection('users').where('role', '==', 'student').get();
    const BATCH_SIZE = 500;
    const docs = usersSnap.docs;
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
  }

  // Create the year folder in Drive.
  let yearFolderId: string | null = null;
  try {
    yearFolderId = await ensureYearFolder(targetYear);
  } catch {
    // Drive creation failure should not block the reset
  }

  // Set the active term — new assignments are tagged with it; teachers can still
  // view past terms' work.
  await adminDb.collection('system').doc('config').set({
    lastResetAt: FieldValue.serverTimestamp(),
    lastResetBy: uid,
    academicYear: targetYear,
    currentTerm: { year: targetYear, term },
    yearFolderDriveId: yearFolderId,
  }, { merge: true });

  // The active term changed — drop the terms list cache and all term-keyed
  // dashboards so every menu re-reads the new current term immediately.
  invalidateGlobal(`terms:${uid}`);
  invalidateLeaderboards();

  return NextResponse.json({ reset, year: targetYear, term, wipedStudents: wipeStudents, yearFolderId });
}
