/**
 * Append a width hint to our Drive image proxy URL so it returns a downscaled
 * WebP instead of the full-size original. No-op for non-proxy URLs (e.g. PDFs
 * or external links), so it is always safe to wrap an <img src>.
 */
export function driveThumb(url: string | undefined | null, w: number): string {
  if (!url) return '';
  return url.startsWith('/api/drive-image?') ? `${url}&w=${w}` : url;
}
