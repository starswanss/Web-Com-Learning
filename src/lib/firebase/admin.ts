/**
 * Server-side data + auth handles.
 *
 * The app used to run on Firebase (Firestore + Firebase Auth). It is now
 * self-hosted: `adminDb` is the SQLite-backed Firestore-compatible layer in
 * `@/lib/db`, and `adminAuth` verifies our own signed session cookie. Both keep
 * the old shapes so the API routes did not need rewriting.
 *
 * The path is kept (`lib/firebase/admin`) because ~80 routes import it.
 */
import { getDb } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth/session';

export const adminDb = getDb();

export const adminAuth = {
  /** Same contract as Firebase's: resolves `{ uid, email }` or throws. */
  async verifySessionCookie(sessionCookie: string, _checkRevoked = false) {
    void _checkRevoked;
    return verifySessionToken(sessionCookie);
  },
  /**
   * Firebase used to hold a separate login account per user. Sign-in now goes
   * straight through Google, so there is no account to delete: removing the
   * `users` document (which callers already do) is enough.
   */
  async deleteUser(_uid: string) {
    void _uid;
  },
};
