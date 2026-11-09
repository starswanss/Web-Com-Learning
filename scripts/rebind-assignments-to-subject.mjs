/**
 * One-time migration: unbind every existing assignment from specific rooms.
 *
 * Old worksheets / ใบความรู้ were created with a hand-picked room subset (often
 * an odd/even split) frozen in `classIds`. Assignments are now subject-wide, but
 * the student list still queries `classIds array-contains <room>`, so students
 * sitting in other rooms never saw those worksheets. This sets each assignment's
 * classIds to its SUBJECT's full room list → everyone who picked that subject
 * sees it. Applies to all content types (worksheet, quiz, knowledge).
 *
 * Usage (from project root):
 *   node scripts/rebind-assignments-to-subject.mjs .env.local            # dry run
 *   node scripts/rebind-assignments-to-subject.mjs .env.local --apply     # write
 */
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const envPath = process.argv[2] ?? '.env.local';
const APPLY = process.argv.includes('--apply');
const raw = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/); if (!m) continue;
  let v = m[2]; if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[m[1]] = v;
}
initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n') }) });
const db = getFirestore(); db.settings({ preferRest: true });

// subjectId → full room list
const subs = await db.collection('subjects').get();
const subjRooms = new Map(subs.docs.map((d) => [d.id, (d.data().classIds ?? []).slice().sort()]));
console.log('subjects:', subs.size, '| apply:', APPLY);

const asg = await db.collection('assignments').get();
let changed = 0, noSubject = 0, alreadyOk = 0;
let batch = db.batch(), inBatch = 0;
const flush = async () => { if (inBatch && APPLY) await batch.commit(); batch = db.batch(); inBatch = 0; };
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

for (const d of asg.docs) {
  const x = d.data();
  const sid = x.subjectId;
  if (!sid || !subjRooms.has(sid)) { noSubject++; continue; }
  const target = subjRooms.get(sid);
  const current = (x.classIds ?? []).slice().sort();
  if (eq(current, target)) { alreadyOk++; continue; }
  changed++;
  console.log(`  ${(x.title ?? '').slice(0, 42).padEnd(42)} ${JSON.stringify(x.classIds)} → ${target.length} rooms`);
  if (APPLY) { batch.update(d.ref, { classIds: target }); if (++inBatch >= 400) await flush(); }
}
await flush();

console.log('─'.repeat(50));
console.log(`assignments total : ${asg.size}`);
console.log(`already full      : ${alreadyOk}`);
console.log(`no subject (skip) : ${noSubject}`);
console.log(`${APPLY ? 'REBOUND' : 'would rebind'} → full subject rooms : ${changed}`);
if (!APPLY) console.log('\n(dry run — re-run with --apply to write)');
process.exit(0);
