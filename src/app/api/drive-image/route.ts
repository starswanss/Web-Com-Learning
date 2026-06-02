import { NextRequest, NextResponse } from 'next/server';
import { downloadFileFromDrive } from '@/lib/google-drive';

const FILE_ID_RE = /^[a-zA-Z0-9_-]+$/;

// GET /api/drive-image?id=FILE_ID
// Proxies a Google Drive file through our server so <img> tags load correctly
// regardless of browser CORS / Google auth policy changes.
// Cached in browser for 24 hours.
export async function GET(req: NextRequest) {
  const fileId = new URL(req.url).searchParams.get('id');

  if (!fileId || !FILE_ID_RE.test(fileId)) {
    return new NextResponse('Missing or invalid id', { status: 400 });
  }

  try {
    const { data, mimeType } = await downloadFileFromDrive(fileId);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[drive-image]', fileId, msg);
    return new NextResponse('Not found', { status: 404 });
  }
}
