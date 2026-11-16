import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { FieldValue } from '@/lib/db';

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

  // No orderBy — avoids requiring a Firestore composite index; sort in JS instead
  const snap = await adminDb.collection('quests')
    .where('teacherId', '==', uid)
    .get();

  if (snap.empty) return NextResponse.json([]);

  interface QuestRaw {
    id: string;
    title: string;
    description: string;
    xpReward: number;
    icon: string;
    resetType: 'daily' | 'once';
    classIds: string[];
    isActive: boolean;
    createdAt: Date;
  }

  const quests: QuestRaw[] = snap.docs.map(d => ({
    id: d.id,
    title: (d.data().title as string) ?? '',
    description: (d.data().description as string) ?? '',
    xpReward: (d.data().xpReward as number) ?? 0,
    icon: (d.data().icon as string) ?? '⭐',
    resetType: ((d.data().resetType as string) === 'once' ? 'once' : 'daily'),
    classIds: (d.data().classIds as string[]) ?? [],
    isActive: (d.data().isActive as boolean) ?? true,
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(0),
  }));

  // Sort newest first
  quests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const questIds = quests.map(q => q.id);
  const allClassIds = [...new Set(quests.flatMap(q => q.classIds))];
  const today = new Date().toISOString().split('T')[0];

  // Fetch quest claims per quest (chunked, Firestore in-limit = 10)
  // For daily quests: count unique students who claimed TODAY
  // For once quests:  count unique students who ever claimed
  const claimedByQuest = new Map<string, Set<string>>();

  for (let i = 0; i < questIds.length; i += 10) {
    const chunk = questIds.slice(i, i + 10);
    const claimsSnap = await adminDb.collection('questClaims')
      .where('questId', 'in', chunk)
      .get();

    claimsSnap.docs.forEach(d => {
      const questId = d.data().questId as string;
      const studentId = d.data().studentId as string;
      const claimDate = d.data().claimDate as string;
      const quest = quests.find(q => q.id === questId);
      if (!quest) return;
      if (quest.resetType === 'daily' && claimDate !== today) return;

      if (!claimedByQuest.has(questId)) claimedByQuest.set(questId, new Set());
      claimedByQuest.get(questId)!.add(studentId);
    });
  }

  // Fetch student count per class
  const studentsByClass = new Map<string, number>();
  if (allClassIds.length > 0) {
    for (let i = 0; i < allClassIds.length; i += 10) {
      const chunk = allClassIds.slice(i, i + 10);
      const studentsSnap = await adminDb.collection('users')
        .where('role', '==', 'student')
        .where('classId', 'in', chunk)
        .get();
      studentsSnap.docs.forEach(d => {
        const classId = d.data().classId as string;
        studentsByClass.set(classId, (studentsByClass.get(classId) ?? 0) + 1);
      });
    }
  }

  const result = quests.map(q => ({
    id: q.id,
    title: q.title,
    description: q.description,
    xpReward: q.xpReward,
    icon: q.icon,
    resetType: q.resetType,
    classIds: q.classIds,
    isActive: q.isActive,
    createdAt: q.createdAt.toISOString(),
    claimedCount: claimedByQuest.get(q.id)?.size ?? 0,
    totalStudents: q.classIds.reduce((acc, cid) => acc + (studentsByClass.get(cid) ?? 0), 0),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    title: string; description?: string; xpReward: number;
    icon?: string; resetType?: string; classIds: string[];
  };

  if (!body.title?.trim() || !body.xpReward) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const ref = await adminDb.collection('quests').add({
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
    xpReward: Math.max(1, Math.min(1000, Number(body.xpReward))),
    icon: body.icon ?? '⭐',
    resetType: body.resetType === 'once' ? 'once' : 'daily',
    classIds: body.classIds ?? [],
    teacherId: uid,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: ref.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, unknown> & { id: string };
  if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const ref = adminDb.collection('quests').doc(body.id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: _id, teacherId: _t, createdAt: _c, ...updates } = body;
  await ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const ref = adminDb.collection('quests').doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.teacherId !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
