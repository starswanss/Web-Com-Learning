import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('classId');
  if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 });

  const snap = await adminDb
    .collection('subjects')
    .where('classIds', 'array-contains', classId)
    .get();

  const subjects = snap.docs
    .map((d) => ({ id: d.id, name: d.data().name, _seconds: d.data().createdAt?._seconds ?? 0 }))
    .sort((a, b) => b._seconds - a._seconds)
    .map(({ id, name }) => ({ id, name }));

  return NextResponse.json(subjects);
}
