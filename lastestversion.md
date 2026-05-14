# LMS v0.3 — Computing Science & IT (ม.3)
> สร้าง: 2026-05-14 | v0.2: 2026-05-14 | v0.3: 2026-05-14

## ฟีเจอร์ทั้งหมดที่ Shipped

### Foundation & Auth
- [x] Next.js 16 App Router + Tailwind CSS + TypeScript
- [x] Google Login จำกัด domain โรงเรียน (`NEXT_PUBLIC_ALLOWED_DOMAIN`)
- [x] Firebase Session Cookie (HTTP-only, 5 วัน) — Admin SDK ทั้งหมด
- [x] Route guard via `proxy.ts`
- [x] Role: teacher (จาก `NEXT_PUBLIC_TEACHER_EMAILS`) / student
- [x] Onboarding: นักเรียนเลือกห้อง ม.3/1–18
- [x] Profile โหลดผ่าน `GET /api/auth/session` (Admin SDK, ไม่พึ่ง client Firestore)

### Subject System (ใหม่ v0.3)
- [x] **หน้าเลือกวิชา** (`/select-subject`): แสดงก่อน Dashboard เสมอ
- [x] **ครูจัดการวิชา** (`/teacher/subjects`): สร้าง/ลบวิชา กำหนดห้องที่รับผิดชอบ
- [x] **แยกใบงานตามวิชา**: `?subject=` filter ในทุก API + `subjectId` บน assignments
- [x] นักเรียนเห็นเฉพาะวิชาที่อยู่ในห้องตัวเอง (classIds array-contains)
- [x] บันทึก subject ใน localStorage (`lms_subject = { id, name }`) — ปุ่ม ← เปลี่ยนวิชา

### Content Type & Unit (ใหม่ v0.3)
- [x] **3 ประเภทเนื้อหา**: ใบงาน 📝, ใบความรู้ 📖, แบบทดสอบ ✏️ (enum `ContentType`)
- [x] **ไอคอนและสีต่างกันตามประเภท** — badge บนทุกการ์ดใบงาน
- [x] **หน่วยการเรียนรู้** (unit field): ข้อความอิสระ, จัดกลุ่มในหน้านักเรียน
- [x] หน้า Student จัดกลุ่ม "งานที่ต้องทำ" ตามหน่วย แสดง header หน่วยก่อนแต่ละกลุ่ม

### Due Date Traffic Light (ใหม่ v0.3)
- [x] 🔴 **เกินกำหนด** / วันนี้ — `bg-red-600` / `text-red-400`
- [x] 🟠 **< 3 วัน** — `bg-orange-500` / `text-orange-400`
- [x] 🟡 **3–7 วัน** — `bg-amber-400` / `text-amber-400`
- [x] 🟢 **7+ วัน** — `bg-emerald-500` / `text-emerald-400`
- [x] แสดงใน Teacher Dashboard (ทุกใบงาน) + Student Dashboard (งานที่ยังไม่ส่ง)

### Teacher
- [x] Teacher Dashboard: รายการใบงาน + ปุ่ม **แก้ไข** + **ตรวจงาน** + ลบ
- [x] **Assignment Builder** (Google Forms-style): Heading, Paragraph, Image, Short Answer, Long Answer, Multiple Choice, Checkbox
- [x] 2-column layout (`half` flag บน block)
- [x] **Rubric per assignment**: ครูกำหนดเกณฑ์ตรวจให้ AI ใช้
- [x] **แก้ไขใบงาน**: โหลด block เดิมมาแก้ได้เต็มรูปแบบ (`PATCH /api/assignments/[id]`)
- [x] **Teacher Grading Page** (split-panel): รายชื่อนักเรียน + panel คำตอบ + ให้คะแนน manual
- [x] **ตรวจเร็ว AI** (Quick Grade): ปุ่มต่อนักเรียน — ตรวจ AI ทันที
- [x] **ตรวจ AI ทั้งหมด** (Batch Grade): ตรวจทุกคนในครั้งเดียว
- [x] **บันทึกคะแนน AI ทั้งหมด** (Approve-All): ปุ่ม "✓ บันทึกคะแนน AI (N)" — batch update status → `reviewed` โดยไม่ต้อง re-grade
- [x] **Export CSV**: โหลดคะแนนทั้งห้อง (ชื่อ, ห้อง, คะแนน, feedback, วันที่ส่ง)
- [x] Plagiarism warning banner (> 60%)
- [x] Teacher Analytics: กราฟ Chart.js

### Student
- [x] Student Dashboard: งานแบ่ง **งานที่ต้องทำ** / **รอตรวจ** / **ตรวจแล้ว**
- [x] งานที่ต้องทำ: จัดกลุ่มตามหน่วย, แสดง traffic light วันกำหนดส่ง
- [x] **Block-based Submission**: render FormBlocks จริง (คำถามทุกแบบมี input ของตัวเอง)
- [x] **ห้ามก๊อปวาง** (Anti-paste): บล็อก paste ใน short-answer และ long-answer ทุกใบงาน แสดง toast แจ้งเตือน
- [x] **Portfolio / Profile Page**: คะแนนเฉลี่ย, progress bar, ประวัติทุกใบงาน + สถานะ
- [x] Auto Drive folder สำหรับนักเรียนแต่ละคน
- [x] แสดงคะแนน + feedback ทันทีหลังส่ง

### AI & Storage
- [x] Gemini 2.0 Flash: ตรวจอัตโนมัติ (คะแนน 0-100, feedback ภาษาไทย)
- [x] Plagiarism suspicion score
- [x] Block-form answers แปลงเป็น Q&A text ก่อนส่ง Gemini (`answersToText`)
- [x] Rubric ต่อใบงานส่งไปกับ prompt
- [x] Google Drive: auto-create folder structure

---

## API Routes (v0.3)

| Method | Path | ใคร | ทำอะไร |
|---|---|---|---|
| POST/GET | `/api/auth/session` | ทุกคน | Login + โหลด profile |
| POST | `/api/auth/onboarding` | นักเรียน | เลือกห้อง |
| GET | `/api/subjects` | ครู | รายการวิชาของครู |
| POST | `/api/subjects` | ครู | สร้างวิชา |
| DELETE | `/api/subjects` | ครู | ลบวิชา |
| GET | `/api/subjects/student` | นักเรียน | วิชาที่นักเรียนอยู่ |
| GET | `/api/assignments?subject=` | ครู | รายการใบงาน (filter ตามวิชา) |
| POST | `/api/assignments` | ครู | สร้างใบงาน (+subjectId, unit, contentType) |
| DELETE | `/api/assignments` | ครู | ลบใบงาน |
| GET | `/api/assignments/[id]` | ครู | โหลดใบงาน (สำหรับ edit) |
| PATCH | `/api/assignments/[id]` | ครู | แก้ไขใบงาน (+unit, contentType) |
| GET | `/api/assignments/student?subject=` | นักเรียน | รายการ + สถานะส่ง (filter ตามวิชา) |
| GET | `/api/assignments/student/[id]` | นักเรียน | ดูใบงานเดี่ยว |
| POST | `/api/submissions` | นักเรียน | ส่งงาน (content หรือ answers) |
| GET | `/api/submissions/[assignmentId]` | นักเรียน | ดูงานที่ส่งแล้ว |
| GET | `/api/teacher/submissions/[assignmentId]` | ครู | รายชื่อนักเรียนที่ส่ง |
| PATCH | `/api/teacher/grade/[id]` | ครู | ให้คะแนน manual → status: reviewed |
| POST | `/api/teacher/quick-grade/[id]` | ครู | ตรวจเร็ว AI เดี่ยว → status: graded |
| POST | `/api/teacher/batch-grade/[assignmentId]` | ครู | ตรวจ AI ทั้งหมด |
| POST | `/api/teacher/approve-all/[assignmentId]` | ครู | batch approve คะแนน AI → reviewed |
| GET | `/api/student/stats` | นักเรียน | ข้อมูล portfolio |
| GET | `/api/analytics` | ครู | กราฟ Analytics |

---

## Firestore Collections

| Collection | Fields หลัก |
|---|---|
| `users` | uid, email, role, classId, onboardingComplete |
| `subjects` | name, teacherId, classIds[], createdAt |
| `assignments` | title, description, dueDate, classIds[], teacherId, blocks[], rubric, subjectId, unit, contentType, driveFileId |
| `submissions` | assignmentId, studentId, classId, content, answers{}, score, feedback, plagiarismSuspicion, status |

**status flow:** `submitted` → (AI grade) → `graded` → (teacher approve-all / manual) → `reviewed`

## Firestore Indexes
- `assignments`: `classIds` (array-contains) + `dueDate` (desc)
- `assignments`: `subjectId` + `createdAt` (desc)
- `submissions`: `assignmentId` + `studentId`
- `submissions`: `assignmentId` + `status`

## Shared Files
- `src/types/index.ts` — ContentType, CONTENT_TYPE_LABELS, Subject, Assignment interfaces
- `src/app/(protected)/teacher/assignments/_builder.tsx` — BlockCard, BlockEditor, makeBlock, groupBlocks, BLOCK_LABELS, ALL_CLASSES
- `src/lib/gemini/index.ts` — `gradeSubmission(title, desc, content, others, rubric?)` + `answersToText(blocks, answers)`

---

## แผน v0.4 — ฟีเจอร์แนะนำ

### 1. 🔔 การแจ้งเตือน (Notifications)
แจ้งเตือนเมื่อมีงานใหม่ที่ครูสั่ง (นักเรียน) หรือเมื่อมีนักเรียนส่งงาน (ครู) ผ่าน Firebase Cloud Messaging หรือ browser Notification API — ไม่ต้องเปิดแอปเพื่อรู้ว่ามีงานใหม่

### 2. 📅 ตารางกำหนดการ (Calendar View)
หน้าปฏิทินแสดงใบงานทุกวิชาตามวันกำหนดส่ง — นักเรียนเห็นภาพรวมสัปดาห์/เดือน ครูวางแผนสั่งงานไม่ให้ชนกัน

### 3. 💬 ระบบ Comment ต่อการส่งงาน
ครูเพิ่ม comment แบบ inline ในหน้าตรวจ (นอกเหนือจาก feedback รวม) นักเรียนตอบกลับได้ — เหมือน Google Classroom comment thread ต่อ submission

### 4. 📊 Student Progress Dashboard (สำหรับครู)
หน้าดูความก้าวหน้าของนักเรียนรายคน: คะแนนทุกใบงาน, กราฟพัฒนาการตามเวลา, เปรียบเทียบกับค่าเฉลี่ยห้อง — ช่วยระบุนักเรียนที่ต้องดูแลเป็นพิเศษ

### 5. 🔁 ส่งซ้ำ / แก้ไขงาน (Resubmission)
ครูอนุญาตให้นักเรียนส่งซ้ำได้กี่ครั้ง, เก็บ history ทุก attempt, แสดง diff ระหว่าง submission — ให้นักเรียนแก้ตาม feedback AI

### 6. 🏷️ ระบบแท็กและค้นหา (Tags & Search)
เพิ่ม tags บนใบงาน (เช่น "สอบกลางภาค", "โปรเจกต์", "homework") และ search bar กรองใบงานตาม tag/unit/ชื่อ — จัดการเนื้อหาง่ายขึ้นเมื่อมีหลายร้อยใบงาน

---

## Deploy
```bash
cp .env.local.example .env.local  # เติมค่าทุกช่อง
# แก้ .firebaserc → Project ID จริง
npm run deploy
```

## Drive Folder Structure
```
LMS Root
├── ม.3/1
│   ├── Assignments
│   └── Submissions / ชื่อนักเรียน
└── ม.3/18 …
```
