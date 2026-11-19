# web-com-learning — ระบบ e-Learning (Computing Science & IT)

Next.js app ที่รันบนเซิร์ฟเวอร์ของโรงเรียนเอง ไม่พึ่ง Firebase/Vercel

- **ฐานข้อมูล:** SQLite (`better-sqlite3`) ผ่าน API แบบ Firestore ใน `src/lib/db/` — route ต่างๆ ใช้ `adminDb` จาก `@/lib/db/admin`
- **ล็อกอิน:** Google OAuth โดยตรง + session cookie ที่เซ็นเอง (`src/lib/auth/`)
- **ไฟล์อัปโหลด:** Google Drive (`src/lib/google-drive/`)

## พัฒนา

```bash
npm run dev          # dev server
node --experimental-transform-types scripts/test-db-adapter.mts   # ทดสอบชั้นฐานข้อมูล
```

ค่าตั้งอยู่ใน `.env.local` (`DB_PATH`, `SESSION_SECRET`, `GOOGLE_OAUTH_*`, `GOOGLE_DRIVE_*`, ...)

## Deploy

commit ใน branch นี้ แล้วรัน `bash ~/sites/_tools/update-site.sh lms`
สำรองฐานข้อมูล: `scripts/backup-db.mjs` (รันอัตโนมัติทุกคืน)
