import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { DEFAULT_SETTINGS, LevelSettings } from '@/lib/xp';

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

const SETTINGS_DOC = 'levelSettings/global';

export async function GET() {
  const snap = await adminDb.doc(SETTINGS_DOC).get();
  if (!snap.exists) return NextResponse.json(DEFAULT_SETTINGS);
  return NextResponse.json({ ...DEFAULT_SETTINGS, ...snap.data() });
}

export async function PUT(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Partial<LevelSettings>;

  const settings: LevelSettings = {
    xpPerLevel: typeof body.xpPerLevel === 'number' && body.xpPerLevel > 0
      ? body.xpPerLevel
      : DEFAULT_SETTINGS.xpPerLevel,
    maxLevel: typeof body.maxLevel === 'number' && body.maxLevel > 0
      ? body.maxLevel
      : null,
    tiers: Array.isArray(body.tiers) && body.tiers.length > 0
      ? body.tiers.map(t => ({ fromLevel: Number(t.fromLevel), name: String(t.name), icon: String(t.icon) }))
      : DEFAULT_SETTINGS.tiers,
  };

  await adminDb.doc(SETTINGS_DOC).set(settings);
  return NextResponse.json(settings);
}
