import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';
import { getLiveSubjectIds, studentSubjectId } from '@/lib/assignment-access';
import { studentSubmissions } from '@/lib/quest-requirement';

async function getStudent() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    if (data.role !== 'student') return null;
    return { uid: decoded.uid, classId: data.classId as string, subjectId: data.subjectId as string | undefined };
  } catch { return null; }
}

export async function GET() {
  const student = await getStudent();
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Find all teachers who teach this student's class (via subjects)
  const subjectsSnap = await adminDb.collection('subjects')
    .where('classIds', 'array-contains', student.classId)
    .get();

  // Build teacherId → {subjectId, subjectName} map
  const teacherSubjectMap = new Map<string, { subjectId: string; subjectName: string }>();
  subjectsSnap.docs.forEach((d) => {
    const tid = d.data().teacherId as string;
    if (!teacherSubjectMap.has(tid)) {
      teacherSubjectMap.set(tid, { subjectId: d.id, subjectName: (d.data().name as string) ?? '' });
    }
  });

  const teacherIds = [...new Set(subjectsSnap.docs.map((d) => d.data().teacherId as string))];
  if (teacherIds.length === 0) return NextResponse.json([]);

  // Fetch active quests for these teachers (Firestore `in` supports up to 30)
  const chunks: string[][] = [];
  for (let i = 0; i < teacherIds.length; i += 10) chunks.push(teacherIds.slice(i, i + 10));

  const questDocs = (await Promise.all(
    chunks.map((chunk) =>
      adminDb.collection('quests')
        .where('teacherId', 'in', chunk)
        .where('isActive', '==', true)
        .get()
    )
  )).flatMap((snap) => snap.docs);

  if (questDocs.length === 0) return NextResponse.json([]);

  // Filter: show quest if classIds is empty (all classes) OR includes student's class
  const visibleDocs = questDocs.filter((d) => {
    const classIds = (d.data().classIds ?? []) as string[];
    return classIds.length === 0 || classIds.includes(student.classId);
  });

  if (visibleDocs.length === 0) return NextResponse.json([]);

  // Quests tied to a subject or a worksheet: show only those for the student's
  // own subject, and hide a worksheet quest until the teacher opens that work.
  const mySubject = studentSubjectId({ subjectId: student.subjectId }, null, await getLiveSubjectIds());
  const requiredIds = [...new Set(visibleDocs.map((d) => d.data().requiredAssignmentId as string | undefined).filter(Boolean))] as string[];
  const [requiredSnaps, mine] = await Promise.all([
    Promise.all(requiredIds.map((id) => adminDb.collection('assignments').doc(id).get())),
    requiredIds.length ? studentSubmissions(student.uid) : Promise.resolve({ thisTerm: new Set<string>(), ever: new Set<string>() }),
  ]);
  const doneThisTerm = mine.thisTerm;
  const required = new Map(requiredSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()!]));
  const shownDocs = visibleDocs.filter((d) => {
    const q = d.data();
    if (q.subjectId && q.subjectId !== mySubject) return false;
    const reqId = q.requiredAssignmentId as string | undefined;
    if (!reqId) return true;
    const a = required.get(reqId);
    if (!a || a.subjectId !== mySubject) return false;
    // Submitted in an earlier term: it can't be submitted again, so the quest
    // could never be met — leave it out rather than show a dead "go submit".
    if (mine.ever.has(reqId) && !doneThisTerm.has(reqId)) return false;
    return a.isOpen !== false || doneThisTerm.has(reqId);
  });
  if (shownDocs.length === 0) return NextResponse.json([]);

  const today = new Date().toISOString().split('T')[0];

  // Fetch all claims for this student
  const claimsSnap = await adminDb.collection('questClaims')
    .where('studentId', '==', student.uid)
    .get();

  const claimedToday = new Set<string>();
  const claimedEver = new Set<string>();
  claimsSnap.docs.forEach((d) => {
    const data = d.data();
    claimedEver.add(data.questId as string);
    if (data.claimDate === today) claimedToday.add(data.questId as string);
  });

  const quests = shownDocs.map((d) => {
    const data = d.data();
    const id = d.id;
    const isClaimed = data.resetType === 'daily' ? claimedToday.has(id) : claimedEver.has(id);
    const subjectInfo = data.subjectId
      ? { subjectId: data.subjectId as string, subjectName: (subjectsSnap.docs.find((s) => s.id === data.subjectId)?.data().name as string) ?? '' }
      : teacherSubjectMap.get(data.teacherId as string);
    const reqId = data.requiredAssignmentId as string | undefined;
    return {
      id,
      title: data.title as string,
      description: (data.description ?? '') as string,
      xpReward: data.xpReward as number,
      icon: (data.icon ?? '⭐') as string,
      resetType: (data.resetType ?? 'daily') as 'daily' | 'once',
      isClaimed,
      subjectId: subjectInfo?.subjectId ?? null,
      subjectName: subjectInfo?.subjectName ?? null,
      // Worksheet the student must submit this term before claiming.
      requirement: reqId
        ? { assignmentId: reqId, title: (required.get(reqId)?.title as string) ?? '', done: doneThisTerm.has(reqId) }
        : null,
    };
  });

  quests.sort((a, b) => Number(a.isClaimed) - Number(b.isClaimed));

  return NextResponse.json(quests);
}
