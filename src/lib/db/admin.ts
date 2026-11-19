/**
 * Server-side data + auth handles used by the API routes.
 *
 * `adminDb` is the SQLite database (a Firestore-style API, see `@/lib/db`), and
 * `adminAuth` verifies our own signed session cookie.
 */
import { getDb } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth/session';

export const adminDb = getDb();

export const adminAuth = {
  /** Resolves `{ uid, email }` for a valid session cookie, or throws. */
  async verifySessionCookie(sessionCookie: string, _checkRevoked = false) {
    void _checkRevoked;
    return verifySessionToken(sessionCookie);
  },
};
