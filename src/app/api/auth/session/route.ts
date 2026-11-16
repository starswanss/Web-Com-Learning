import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminDb } from '@/lib/firebase/admin';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/auth/session';

/** Current user's profile, or null when signed out / session invalid. */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get(SESSION_COOKIE)?.value;
    if (!session) return NextResponse.json(null);

    const { uid } = await verifySessionToken(session);
    const snap = await adminDb.collection('users').doc(uid).get();
    if (!snap.exists) return NextResponse.json(null);

    const data = snap.data()!;
    return NextResponse.json({
      uid,
      ...data,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    });
  } catch {
    return NextResponse.json(null);
  }
}

/** Sign out. (Sign-in is /api/auth/google.) */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json({ status: 'ok' });
}
