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

export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const subjectId = url.searchParams.get('subject');
  const assignmentId = url.searchParams.get('assignmentId'); // single assignment mode

  // Fetch assignments by teacher
  let assignmentsQuery = adminDb.collection('assignments').where('teacherId', '==', uid);
  if (subjectId) assignmentsQuery = assignmentsQuery.where('subjectId', '==', subjectId) as typeof assignmentsQuery;

  const assignmentsSnap = await assignmentsQuery.get();
  const assignments = assignmentsSnap.docs.map(d => ({
    id: d.id,
    title: (d.data().title as string) ?? '',
    classIds: (d.data().classIds as string[]) ?? [],
  }));

  // Filter to single assignment if requested
  const targetAssignments = assignmentId
    ? assignments.filter(a => a.id === assignmentId)
    : assignments;

  if (targetAssignments.length === 0) return NextResponse.json([]);

  // Collect all classIds across assignments
  const allClassIds = [...new Set(targetAssignments.flatMap(a => a.classIds))];

  // Fetch all students in those classes
  const studentsSnap = await adminDb.collection('users')
    .where('role', '==', 'student')
    .where('classId', 'in', allClassIds.slice(0, 10)) // Firestore 'in' limit = 10
    .get();

  const students = studentsSnap.docs.map(d => ({
    uid: d.id,
    name: (d.data().displayName as string) ?? '',
    classId: (d.data().classId as string) ?? '',
  }));

  // Fetch all submissions for target assignments
  const submissionsSnap = await adminDb.collection('submissions')
    .where('assignmentId', 'in', targetAssignments.slice(0, 10).map(a => a.id))
    .get();

  // Map: assignmentId → Set of studentIds who submitted
  const submittedMap = new Map<string, Set<string>>();
  submissionsSnap.docs.forEach(d => {
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
      submitted: submittedSet.size,
      notSubmitted: notSubmitted.length,
      notSubmittedNames: notSubmitted.map(s => ({ uid: s.uid, name: s.name, classId: s.classId })),
    };
  });

  return NextResponse.json(stats);
}
