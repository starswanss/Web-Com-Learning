# vercel-redirect

Redirect-only deployment for the old Vercel address (web-com-learning.vercel.app).
Every path is sent permanently (308) to the self-hosted site at https://lms.rajsima.ac.th,
keeping the path. The app itself lives on `main` and is not built on Vercel.
