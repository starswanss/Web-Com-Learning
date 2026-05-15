# LMS v0.8 — Computing Science & IT (ม.3)
> สร้าง: 2026-05-14 | v0.2: 2026-05-14 | v0.3: 2026-05-14 | v0.4: 2026-05-15 | v0.5: 2026-05-15 | v0.6: 2026-05-15 | v0.7: 2026-05-15 | v0.8: 2026-05-15

## ฟีเจอร์ทั้งหมดที่ Shipped

### Foundation & Auth
- [x] Next.js 16 App Router + Tailwind CSS + TypeScript
- [x] Google Login จำกัด domain โรงเรียน (`NEXT_PUBLIC_ALLOWED_DOMAIN`)
- [x] Firebase Session Cookie (HTTP-only, 5 วัน) — Admin SDK ทั้งหมด
- [x] Route guard via `proxy.ts`
- [x] Role: teacher (จาก `NEXT_PUBLIC_TEACHER_EMAILS`) / student
- [x] Onboarding 2-step: นักเรียนเลือกห้อง ม.3/1–18 → เลือกวิชา (ป้องกันเข้าวิชาผิด)
- [x] Profile โหลดผ่าน `GET /api/auth/session` (Admin SDK, ไม่พึ่ง client Firestore)
- [x] **Profile cache** ใน localStorage — โหลดทันทีสำหรับผู้ใช้ที่ login อยู่แล้ว ลด load time ~500ms
- [x] **PWA**: `manifest.json` + apple-web-app meta tags + theme-color → ติดตั้งได้บน Android/iOS

### Subject System
- [x] หน้าเลือกวิชา (`/select-subject`): แสดงก่อน Dashboard เสมอ ทั้งครูและนักเรียน
- [x] ครูจัดการวิชา (`/teacher/subjects`): สร้าง/ลบวิชา กำหนดห้องที่รับผิดชอบ
- [x] แยกใบงานตามวิชา: `?subject=` filter ในทุก API + `subjectId` บน assignments
- [x] นักเรียนเห็นเฉพาะวิชาของห้องตัวเอง (`/api/subjects/by-class?classId=`)
- [x] บันทึก subject ใน localStorage (`lms_subject = { id, name }`)

### Content Type & Unit
- [x] 3 ประเภทเนื้อหา: ใบความรู้ 📖, ใบงาน 📝, แบบทดสอบ ✏️ (เรียงตามลำดับนี้ในหน้าหลัก)
- [x] ไอคอนและสีต่างกันตามประเภท — badge บนทุกการ์ด
- [x] หน่วยการเรียนรู้ (unit field): จัดกลุ่มในหน้านักเรียน + Learning Path

### Due Date Logic
- [x] **ใบงาน**: กำหนดวันส่งบังคับ
- [x] **ใบความรู้**: กำหนดวันส่งไม่บังคับ
- [x] **แบบทดสอบ**: ไม่มีวันกำหนดส่ง — ครูเปิด/ปิดเองแบบ real-time
- [x] Traffic light: 🔴 เกินกำหนด · 🟠 < 3 วัน · 🟡 3–7 วัน · 🟢 7+ วัน

### Quiz Open/Close System
- [x] ครูเปิด/ปิดแบบทดสอบจากหน้าหลัก (▶ เปิดสอบ / ⏸ ปิดสอบ) คล้าย Google Forms
- [x] นักเรียนเห็น 🔒 หน้าล็อกเมื่อยังไม่เปิด — ไม่สามารถส่งได้
- [x] API ส่งคืน HTTP 423 หากพยายามส่งขณะปิด
- [x] `PATCH /api/teacher/toggle-quiz/[id]` toggle `isOpen` field

### Calendar View
- [x] **ปฏิทินนักเรียน** (`/student/calendar`): ปฏิทินเดือน แสดง dot สี traffic-light ตามวันกำหนดส่ง
- [x] **ปฏิทินครู** (`/teacher/calendar`): เช่นเดียวกัน คลิกวันเพื่อดูรายชื่อใบงาน
- [x] Navigation เดือนก่อน/หน้า + แสดงวันนี้

### Student Progress Dashboard
- [x] **หน้าภาพรวมนักเรียน** (`/teacher/students`): summary card (จำนวน, คะแนนเฉลี่ย, นักเรียนเสี่ยง)
- [x] **กรองตามห้อง**: ปุ่ม filter ห้องด้านบน
- [x] **Progress bar**: % งานที่ส่งต่อทั้งหมด
- [x] **Mini sparkline chart**: แนวโน้มคะแนนแต่ละชิ้นงาน (↑↓→)
- [x] **Tab switch รวม**: แสดง tabSwitchCount รวมต่อนักเรียน

### One-time Submission + Teacher Reset
- [x] นักเรียนส่งงานได้ครั้งเดียว (submissions API ส่งคืน 409 หากส่งซ้ำ)
- [x] ครูลบงานนักเรียนรายคนจากหน้าตรวจ → นักเรียนส่งใหม่ได้
- [x] **รีเซ็ตเทอม** (`/teacher/admin`): reset นักเรียนทั้งหมด + สร้าง Drive folder ปีใหม่

### Anti-Copy Enhancement
- [x] **Tab-switch detection**: `visibilitychange` listener นับครั้งออกจากหน้าระหว่างทำแบบทดสอบ
- [x] **Toast แจ้งเตือน**: "ตรวจพบการออกจากหน้านี้ (N ครั้ง) — ระบบบันทึกไว้แล้ว"
- [x] **บันทึก `tabSwitchCount`** ลง Firestore พร้อมกับ submission
- [x] **แสดงให้ครู**: หน้าตรวจงาน (per-submission) + Students dashboard (รวม)
- [x] **Anti-paste**: `onPaste preventDefault` + toast แจ้งเตือน

### Teacher Dashboard (Grouped)
- [x] แบ่งหมวด ใบความรู้ | ใบงาน | แบบทดสอบ — แต่ละหมวดมีปุ่ม "+ สร้าง" ของตัวเอง
- [x] ← กลับไปเลือกวิชาได้จากปุ่มหัวหน้า

### Teacher Assignment Overview — v0.5
- [x] **หน้าภาพรวม** (`/teacher/overview`): Google Classroom-style
- [x] Filter tab: ทั้งหมด | ใบงาน | ใบความรู้ | แบบทดสอบ
- [x] Summary cards: จำนวนใบงาน, รอตรวจ, ตรวจแล้ว
- [x] แต่ละ card: type badge, หน่วย, due date, จำนวนส่งแยกสถานะ, progress bar

### Leaderboard / Ranking — v0.5
- [x] **Teacher Leaderboard** (`/teacher/leaderboard`): อันดับพร้อมชื่อ, filter ตามห้อง, podium top 3
- [x] **Student Leaderboard** (`/student/leaderboard`): anonymized — rank#, คะแนนเฉลี่ย, highlight "ฉัน"
- [x] เรียงตาม avgScore desc → submittedCount desc

### Timer / Countdown — v0.5
- [x] **`timeLimit` field** (นาที) — เฉพาะ quiz
- [x] **Countdown timer**: สีเปลี่ยนตามเวลา เขียว→ส้ม→แดงกระพริบ
- [x] **Auto-submit** เมื่อหมดเวลา

### Template System — v0.5
- [x] บันทึก/โหลด Template (blocks, rubric, contentType, unit)
- [x] จัดการ Template (`/teacher/templates`): ดูรายการ + ลบ
- [x] Template เก็บใน Firestore `templates`

### Import from JSON — v0.5
- [x] วาง JSON → preview → ส่งต่อหน้าสร้างใบงาน (sessionStorage)
- [x] รองรับ: heading, paragraph, short/long-answer, multiple-choice, checkbox

### Teacher Tools
- [x] Assignment Builder: block-based (Heading, Paragraph, Image, Short/Long Answer, MC, Checkbox)
- [x] 2-column layout (`half` flag), Rubric per assignment
- [x] Grading Page (split-panel): Quick Grade AI + Batch Grade + Approve-All + Manual Grade
- [x] Export CSV, Plagiarism warning banner (> 60%)

### AI & Storage
- [x] Gemini 2.0 Flash: ตรวจอัตโนมัติ (0–100, feedback ภาษาไทย)
- [x] Plagiarism suspicion score, `answersToText()` + Rubric ต่อใบงาน
- [x] Google Drive: auto-create year folder (`ปีการศึกษา 2568/`) + class/student folders

### Timetable — v0.6
- [x] **ตารางสอน** (`/teacher/timetable`): จันทร์–ศุกร์, โฮมรูม 08:00–08:50 + คาบ 1–10 ทุก 50 นาที
- [x] **คลิกเซลล์แก้ไข**: พิมพ์วิชา + ห้อง → Enter/ตกลง บันทึก
- [x] บันทึกลง Firestore `system/timetable` — ดูได้ทุก role (ไม่ต้อง auth)
- [x] ปุ่ม "บันทึก" ส่ง POST ครั้งเดียว (ไม่ autosave ทุก cell)
- [x] **Embed ในหน้าหลักครู**: sidebar แสดงตารางวันนี้ + highlight คาบปัจจุบัน

### Logo Management — v0.6
- [x] **อัปโหลดโลโก้โรงเรียน** ใน `/teacher/admin`: เลือกไฟล์ (อ่านเป็น base64) หรือวาง URL
- [x] Preview ก่อนบันทึก
- [x] บันทึกลง Firestore `system/config.logoUrl`

### Question Bank — v0.6
- [x] **คลังคำถาม** (`/teacher/question-bank`): สร้าง/ลบคำถาม 4 ประเภท
- [x] ประเภท: ตอบสั้น, ตอบยาว, ตัวเลือก (MC), เลือกหลายข้อ (Checkbox)
- [x] ระบบแท็ก: เพิ่ม/กรองคำถามตามแท็ก
- [x] เก็บใน Firestore `questionBank`

### Advanced Analytics v2 — v0.6
- [x] **Score Distribution Histogram**: bucket 10 คะแนน (0–9, 10–19, …, 90–100) พร้อมสีตาม traffic-light
- [x] **Weekly Trend Line Chart**: แนวโน้มส่งงาน 8 สัปดาห์ล่าสุด (fill area)
- [x] ทั้งสองแสดงใน `/teacher/analytics` ต่อจากกราฟ class เดิม

### Student Learning Path — v0.6
- [x] **เส้นทางการเรียนรู้** ใน `/student/profile`: จัดกลุ่มใบงานตามหน่วย
- [x] แต่ละหน่วย: progress bar %, จำนวนส่ง/ทั้งหมด, avg score badge, icon สถานะ ✅📖🔒
- [x] API `/api/student/stats` คืน `unit` field ต่อใบงาน

### Export / Print Report — v0.6
- [x] **หน้า Export** (`/teacher/export-report`): ตารางนักเรียนทุกคน + คะแนนเฉลี่ย + Tab Switch
- [x] กรองตามห้อง, summary stats (จำนวน, avg score, avg submit)
- [x] ปุ่ม "🖨 พิมพ์" → `window.print()` + print-friendly CSS (ซ่อน header, bg → ขาว)

### Performance — v0.6
- [x] **Profile localStorage cache**: `onAuthStateChanged` ใช้ cache ก่อน → `loading=false` ทันที, refresh ใน background
- [x] **ลด Firestore reads**: Student API รับ `?classId=` จาก client → ไม่ต้อง user doc read ซ้ำ
- [x] **ลบ `.orderBy()` compound queries**: subjects, assignments, by-class ทุก API เรียงใน JS แทน → ไม่ต้อง composite index

### Home Page Dashboard — v0.6
- [x] **หน้าหลักครู**: 6 stat cards + mini calendar + today's timetable sidebar + assignment sections
- [x] **หน้าหลักนักเรียน**: 4 stat cards + mini calendar + upcoming deadline sidebar + score bar

### Achievement Badges — v0.7
- [x] **5 badges** คำนวณอัตโนมัติจาก `/api/student/stats`:
  - 🏆 ส่งงานครบ — submitted === total
  - ⭐ คะแนนดีเด่น — avgScore ≥ 80
  - ⚡ ส่งก่อนกำหนด — ≥ 3 ชิ้น
  - 🧘 ซื่อสัตย์ — ไม่มี tab switch ทุกชิ้น
  - 🔥 ไม่เคยช้า — ส่งทันทุกครั้ง
- [x] แสดงใน `/student/profile` พร้อม desc tooltip

### Q-Bank Import for Quiz — v0.7
- [x] **"📦 นำเข้าจาก Q-Bank"** ปุ่มในหน้าสร้างใบงาน — เปิด modal เลือกคำถามจาก Q-Bank
- [x] Filter ตาม type + tag, เลือกด้วย checkbox
- [x] ตั้งค่า "สุ่ม N ข้อ" จากที่เลือก (Fisher-Yates shuffle)
- [x] คำถามที่เลือกแปลงเป็น FormBlocks ต่อท้ายใบงาน

### Parent Report — v0.7
- [x] **สร้างลิงก์ผู้ปกครอง** จากหน้า `/teacher/students` → ปุ่ม "🔗 ลิงก์" ต่อนักเรียน
- [x] Token เก็บใน Firestore `parentTokens/{token}` หมดอายุ 30 วัน
- [x] หน้า **`/parent/[token]`** public (ไม่ต้อง login): แสดงชื่อ, ห้อง, stats, รายการใบงาน+คะแนน
- [x] Copy to clipboard ลิงก์ได้ทันที

### Bug Fix — v0.7
- [x] **Profile page filter by subject**: `/api/student/stats` รับ `?subject=` และกรองใน JS เพื่อไม่ให้แสดงใบงานวิชาอื่น

### Bonus Points System — v0.8
- [x] **Firestore collection `bonusPoints`**: fields — studentId, studentName, classId, points, medal, reason, teacherId, createdAt
- [x] **4 ประเภทเหรียญ**: ⭐ Gold Star, 💎 Diamond, 🏅 Silver Medal, 🎖 Special Award
- [x] **Teacher Bonus Page** (`/teacher/bonus-points`): ค้นหานักเรียนด้วยอีเมล/ชื่อ → เลือกเหรียญ + คะแนน [5/10/15/20/30/custom] + เหตุผล → มอบ
- [x] **Search API** (`GET /api/teacher/bonus-points/search?email=`): ค้นหา exact → partial match
- [x] **ประวัติ + ยกเลิก**: แสดงรายการ bonus ทั้งหมด, ครูยกเลิกได้
- [x] **`totalScore = avgScore + bonusPoints`** ทั้งใน teacher + student leaderboard API
- [x] **Chunked Firestore `in` query**: รองรับนักเรียนมากกว่า 30 คน (chunk ละ 30)

### Student Self-Assessment — v0.8
- [x] **Slider 0–100 ก่อนส่งงาน**: นักเรียนประเมินตัวเองก่อน submit
- [x] **emoji feedback**: < 50 → 😟 · 50–79 → 🤔 · ≥ 80 → 😊
- [x] **บันทึก `selfScore`** ลง Firestore พร้อม submission (ไม่กระทบคะแนนจริง)
- [x] ครูเห็น selfScore ในหน้าตรวจงาน เปรียบเทียบกับ AI score

### Spectacular Leaderboard Redesign — v0.8
- [x] **Podium 3 ขั้น**: อันดับ 2 (กลาง-ซ้าย, silver) | อันดับ 1 (กลาง, gold, ใหญ่สุด) | อันดับ 3 (ขวา, bronze)
- [x] อันดับ 1: gradient ทอง, 👑 กระเด้ง, avatar ใหญ่, font `text-5xl font-black`
- [x] แต่ละ card: ชื่อ, ห้อง, totalScore, breakdown avg+bonus, medal icons, จำนวนส่ง
- [x] Student view: anonymous + highlight "ฉัน" พร้อมลูกศร ← ฉัน
- [x] "My rank card" แสดงด้านบนหากไม่อยู่ top-3
- [x] ปุ่ม "⭐ ให้ Bonus" ใน header ครูลิงก์ไป `/teacher/bonus-points`

### LINE Notify Integration — v0.8
- [x] **`src/lib/line-notify.ts`**: `sendLineNotify(token, message)` + `getLineNotifyToken(adminDb)`
- [x] **API** (`GET/POST /api/teacher/line-notify`): GET คืน token ปัจจุบัน, POST บันทึกลง `system/config.lineNotifyToken`
- [x] **Admin UI**: section "📱 LINE Notify" ใน `/teacher/admin` — input password, save button, คำแนะนำขั้นตอนรับ token
- [x] **Trigger**: แจ้งเตือนอัตโนมัติเมื่อสร้างใบงานใหม่ (best-effort, ไม่ block main flow)

---

## API Routes (v0.8)

| Method | Path | ใคร | ทำอะไร |
|---|---|---|---|
| POST/GET/DELETE | `/api/auth/session` | ทุกคน | Login + profile + logout |
| POST | `/api/auth/onboarding` | นักเรียน | เลือกห้อง + วิชา |
| GET/POST/DELETE | `/api/subjects` | ครู | จัดการวิชา |
| GET | `/api/subjects/student` | นักเรียน | วิชาที่นักเรียนอยู่ |
| GET | `/api/subjects/by-class?classId=` | ทุกคน | วิชาของห้องนี้ (onboarding) |
| GET | `/api/assignments?subject=` | ครู | รายการใบงาน |
| POST/DELETE | `/api/assignments` | ครู | สร้าง/ลบใบงาน |
| GET/PATCH | `/api/assignments/[id]` | ครู | โหลด/แก้ไขใบงาน |
| GET | `/api/assignments/student?subject=&classId=` | นักเรียน | รายการ + สถานะส่ง |
| GET | `/api/assignments/student/[id]` | นักเรียน | ดูใบงานเดี่ยว |
| POST | `/api/submissions` | นักเรียน | ส่งงาน (+ tabSwitchCount, quiz lock check) |
| GET | `/api/submissions/[assignmentId]` | นักเรียน | ดูงานที่ส่งแล้ว |
| GET | `/api/teacher/submissions/[assignmentId]` | ครู | รายชื่อนักเรียนที่ส่ง |
| DELETE | `/api/teacher/submission/[submissionId]` | ครู | ลบงานนักเรียน (ให้ส่งใหม่) |
| PATCH | `/api/teacher/grade/[id]` | ครู | ให้คะแนน manual → reviewed |
| POST | `/api/teacher/quick-grade/[id]` | ครู | ตรวจเร็ว AI เดี่ยว |
| POST | `/api/teacher/batch-grade/[assignmentId]` | ครู | ตรวจ AI ทั้งหมด |
| POST | `/api/teacher/approve-all/[assignmentId]` | ครู | batch approve → reviewed |
| PATCH | `/api/teacher/toggle-quiz/[id]` | ครู | เปิด/ปิดแบบทดสอบ |
| POST | `/api/teacher/reset-term` | ครู | รีเซ็ตนักเรียนทั้งหมด + Drive folder ใหม่ |
| GET | `/api/teacher/overview?subject=` | ครู | ภาพรวมใบงาน + สถิติ |
| GET | `/api/teacher/students?subject=` | ครู | ความก้าวหน้านักเรียน |
| GET | `/api/teacher/leaderboard?subject=&classId=` | ครู | อันดับนักเรียน (พร้อมชื่อ) |
| GET/POST/DELETE | `/api/teacher/templates` | ครู | จัดการ Template |
| GET/POST/DELETE | `/api/teacher/question-bank` | ครู | คลังคำถาม |
| GET/POST | `/api/teacher/timetable` | ครู/ทุกคน | ตารางสอน |
| GET/POST | `/api/teacher/logo` | ครู/ทุกคน | โลโก้โรงเรียน |
| POST/DELETE | `/api/teacher/parent-token` | ครู | สร้าง/ยกเลิก token ผู้ปกครอง |
| GET | `/api/parent/[token]` | public | รายงานนักเรียน (ไม่ต้อง auth) |
| GET | `/api/student/stats?subject=` | นักเรียน | portfolio + unit breakdown + badges |
| GET | `/api/student/leaderboard?subject=` | นักเรียน | อันดับ (anonymized) |
| GET | `/api/analytics` | ครู | กราฟ + distribution + weekly trend |
| GET/POST/DELETE | `/api/teacher/bonus-points` | ครู | มอบ/ลิสต์/ยกเลิก bonus |
| GET | `/api/teacher/bonus-points/search?email=` | ครู | ค้นหานักเรียนด้วยอีเมล/ชื่อ |
| GET/POST | `/api/teacher/line-notify` | ครู | อ่าน/บันทึก LINE Notify token |

---

## Firestore Collections (v0.8)

| Collection | Fields หลัก |
|---|---|
| `users` | uid, email, role, classId, subjectId, onboardingComplete |
| `subjects` | name, teacherId, classIds[], createdAt |
| `assignments` | title, description, dueDate, classIds[], teacherId, blocks[], rubric, subjectId, unit, contentType, timeLimit, isOpen, driveFileId |
| `submissions` | assignmentId, studentId, classId, content, answers{}, score, feedback, plagiarismSuspicion, tabSwitchCount, selfScore, status, submittedAt |
| `bonusPoints` | studentId, studentName, classId, points, medal, reason, teacherId, createdAt |
| `templates` | name, contentType, unit, blocks[], rubric, teacherId, createdAt |
| `questionBank` | type, question, options[], tags[], teacherId, createdAt |
| `parentTokens` | studentId, studentName, classId, createdBy, createdAt, expiresAt |
| `system/config` | logoUrl, logoUpdatedBy, academicYear, lastResetAt, yearFolderDriveId, lineNotifyToken, lineNotifyUpdatedBy, lineNotifyUpdatedAt |
| `system/timetable` | cells{`day_period`: {subject, room}}, updatedBy, updatedAt |

**status flow:** `submitted` → (AI) → `graded` → (approve/manual) → `reviewed`

## Firestore Index Notes
ทุก query ที่ต้องการ compound filter ใช้วิธีดึงข้อมูลแล้วเรียงใน JavaScript แทน เพื่อหลีกเลี่ยงการสร้าง composite index — ดูแล้วก็ทำงานได้เร็วพอสำหรับ ~400 นักเรียน

## Shared Files
- `src/types/index.ts` — ContentType, CONTENT_TYPE_LABELS, Subject, Assignment
- `src/app/(protected)/teacher/assignments/_builder.tsx` — BlockCard, BlockEditor, makeBlock, groupBlocks, BLOCK_LABELS, ALL_CLASSES
- `src/lib/gemini/index.ts` — `gradeSubmission()` + `answersToText()`
- `src/lib/google-drive/index.ts` — `ensureYearFolder()`, `ensureClassFolders()`, `ensureStudentFolder()`, `uploadFileToDrive()`
- `src/context/AuthContext.tsx` — profile cache in localStorage

## Drive Folder Structure
```
LMS Root/
└── ปีการศึกษา 2568/
    └── ม.3/1/
        ├── Assignments/
        └── Submissions/
            └── ชื่อนักเรียน/
```

---

## แผน v0.9 — ฟีเจอร์แนะนำ

### 1. 🔄 Peer Review System
หลังส่งงาน ระบบสุ่มให้นักเรียนตรวจงานเพื่อน 1–2 คนตาม rubric เดียวกัน — เพิ่มทักษะ critical thinking ลดภาระครู มี interface ให้คะแนน + comment โดยไม่เปิดเผยชื่อ

### 2. 🔔 Push Notification (Web Push API)
แจ้งเตือนผ่าน browser push เมื่อ: ใบงานใหม่ถูกมอบหมาย, ใกล้วันกำหนดส่ง (24 ชม.), ครูตรวจงานเสร็จ — ใช้ Service Worker + VAPID keys + `web-push` library

### 3. 🗂 Multi-Teacher / Department Support
รองรับครูหลายคนในระบบเดียว: แต่ละครูจัดการวิชาของตัวเอง, admin teacher มองเห็น overview ทุกวิชา, แชร์วิชาระหว่างครูได้ — เหมาะกับโรงเรียนที่มีหลายวิชาคอมฯ

### 4. 🗓 Assignment Scheduler (Publish Later)
ครูสร้างใบงานล่วงหน้าและตั้งเวลา "เปิดให้นักเรียนเห็น" — เช่น เปิดวันจันทร์ 08:00, ปิดรับวันศุกร์ 23:59; ระบบใช้ cron job (Vercel Cron) ตรวจสถานะทุก 5 นาที

### 5. 📝 Rich Text Editor (Tiptap)
แทน plain textarea ด้วย rich text editor: bold/italic/underline, ลิสต์, code block, image upload inline — นักเรียนส่งงานที่มีการจัดรูปแบบสวยงาม ครูเห็น rendered HTML

### 6. 🤖 AI Study Assistant (Chatbot)
ปุ่ม "ถามอาจารย์ AI" ในหน้าดูใบงาน — chatbot ตอบคำถามเกี่ยวกับเนื้อหาในใบงานนั้นโดยเฉพาะ (RAG-lite: ส่ง content ของใบงานเป็น context ใน prompt) ช่วยนักเรียนที่ติดปัญหาโดยไม่ต้องรอครู

---

## Deploy
```bash
cp .env.local.example .env.local
npm run dev      # development
npm run build    # production build
```

## Environment Variables ที่จำเป็น
```
NEXT_PUBLIC_ALLOWED_DOMAIN=
NEXT_PUBLIC_TEACHER_EMAILS=
NEXT_PUBLIC_FIREBASE_*=          # client Firebase config
FIREBASE_SERVICE_ACCOUNT_JSON=   # Admin SDK
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_ROOT_FOLDER_ID=
GEMINI_API_KEY=
```
