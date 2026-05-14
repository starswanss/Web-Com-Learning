# Phase 3 Complete — Teacher & Storage

## What was built

### Google Drive Integration (`src/lib/google-drive/index.ts`)
- Auto-creates folder structure: `LMS Root > ม.3/X > Assignments / Submissions`
- Idempotent `getOrCreateFolder` — safe to call multiple times
- `uploadAssignmentFile` — uploads file to the correct class folder and makes it publicly readable
- `ensureStudentFolder` — creates per-student submission folder (used in Phase 4+)

### Teacher Dashboard (`/teacher`)
- Header with teacher name, photo, logout
- Lists all assignments created by this teacher (fetched from Firestore via `/api/assignments`)
- Delete assignment button (server verifies teacher ownership)
- "สร้างใบงาน" button → navigates to creation form

### Assignment Creation (`/teacher/assignments/new`)
- Fields: title, description, due date, class selection (ม.3/1–18), file upload
- "Select all" toggle for classes
- On submit: uploads file to Google Drive (one copy per class folder), saves assignment to Firestore

### Assignments API (`/api/assignments`)
- `GET` — list teacher's assignments (requires session cookie + teacher role)
- `POST` — create assignment with optional file upload (multipart/form-data)
- `DELETE` — delete assignment (verifies teacher ownership)

## Environment variables needed
Copy `.env.local.example` to `.env.local` and fill in all values before running.

## Next steps (Phase 4+)
- Student assignment view (list assignments for their class)
- Student file submission flow
- Gemini AI grading (`/api/ai/grade`)
- Plagiarism detection
