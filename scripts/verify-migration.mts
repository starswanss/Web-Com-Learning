/**
 * Verify the SQLite copy matches Firestore document-for-document (read-only).
 * Run after migrate-firestore-to-sqlite.mts:
 *   node --experimental-transform-types --no-warnings scripts/verify-migration.mts
 */
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { openFirestore } from '../src/lib/db/index.ts';
const env: Record<string,string> = {};
for (const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(!m) continue; let v=m[2]; if(v.startsWith('"')) v=JSON.parse(v); env[m[1]]=v; }
initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY }) });
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon((v as any)[k])])) : v;
const fs1 = getFirestore(); const local = openFirestore('data/lms.db');
let n=0, bad=0;
for (const col of await fs1.listCollections()) for (const d of (await col.get()).docs) {
  n++; const a = JSON.stringify(canon(JSON.parse(JSON.stringify(d.data()))));
  const b = JSON.stringify(canon(JSON.parse(JSON.stringify((await local.collection(col.id).doc(d.id).get()).data()))));
  if (a !== b) { if (bad++ < 3) console.log('DIFF', col.id, d.id, a.slice(0,300), '\n  vs', b.slice(0,300)); }
}
console.log(`compared ${n} docs, ${bad} differ`);
