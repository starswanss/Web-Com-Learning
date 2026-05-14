import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import { ensureStudentFolder, uploadFileToDrive } from '@/lib/google-drive';
import { gradeSubmission, answersToText } from '@/lib/gemini';

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
    return { uid: decoded.uid, classId: data.classId as string, displayName: data.displayName as string };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const student = await getStudent();
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const assignmentId = formData.get('assignmentId') as string;
  const content = (formData.get('content') as string) ?? '';
  const answersRaw = formData.get('answers') as string | null;
  const answers = answersRaw ? (JSON.parse(answersRaw) as Record<string, string | string[]>) : null;
  const file = formData.get('file') as File | null;

  if (!assignmentId) return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 });
  if (!content.trim() && !answers && !file) {
    return NextResponse.json({ error: 'No content provided' }, { status: 400 });
  }

  const assignmentDoc = await adminDb.collection('assignments').doc(assignmentId).get();
  if (!assignmentDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const assignment = assignmentDoc.data()!;
  if (!(assignment.classIds as string[]).includes(student.classId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const existing = await adminDb
    .collection('submissions')
    .where('assignmentId', '==', assignmentId)
    .where('studentId', '==', student.uid)
    .limit(1)
    .get();
  if (!existing.empty) return NextResponse.json({ error: 'Already submitted' }, { status: 409 });

  // Run Drive upload and plagiarism context fetch in parallel
  const fileBuffer = file ? Buffer.from(await file.arrayBuffer()) : null;

  const [uploadResult, othersSnap] = await Promise.all([
    fileBuffer
      ? ensureStudentFolder(student.classId, student.displayName).then((folderId) =>
          uploadFileToDrive(folderId, fileBuffer, file!.type, file!.name)
        )
      : Promise.resolve(null),
    adminDb.collection('submissions').where('assignmentId', '==', assignmentId).limit(20).get(),
  ]);

  const driveFileId = uploadResult?.fileId;
  const driveWebViewLink = uploadResult?.webViewLink;
  const otherContents = othersSnap.docs.map((d) => d.data().content as string).filter(Boolean);

  let score = 0;
  let feedback = 'รอครูตรวจสอบ';
  let plagiarismSuspicion = 0;

  // For block-form answers, convert to text for AI grading
  const gradableContent = content.trim()
    ? content
    : answers && assignment.blocks
    ? answersToText(assignment.blocks as Array<{ id: string; type: string; question?: string }>, answers)
    : '';

  if (gradableContent) {
    try {
      const grading = await gradeSubmission(
        assignment.title as string,
        assignment.description as string,
        gradableContent,
        otherContents,
        assignment.rubric as string | undefined
      );
      score = grading.score;
      feedback = grading.feedback;
      plagiarismSuspicion = grading.plagiarismSuspicion;
    } catch {
      // AI grading failed — submission is saved, teacher grades manually
    }
  }

  const docRef = await adminDb.collection('submissions').add({
    assignmentId,
    studentId: student.uid,
    studentName: student.displayName,
    classId: student.classId,
    content: content || null,
    answers: answers ?? null,
    driveFileId: driveFileId ?? null,
    driveWebViewLink: driveWebViewLink ?? null,
    score,
    feedback,
    plagiarismSuspicion,
    status: gradableContent ? 'graded' : 'submitted',
    submittedAt: FieldValue.serverTimestamp(),
    gradedAt: gradableContent ? FieldValue.serverTimestamp() : null,
  });

  return NextResponse.json({ id: docRef.id, score, feedback }, { status: 201 });
}
