'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useRouter } from 'next/navigation';
import type { UserProfile } from '@/types';

const ALLOWED_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN ?? '';
const TEACHER_EMAILS = (process.env.NEXT_PUBLIC_TEACHER_EMAILS ?? '').split(',').map((e) => e.trim());

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/auth/session');
        const p = res.ok ? await res.json() : null;
        setProfile((prev) => (prev?.uid === firebaseUser.uid && p === null ? prev : p));
      } catch {
        setProfile((prev) => (prev?.uid === firebaseUser.uid ? prev : null));
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  async function refreshProfile() {
    const res = await fetch('/api/auth/session');
    const p = res.ok ? await res.json() : null;
    setProfile(p);
  }

  async function signInWithGoogle() {
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      if (ALLOWED_DOMAIN) {
        provider.setCustomParameters({ hd: ALLOWED_DOMAIN });
      }

      const result = await signInWithPopup(auth, provider);

      const email = result.user.email ?? '';
      const isTeacher = TEACHER_EMAILS.includes(email);
      if (ALLOWED_DOMAIN && !email.endsWith(`@${ALLOWED_DOMAIN}`) && !isTeacher) {
        await firebaseSignOut(auth);
        setError(`เฉพาะบัญชี @${ALLOWED_DOMAIN} เท่านั้น`);
        return;
      }

      // Session cookie + user doc created server-side in one call
      const idToken = await result.user.getIdToken();
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const body = await res.text();
        setError(`Session API ${res.status}: ${body}`);
        return;
      }

      const body = await res.json();
      if (body.profile) setProfile(body.profile);

      // Hard navigation so the browser sends the fresh session cookie and
      // onAuthStateChanged loads the profile from a clean state.
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      setError('เข้าสู่ระบบไม่สำเร็จ: ' + (code || 'กรุณาลองใหม่'));
    }
  }

  async function signOut() {
    await firebaseSignOut(auth);
    await fetch('/api/auth/session', { method: 'DELETE' });
    setUser(null);
    setProfile(null);
    router.push('/login');
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, error, signInWithGoogle, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
