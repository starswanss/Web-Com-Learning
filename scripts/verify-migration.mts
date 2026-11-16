/**
 * Verify the SQLite copy matches Firestore document-for-document (read-only).
 * Walks subcollections too. Run after migrate-firestore-to-sqlite.mts:
 *   node --experimental-transform-types --no-warnings scripts/verify-migration.mts [.env.local] [data/lms.db]
 */
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { openFirestore } from '../src/lib/db/index.ts';

const envPath = process.argv[2] ?? '.env.local';
const dbPath = process.argv[3] ?? process.env.DB_PATH ?? 'data/lms.db';
const env: Record<string, string> = {};
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if (v.startsWith('"')) v = JSON.parse(v);
  env[m[1]] = v;
}
initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

// Key-sorted JSON so field order doesn't matter; Timestamps serialise identically.
const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
      : v;
const json = (v: unknown) => JSON.stringify(canon(JSON.parse(JSON.stringify(v ?? null))));

const remote = getFirestore();
const local = openFirestore(dbPath);
let n = 0;
let bad = 0;

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

type FsCollection = ReturnType<typeof remote.collection>;
async function check(col: FsCollection): Promise<void> {
  for (const d of (await col.get()).docs) {
    n++;
    const a = json(d.data());
    const b = json((await local.collection(col.path).doc(d.id).get()).data());
    if (a !== b && bad++ < 5) console.log('DIFF', col.path, d.id, '\n  firestore:', a.slice(0, 300), '\n  sqlite:   ', b.slice(0, 300));
  }
  await pool(await col.listDocuments(), 20, async (ref) => {
    for (const sub of await ref.listCollections()) await check(sub);
  });
}

for (const col of await remote.listCollections()) await check(col);
console.log(`compared ${n} docs, ${bad} differ`);
local.close();
process.exitCode = bad ? 1 : 0;
