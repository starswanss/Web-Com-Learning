import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const DAILY_LIMIT = 30;

async function getStudentUid(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    return decoded.uid;
  } catch { return null; }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function getUsage(uid: string): Promise<{ count: number; date: string }> {
  const snap = await adminDb.collection('aiChatUsage').doc(uid).get();
  if (!snap.exists) return { count: 0, date: todayStr() };
  const data = snap.data()!;
  if (data.date !== todayStr()) return { count: 0, date: todayStr() };
  return { count: data.count ?? 0, date: data.date };
}

/* GET — return remaining quota for the student */
export async function GET() {
  const uid = await getStudentUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const usage = await getUsage(uid);
  const remaining = Math.max(0, DAILY_LIMIT - usage.count);
  return NextResponse.json({ remaining, used: usage.count, limit: DAILY_LIMIT });
}

/* POST — chat with AI about an assignment */
export async function POST(req: NextRequest) {
  const uid = await getStudentUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Rate limit check
  const usage = await getUsage(uid);
  if (usage.count >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: `คุณใช้โควต้าอาจารย์ AI ครบ ${DAILY_LIMIT} ครั้งแล้วในวันนี้ กรุณาลองใหม่พรุ่งนี้` },
      { status: 429 }
    );
  }

  const { assignmentId, question, history } = await req.json() as {
    assignmentId: string;
    question: string;
    history?: Array<{ role: 'user' | 'model'; text: string }>;
  };

  if (!assignmentId || !question?.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Load assignment content as context
  const snap = await adminDb.collection('assignments').doc(assignmentId).get();
  if (!snap.exists) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  const a = snap.data()!;
  const blockText = (a.blocks ?? [])
    .filter((b: any) => ['heading', 'paragraph', 'short-answer', 'long-answer', 'multiple-choice', 'checkbox', 'ordering'].includes(b.type))
    .map((b: any) => {
      if (b.type === 'heading') return `## ${b.text}`;
      if (b.type === 'paragraph') return b.text;
      if (b.type === 'short-answer' || b.type === 'long-answer') return `คำถาม: ${b.question}`;
      if (b.type === 'multiple-choice' || b.type === 'checkbox') {
        return `คำถาม: ${b.question}\nตัวเลือก: ${(b.options ?? []).join(', ')}`;
      }
      if (b.type === 'ordering') return `คำถาม: ${b.question}\nรายการ: ${(b.items ?? []).join(', ')}`;
      return '';
    })
    .filter(Boolean)
    .join('\n\n');

  const systemContext = `คุณคือผู้ช่วยการเรียนรู้ AI สำหรับนักเรียนชั้น ม.3 วิชาวิทยาการคำนวณ

ใบงาน/แบบทดสอบที่นักเรียนกำลังทำ:
ชื่อ: ${a.title}
คำอธิบาย: ${a.description ?? ''}
${blockText ? `\nเนื้อหา:\n${blockText}` : ''}

กฎสำคัญ:
- ตอบเป็นภาษาไทย กระชับ ชัดเจน เป็นกันเอง
- ช่วยให้นักเรียนเข้าใจ ไม่บอกคำตอบตรงๆ ให้ตอบแทน
- ถ้าถามนอกเรื่องใบงาน ให้บอกอ่อนๆ ว่าขอโฟกัสที่เนื้อหาบทเรียน
- ตอบสั้นๆ 2-4 ประโยค เพียงพอให้เข้าใจ`;

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const historyParts = (history ?? []).slice(-6).map(h => ({
    role: h.role,
    parts: [{ text: h.text }],
  }));

  const chat = model.startChat({
    history: [
      { role: 'user', parts: [{ text: systemContext }] },
      { role: 'model', parts: [{ text: 'เข้าใจแล้วครับ พร้อมช่วยนักเรียนเรียนรู้!' }] },
      ...historyParts,
    ],
  });

  try {
    const result = await chat.sendMessage(question.trim());
    const reply = result.response.text().trim();

    // Increment usage counter
    const newCount = usage.count + 1;
    await adminDb.collection('aiChatUsage').doc(uid).set({ count: newCount, date: todayStr() });

    const remaining = Math.max(0, DAILY_LIMIT - newCount);
    return NextResponse.json({ reply, remaining });
  } catch (err) {
    console.error('[ai-chat] Gemini error:', err instanceof Error ? err.message : err);
    const msg = err instanceof Error && err.message.includes('429')
      ? 'ขณะนี้ AI มีผู้ใช้งานมาก กรุณาลองใหม่สักครู่'
      : 'AI ไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
