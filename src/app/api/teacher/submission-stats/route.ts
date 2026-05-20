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
  } catch { return null; }
}

export interface AssignmentStat {
  assignmentId: string;
  title: string;
  totalStudents: number;
  submitted: number;
  notSubmitted: number;
  notSubmittedNames: Array<{ uid: string; name: string; classId: string }>;
}

async function queryInChunks<T>(
  collection: FirebaseFirestore.CollectionReference,
  field: string,
  values: string[],
  extraFilters?: (ref: FirebaseFirestore.Query) => FirebaseFirestore.Query
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  if (values.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < values.length; i += 10) chunks.push(values.slice(i, i + 10));

  const results = await Promise.all(
    chunks.map(chunk => {
      let q: FirebaseFirestore.Query = collection.where(field, 'in', chunk);
      if (extraFilters) q = extraFilters(q);
      return q.get();
    })
  );
  return results.flatMap(snap => snap.docs);
}

export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const subjectId = url.searchParams.get('subject');
  const assignmentId = url.searchParams.get('assignmentId');

  // Fetch active subjects for this teacher to filter out orphaned assignments
  const subjectsSnap = await adminDb.collection('subjects').where('teacherId', '==', uid).get();
  const activeSubjectIds = new Set(subjectsSnap.docs.map(d => d.id));

  // Fetch assignments by teacher
  let assignmentsQuery = adminDb.collection('assignments').where('teacherId', '==', uid);
  if (subjectId) {
    assignmentsQuery = assignmentsQuery.where('subjectId', '==', subjectId) as typeof assignmentsQuery;
  }

  const assignmentsSnap = await assignmentsQuery.get();
  const allAssignments = assignmentsSnap.docs
    .filter(d => {
      const sid = d.data().subjectId as string | null;
      // Only include assignments whose subjectId exists in active subjects
      return sid && activeSubjectIds.has(sid);
    })
    .map(d => ({
      id: d.id,
      title: (d.data().title as string) ?? '',
      classIds: (d.data().classIds as string[]) ?? [],
    }));

  const targetAssignments = assignmentId
    ? allAssignments.filter(a => a.id === assignmentId)
    : allAssignments;

  if (targetAssignments.length === 0) return NextResponse.json([]);

  // Collect all unique classIds
  const allClassIds = [...new Set(targetAssignments.flatMap(a => a.classIds))];

  // Fetch students across all classes — chunked (Firestore 'in' limit = 10)
  const studentDocs = await queryInChunks(
    adminDb.collection('users') as unknown as FirebaseFirestore.CollectionReference,
    'classId',
    allClassIds,
    q => q.where('role', '==', 'student')
  );

  const students = studentDocs.map(d => ({
    uid: d.id,
    name: (d.data().displayName as string) ?? '',
    classId: (d.data().classId as string) ?? '',
  }));

  // Fetch all submissions for target assignments — chunked
  const assignmentIds = targetAssignments.map(a => a.id);
  const submissionDocs = await queryInChunks(
    adminDb.collection('submissions') as unknown as FirebaseFirestore.CollectionReference,
    'assignmentId',
    assignmentIds
  );

  // Map: assignmentId → Set of studentIds who submitted
  const submittedMap = new Map<string, Set<string>>();
  submissionDocs.forEach(d => {
    const aid = d.data().assignmentId as string;
    const sid = d.data().studentId as string;
    if (!submittedMap.has(aid)) submittedMap.set(aid, new Set());
    submittedMap.get(aid)!.add(sid);
  });

  const stats: AssignmentStat[] = targetAssignments.map(a => {
    const classStudents = students.filter(s => a.classIds.includes(s.classId));
    const submittedSet = submittedMap.get(a.id) ?? new Set<string>();
    const notSubmitted = classStudents.filter(s => !submittedSet.has(s.uid));
    return {
      assignmentId: a.id,
      title: a.title,
      totalStudents: classStudents.length,
      submitted: Math.min(submittedSet.size, classStudents.length),
      notSubmitted: notSubmitted.length,
      notSubmittedNames: notSubmitted.map(s => ({ uid: s.uid, name: s.name, classId: s.classId })),
    };
  });

  return NextResponse.json(stats);
}
