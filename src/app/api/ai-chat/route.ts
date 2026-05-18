import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function getStudentUid(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, false);
    return decoded.uid;
  } catch { return null; }
}

/* POST — chat with AI about an assignment */
export async function POST(req: NextRequest) {
  const uid = await getStudentUid();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Build conversation history for context
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
    return NextResponse.json({ reply });
  } catch (err) {
    console.error('[ai-chat] Gemini error:', err instanceof Error ? err.message : err);
    const msg = err instanceof Error && err.message.includes('429')
      ? 'ขณะนี้ AI มีผู้ใช้งานมาก กรุณาลองใหม่สักครู่'
      : 'AI ไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
