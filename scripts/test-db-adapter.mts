/**
 * Self-test for src/lib/db (the SQLite-backed Firestore replacement).
 * Run: node --experimental-transform-types scripts/test-db-adapter.mts
 */
import assert from 'node:assert/strict';
import { openFirestore, FieldValue, Timestamp } from '../src/lib/db/index.ts';

const db = openFirestore(':memory:');
let passed = 0;
async function t(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
}

await t('set/get roundtrip + Date→Timestamp', async () => {
  const d = new Date('2026-01-02T03:04:05.678Z');
  await db.collection('users').doc('u1').set({ name: 'A', role: 'student', at: d, nested: { x: 1 }, tags: ['a', 'b'], ok: true, nil: null });
  const s = await db.collection('users').doc('u1').get();
  assert.equal(s.exists, true);
  const data = s.data()!;
  assert.ok(data.at instanceof Timestamp);
  assert.equal(data.at.toDate().toISOString(), d.toISOString());
  assert.deepEqual(JSON.parse(JSON.stringify(data.at)), { _seconds: Math.floor(d.getTime() / 1000), _nanoseconds: 678_000_000 });
  assert.deepEqual(data.nested, { x: 1 });
  assert.equal(s.get('nested.x'), 1);
});

await t('missing doc', async () => {
  const s = await db.collection('users').doc('nope').get();
  assert.equal(s.exists, false);
  assert.equal(s.data(), undefined);
});

await t('set merge deep-merges maps', async () => {
  const r = db.collection('m').doc('a');
  await r.set({ a: 1, map: { x: 1, y: 2 } });
  await r.set({ b: 2, map: { y: 3, z: 4 } }, { merge: true });
  assert.deepEqual((await r.get()).data(), { a: 1, b: 2, map: { x: 1, y: 3, z: 4 } });
  await r.set({ c: 3 });
  assert.deepEqual((await r.get()).data(), { c: 3 });
});

await t('update dotted paths, replaces maps, NOT_FOUND', async () => {
  const r = db.collection('m').doc('u');
  await r.set({ map: { x: 1, y: 2 }, keep: 1 });
  await r.update({ 'map.x': 9, 'deep.a.b': 1 });
  assert.deepEqual((await r.get()).data(), { map: { x: 9, y: 2 }, keep: 1, deep: { a: { b: 1 } } });
  await r.update({ map: { z: 1 } });
  assert.deepEqual((await r.get()).data()!.map, { z: 1 });
  await assert.rejects(db.collection('m').doc('none').update({ a: 1 }), (e: { code: number }) => e.code === 5);
});

await t('FieldValue sentinels', async () => {
  const r = db.collection('fv').doc('x');
  await r.set({ n: 1, arr: ['a'], gone: 1 });
  await r.update({ n: FieldValue.increment(2), fresh: FieldValue.increment(5), arr: FieldValue.arrayUnion('a', 'b'), gone: FieldValue.delete(), ts: FieldValue.serverTimestamp() });
  let d = (await r.get()).data()!;
  assert.equal(d.n, 3);
  assert.equal(d.fresh, 5);
  assert.deepEqual(d.arr, ['a', 'b']);
  assert.equal('gone' in d, false);
  assert.ok(d.ts instanceof Timestamp && Math.abs(d.ts.toMillis() - Date.now()) < 5000);
  await r.set({ arr: FieldValue.arrayRemove('a'), stats: { c: FieldValue.increment(1) } }, { merge: true });
  await r.set({ stats: { c: FieldValue.increment(1) } }, { merge: true });
  d = (await r.get()).data()!;
  assert.deepEqual(d.arr, ['b']);
  assert.equal(d.stats.c, 2);
  await r.update({ 'stats.c': FieldValue.increment(10) });
  assert.equal((await r.get()).data()!.stats.c, 12);
});

await t('add / doc() auto ids', async () => {
  const ref = await db.collection('auto').add({ v: 1 });
  assert.equal(ref.id.length, 20);
  assert.equal((await ref.get()).data()!.v, 1);
  assert.equal(db.collection('auto').doc().id.length, 20);
});

await t('where == / in / array-contains / __name__ / types', async () => {
  const c = db.collection('q');
  await c.doc('1').set({ a: 'x', n: 1, b: true, cls: ['m1', 'm2'], at: new Date(1000) });
  await c.doc('2').set({ a: 'y', n: 2, b: false, cls: ['m2'], at: new Date(2000) });
  await c.doc('3').set({ a: 'x', n: '1', b: 1, cls: 'm1' });
  const ids = async (q: { get(): Promise<{ docs: { id: string }[] }> }) => (await q.get()).docs.map((d) => d.id);
  assert.deepEqual(await ids(c.where('a', '==', 'x')), ['1', '3']);
  assert.deepEqual(await ids(c.where('n', '==', 1)), ['1']); // string '1' must not match
  assert.deepEqual(await ids(c.where('b', '==', true)), ['1']); // number 1 must not match
  assert.deepEqual(await ids(c.where('a', 'in', ['y', 'z'])), ['2']);
  assert.deepEqual(await ids(c.where('cls', 'array-contains', 'm1')), ['1']); // non-array ignored
  assert.deepEqual(await ids(c.where('cls', 'array-contains', 'm2')), ['1', '2']);
  assert.deepEqual(await ids(c.where('__name__', 'in', ['3', '1'])), ['1', '3']);
  assert.deepEqual(await ids(c.where('a', '==', 'x').where('n', '==', 1)), ['1']);
  assert.deepEqual(await ids(c.where('at', '==', new Date(2000))), ['2']);
  assert.deepEqual(await ids(c.where('a', 'in', [])), []);
  assert.deepEqual(await ids(c.where('n', '>=', 1)), ['1', '2']);
});

await t('orderBy excludes missing, desc, limit, immutability', async () => {
  const c = db.collection('o');
  await c.doc('a').set({ t: new Date(3000), k: 1 });
  await c.doc('b').set({ t: new Date(1000), k: 1 });
  await c.doc('c').set({ k: 1 });
  await c.doc('d').set({ t: new Date(2000), k: 2 });
  const base = c.where('k', '==', 1);
  const ordered = base.orderBy('t', 'desc');
  assert.deepEqual((await ordered.get()).docs.map((d) => d.id), ['a', 'b']);
  assert.deepEqual((await ordered.limit(1).get()).docs.map((d) => d.id), ['a']);
  assert.equal((await base.get()).size, 3); // base unchanged by derived queries
  assert.deepEqual((await c.orderBy('t').get()).docs.map((d) => d.id), ['b', 'd', 'a']);
});

await t('getAll keeps order', async () => {
  const c = db.collection('o');
  const snaps = await db.getAll(c.doc('d'), c.doc('zz'), c.doc('a'));
  assert.deepEqual(snaps.map((s) => [s.id, s.exists]), [['d', true], ['zz', false], ['a', true]]);
});

await t('batch is atomic and ordered', async () => {
  const c = db.collection('bt');
  const b = db.batch();
  b.set(c.doc('1'), { v: 1 });
  b.update(c.doc('1'), { v: FieldValue.increment(1) });
  b.set(c.doc('2'), { v: 1 });
  await b.commit();
  assert.equal((await c.doc('1').get()).data()!.v, 2);
  const bad = db.batch();
  bad.set(c.doc('3'), { v: 1 });
  bad.update(c.doc('missing'), { v: 1 });
  await assert.rejects(bad.commit());
  assert.equal((await c.doc('3').get()).exists, false); // rolled back
  const del = db.batch();
  del.delete(c.doc('2'));
  await del.commit();
  assert.equal((await c.doc('2').get()).exists, false);
});

await t('snapshot.ref.update works', async () => {
  const snap = (await db.collection('bt').where('v', '==', 2).get()).docs[0];
  await snap.ref.update({ w: 1 });
  assert.equal((await snap.ref.get()).data()!.w, 1);
});

await t('subcollection paths', async () => {
  await db.doc('readStats/2026-01-02/students/u1').set({ reads: FieldValue.increment(3) }, { merge: true });
  await db.doc('readStats/2026-01-02/students/u1').set({ reads: FieldValue.increment(2) }, { merge: true });
  await db.collection('readStats').doc('2026-01-02').collection('students').doc('u2').set({ reads: 1 });
  const snap = await db.collection('readStats/2026-01-02/students').get();
  assert.deepEqual(snap.docs.map((d) => [d.id, d.data().reads]), [['u1', 5], ['u2', 1]]);
  assert.equal((await db.collection('readStats').get()).size, 0); // parent doc never created
  assert.ok(!(await db.listCollections()).some((c) => c.id.includes('/')));
  assert.throws(() => db.collection('a/b'));
  assert.throws(() => db.doc('a'));
});

await t('Timestamp compare and JSON', async () => {
  const a = Timestamp.fromMillis(1000), b = Timestamp.fromMillis(2000);
  assert.ok(a < b);
  assert.equal(JSON.stringify({ a }), '{"a":{"_seconds":1,"_nanoseconds":0}}');
});

console.log(`${passed} test groups passed${process.exitCode ? ' (with failures)' : ''}`);
