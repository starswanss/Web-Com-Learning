import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { trackReads, flushReadsIfDue } from '@/lib/read-tracker';

async function getStudentUid(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const uid = await getStudentUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const subjectId = params.get('subject');
  // classId passed from the client profile to avoid a redundant Firestore user doc read
  const classIdParam = params.get('classId');

  // Resolve classId: trust client param if provided (session already verified above),
  // otherwise fall back to reading the user doc
  let classId = classIdParam;
  if (!classId) {
    const snap = await adminDb.collection('users').doc(uid).get();
    if (!snap.exists || snap.data()?.role !== 'student' || !snap.data()?.classId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    classId = snap.data()!.classId as string;
  }

  const base = adminDb.collection('assignments').where('classIds', 'array-contains', classId);
  const filtered = subjectId ? base.where('subjectId', '==', subjectId) : base;

  const [assignmentsSnap, submissionsSnap] = await Promise.all([
    filtered.get(),
    adminDb.collection('submissions').where('studentId', '==', uid).get(),
  ]);

  // Attribute the docs this request read to the student (1 per returned doc;
  // +1 if we had to read the user doc above).
  trackReads(uid, assignmentsSnap.size + submissionsSnap.size + (classIdParam ? 0 : 1));
  await flushReadsIfDue();

  const submissionMap = new Map(
    submissionsSnap.docs.map((d) => [d.data().assignmentId as string, { id: d.id, ...d.data() }])
  );

  const assignments = assignmentsSnap.docs
    .map((d) => ({ id: d.id, ...d.data(), submission: submissionMap.get(d.id) ?? null }))
    .sort((a, b) => {
      const ta = (a as Record<string, unknown> & { dueDate?: { _seconds?: number } }).dueDate?._seconds ?? 0;
      const tb = (b as Record<string, unknown> & { dueDate?: { _seconds?: number } }).dueDate?._seconds ?? 0;
      return tb - ta;
    });

  return NextResponse.json(assignments);
}
