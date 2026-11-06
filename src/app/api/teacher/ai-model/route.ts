import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import {
  getModelId, setModelId, isModelEnvLocked, testModel, listModels,
  getGradingStyle, setGradingStyle, type GradingStyle,
  getProvider, setProvider, getClaudeModelId, setClaudeModelId, isAnthropicConfigured,
} from '@/lib/gemini';

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

// GET — current model, env-lock, quick picks, and the models this account can
// actually access (fetched live from Groq; empty if that call fails).
export async function GET() {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [model, available, gradingStyle, provider, claudeModel] = await Promise.all([
    getModelId(), listModels(), getGradingStyle(), getProvider(), getClaudeModelId(),
  ]);
  return NextResponse.json({
    model,
    envLocked: isModelEnvLocked(),
    suggestions: SUGGESTED,
    available,
    gradingStyle,
    provider,
    claudeModel,
    anthropicConfigured: isAnthropicConfigured(),
  });
}

// PUT { model } — save the model (also tests it first; refuses if it fails)
//     { gradingStyle } — save the global grading style (no model test)
export async function PUT(req: NextRequest) {
  const uid = await getTeacherUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { model?: string; gradingStyle?: string; provider?: string; claudeModel?: string };

  // Grading-style update is independent of the model (and of the env lock).
  if (body.gradingStyle !== undefined) {
    const s = body.gradingStyle;
    if (s !== 'strict' && s !== 'balanced' && s !== 'lenient') {
      return NextResponse.json({ error: 'โหมดตรวจไม่ถูกต้อง' }, { status: 400 });
    }
    await setGradingStyle(s as GradingStyle);
    return NextResponse.json({ ok: true, gradingStyle: s });
  }

  // Provider switch (Groq vs Claude) — also independent of the Groq model.
  if (body.provider !== undefined) {
    if (body.provider !== 'groq' && body.provider !== 'claude') {
      return NextResponse.json({ error: 'provider ไม่ถูกต้อง' }, { status: 400 });
    }
    if (body.provider === 'claude' && !isAnthropicConfigured()) {
      return NextResponse.json({ error: 'ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY ใน Vercel' }, { status: 400 });
    }
    await setProvider(body.provider);
    return NextResponse.json({ ok: true, provider: body.provider });
  }

  // Claude model id (optional override; defaults to claude-haiku-5-5).
  if (body.claudeModel !== undefined) {
    if (!body.claudeModel.trim()) return NextResponse.json({ error: 'กรุณาระบุชื่อ Claude model' }, { status: 400 });
    await setClaudeModelId(body.claudeModel);
    return NextResponse.json({ ok: true, claudeModel: body.claudeModel.trim() });
  }

  if (isModelEnvLocked()) {
    return NextResponse.json({ error: 'ถูกกำหนดโดย env GROQ_MODEL — แก้ที่ Vercel แทน' }, { status: 400 });
  }

  const { model } = body;
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
