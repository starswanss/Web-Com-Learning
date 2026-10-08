import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import { uploadSubmissionFile } from '@/lib/storage';
import { calcXpGain } from '@/lib/xp';
import { invalidateLeaderboards } from '@/lib/leaderboard-cache';
import { rateLimit } from '@/lib/rate-limit';

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

  if (!rateLimit(`submit:${student.uid}`, 10, 60_000)) {
    return NextResponse.json({ error: 'มีการส่งบ่อยเกินไป กรุณารอสักครู่' }, { status: 429 });
  }

  const formData = await req.formData();
  const assignmentId = formData.get('assignmentId') as string;
  const content = (formData.get('content') as string) ?? '';
  const answersRaw = formData.get('answers') as string | null;
  const answers = answersRaw ? (JSON.parse(answersRaw) as Record<string, string | string[]>) : null;
  const file = formData.get('file') as File | null;
  // Pre-uploaded Drive URL (from /api/student/upload-image)
  const preUploadedFileUrl = (formData.get('fileUrl') as string | null) ?? null;
  const tabSwitchRaw = formData.get('tabSwitchCount') as string | null;
  const tabSwitchCount = tabSwitchRaw ? parseInt(tabSwitchRaw, 10) : 0;
  const burstRaw = formData.get('burstInsertCount') as string | null;
  const burstInsertCount = burstRaw ? parseInt(burstRaw, 10) : 0;
  const selfScoreRaw = formData.get('selfScore') as string | null;
  const selfScore = selfScoreRaw ? parseInt(selfScoreRaw, 10) : null;

  if (!assignmentId) return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 });
  if (!content.trim() && !answers && !file && !preUploadedFileUrl) {
    return NextResponse.json({ error: 'No content provided' }, { status: 400 });
  }

  const assignmentDoc = await adminDb.collection('assignments').doc(assignmentId).get();
  if (!assignmentDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const assignment = assignmentDoc.data()!;
  if (!(assignment.classIds as string[]).includes(student.classId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Knowledge sheets are read-only — they can't be submitted.
  if (assignment.contentType === 'knowledge') {
    return NextResponse.json({ error: 'ใบความรู้ไม่ต้องส่งงาน' }, { status: 400 });
  }

  if (assignment.isOpen === false) {
    return NextResponse.json({ error: 'Assignment is closed' }, { status: 423 });
  }

  const existing = await adminDb
    .collection('submissions')
    .where('assignmentId', '==', assignmentId)
    .where('studentId', '==', student.uid)
    .limit(1)
    .get();
  if (!existing.empty) return NextResponse.json({ error: 'Already submitted' }, { status: 409 });

  // Use pre-uploaded Drive URL if provided, otherwise upload raw file
  let driveWebViewLink: string | null = preUploadedFileUrl;
  if (!driveWebViewLink && file) {
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await uploadSubmissionFile(student.classId, student.displayName, fileBuffer, file.type, file.name)
      .catch((err) => { console.error('[submissions] upload failed:', err); return null; });
    driveWebViewLink = uploadResult?.url ?? null;
  }
  const xpGain = calcXpGain(null); // base XP for submitting; score-based XP added when teacher grades

  const [docRef] = await Promise.all([
    adminDb.collection('submissions').add({
      assignmentId,
      studentId: student.uid,
      studentName: student.displayName,
      classId: student.classId,
      content: content || null,
      answers: answers ?? null,
      driveWebViewLink: driveWebViewLink ?? null,
      score: null,
      feedback: null,
      plagiarismSuspicion: 0,
      tabSwitchCount,
      burstInsertCount,
      selfScore: selfScore ?? null,
      status: 'submitted',
      xpAwarded: xpGain,
      submittedAt: FieldValue.serverTimestamp(),
      gradedAt: null,
    }),
    adminDb.collection('users').doc(student.uid).update({
      xp: FieldValue.increment(xpGain),
    }),
  ]);

  invalidateLeaderboards(); // submittedCount + xp changed

  return NextResponse.json({ id: docRef.id, score: null, feedback: null, graded: false, xpGain }, { status: 201 });
}

// ── PATCH: student edits / resubmits their own work (while not yet reviewed) ───────
export async function PATCH(req: NextRequest) {
  const student = await getStudent();
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!rateLimit(`edit:${student.uid}`, 15, 60_000)) {
    return NextResponse.json({ error: 'แก้ไขบ่อยเกินไป กรุณารอสักครู่' }, { status: 429 });
  }

  const formData = await req.formData();
  const assignmentId = formData.get('assignmentId') as string;
  const content = (formData.get('content') as string) ?? '';
  const answersRaw = formData.get('answers') as string | null;
  const answers = answersRaw ? (JSON.parse(answersRaw) as Record<string, string | string[]>) : null;
  const preUploadedFileUrl = (formData.get('fileUrl') as string | null) ?? null;
  const tabSwitchRaw = formData.get('tabSwitchCount') as string | null;
  const burstRaw = formData.get('burstInsertCount') as string | null;

  if (!assignmentId) return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 });

  const existing = await adminDb
    .collection('submissions')
    .where('assignmentId', '==', assignmentId)
    .where('studentId', '==', student.uid)
    .limit(1)
    .get();
  if (existing.empty) return NextResponse.json({ error: 'ยังไม่ได้ส่งงานนี้' }, { status: 404 });

  const doc = existing.docs[0];
  if (doc.data().status === 'reviewed') {
    return NextResponse.json({ error: 'งานนี้ครูตรวจแล้ว แก้ไขไม่ได้' }, { status: 403 });
  }

  // Replace the answers/content and reset grading (teacher re-grades). XP stays.
  const update: Record<string, unknown> = {
    content: content || null,
    answers: answers ?? null,
    status: 'submitted',
    score: null,
    feedback: null,
    plagiarismSuspicion: 0,
    gradedAt: null,
    reviewedAt: null,
    submittedAt: FieldValue.serverTimestamp(),
  };
  if (preUploadedFileUrl) update.driveWebViewLink = preUploadedFileUrl;
  if (tabSwitchRaw) update.tabSwitchCount = parseInt(tabSwitchRaw, 10) || 0;
  if (burstRaw) update.burstInsertCount = parseInt(burstRaw, 10) || 0;

  await doc.ref.update(update);
  invalidateLeaderboards();

  return NextResponse.json({ id: doc.id, ok: true });
}
