import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const tokenSnap = await adminDb.collection('parentTokens').doc(token).get();
    if (!tokenSnap.exists) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    const tokenData = tokenSnap.data()!;
    const expiresAt = tokenData.expiresAt?.toMillis?.() ?? 0;
    if (expiresAt < Date.now()) {
      return NextResponse.json({ error: 'Link expired' }, { status: 410 });
    }

    const { studentId, studentName, classId } = tokenData;

    const [assignmentsSnap, submissionsSnap] = await Promise.all([
      adminDb.collection('assignments').where('classIds', 'array-contains', classId).get(),
      adminDb.collection('submissions').where('studentId', '==', studentId).get(),
    ]);

    const submissionMap = new Map(
      submissionsSnap.docs.map((d) => [d.data().assignmentId as string, { id: d.id, ...d.data() }])
    );

    const assignments = assignmentsSnap.docs.map((d) => {
      const a = d.data();
      const sub = submissionMap.get(d.id) as Record<string, unknown> | undefined;
      return {
        id: d.id,
        title: a.title,
        contentType: a.contentType ?? 'worksheet',
        unit: a.unit ?? null,
        dueDate: a.dueDate ?? null,
        submission: sub
          ? {
              status: sub.status,
              score: sub.score ?? null,
              feedback: sub.feedback ?? null,
              submittedAt: sub.submittedAt ?? null,
            }
          : null,
      };
    });

    const scored = assignments.filter((a) => typeof a.submission?.score === 'number');
    const avgScore =
      scored.length > 0
        ? Math.round(scored.reduce((s, a) => s + (a.submission!.score as number), 0) / scored.length)
        : null;

    return NextResponse.json({
      student: { name: studentName, classId },
      expiresAt,
      stats: {
        total: assignments.length,
        submitted: submissionsSnap.size,
        graded: scored.length,
        avgScore,
      },
      assignments,
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
