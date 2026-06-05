import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { google } from 'googleapis';
import { cachedGlobal } from '@/lib/server-cache';

/**
 * Firestore daily usage (reads/writes/deletes) for the teacher dashboard.
 *
 * The numbers come from Cloud Monitoring — a SEPARATE service — so querying
 * them does NOT consume any Firestore quota. The free-tier daily caps reset at
 * midnight America/Los_Angeles, so "today" is measured from Pacific midnight.
 *
 * Requirements (one-time, in Google Cloud console for this project):
 *  - Enable the "Cloud Monitoring API"
 *  - Grant the Firebase Admin service account the role "Monitoring Viewer"
 *
 * Metric latency is ~3-7 min, so the figure is near-real-time, not instant.
 */

const FREE_LIMITS = { reads: 50_000, writes: 20_000, deletes: 20_000 };

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

/** Real UTC instant of the most recent midnight in America/Los_Angeles. */
function pacificMidnightUtc(): Date {
  const now = new Date();
  const pacificNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const utcNow = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = utcNow.getTime() - pacificNow.getTime();
  const pm = new Date(pacificNow);
  pm.setHours(0, 0, 0, 0);
  return new Date(pm.getTime() + offsetMs);
}

export async function GET() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Cache 60s: the metric itself lags a few minutes, and this avoids hitting
    // the Monitoring API on every dashboard load.
    const usage = await cachedGlobal('firestore-usage', 60_000, fetchUsage);
    return NextResponse.json(usage);
  } catch (err) {
    // Most likely cause: Monitoring API not enabled, or the service account
    // lacks the Monitoring Viewer role. Surface a hint so setup is obvious.
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'monitoring_unavailable', detail: message, limits: FREE_LIMITS },
      { status: 503 },
    );
  }
}

async function fetchUsage() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID!;
  const auth = new google.auth.JWT({
    email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/monitoring.read'],
  });
  const monitoring = google.monitoring({ version: 'v3', auth });

  const start = pacificMidnightUtc();
  const end = new Date();
  const periodSec = Math.max(60, Math.ceil((end.getTime() - start.getTime()) / 1000));

  async function sumMetric(metricType: string): Promise<number> {
    const res = await monitoring.projects.timeSeries.list({
      name: `projects/${projectId}`,
      filter: `metric.type="${metricType}"`,
      'interval.startTime': start.toISOString(),
      'interval.endTime': end.toISOString(),
      // One summed point across the whole window and all series.
      'aggregation.alignmentPeriod': `${periodSec}s`,
      'aggregation.perSeriesAligner': 'ALIGN_SUM',
      'aggregation.crossSeriesReducer': 'REDUCE_SUM',
    });
    let total = 0;
    for (const series of res.data.timeSeries ?? []) {
      for (const pt of series.points ?? []) {
        total += Number(pt.value?.int64Value ?? pt.value?.doubleValue ?? 0);
      }
    }
    return total;
  }

  const [reads, writes, deletes] = await Promise.all([
    sumMetric('firestore.googleapis.com/document/read_count'),
    sumMetric('firestore.googleapis.com/document/write_count'),
    sumMetric('firestore.googleapis.com/document/delete_count'),
  ]);

  return {
    reads, writes, deletes,
    limits: FREE_LIMITS,
    resetsAt: 'midnight America/Los_Angeles',
    asOf: end.toISOString(),
  };
}
