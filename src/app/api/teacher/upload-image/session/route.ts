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

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB — the image goes straight to Drive

/**
 * POST — start a resumable Drive upload for a teacher content image; returns a
 * pre-authorised session URL the browser PUTs the bytes to directly. This keeps
 * images OUT of the assignment JSON (which was storing base64 data URLs and
 * blowing past the ~4.5 MB save-body limit, so assignments couldn't be saved).
 * Body: { filename, mimeType, size }
 */
export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { filename, mimeType, size } = await req.json() as {
    filename?: string; mimeType?: string; size?: number;
  };

  if (!mimeType || !/^image\//.test(mimeType)) {
    return NextResponse.json({ error: 'รองรับเฉพาะไฟล์รูปภาพ' }, { status: 400 });
  }
  if (typeof size !== 'number' || size <= 0 || size > MAX_SIZE) {
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 25 MB' }, { status: 400 });
  }

  try {
    const folderId = await ensureMediaFolder('Images');
    const ext = (filename?.split('.').pop() ?? 'jpg').toLowerCase();
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const clientOrigin = req.headers.get('origin') ?? new URL(req.url).origin;
    const uploadUrl = await createResumableUploadSession(folderId, safeName, mimeType, size, clientOrigin);
    return NextResponse.json({ uploadUrl });
  } catch (err) {
    console.error('[upload-image/session]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'เริ่มอัปโหลดไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 });
  }
}

/**
 * PATCH — finalise: make the file public and return the proxy URL so <img> loads
 * it (bypasses Google CORS/auth).
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
    return NextResponse.json({ url: `/api/drive-image?id=${fileId}` });
  } catch (err) {
    console.error('[upload-image/finalize]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'ตั้งค่าการเข้าถึงไฟล์ไม่สำเร็จ' }, { status: 500 });
  }
}
