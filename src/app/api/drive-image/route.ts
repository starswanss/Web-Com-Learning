import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { downloadFileFromDrive } from '@/lib/google-drive';

export const runtime = 'nodejs'; // sharp needs the Node runtime

const FILE_ID_RE = /^[a-zA-Z0-9_-]+$/;

// GET /api/drive-image?id=FILE_ID[&w=WIDTH]
// Proxies a Google Drive file through our server so <img> tags load correctly
// regardless of browser CORS / Google auth policy changes.
// When `w` is given, raster images are downscaled to that width and re-encoded
// as WebP — far smaller payloads for thumbnails. Cached in browser for 24 hours.
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const fileId = params.get('id');
  const wRaw = params.get('w');
  const width = wRaw ? Math.min(2000, Math.max(32, parseInt(wRaw, 10) || 0)) : null;

  if (!fileId || !FILE_ID_RE.test(fileId)) {
    return new NextResponse('Missing or invalid id', { status: 400 });
  }

  try {
    const { data, mimeType } = await downloadFileFromDrive(fileId);

    // Resize raster images only; leave PDFs and other types untouched.
    if (width && /^image\/(jpe?g|png|webp|gif|avif)$/i.test(mimeType)) {
      try {
        const resized = await sharp(data, { animated: mimeType.includes('gif') })
          .rotate() // respect EXIF orientation
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 78 })
          .toBuffer();
        return new NextResponse(new Uint8Array(resized), {
          headers: {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400',
          },
        });
      } catch {
        // Fall through to serving the original if resizing fails.
      }
    }

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
