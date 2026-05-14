import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';

const SESSION_DURATION_MS = 60 * 60 * 24 * 5 * 1000; // 5 days
const TEACHER_EMAILS = (process.env.NEXT_PUBLIC_TEACHER_EMAILS ?? '').split(',').map((e) => e.trim());

export async function POST(req: NextRequest) {
  // Step 1: verify the ID token and create the session cookie
  let uid: string;
  let email: string;
  let displayName: string;
  let photoURL: string | null;

  try {
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
    email = decoded.email ?? '';
    displayName = (decoded['name'] as string | undefined) ?? 'User';
    photoURL = (decoded['picture'] as string | undefined) ?? null;

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_DURATION_MS,
    });

    const cookieStore = await cookies();
    cookieStore.set('__session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_DURATION_MS / 1000,
      path: '/',
      sameSite: 'lax',
    });
  } catch (err) {
    console.error('[session] auth error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: get or create user profile — failure here does NOT block login
  let profile: Record<string, unknown> | null = null;
  try {
    const userRef = adminDb.collection('users').doc(uid);
    const snap = await userRef.get();

    if (snap.exists) {
      const data = snap.data()!;
      profile = {
        uid,
        ...data,
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
        updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
      };
    } else {
      const role = TEACHER_EMAILS.includes(email) ? 'teacher' : 'student';
      const now = new Date();
      const newUser = {
        uid,
        email,
        displayName,
        photoURL,
        role,
        onboardingComplete: role === 'teacher',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      await userRef.set(newUser);
      profile = { uid, email, displayName, photoURL, role, onboardingComplete: role === 'teacher', createdAt: now, updatedAt: now };
    }
  } catch (err) {
    console.error('[session] profile error:', err);
    // Session cookie is already set — profile will be loaded on next page visit
  }

  return NextResponse.json({ status: 'ok', profile });
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return NextResponse.json(null);

    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists) return NextResponse.json(null);

    const data = snap.data()!;
    return NextResponse.json({
      uid: decoded.uid,
      ...data,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    });
  } catch {
    return NextResponse.json(null);
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('__session');
  return NextResponse.json({ status: 'ok' });
}
