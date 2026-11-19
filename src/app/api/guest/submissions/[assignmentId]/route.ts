import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/admin';
import { cachedGlobal } from '@/lib/server-cache';

/**
 * GUEST (no login) — an assignment plus its submissions, read-only and with
 * student identities removed. Names/ids are replaced by a stable "นักเรียนคนที่ N"
 * label so visitors can view the work without seeing who submitted it.
 * Cached to protect the Firestore read quota against anonymous traffic.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const { assignmentId } = await params;

    const data = await cachedGlobal(`guest:submissions:${assignmentId}`, 30_000, async () => {
      const [assignmentSnap, submissionsSnap] = await Promise.all([
        adminDb.collection('assignments').doc(assignmentId).get(),
        adminDb.collection('submissions').where('assignmentId', '==', assignmentId).get(),
      ]);

      if (!assignmentSnap.exists) return null;

      const a = assignmentSnap.data()!;
      const assignment = {
        id: assignmentId,
        title: a.title ?? '',
        description: a.description ?? '',
        contentType: a.contentType ?? 'worksheet',
        blocks: a.blocks ?? [],
        isGroupWork: a.isGroupWork ?? false,
      };

      // Stable anonymisation: order by studentId, then label 1..N.
      const raw = submissionsSnap.docs
        .map((d): { id: string } & Record<string, unknown> => ({ id: d.id, ...d.data() }))
        .sort((x, y) => String(x.studentId ?? '').localeCompare(String(y.studentId ?? '')));

      const submissions = raw.map((s, i) => ({
        id: s.id,
        alias: `นักเรียนคนที่ ${i + 1}`,
        classId: (s.classId as string) ?? '',
        answers: (s.answers as Record<string, string | string[]>) ?? undefined,
        content: (s.content as string) ?? undefined,
        score: typeof s.score === 'number' ? s.score : undefined,
        feedback: (s.feedback as string) ?? undefined,
        questionComments: (s.questionComments as Record<string, string>) ?? undefined,
        status: (s.status as string) ?? 'submitted',
        submittedAt: s.submittedAt ?? undefined,
        // Deliberately omitted: studentId, studentName, driveWebViewLink,
        // plagiarismSuspicion, tab/burst counts — identity or teacher-only signals.
      }));

      return { assignment, submissions };
    });

    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
