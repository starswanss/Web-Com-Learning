import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = await adminAuth.verifySessionCookie(session, false);
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!userSnap.exists || userSnap.data()?.role !== 'student') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const student = userSnap.data()!;

    const [assignmentsSnap, submissionsSnap] = await Promise.all([
      adminDb.collection('assignments').where('classIds', 'array-contains', student.classId).get(),
      adminDb.collection('submissions').where('studentId', '==', decoded.uid).get(),
    ]);

    const submissions = submissionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const submissionMap = new Map(submissions.map((s: Record<string, unknown>) => [s.assignmentId as string, s]));

    const assignments = assignmentsSnap.docs.map((d) => {
      const a = { id: d.id, ...d.data() } as Record<string, unknown>;
      const sub = submissionMap.get(d.id);
      return {
        id: d.id,
        title: a.title,
        dueDate: a.dueDate,
        submission: sub
          ? {
              status: (sub as Record<string, unknown>).status,
              score: (sub as Record<string, unknown>).score,
              feedback: (sub as Record<string, unknown>).feedback,
              submittedAt: (sub as Record<string, unknown>).submittedAt,
            }
          : null,
      };
    });

    const scoredSubmissions = submissions.filter(
      (s) => typeof (s as Record<string, unknown>).score === 'number'
    );
    const avgScore =
      scoredSubmissions.length > 0
        ? Math.round(
            scoredSubmissions.reduce((sum, s) => sum + ((s as Record<string, unknown>).score as number), 0) /
              scoredSubmissions.length
          )
        : null;

    return NextResponse.json({
      student: {
        uid: decoded.uid,
        displayName: student.displayName,
        classId: student.classId,
      },
      stats: {
        total: assignments.length,
        submitted: submissions.length,
        graded: scoredSubmissions.length,
        avgScore,
      },
      assignments,
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
