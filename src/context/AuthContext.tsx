'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserProfile } from '@/types';

const PROFILE_CACHE_KEY = 'lms_profile';

/** Fields pages read from `user` (previously the Firebase `User`). */
export interface AuthUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
}

const LOGIN_ERRORS: Record<string, string> = {
  domain: `เฉพาะบัญชี @${process.env.NEXT_PUBLIC_ALLOWED_DOMAIN ?? ''} เท่านั้น`,
  cancelled: 'ยกเลิกการเข้าสู่ระบบ',
  state: 'เข้าสู่ระบบไม่สำเร็จ: หมดเวลา กรุณาลองใหม่',
  token: 'เข้าสู่ระบบไม่สำเร็จ: ยืนยันตัวตนกับ Google ไม่ได้',
  profile: 'เข้าสู่ระบบไม่สำเร็จ: โหลดข้อมูลผู้ใช้ไม่ได้',
  config: 'ระบบเข้าสู่ระบบยังไม่ได้ตั้งค่า (GOOGLE_OAUTH_CLIENT_ID)',
};

function loadCachedProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveProfileCache(p: UserProfile | null) {
  try {
    if (p) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
    else localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // storage unavailable (private mode) — cache is only an optimisation
  }
}

function toUser(p: UserProfile | null): AuthUser | null {
  if (!p) return null;
  return { uid: p.uid, email: p.email, displayName: p.displayName ?? null, photoURL: p.photoURL ?? null };
}

async function fetchProfile(): Promise<UserProfile | null> {
  const res = await fetch('/api/auth/session', { cache: 'no-store' });
  if (!res.ok) return null;
  const p = await res.json();
  return p && typeof p === 'object' && p.uid ? (p as UserProfile) : null;
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(loadCachedProfile);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Reads browser-only state (URL, localStorage) once after mount; doing it during
  // render would mismatch the server-rendered HTML.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Errors from the Google callback come back as /login?error=<code>.
    const code = new URLSearchParams(window.location.search).get('error');
    if (code) setError(LOGIN_ERRORS[code] ?? 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่');

    // A cached profile renders instantly; the server session is the source of truth.
    // Not on /login: a stale cache there would bounce to /dashboard and back.
    if (loadCachedProfile() && window.location.pathname !== '/login') setLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */

    let cancelled = false;
    fetchProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        saveProfileCache(p);
      })
      .catch(() => {
        // Network error: keep whatever we had rather than logging the user out.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshProfile() {
    try {
      const p = await fetchProfile();
      if (p) {
        setProfile(p);
        saveProfileCache(p);
      }
    } catch {
      // Ignore network errors — keep existing profile
    }
  }

  async function signInWithGoogle() {
    setError(null);
    window.location.href = '/api/auth/google';
  }

  async function signOut() {
    await fetch('/api/auth/session', { method: 'DELETE' });
    saveProfileCache(null);
    setProfile(null);
    router.push('/login');
  }

  return (
    <AuthContext.Provider
      value={{ user: toUser(profile), profile, loading, error, signInWithGoogle, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
