/**
 * Consistent online backup of the SQLite database (safe while the site is
 * running — uses SQLite's backup API, not a file copy), gzipped, keeping the
 * newest N backups.
 *
 * Usage (from the app folder):
 *   node scripts/backup-db.mjs <db-file> <backup-dir> [keep=14]
 * Restore: stop the service, gunzip the chosen file over <db-file>
 *   (delete <db-file>-wal and <db-file>-shm first), start the service.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import Database from 'better-sqlite3';

const [dbFile, backupDir, keepArg] = process.argv.slice(2);
if (!dbFile || !backupDir) {
  console.error('usage: node scripts/backup-db.mjs <db-file> <backup-dir> [keep]');
  process.exit(1);
}
const keep = Number(keepArg ?? 14);
if (!fs.existsSync(dbFile)) {
  console.error(`No database at ${dbFile}`);
  process.exit(1);
}

process.umask(0o077); // backups contain student data: owner-only
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const raw = path.join(backupDir, `lms-${stamp}.db`);
const out = `${raw}.gz`;

const db = new Database(dbFile, { readonly: true, fileMustExist: true });
await db.backup(raw);
db.close();

// Make the snapshot a single self-contained file (no -wal/-shm), then
// sanity-check it before keeping it. The app switches back to WAL on open.
const check = new Database(raw);
check.pragma('journal_mode = DELETE');
const ok = check.pragma('integrity_check', { simple: true });
const docs = check.prepare('SELECT count(*) AS n FROM docs').get().n;
check.close();
if (ok !== 'ok') {
  fs.rmSync(raw, { force: true });
  console.error(`Backup failed integrity check: ${ok}`);
  process.exit(1);
}

await pipeline(fs.createReadStream(raw), zlib.createGzip({ level: 9 }), fs.createWriteStream(`${out}.partial`));
fs.renameSync(`${out}.partial`, out);
fs.rmSync(raw);

const old = fs
  .readdirSync(backupDir)
  .filter((f) => /^lms-\d{8}-\d{6}\.db\.gz$/.test(f))
  .sort()
  .reverse()
  .slice(keep);
for (const f of old) fs.rmSync(path.join(backupDir, f));

const size = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`${new Date().toISOString()} backed up ${docs} docs -> ${out} (${size} MB)${old.length ? `, pruned ${old.length}` : ''}`);
