import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const storageBucket =
  process.env.FIREBASE_STORAGE_BUCKET ?? (projectId ? `${projectId}.firebasestorage.app` : undefined);

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket,
  });
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();
// Use REST instead of gRPC: on a serverless cold start this skips establishing
// an HTTP/2 gRPC channel before the first query, cutting cold-start latency for
// our bursty, one-shot read/write pattern (no server-side snapshot listeners).
// Wrapped because settings() may only be called once before first use (dev HMR
// can re-run this module).
try {
  adminDb.settings({ preferRest: true });
} catch {
  /* already configured on this instance */
}
export const adminStorage = getStorage();
