import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/db/admin';
import { cookies } from 'next/headers';

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

export interface MedalType {
  id: string;
  icon: string;
  label: string;
  desc: string;
  color: string;
  isDefault?: boolean;
}

export const DEFAULT_MEDALS: MedalType[] = [
  { id: 'gold',    icon: '⭐', label: 'Gold Star',     desc: 'ผลงานดีเยี่ยม',      color: 'border-yellow-600 bg-yellow-950/40 text-yellow-300', isDefault: true },
  { id: 'diamond', icon: '💎', label: 'Diamond',       desc: 'ความพยายามพิเศษ',    color: 'border-cyan-600 bg-cyan-950/40 text-cyan-300',       isDefault: true },
  { id: 'silver',  icon: '🏅', label: 'Silver Medal',  desc: 'ส่งงานครบ/ตรงเวลา',  color: 'border-slate-400 bg-slate-800/60 text-slate-200',    isDefault: true },
  { id: 'special', icon: '🎖', label: 'Special Award', desc: 'รางวัลพิเศษ',         color: 'border-purple-600 bg-purple-950/40 text-purple-300', isDefault: true },
];

const PRESET_COLORS = [
  'border-yellow-600 bg-yellow-950/40 text-yellow-300',
  'border-cyan-600 bg-cyan-950/40 text-cyan-300',
  'border-purple-600 bg-purple-950/40 text-purple-300',
  'border-emerald-600 bg-emerald-950/40 text-emerald-300',
  'border-rose-600 bg-rose-950/40 text-rose-300',
  'border-blue-600 bg-blue-950/40 text-blue-300',
];
export { PRESET_COLORS };

export async function GET() {
  // No auth required — students also need medal info for display
  const snap = await adminDb.collection('medalTypes').doc('global').get();
  const custom: MedalType[] = snap.exists ? ((snap.data()?.medals as MedalType[]) ?? []) : [];
  return NextResponse.json([...DEFAULT_MEDALS, ...custom]);
}

export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { icon, label, desc, color } = await req.json() as Partial<MedalType>;
  if (!icon || !label) return NextResponse.json({ error: 'icon and label required' }, { status: 400 });

  const newMedal: MedalType = {
    id: `custom_${Date.now()}`,
    icon: String(icon).slice(0, 500),
    label: String(label).slice(0, 30),
    desc: String(desc ?? '').slice(0, 60),
    color: PRESET_COLORS.includes(color ?? '') ? color! : PRESET_COLORS[0],
  };

  const docRef = adminDb.collection('medalTypes').doc('global');
  const snap = await docRef.get();
  const existing: MedalType[] = snap.exists ? ((snap.data()?.medals as MedalType[]) ?? []) : [];
  await docRef.set({ medals: [...existing, newMedal] });

  return NextResponse.json(newMedal, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, icon, label, desc, color } = await req.json() as MedalType;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const docRef = adminDb.collection('medalTypes').doc('global');
  const snap = await docRef.get();
  const existing: MedalType[] = snap.exists ? ((snap.data()?.medals as MedalType[]) ?? []) : [];
  const updated = existing.map(m => m.id === id
    ? { ...m, icon: icon ?? m.icon, label: label ?? m.label, desc: desc ?? m.desc, color: color ?? m.color }
    : m
  );
  await docRef.set({ medals: updated });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json() as { id: string };
  if (!id || !id.startsWith('custom_')) {
    return NextResponse.json({ error: 'Cannot delete default medals' }, { status: 400 });
  }

  const docRef = adminDb.collection('medalTypes').doc('global');
  const snap = await docRef.get();
  const existing: MedalType[] = snap.exists ? ((snap.data()?.medals as MedalType[]) ?? []) : [];
  await docRef.set({ medals: existing.filter(m => m.id !== id) });
  return NextResponse.json({ ok: true });
}
