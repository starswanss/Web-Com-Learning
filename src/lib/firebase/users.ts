import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './client';
import type { UserProfile, UserRole } from '@/types';

const TEACHER_EMAILS = (process.env.NEXT_PUBLIC_TEACHER_EMAILS ?? '').split(',').map((e) => e.trim());

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName: string,
  photoURL?: string
): Promise<UserProfile> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    return {
      ...data,
      createdAt: (data.createdAt as Timestamp).toDate(),
      updatedAt: (data.updatedAt as Timestamp).toDate(),
    } as UserProfile;
  }

  const role: UserRole = TEACHER_EMAILS.includes(email) ? 'teacher' : 'student';
  const newUser: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
    uid,
    email,
    displayName,
    photoURL,
    role,
    onboardingComplete: role === 'teacher',
  };

  await setDoc(ref, {
    ...newUser,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { ...newUser, createdAt: new Date(), updatedAt: new Date() };
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    ...data,
    createdAt: (data.createdAt as Timestamp).toDate(),
    updatedAt: (data.updatedAt as Timestamp).toDate(),
  } as UserProfile;
}

export async function completeOnboarding(uid: string, classId: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    classId,
    onboardingComplete: true,
    updatedAt: serverTimestamp(),
  });
}
