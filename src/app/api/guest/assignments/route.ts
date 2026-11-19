import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/admin';
import { cachedGlobal } from '@/lib/server-cache';
import { getLiveSubjectIds, inLiveSubject } from '@/lib/assignment-access';

/**
 * GUEST (no login) — list all assignments, read-only. Returns only the fields a
 * visitor needs to browse; no submissions, no teacher-only data. Cached so that
 * anonymous traffic can't hammer the database.
 */
export async function GET() {
  try {
    const assignments = await cachedGlobal('guest:assignments', 60_000, async () => {
      const [snap, liveSubjects] = await Promise.all([adminDb.collection('assignments').get(), getLiveSubjectIds()]);
      return snap.docs
        .filter((d) => inLiveSubject(d.data(), liveSubjects))
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
