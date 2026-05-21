import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { uploadSubmissionFile } from '@/lib/storage';

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
    return {
      uid: decoded.uid,
      classId: data.classId as string,
      displayName: data.displayName as string,
    };
  } catch { return null; }
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const student = await getStudent();
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!student.classId) return NextResponse.json({ error: 'ไม่พบข้อมูลห้องเรียน' }, { status: 400 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'รองรับเฉพาะ JPG, PNG, GIF, WebP' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 10 MB' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadSubmissionFile(
      student.classId,
      student.displayName,
      buffer,
      file.type,
      `img-answer-${Date.now()}-${file.name}`,
    );
    return NextResponse.json({ url: result.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[student/upload-image]', msg);
    return NextResponse.json({ error: `อัปโหลดไม่สำเร็จ: ${msg}` }, { status: 500 });
  }
}
