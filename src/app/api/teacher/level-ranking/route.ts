import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { calcLevel, DEFAULT_SETTINGS, LevelSettings } from '@/lib/xp';

async function getTeacherUid(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists || snap.data()?.role !== 'teacher') return null;
    return decoded.uid;
  } catch { return null; }
}

export async function GET() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [studentsSnap, settingsSnap] = await Promise.all([
    adminDb.collection('users').where('role', '==', 'student').get(),
    adminDb.doc('levelSettings/global').get(),
  ]);

  const settings: LevelSettings = settingsSnap.exists
    ? { ...DEFAULT_SETTINGS, ...settingsSnap.data() }
    : DEFAULT_SETTINGS;

  const students = studentsSnap.docs.map((d) => {
    const data = d.data();
    const xp = (data.xp as number) ?? 0;
    const info = calcLevel(xp, settings);
    return {
      uid: d.id,
      displayName: (data.displayName as string) ?? '',
      classId: (data.classId as string) ?? '',
      xp,
      level: info.level,
      icon: info.icon,
      title: info.title,
      currentXp: info.currentXp,
      nextLevelXp: info.nextLevelXp,
      progress: info.progress,
    };
  });

  students.sort((a, b) => b.xp - a.xp || a.displayName.localeCompare(b.displayName, 'th'));

  return NextResponse.json(students.slice(0, 50));
}
