import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { uploadAssignmentAttachment } from '@/lib/storage';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import { sendLineNotify, getLineNotifyToken } from '@/lib/line-notify';
import { trackReads, flushReadsIfDue } from '@/lib/read-tracker';
import { invalidateLeaderboards } from '@/lib/leaderboard-cache';

async function getTeacherUid(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'teacher') return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subjectId = new URL(req.url).searchParams.get('subject');
  const base = adminDb.collection('assignments').where('teacherId', '==', uid);
  const filtered = subjectId ? base.where('subjectId', '==', subjectId) : base;
  const snap = await filtered.get();
  const assignments = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (b.createdAt?._seconds ?? 0) - (a.createdAt?._seconds ?? 0));

  trackReads(uid, 1 + snap.size); // user doc + assignments
  await flushReadsIfDue();

  return NextResponse.json(assignments);
}

export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const title = formData.get('title') as string;
  const description = formData.get('description') as string;
  const dueDate = formData.get('dueDate') as string;
  const classIdsRaw = formData.get('classIds') as string | null;
  let classIds: string[] = classIdsRaw ? (JSON.parse(classIdsRaw) as string[]) : [];
  const file = formData.get('file') as File | null;
  const blocksRaw = formData.get('blocks') as string | null;
  const blocks = blocksRaw ? JSON.parse(blocksRaw) : [];
  const rubric = (formData.get('rubric') as string | null) ?? '';
  const subjectId = (formData.get('subjectId') as string | null) ?? '';
  const unit = (formData.get('unit') as string | null) ?? '';
  const contentType = (formData.get('contentType') as string | null) ?? 'worksheet';
  const timeLimitRaw = formData.get('timeLimit') as string | null;
  const timeLimit = timeLimitRaw ? parseInt(timeLimitRaw, 10) : null;
  const quizPhase = (formData.get('quizPhase') as string | null) ?? null;
  const pairedQuizId = (formData.get('pairedQuizId') as string | null) ?? null;
  const isGroupWork = formData.get('isGroupWork') === 'true';
  const groupSizeRaw = formData.get('groupSize') as string | null;
  const groupSize = groupSizeRaw ? parseInt(groupSizeRaw, 10) : null;
  const attitudeMaxRaw = formData.get('attitudeMax') as string | null;
  const attitudeMax = attitudeMaxRaw ? Math.max(0, parseInt(attitudeMaxRaw, 10) || 0) : null;

  // Classes are no longer chosen by the teacher: an assignment goes to EVERY
  // class in its subject (students in the subject all see it; their class is
  // recorded automatically when they submit). Derive from the subject here.
  if (classIds.length === 0 && subjectId) {
    const subjSnap = await adminDb.collection('subjects').doc(subjectId).get();
    if (subjSnap.exists && subjSnap.data()?.teacherId === uid) {
      classIds = (subjSnap.data()?.classIds as string[]) ?? [];
    }
  }

  // Title + subject required; due date is now optional for every type.
  if (!title || !subjectId || classIds.length === 0) {
    return NextResponse.json({ error: 'กรุณาเลือกวิชา และตั้งชื่องาน (วิชานี้ต้องมีห้องอย่างน้อย 1 ห้อง)' }, { status: 400 });
  }

  let fileUrl: string | undefined;
  let fileUploaded = false;

  if (file) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await uploadAssignmentAttachment(classIds[0], buffer, file.type, file.name);
      fileUrl = result.url;
      fileUploaded = true;
    } catch (err) {
      console.error('[assignments POST] Storage upload failed:', err instanceof Error ? err.message : err);
    }
  }

  // Tag with the active term so work can be viewed/filtered per term.
  let termYear = new Date().getFullYear() + 543;
  let termNo = 1;
  try {
    const cfg = await adminDb.collection('system').doc('config').get();
    const ct = cfg.exists ? cfg.data()?.currentTerm : null;
    if (ct && typeof ct.year === 'number') termYear = ct.year;
    if (ct && (ct.term === 1 || ct.term === 2)) termNo = ct.term;
  } catch { /* default to current year / term 1 */ }

  const docRef = await adminDb.collection('assignments').add({
    title,
    description,
    academicYear: termYear,
    term: termNo,
    dueDate: dueDate ? new Date(dueDate) : null,
    classIds,
    teacherId: uid,
    fileUrl: fileUrl ?? null,
    // Keep driveWebViewLink alias for backward compatibility with student page
    driveWebViewLink: fileUrl ?? null,
    blocks,
    rubric: rubric || null,
    subjectId: subjectId || null,
    unit: unit || null,
    contentType: contentType || 'worksheet',
    timeLimit: timeLimit ?? null,
    isOpen: contentType === 'quiz' ? false : true,
    quizPhase: quizPhase || null,
    pairedQuizId: pairedQuizId || null,
    isGroupWork: isGroupWork || false,
    groupSize: groupSize ?? null,
    attitudeMax: attitudeMax ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Best-effort LINE Notify
  const lineToken = await getLineNotifyToken(adminDb);
  if (lineToken) {
    const typeLabel = contentType === 'quiz' ? 'แบบทดสอบ' : contentType === 'knowledge' ? 'ใบความรู้' : 'ใบงาน';
    const classList = classIds.join(', ');
    const due = dueDate ? ` (กำหนดส่ง: ${new Date(dueDate).toLocaleDateString('th-TH')})` : '';
    sendLineNotify(lineToken, `\n📚 มอบหมาย${typeLabel}ใหม่\nชื่อ: ${title}\nห้อง: ${classList}${due}`);
  }

  return NextResponse.json({ id: docRef.id, fileUploaded, fileUrl: fileUrl ?? null }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const doc = await adminDb.collection('assignments').doc(id).get();
  if (!doc.exists || doc.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Remove the assignment AND its submissions so they no longer linger in
  // analytics / stats. Reverse the XP those submissions had awarded so student
  // totals stay correct.
  const subsSnap = await adminDb.collection('submissions').where('assignmentId', '==', id).get();
  const xpPerStudent = new Map<string, number>();
  subsSnap.docs.forEach((d) => {
    const data = d.data();
    const sid = data.studentId as string | undefined;
    const xp = (data.xpAwarded as number) ?? 0;
    if (sid && xp) xpPerStudent.set(sid, (xpPerStudent.get(sid) ?? 0) + xp);
  });

  const CHUNK = 400;
  let batch = adminDb.batch();
  let count = 0;
  const flush = async () => { if (count > 0) { await batch.commit(); batch = adminDb.batch(); count = 0; } };

  for (const d of subsSnap.docs) { batch.delete(d.ref); if (++count >= CHUNK) await flush(); }
  for (const [sid, xp] of xpPerStudent) {
    batch.update(adminDb.collection('users').doc(sid), { xp: FieldValue.increment(-xp) });
    if (++count >= CHUNK) await flush();
  }
  batch.delete(adminDb.collection('assignments').doc(id));
  count++;
  await flush();

  invalidateLeaderboards(); // clears analytics / overview / gradebook / stats caches
  return NextResponse.json({ status: 'ok', submissionsDeleted: subsSnap.size });
}
