/**
 * One-time migration: stamp existing SUBMISSIONS with the admin's active term.
 *
 * The term moved from the assignment (reused every year) onto each submission.
 * New submissions are stamped at submit time; this backfills the ones that
 * predate that change.
 *
 * Only submissions from CURRENTLY-ENROLLED students (live user doc exists, is a
 * student, has a classId) are stamped — so past-term students' work stays
 * untagged and never leaks into the current term's views. Already-tagged
 * submissions are skipped.
 *
 * Usage (from the project root, so node_modules resolves):
 *   node scripts/backfill-submission-terms.mjs .env.local           # dry run
 *   node scripts/backfill-submission-terms.mjs .env.local --apply    # write
 */
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const envPath = process.argv[2] ?? '.env.local';
const APPLY = process.argv.includes('--apply');

const raw = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[m[1]] = v;
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = getFirestore();
db.settings({ preferRest: true });

// 1. Active term from system/config.
const cfg = await db.collection('system').doc('config').get();
const ct = cfg.exists ? cfg.data()?.currentTerm : null;
const academicYear = (ct && typeof ct.year === 'number') ? ct.year : (new Date().getFullYear() + 543);
const term = (ct && (ct.term === 1 || ct.term === 2)) ? ct.term : 1;
console.log(`Active term = ${academicYear}/${term}  (apply=${APPLY})`);

// 2. Currently-enrolled student ids (live user doc, role student, has classId).
const studentsSnap = await db.collection('users').where('role', '==', 'student').get();
const enrolled = new Set();
studentsSnap.docs.forEach((d) => { if (d.data().classId) enrolled.add(d.id); });
console.log(`Enrolled students: ${enrolled.size} / ${studentsSnap.size} student docs`);

// 3. Walk submissions, stamp the enrolled + untagged ones.
const subsSnap = await db.collection('submissions').get();
let toStamp = 0, alreadyTagged = 0, skippedNotEnrolled = 0;
let batch = db.batch();
let inBatch = 0;
const flush = async () => {
  if (inBatch === 0) return;
  if (APPLY) await batch.commit();
  batch = db.batch();
  inBatch = 0;
};

for (const d of subsSnap.docs) {
  const data = d.data();
  const tagged = typeof data.academicYear === 'number' && (data.term === 1 || data.term === 2);
  if (tagged) { alreadyTagged++; continue; }
  const sid = data.studentId;
  if (!sid || !enrolled.has(sid)) { skippedNotEnrolled++; continue; }
  toStamp++;
  if (APPLY) {
    batch.update(d.ref, { academicYear, term, termBackfilledAt: FieldValue.serverTimestamp() });
    if (++inBatch >= 400) await flush();
  }
}
await flush();

console.log('─'.repeat(50));
console.log(`submissions total      : ${subsSnap.size}`);
console.log(`already tagged (skip)  : ${alreadyTagged}`);
console.log(`not enrolled (skip)    : ${skippedNotEnrolled}`);
console.log(`${APPLY ? 'STAMPED' : 'would stamp'} → ${academicYear}/${term} : ${toStamp}`);
if (!APPLY) console.log('\n(dry run — re-run with --apply to write)');
process.exit(0);
