@AGENTS.md

# Working rules (ผู้ใช้กำหนด)

- **อย่า push เอง** — commit ได้ แต่ต้องรอให้ผู้ใช้สั่ง "push" ทุกครั้งก่อนจึงจะ `git push`
- **deploy ได้เลยไม่ต้องถาม** — หลัง commit ลง `main` แล้ว build ผ่าน ให้รัน `bash ~/sites/_tools/update-site.sh lms` ขึ้นเว็บจริงได้ทันที แล้วเช็คหน้าเว็บ/log หลัง deploy
- **ทุกครั้งที่เริ่มงาน/เปิดโปรแกรม** ให้รัน `npm run dev` (dev server) ให้ก่อน
