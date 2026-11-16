import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from '@/lib/db';
import { oauthClient, appUrl, OAUTH_STATE_COOKIE } from '@/lib/auth/google';
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth/session';

const TEACHER_EMAILS = (process.env.NEXT_PUBLIC_TEACHER_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Step 2 of Google sign-in: verify Google's answer, find/create the user, set the session. */
export async function GET(req: NextRequest) {
  const base = appUrl(req);
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${code}`, base));
    res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: '/api/auth/google' });
    return res;
  };

  const params = req.nextUrl.searchParams;
  if (params.get('error')) return fail('cancelled');

  const code = params.get('code');
  const state = params.get('state');
  const expectedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) return fail('state');

  let sub: string, email: string, displayName: string, photoURL: string | null;
  try {
    const { client, clientId } = oauthClient(req);
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) return fail('token');
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || !p.email_verified) return fail('token');
    sub = p.sub;
    email = p.email.toLowerCase();
    displayName = p.name ?? 'User';
    photoURL = p.picture ?? null;
  } catch (err) {
    console.error('[auth/google/callback] token exchange failed:', err);
    return fail('token');
  }

  const allowedDomain = (process.env.NEXT_PUBLIC_ALLOWED_DOMAIN ?? '').toLowerCase();
  const isTeacher = TEACHER_EMAILS.includes(email);
  if (allowedDomain && !email.endsWith(`@${allowedDomain}`) && !isTeacher) return fail('domain');

  // Existing users keep their old (Firebase-era) uid, matched by email, so all
  // their submissions/XP stay attached. New users get Google's stable `sub`.
  let uid: string;
  try {
    const existing = await adminDb.collection('users').where('email', '==', email).limit(1).get();
    if (!existing.empty) {
      uid = existing.docs[0].id;
    } else {
      uid = sub;
      const role = isTeacher ? 'teacher' : 'student';
      await adminDb.collection('users').doc(uid).set({
        uid,
        email,
        displayName,
        photoURL,
        role,
        onboardingComplete: role === 'teacher',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    console.error('[auth/google/callback] profile error:', err);
    return fail('profile');
  }

  const res = NextResponse.redirect(new URL('/dashboard', base));
  res.cookies.set(SESSION_COOKIE, await createSessionToken({ uid, email }), sessionCookieOptions());
  res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: '/api/auth/google' });
  return res;
}
