import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
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
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get('subject');

  const base = adminDb.collection('assignments').where('teacherId', '==', uid);
  const assignmentsSnap = subjectId
    ? await base.where('subjectId', '==', subjectId).orderBy('createdAt', 'desc').get()
    : await base.orderBy('createdAt', 'desc').get();

  if (assignmentsSnap.empty) return NextResponse.json([]);

  const assignmentIds = assignmentsSnap.docs.map((d) => d.id);

  // Batch query submissions (Firestore 'in' limit: 30)
  const submissionsSnap = await adminDb
    .collection('submissions')
    .where('assignmentId', 'in', assignmentIds.slice(0, 30))
    .get();

  // Count by status per assignment
  const countMap = new Map<string, { submitted: number; graded: number; reviewed: number }>();
  submissionsSnap.docs.forEach((d) => {
    const data = d.data();
    const aId = data.assignmentId as string;
    if (!countMap.has(aId)) countMap.set(aId, { submitted: 0, graded: 0, reviewed: 0 });
    const c = countMap.get(aId)!;
    if (data.status === 'submitted') c.submitted++;
    else if (data.status === 'graded') c.graded++;
    else if (data.status === 'reviewed') c.reviewed++;
  });

  const result = assignmentsSnap.docs.map((d) => {
    const data = d.data();
    const counts = countMap.get(d.id) ?? { submitted: 0, graded: 0, reviewed: 0 };
    return {
      id: d.id,
      title: data.title,
      contentType: data.contentType ?? 'worksheet',
      unit: data.unit ?? null,
      dueDate: data.dueDate ?? null,
      classIds: data.classIds ?? [],
      driveWebViewLink: data.driveWebViewLink ?? null,
      submittedCount: counts.submitted,
      gradedCount: counts.graded,
      reviewedCount: counts.reviewed,
      totalSubmissions: counts.submitted + counts.graded + counts.reviewed,
    };
  });

  return NextResponse.json(result);
}
