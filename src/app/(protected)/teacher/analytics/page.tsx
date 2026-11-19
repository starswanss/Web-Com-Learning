'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import TermSelect from '@/components/TermSelect';
import {
  Chart,
  BarController,
  LineController,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

Chart.register(BarController, LineController, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

interface ClassStat { classId: string; submitted: number; avgScore: number }
interface AssignmentStat { id: string; title: string; submitted: number; avgScore: number }
interface BucketStat { label: string; count: number }

interface AnalyticsData {
  classStats: ClassStat[];
  assignmentStats: AssignmentStat[];
  totalSubmissions: number;
  scoreDistribution: BucketStat[];
  weeklyTrend: BucketStat[];
}

export default function AnalyticsPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [fetching, setFetching] = useState(true);
  const [term, setTerm] = useState<string | undefined>(undefined);
  const submissionsChartRef = useRef<HTMLCanvasElement>(null);
  const scoresChartRef = useRef<HTMLCanvasElement>(null);
  const distributionChartRef = useRef<HTMLCanvasElement>(null);
  const trendChartRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.role !== 'teacher' || term === undefined) return;
    setFetching(true);
    // Same scope as the overview: the teacher's selected subject, and only the
    // submissions made in the chosen term.
    const saved = localStorage.getItem('lms_subject');
    const sub = saved ? (JSON.parse(saved) as { id: string }) : null;
    const qs = new URLSearchParams();
    if (term) qs.set('term', term);
    if (sub) qs.set('subject', sub.id);
    fetch(`/api/analytics?${qs}`)
      .then((r) => r.json())
      .then((d: AnalyticsData) => setData(d))
      .finally(() => setFetching(false));
  }, [profile, term]);

  useEffect(() => {
    if (!data || !submissionsChartRef.current || !scoresChartRef.current) return;

    const labels = data.classStats.map((c) => c.classId);
    const palette = { grid: '#1e293b', tick: '#64748b', bar1: '#3b82f6', bar2: '#10b981' };

    const chartDefaults = {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
      scales: {
        x: { ticks: { color: palette.tick }, grid: { color: palette.grid } },
        y: { ticks: { color: palette.tick }, grid: { color: palette.grid }, beginAtZero: true },
      },
    };

    const chart1 = new Chart(submissionsChartRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'จำนวนส่ง', data: data.classStats.map((c) => c.submitted), backgroundColor: palette.bar1, borderRadius: 6 }],
      },
      options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, legend: { display: true, labels: { color: palette.tick } } } },
    });

    const chart2 = new Chart(scoresChartRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'คะแนนเฉลี่ย', data: data.classStats.map((c) => c.avgScore), backgroundColor: palette.bar2, borderRadius: 6 }],
      },
      options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, max: 100 } }, plugins: { ...chartDefaults.plugins, legend: { display: true, labels: { color: palette.tick } } } },
    });

    let chart3: Chart | undefined;
    let chart4: Chart | undefined;

    if (data.scoreDistribution && distributionChartRef.current) {
      chart3 = new Chart(distributionChartRef.current, {
        type: 'bar',
        data: {
          labels: data.scoreDistribution.map((b) => b.label),
          datasets: [{
            label: 'จำนวนนักเรียน',
            data: data.scoreDistribution.map((b) => b.count),
            backgroundColor: data.scoreDistribution.map((b) => {
              const mid = parseInt(b.label.split('–')[0]);
              return mid >= 80 ? '#10b981' : mid >= 60 ? '#f59e0b' : mid >= 40 ? '#f97316' : '#ef4444';
            }),
            borderRadius: 4,
          }],
        },
        options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, legend: { display: false } } },
      });
    }

    if (data.weeklyTrend && trendChartRef.current) {
      chart4 = new Chart(trendChartRef.current, {
        type: 'line',
        data: {
          labels: data.weeklyTrend.map((w) => w.label),
          datasets: [{
            label: 'งานที่ส่ง',
            data: data.weeklyTrend.map((w) => w.count),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.1)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#3b82f6',
          }],
        },
        options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, legend: { display: false } } },
      });
    }

    return () => { chart1.destroy(); chart2.destroy(); chart3?.destroy(); chart4?.destroy(); };
  }, [data]);

  if (loading || !profile) return <Spinner />;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/teacher" className="text-sm text-slate-400 hover:text-slate-200">
            ← กลับ
          </Link>
          <h1 className="text-xl font-semibold text-slate-100">Analytics</h1>
          <div className="ml-auto"><TermSelect value={term} onChange={setTerm} /></div>
        </div>

        {fetching ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : !data || data.classStats.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 py-24 text-center">
            <p className="text-slate-400">ยังไม่มีข้อมูล</p>
            <p className="mt-1 text-sm text-slate-500">จะแสดงเมื่อนักเรียนเริ่มส่งงาน</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="งานทั้งหมด" value={data.assignmentStats.length} />
              <StatCard label="การส่งทั้งหมด" value={data.totalSubmissions} />
              <StatCard
                label="คะแนนเฉลี่ยรวม"
                value={
                  data.classStats.length
                    ? Math.round(data.classStats.reduce((s, c) => s + c.avgScore, 0) / data.classStats.length)
                    : 0
                }
                unit="/100"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="จำนวนส่งงาน รายห้อง">
                <canvas ref={submissionsChartRef} />
              </ChartCard>
              <ChartCard title="คะแนนเฉลี่ย รายห้อง">
                <canvas ref={scoresChartRef} />
              </ChartCard>
              <ChartCard title="การกระจายคะแนน (Score Distribution)">
                <canvas ref={distributionChartRef} />
              </ChartCard>
              <ChartCard title="แนวโน้มการส่งงาน 8 สัปดาห์ล่าสุด">
                <canvas ref={trendChartRef} />
              </ChartCard>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
              <div className="border-b border-slate-800 px-6 py-4">
                <h2 className="text-sm font-medium text-slate-200">สรุปรายใบงาน</h2>
              </div>
              <div className="divide-y divide-slate-800">
                {data.assignmentStats.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-6 py-4">
                    <p className="text-sm text-slate-300 truncate max-w-xs">{a.title}</p>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-sm text-slate-400">{a.submitted} ส่ง</span>
                      <span className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-sm font-medium text-slate-200">
                        avg {a.avgScore}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, unit = '' }: { label: string; value: number; unit?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-100">
        {value}
        <span className="text-base text-slate-400">{unit}</span>
      </p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h3 className="mb-4 text-sm font-medium text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
    </div>
  );
}
