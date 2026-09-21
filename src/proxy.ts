import { NextRequest, NextResponse } from 'next/server';

// Guest mode: /guest pages and /api/guest/* endpoints are read-only and need
// no session, so visitors can browse student work without logging in.
const PUBLIC_PATHS = ['/login', '/api/auth/session', '/guest', '/api/guest'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get('__session')?.value;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (session && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything EXCEPT: Next internals, the web manifest, and static
    // asset files. Without these exclusions the proxy redirects manifest/asset
    // requests to /login (HTML), which breaks manifest JSON parsing.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
