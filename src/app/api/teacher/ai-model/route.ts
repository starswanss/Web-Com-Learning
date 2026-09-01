import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { getModelId, setModelId, isModelEnvLocked, testModel } from '@/lib/gemini';

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

// A few known-stable Groq models to offer as quick picks. The teacher can also
// type any model id — the list at console.groq.com/docs/models is the source of
// truth and changes over time.
const SUGGESTED = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'llama3-70b-8192',
  'gemma2-9b-it',
];

// GET — current model + whether it's env-locked + quick-pick suggestions
export async function GET() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    model: await getModelId(),
    envLocked: isModelEnvLocked(),
    suggestions: SUGGESTED,
  });
}

// PUT { model } — save the model (also tests it first; refuses if it fails)
export async function PUT(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (isModelEnvLocked()) {
    return NextResponse.json({ error: 'ถูกกำหนดโดย env GROQ_MODEL — แก้ที่ Vercel แทน' }, { status: 400 });
  }

  const { model } = await req.json() as { model?: string };
  if (!model || !model.trim()) return NextResponse.json({ error: 'กรุณาระบุชื่อ model' }, { status: 400 });

  const test = await testModel(model.trim());
  if (!test.ok) {
    return NextResponse.json({ error: `model นี้ใช้ไม่ได้: ${test.error}` }, { status: 400 });
  }

  await setModelId(model.trim());
  return NextResponse.json({ ok: true, model: model.trim() });
}

// POST { model } — just test a model without saving
export async function POST(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { model } = await req.json() as { model?: string };
  if (!model || !model.trim()) return NextResponse.json({ error: 'กรุณาระบุชื่อ model' }, { status: 400 });

  const result = await testModel(model.trim());
  return NextResponse.json(result);
}
