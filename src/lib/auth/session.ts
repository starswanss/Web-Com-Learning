import { SignJWT, jwtVerify } from 'jose';

/** Cookie name kept from the Firebase era so proxy.ts and every route keep working. */
export const SESSION_COOKIE = '__session';
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 5; // 5 days

export interface SessionClaims {
  uid: string;
  email: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.uid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_S}s`)
    .sign(secretKey());
}

/** Throws if the token is missing, tampered with or expired. */
export async function verifySessionToken(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
  if (!payload.sub) throw new Error('Session token has no subject');
  return { uid: payload.sub, email: typeof payload.email === 'string' ? payload.email : '' };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_S,
    path: '/',
    sameSite: 'lax' as const,
  };
}
