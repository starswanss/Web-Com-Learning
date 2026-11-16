/**
 * Copy every Firestore collection into the local SQLite database.
 *
 * READ-ONLY on Firestore. Wipes and reloads the SQLite file each run, so it can
 * be run once for testing and again at cutover (after freezing the old site).
 *
 * Usage (project root):
 *   node --experimental-transform-types --no-warnings scripts/migrate-firestore-to-sqlite.mts [.env.local] [data/lms.db]
 */
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp as FsTimestamp, DocumentReference as FsRef, GeoPoint } from 'firebase-admin/firestore';
import { openFirestore, Timestamp } from '../src/lib/db/index.ts';

const envPath = process.argv[2] ?? '.env.local';
const dbPath = process.argv[3] ?? process.env.DB_PATH ?? 'data/lms.db';

const env: Record<string, string> = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if (v.startsWith('"') && v.endsWith('"')) v = JSON.parse(v);
  env[m[1]] = v;
}
for (const k of ['FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_ADMIN_PRIVATE_KEY']) {
  if (!env[k]) throw new Error(`${k} missing in ${envPath}`);
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const fsdb = getFirestore();

const unknownTypes = new Map<string, number>();

/** Convert firebase-admin values into the adapter's value model. */
function convert(v: unknown): unknown {
  if (v instanceof FsTimestamp) return new Timestamp(v.seconds, v.nanoseconds);
  if (v instanceof FsRef) {
    unknownTypes.set('DocumentReference', (unknownTypes.get('DocumentReference') ?? 0) + 1);
    return v.path;
  }
  if (v instanceof GeoPoint) {
    unknownTypes.set('GeoPoint', (unknownTypes.get('GeoPoint') ?? 0) + 1);
    return { latitude: v.latitude, longitude: v.longitude };
  }
  if (Array.isArray(v)) return v.map(convert);
  if (v !== null && typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      const name = proto?.constructor?.name ?? 'unknown';
      unknownTypes.set(name, (unknownTypes.get(name) ?? 0) + 1);
    }
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = convert(val);
    return out;
  }
  return v;
}

const local = openFirestore(dbPath);
local._conn().exec('DELETE FROM docs');

let total = 0;
const report: [string, number, number][] = [];
for (const col of await fsdb.listCollections()) {
  const snap = await col.get();
  const subCounts = await Promise.all(snap.docs.slice(0, 50).map(async (d) => (await d.ref.listCollections()).length));
  if (subCounts.some((n) => n > 0)) console.warn(`WARNING: ${col.id} has subcollections (not migrated)`);

  // Chunk to keep each transaction modest.
  for (let i = 0; i < snap.docs.length; i += 500) {
    const batch = local.batch();
    for (const d of snap.docs.slice(i, i + 500)) {
      batch.set(local.collection(col.id).doc(d.id), convert(d.data()) as Record<string, unknown>);
    }
    await batch.commit();
  }
  const localCount = (await local.collection(col.id).get()).size;
  report.push([col.id, snap.size, localCount]);
  total += snap.size;
}

console.log('collection'.padEnd(22), 'firestore'.padStart(9), 'sqlite'.padStart(8));
for (const [name, a, b] of report) console.log(name.padEnd(22), String(a).padStart(9), String(b).padStart(8), a === b ? '' : '  MISMATCH');
console.log('TOTAL'.padEnd(22), String(total).padStart(9));
if (unknownTypes.size) console.warn('Non-plain values converted:', Object.fromEntries(unknownTypes));
local._conn().pragma('wal_checkpoint(TRUNCATE)');
local.close();
console.log(`Wrote ${dbPath}`);
