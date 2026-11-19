import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/admin';
import { cachedGlobal } from '@/lib/server-cache';
import { getLiveSubjectIds, inLiveSubject } from '@/lib/assignment-access';

/**
 * GUEST (no login) — the public course showcase: subjects, their work grouped
 * for display, and aggregate numbers. Read-only and anonymous: only counts and
 * averages leave the server, never a student's name, id or individual score.
 * Cached so anonymous traffic can't hammer the database.
 */
export async function GET() {
  try {
    const data = await cachedGlobal('guest:assignments', 60_000, async () => {
      const [assignmentsSnap, subjectsSnap, submissionsSnap, configSnap, liveSubjects] = await Promise.all([
        adminDb.collection('assignments').get(),
        adminDb.collection('subjects').get(),
        adminDb.collection('submissions').get(),
        adminDb.collection('system').doc('config').get(),
        getLiveSubjectIds(),
      ]);

      const liveDocs = assignmentsSnap.docs.filter((d) => inLiveSubject(d.data(), liveSubjects));
      const liveIds = new Set(liveDocs.map((d) => d.id));

      // Per-assignment submission count and average of graded scores.
      const perAssignment = new Map<string, { n: number; scored: number; sum: number }>();
      const submitters = new Set<string>();
      let total = 0;
      let scored = 0;
      let scoreSum = 0;
      for (const d of submissionsSnap.docs) {
        const s = d.data();
        const aid = s.assignmentId as string;
        if (!liveIds.has(aid)) continue;
        const e = perAssignment.get(aid) ?? { n: 0, scored: 0, sum: 0 };
        e.n += 1;
        total += 1;
        submitters.add(s.studentId as string);
        if (typeof s.score === 'number') {
          e.scored += 1;
          e.sum += s.score;
          scored += 1;
          scoreSum += s.score;
        }
        perAssignment.set(aid, e);
      }

      const assignments = liveDocs
        .map((d) => {
          const a = d.data();
          const e = perAssignment.get(d.id);
          return {
            id: d.id,
            title: (a.title as string) ?? '',
            contentType: (a.contentType as string) ?? 'worksheet',
            subjectId: a.subjectId as string,
            unit: (a.unit as string) ?? null,
            order: typeof a.order === 'number' ? a.order : null,
            isGroupWork: a.isGroupWork ?? false,
            submissionCount: e?.n ?? 0,
            avgScore: e && e.scored > 0 ? Math.round(e.sum / e.scored) : null,
          };
        })
        .sort((x, y) =>
          (x.order ?? 1e9) - (y.order ?? 1e9) ||
          x.title.localeCompare(y.title, 'th', { numeric: true }),
        );

      const subjects = subjectsSnap.docs
        .filter((d) => liveSubjects.has(d.id))
        .map((d) => {
          const mine = assignments.filter((a) => a.subjectId === d.id);
          return {
            id: d.id,
            name: (d.data().name as string) ?? '',
            classCount: ((d.data().classIds as string[]) ?? []).length,
            assignmentCount: mine.length,
            submissionCount: mine.reduce((acc, a) => acc + a.submissionCount, 0),
          };
        })
        // Busiest subject first — it becomes the default tab.
        .sort((x, y) => y.submissionCount - x.submissionCount);

      return {
        logoUrl: (configSnap.data()?.logoUrl as string) ?? null,
        stats: {
          subjects: subjects.length,
          worksheets: assignments.filter((a) => a.contentType !== 'knowledge').length,
          knowledge: assignments.filter((a) => a.contentType === 'knowledge').length,
          submissions: total,
          students: submitters.size,
          avgScore: scored > 0 ? Math.round(scoreSum / scored) : null,
        },
        subjects,
        assignments,
      };
    });

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
