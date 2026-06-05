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
const PROFILE_CACHE_KEY = 'lms_profile';

function loadCachedProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveProfileCache(p: UserProfile | null) {
  if (p) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
  else localStorage.removeItem(PROFILE_CACHE_KEY);
}

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
  const [profile, setProfile] = useState<UserProfile | null>(loadCachedProfile);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        saveProfileCache(null);
        setLoading(false);
        return;
      }

      // If the cached profile belongs to this user, show content instantly
      const cached = loadCachedProfile();
      if (cached?.uid === firebaseUser.uid) {
        setProfile(cached);
        setLoading(false);
        // Silently refresh in background
        fetch('/api/auth/session')
          .then((r) => (r.ok ? r.json() : null))
          .then((p) => { if (p) { setProfile(p); saveProfileCache(p); } })
          .catch(() => {});
        return;
      }

      // No matching cache — fetch and wait
      try {
        const res = await fetch('/api/auth/session');
        const p = res.ok ? await res.json() : null;
        setProfile((prev) => (prev?.uid === firebaseUser.uid && p === null ? prev : p));
        saveProfileCache(p);
      } catch {
        setProfile((prev) => (prev?.uid === firebaseUser.uid ? prev : null));
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  async function refreshProfile() {
    try {
      const res = await fetch('/api/auth/session');
      if (!res.ok) return;
      const p = await res.json();
      if (p && typeof p === 'object' && p.uid) {
        setProfile(p);
        saveProfileCache(p);
      }
    } catch {
      // Ignore network errors — keep existing profile
    }
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
      if (body.profile) {
        setProfile(body.profile);
        saveProfileCache(body.profile);
      }

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
    saveProfileCache(null);
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
