import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { ensureMediaFolder, createResumableUploadSession, makeFilePublic } from '@/lib/google-drive';

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

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB — the file goes straight to Drive

/**
 * POST — start a resumable Drive upload; returns a pre-authorised session URL
 * the browser uploads the file bytes to directly. This bypasses the hosting
 * platform's ~4.5 MB request-body limit that blocks large PDFs.
 * Body: { filename, mimeType, size }
 */
export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { filename, mimeType, size } = await req.json() as {
    filename?: string; mimeType?: string; size?: number;
  };

  if (mimeType !== 'application/pdf') {
    return NextResponse.json({ error: 'รองรับเฉพาะไฟล์ PDF' }, { status: 400 });
  }
  if (typeof size !== 'number' || size <= 0 || size > MAX_SIZE) {
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 50 MB' }, { status: 400 });
  }

  try {
    const folderId = await ensureMediaFolder('PDFs');
    const ext = (filename?.split('.').pop() ?? 'pdf').toLowerCase();
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const uploadUrl = await createResumableUploadSession(folderId, safeName, mimeType, size);
    return NextResponse.json({ uploadUrl });
  } catch (err) {
    console.error('[upload-pdf/session]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'เริ่มอัปโหลดไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 });
  }
}

/**
 * PATCH — finalise a direct upload: make the file public and return its URL.
 * Body: { fileId }
 */
export async function PATCH(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fileId } = await req.json() as { fileId?: string };
  if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
    return NextResponse.json({ error: 'fileId ไม่ถูกต้อง' }, { status: 400 });
  }

  try {
    await makeFilePublic(fileId);
    return NextResponse.json({ url: `https://drive.google.com/file/d/${fileId}/preview` });
  } catch (err) {
    console.error('[upload-pdf/finalize]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'ตั้งค่าการเข้าถึงไฟล์ไม่สำเร็จ' }, { status: 500 });
  }
}
