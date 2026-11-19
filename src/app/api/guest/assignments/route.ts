import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/admin';
import { cachedGlobal } from '@/lib/server-cache';

/**
 * GUEST (no login) — list all assignments, read-only. Returns only the fields a
 * visitor needs to browse; no submissions, no teacher-only data. Cached so that
 * anonymous traffic can't burn through the Firestore read quota.
 */
export async function GET() {
  try {
    const assignments = await cachedGlobal('guest:assignments', 60_000, async () => {
      const snap = await adminDb.collection('assignments').get();
      return snap.docs
        .map((d) => {
          const a = d.data();
          return {
            id: d.id,
            title: a.title ?? '',
            contentType: a.contentType ?? 'worksheet',
            subjectId: a.subjectId ?? null,
            unit: a.unit ?? null,
            classIds: (a.classIds as string[]) ?? [],
            isGroupWork: a.isGroupWork ?? false,
            dueDate: a.dueDate ?? null,
            createdAt: a.createdAt ?? null,
          };
        })
        .sort((x, y) => (y.createdAt?._seconds ?? 0) - (x.createdAt?._seconds ?? 0));
    });

    return NextResponse.json(assignments);
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
