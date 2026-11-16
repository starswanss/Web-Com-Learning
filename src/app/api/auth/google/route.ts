import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { oauthClient, appUrl, OAUTH_STATE_COOKIE } from '@/lib/auth/google';

/** Step 1 of Google sign-in: send the browser to Google's consent screen. */
export async function GET(req: NextRequest) {
  let client;
  try {
    ({ client } = oauthClient(req));
  } catch (err) {
    console.error('[auth/google] misconfigured:', err);
    return NextResponse.redirect(new URL('/login?error=config', appUrl(req)));
  }

  const state = randomBytes(24).toString('base64url');
  const allowedDomain = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN;
  const url = client.generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
    ...(allowedDomain ? { hd: allowedDomain } : {}),
  });

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/google',
    maxAge: 600,
  });
  return res;
}
