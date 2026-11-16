/**
 * Self-hosted replacement for the slice of the Firestore Admin API this app
 * uses, backed by a single SQLite file (better-sqlite3).
 *
 * Every API route was written against `adminDb.collection(...).where(...).get()`
 * etc. Rather than rewriting ~80 routes, this module reproduces that surface
 * with Firestore's semantics so route code runs unchanged:
 *
 *   collection / doc / add / set(merge) / update(dotted paths) / delete / create
 *   subcollection paths ('readStats/<date>/students', doc.collection(name))
 *   where: == != < <= > >= in array-contains array-contains-any  (+ '__name__')
 *   orderBy (docs missing the field are excluded, like Firestore) / limit
 *   getAll / batch (atomic: one SQLite transaction)
 *   FieldValue: serverTimestamp increment arrayUnion arrayRemove delete
 *   Timestamp: JSON-serialises to {_seconds,_nanoseconds} exactly like Firestore
 *
 * Storage: one row per document in `docs(collection, id, data JSONB)`.
 * Timestamps (and Dates, which Firestore converts on write) are stored as
 * {"__ts": <epoch ms, µs precision>} so they sort and compare numerically.
 *
 * Self-contained on purpose (no `@/` imports) so scripts can import it too.
 */
import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type DocumentData = { [field: string]: any };

// ─── Timestamp ──────────────────────────────────────────────────────────────

const MIN_SECONDS = -62135596800; // 0001-01-01, same base Firestore uses

export class Timestamp {
  // Field names match firebase-admin so JSON output ({_seconds,_nanoseconds})
  // is byte-identical to what the frontend already parses.
  readonly _seconds: number;
  readonly _nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this._seconds = seconds;
    this._nanoseconds = nanoseconds;
  }

  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now());
  }
  static fromDate(date: Date): Timestamp {
    return Timestamp.fromMillis(date.getTime());
  }
  static fromMillis(ms: number): Timestamp {
    const seconds = Math.floor(ms / 1000);
    // Round to whole microseconds to shed float noise (Firestore is µs-precise).
    const nanos = Math.round((ms - seconds * 1000) * 1000) * 1000;
    return new Timestamp(seconds, nanos);
  }

  get seconds(): number {
    return this._seconds;
  }
  get nanoseconds(): number {
    return this._nanoseconds;
  }
  toDate(): Date {
    return new Date(this.toMillis());
  }
  toMillis(): number {
    return this._seconds * 1000 + Math.floor(this._nanoseconds / 1e6);
  }
  isEqual(other: Timestamp): boolean {
    return other instanceof Timestamp && other._seconds === this._seconds && other._nanoseconds === this._nanoseconds;
  }
  /** Lexicographically sortable, so `a < b` works like firebase-admin's. */
  valueOf(): string {
    const s = String(this._seconds - MIN_SECONDS).padStart(12, '0');
    return `${s}.${String(this._nanoseconds).padStart(9, '0')}`;
  }
}

function tsToMs(t: Timestamp): number {
  return t._seconds * 1000 + t._nanoseconds / 1e6;
}

// ─── FieldValue ─────────────────────────────────────────────────────────────

type SentinelKind = 'serverTimestamp' | 'increment' | 'arrayUnion' | 'arrayRemove' | 'delete';

export class FieldValue {
  private constructor(
    readonly _kind: SentinelKind,
    readonly _operand?: unknown,
  ) {}
  static serverTimestamp(): FieldValue {
    return new FieldValue('serverTimestamp');
  }
  static increment(n: number): FieldValue {
    return new FieldValue('increment', n);
  }
  static arrayUnion(...elements: unknown[]): FieldValue {
    return new FieldValue('arrayUnion', elements);
  }
  static arrayRemove(...elements: unknown[]): FieldValue {
    return new FieldValue('arrayRemove', elements);
  }
  static delete(): FieldValue {
    return new FieldValue('delete');
  }
  isEqual(other: FieldValue): boolean {
    return other === this;
  }
}

// ─── Encoding (JS value <-> stored JSON) ────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function encode(v: unknown): unknown {
  if (v instanceof Timestamp) return { __ts: tsToMs(v) };
  if (v instanceof Date) return { __ts: v.getTime() };
  if (v instanceof DocumentReference) return v.id; // refs are never stored today; keep the id
  if (Array.isArray(v)) return v.map(encode);
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) continue;
      out[k] = encode(val);
    }
    return out;
  }
  return v;
}

function decode(v: unknown): any {
  if (Array.isArray(v)) return v.map(decode);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === '__ts' && typeof o.__ts === 'number') {
      return Timestamp.fromMillis(o.__ts);
    }
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = decode(o[k]);
    return out;
  }
  return v;
}

/** Stable comparison key for arrayUnion / arrayRemove membership. */
function valueKey(v: unknown): string {
  return JSON.stringify(encode(v));
}

// ─── Database handle ────────────────────────────────────────────────────────

const INDEXED_FIELDS = [
  'assignmentId',
  'teacherId',
  'studentId',
  'subjectId',
  'classId',
  'role',
  'email',
  'groupId',
  'questId',
];

function openDatabase(file: string): Database.Database {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new Database(file);
  conn.pragma('journal_mode = WAL');
  conn.pragma('synchronous = NORMAL');
  conn.pragma('busy_timeout = 5000');
  conn.exec(`
    CREATE TABLE IF NOT EXISTS docs (
      collection TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       BLOB NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (collection, id)
    );
  `);
  for (const f of INDEXED_FIELDS) {
    conn.exec(
      `CREATE INDEX IF NOT EXISTS docs_by_${f} ON docs (collection, ${extractExpr('data', [f])})`,
    );
  }
  return conn;
}

// ─── SQL helpers ────────────────────────────────────────────────────────────

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function jsonPath(segments: string[]): string {
  return '$' + segments.map((s) => `."${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join('');
}

function extractExpr(source: string, segments: string[]): string {
  return `json_extract(${source}, ${sqlString(jsonPath(segments))})`;
}

function typeExpr(source: string, segments: string[]): string {
  return `json_type(${source}, ${sqlString(jsonPath(segments))})`;
}

/** How to read one value in SQL: either a document field or a json_each row. */
interface Accessor {
  value: string; // SQL expression yielding the SQL value (json_extract semantics)
  type: string; // SQL expression yielding the json type name
  ts: string; // SQL expression yielding the __ts number if the value is a Timestamp
}

function fieldAccessor(field: string): Accessor {
  const seg = field.split('.');
  return {
    value: extractExpr('data', seg),
    type: typeExpr('data', seg),
    ts: extractExpr('data', [...seg, '__ts']),
  };
}

const EACH_ACCESSOR: Accessor = {
  value: 'je.value',
  type: 'je.type',
  ts: `json_extract(je.value, '$."__ts"')`,
};

type Clause = { sql: string; params: unknown[] };

function compareClause(acc: Accessor, op: '=' | '<' | '<=' | '>' | '>=', v: unknown): Clause {
  if (v instanceof Timestamp || v instanceof Date) {
    const ms = v instanceof Date ? v.getTime() : tsToMs(v);
    return { sql: `(${acc.ts} ${op} ?)`, params: [ms] };
  }
  if (typeof v === 'string') {
    return { sql: `(${acc.type} = 'text' AND ${acc.value} ${op} ?)`, params: [v] };
  }
  if (typeof v === 'number') {
    return { sql: `(${acc.type} IN ('integer','real') AND ${acc.value} ${op} ?)`, params: [v] };
  }
  if (op !== '=') throw new Error(`Range comparison on unsupported value type: ${typeof v}`);
  if (typeof v === 'boolean') return { sql: `(${acc.type} = '${v ? 'true' : 'false'}')`, params: [] };
  if (v === null) return { sql: `(${acc.type} = 'null')`, params: [] };
  // Arrays / maps: compare canonical JSON text.
  return { sql: `(${acc.type} IN ('array','object') AND ${acc.value} = ?)`, params: [JSON.stringify(encode(v))] };
}

function orClauses(parts: Clause[]): Clause {
  if (parts.length === 0) return { sql: '0', params: [] };
  return { sql: `(${parts.map((p) => p.sql).join(' OR ')})`, params: parts.flatMap((p) => p.params) };
}

function refId(v: unknown): string {
  return v instanceof DocumentReference ? v.id : String(v);
}

type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains' | 'array-contains-any';

function whereClause(field: string, op: WhereOp, value: unknown): Clause {
  if (field === '__name__') {
    if (op === '==') return { sql: 'id = ?', params: [refId(value)] };
    if (op === 'in') {
      const ids = (value as unknown[]).map(refId);
      if (ids.length === 0) return { sql: '0', params: [] };
      return { sql: `id IN (${ids.map(() => '?').join(',')})`, params: ids };
    }
    if (op === '!=') return { sql: 'id != ?', params: [refId(value)] };
    throw new Error(`Unsupported operator on __name__: ${op}`);
  }

  const acc = fieldAccessor(field);
  switch (op) {
    case '==':
      return compareClause(acc, '=', value);
    case '<':
    case '<=':
    case '>':
    case '>=':
      return compareClause(acc, op, value);
    case '!=': {
      const eq = compareClause(acc, '=', value);
      return { sql: `(${acc.type} IS NOT NULL AND ${acc.type} != 'null' AND NOT ${eq.sql})`, params: eq.params };
    }
    case 'in': {
      const vals = value as unknown[];
      // All-string lists use a plain IN so the expression index can serve it.
      if (vals.length > 0 && vals.every((x) => typeof x === 'string')) {
        return { sql: `${acc.value} IN (${vals.map(() => '?').join(',')})`, params: vals };
      }
      return orClauses(vals.map((x) => compareClause(acc, '=', x)));
    }
    case 'not-in': {
      const inner = orClauses((value as unknown[]).map((x) => compareClause(acc, '=', x)));
      return { sql: `(${acc.type} IS NOT NULL AND ${acc.type} != 'null' AND NOT ${inner.sql})`, params: inner.params };
    }
    case 'array-contains':
    case 'array-contains-any': {
      const needles = op === 'array-contains' ? [value] : (value as unknown[]);
      const inner = orClauses(needles.map((x) => compareClause(EACH_ACCESSOR, '=', x)));
      const p = sqlString(jsonPath(field.split('.')));
      return {
        sql: `(${acc.type} = 'array' AND EXISTS (SELECT 1 FROM json_each(data, ${p}) je WHERE ${inner.sql}))`,
        params: inner.params,
      };
    }
    default:
      throw new Error(`Unsupported where operator: ${op as string}`);
  }
}

// ─── Write application ──────────────────────────────────────────────────────

function getAtPath(obj: DocumentData | undefined, segments: string[]): unknown {
  let cur: unknown = obj;
  for (const s of segments) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[s];
  }
  return cur;
}

/** Resolve FieldValue sentinels inside `value`, relative to the old value at the same place. */
function resolveValue(value: unknown, existing: unknown, now: Timestamp): unknown {
  if (value instanceof FieldValue) {
    switch (value._kind) {
      case 'serverTimestamp':
        return now;
      case 'increment': {
        const base = typeof existing === 'number' ? existing : 0;
        return base + (value._operand as number);
      }
      case 'arrayUnion': {
        const arr = Array.isArray(existing) ? [...existing] : [];
        const seen = new Set(arr.map(valueKey));
        for (const el of value._operand as unknown[]) {
          const k = valueKey(el);
          if (!seen.has(k)) {
            seen.add(k);
            arr.push(el);
          }
        }
        return arr;
      }
      case 'arrayRemove': {
        if (!Array.isArray(existing)) return [];
        const drop = new Set((value._operand as unknown[]).map(valueKey));
        return existing.filter((el) => !drop.has(valueKey(el)));
      }
      case 'delete':
        return DELETE_MARK;
    }
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      const r = resolveValue(v, isPlainObject(existing) ? existing[k] : undefined, now);
      if (r !== DELETE_MARK) out[k] = r;
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, undefined, now));
  return value;
}

const DELETE_MARK = Symbol('delete');

/** Firestore `set(data, {merge:true})`: maps merge recursively, everything else replaces. */
function mergeInto(target: Record<string, unknown>, data: Record<string, unknown>, now: Timestamp): void {
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const old = target[k];
    if (isPlainObject(v) && Object.keys(v).length > 0) {
      const base = isPlainObject(old) ? { ...old } : {};
      mergeInto(base, v, now);
      target[k] = base;
      continue;
    }
    const r = resolveValue(v, old, now);
    if (r === DELETE_MARK) delete target[k];
    else target[k] = r;
  }
}

/** Firestore `update(data)`: keys are dotted field paths; values replace. */
function applyUpdate(target: Record<string, unknown>, data: Record<string, unknown>, now: Timestamp): void {
  for (const [key, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const seg = key.split('.');
    const r = resolveValue(v, getAtPath(target, seg), now);
    let cur = target;
    for (let i = 0; i < seg.length - 1; i++) {
      const next = cur[seg[i]];
      if (!isPlainObject(next)) {
        if (r === DELETE_MARK) {
          cur = {};
          break;
        }
        cur[seg[i]] = {};
      } else {
        cur[seg[i]] = { ...next };
      }
      cur = cur[seg[i]] as Record<string, unknown>;
    }
    const last = seg[seg.length - 1];
    if (r === DELETE_MARK) delete cur[last];
    else cur[last] = r;
  }
}

class FirestoreLikeError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

// ─── Snapshots & references ─────────────────────────────────────────────────

export class DocumentSnapshot {
  constructor(
    readonly ref: DocumentReference,
    private readonly raw: string | undefined,
  ) {}
  get id(): string {
    return this.ref.id;
  }
  get exists(): boolean {
    return this.raw !== undefined;
  }
  data(): DocumentData | undefined {
    return this.raw === undefined ? undefined : decode(JSON.parse(this.raw));
  }
  get(field: string): any {
    return getAtPath(this.data(), field.split('.'));
  }
}

/** Snapshot of a document returned by a query: always exists. */
export class QueryDocumentSnapshot extends DocumentSnapshot {
  data(): DocumentData {
    return super.data() as DocumentData;
  }
}

export class QuerySnapshot {
  constructor(readonly docs: QueryDocumentSnapshot[]) {}
  get size(): number {
    return this.docs.length;
  }
  get empty(): boolean {
    return this.docs.length === 0;
  }
  forEach(cb: (doc: QueryDocumentSnapshot) => void): void {
    this.docs.forEach(cb);
  }
}

export interface WriteResult {
  writeTime: Timestamp;
}

type SetOptions = { merge?: boolean };

export class DocumentReference {
  constructor(
    readonly firestore: Firestore,
    readonly collectionId: string,
    readonly id: string,
  ) {}
  get path(): string {
    return `${this.collectionId}/${this.id}`;
  }
  get parent(): CollectionReference {
    return this.firestore.collection(this.collectionId);
  }
  async get(): Promise<DocumentSnapshot> {
    return new DocumentSnapshot(this, this.firestore._readRaw(this.collectionId, this.id));
  }
  async set(data: DocumentData, options?: SetOptions): Promise<WriteResult> {
    return this.firestore._write([{ kind: 'set', ref: this, data, merge: !!options?.merge }])[0];
  }
  async update(data: DocumentData): Promise<WriteResult> {
    return this.firestore._write([{ kind: 'update', ref: this, data }])[0];
  }
  async create(data: DocumentData): Promise<WriteResult> {
    return this.firestore._write([{ kind: 'create', ref: this, data }])[0];
  }
  async delete(): Promise<WriteResult> {
    return this.firestore._write([{ kind: 'delete', ref: this }])[0];
  }
  collection(name: string): CollectionReference {
    return this.firestore.collection(`${this.path}/${name}`);
  }
  isEqual(other: DocumentReference): boolean {
    return other instanceof DocumentReference && other.path === this.path;
  }
}

type Order = { field: string; dir: 'asc' | 'desc' };

export class Query {
  constructor(
    readonly firestore: Firestore,
    protected readonly collectionId: string,
    private readonly filters: Clause[] = [],
    private readonly orders: Order[] = [],
    private readonly limitN?: number,
  ) {}

  where(field: string, op: WhereOp, value: unknown): Query {
    return new Query(this.firestore, this.collectionId, [...this.filters, whereClause(field, op, value)], this.orders, this.limitN);
  }
  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): Query {
    return new Query(this.firestore, this.collectionId, this.filters, [...this.orders, { field, dir }], this.limitN);
  }
  limit(n: number): Query {
    return new Query(this.firestore, this.collectionId, this.filters, this.orders, n);
  }

  async get(): Promise<QuerySnapshot> {
    const where: string[] = ['collection = ?'];
    const params: unknown[] = [this.collectionId];
    for (const f of this.filters) {
      where.push(f.sql);
      params.push(...f.params);
    }
    const orderSql: string[] = [];
    for (const o of this.orders) {
      const dir = o.dir === 'desc' ? 'DESC' : 'ASC';
      if (o.field === '__name__') {
        orderSql.push(`id ${dir}`);
        continue;
      }
      const acc = fieldAccessor(o.field);
      where.push(`${acc.type} IS NOT NULL`); // Firestore drops docs missing an orderBy field
      orderSql.push(`coalesce(${acc.ts}, ${acc.value}) ${dir}`);
    }
    const lastDir = this.orders.length ? (this.orders[this.orders.length - 1].dir === 'desc' ? 'DESC' : 'ASC') : 'ASC';
    orderSql.push(`id ${lastDir}`);

    let sql = `SELECT id, json(data) AS data FROM docs WHERE ${where.join(' AND ')} ORDER BY ${orderSql.join(', ')}`;
    if (this.limitN !== undefined) {
      sql += ' LIMIT ?';
      params.push(this.limitN);
    }
    const rows = this.firestore._conn().prepare(sql).all(...params) as { id: string; data: string }[];
    return new QuerySnapshot(
      rows.map((r) => new QueryDocumentSnapshot(new DocumentReference(this.firestore, this.collectionId, r.id), r.data)),
    );
  }

  count(): { get(): Promise<{ data(): { count: number } }> } {
    return {
      get: async () => {
        const n = (await this.get()).size;
        return { data: () => ({ count: n }) };
      },
    };
  }
}

export class CollectionReference extends Query {
  get id(): string {
    return this.collectionId;
  }
  get path(): string {
    return this.collectionId;
  }
  doc(id?: string): DocumentReference {
    return new DocumentReference(this.firestore, this.collectionId, id ?? autoId());
  }
  async add(data: DocumentData): Promise<DocumentReference> {
    const ref = this.doc();
    await ref.create(data);
    return ref;
  }
}

function autoId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(40);
  let out = '';
  for (let i = 0; out.length < 20; i++) {
    const b = bytes[i];
    if (b < 248) out += chars[b % 62]; // reject to keep the distribution uniform
  }
  return out;
}

// ─── Batch & Firestore ──────────────────────────────────────────────────────

type WriteOp =
  | { kind: 'set'; ref: DocumentReference; data: DocumentData; merge: boolean }
  | { kind: 'update'; ref: DocumentReference; data: DocumentData }
  | { kind: 'create'; ref: DocumentReference; data: DocumentData }
  | { kind: 'delete'; ref: DocumentReference };

export class WriteBatch {
  private ops: WriteOp[] = [];
  private committed = false;
  constructor(private readonly firestore: Firestore) {}

  set(ref: DocumentReference, data: DocumentData, options?: SetOptions): WriteBatch {
    this.ops.push({ kind: 'set', ref, data, merge: !!options?.merge });
    return this;
  }
  update(ref: DocumentReference, data: DocumentData): WriteBatch {
    this.ops.push({ kind: 'update', ref, data });
    return this;
  }
  create(ref: DocumentReference, data: DocumentData): WriteBatch {
    this.ops.push({ kind: 'create', ref, data });
    return this;
  }
  delete(ref: DocumentReference): WriteBatch {
    this.ops.push({ kind: 'delete', ref });
    return this;
  }
  async commit(): Promise<WriteResult[]> {
    if (this.committed) throw new Error('Cannot modify a WriteBatch that has been committed.');
    this.committed = true;
    return this.firestore._write(this.ops);
  }
}

export class Firestore {
  private db: Database.Database | null = null;
  constructor(private readonly file: string) {}

  /** @internal */
  _conn(): Database.Database {
    if (!this.db) this.db = openDatabase(this.file);
    return this.db;
  }

  /**
   * Subcollections are stored under their full path as the collection key, e.g.
   * `readStats/2026-01-02/students` (Firestore's own path model).
   */
  collection(pathStr: string): CollectionReference {
    const seg = pathStr.split('/');
    if (seg.length % 2 === 0 || seg.some((s) => !s)) throw new Error(`Invalid collection path: ${pathStr}`);
    return new CollectionReference(this, pathStr);
  }
  doc(pathStr: string): DocumentReference {
    const seg = pathStr.split('/');
    if (seg.length % 2 !== 0 || seg.some((s) => !s)) throw new Error(`Invalid document path: ${pathStr}`);
    return new DocumentReference(this, seg.slice(0, -1).join('/'), seg[seg.length - 1]);
  }
  batch(): WriteBatch {
    return new WriteBatch(this);
  }
  async getAll(...refs: unknown[]): Promise<DocumentSnapshot[]> {
    const conn = this._conn();
    const stmt = conn.prepare('SELECT json(data) AS data FROM docs WHERE collection = ? AND id = ?');
    return refs
      .filter((r): r is DocumentReference => r instanceof DocumentReference)
      .map((r) => new DocumentSnapshot(r, (stmt.get(r.collectionId, r.id) as { data: string } | undefined)?.data));
  }
  async listCollections(): Promise<CollectionReference[]> {
    const rows = this._conn()
      .prepare("SELECT DISTINCT collection FROM docs WHERE instr(collection, '/') = 0 ORDER BY collection")
      .all() as { collection: string }[];
    return rows.map((r) => this.collection(r.collection));
  }

  /** @internal */
  _readRaw(collection: string, id: string): string | undefined {
    const row = this._conn()
      .prepare('SELECT json(data) AS data FROM docs WHERE collection = ? AND id = ?')
      .get(collection, id) as { data: string } | undefined;
    return row?.data;
  }

  /** @internal Apply writes atomically, in order. */
  _write(ops: WriteOp[]): WriteResult[] {
    const conn = this._conn();
    const read = conn.prepare('SELECT json(data) AS data FROM docs WHERE collection = ? AND id = ?');
    const upsert = conn.prepare(
      'INSERT INTO docs (collection, id, data, updated_at) VALUES (?, ?, jsonb(?), ?) ' +
        'ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
    );
    const del = conn.prepare('DELETE FROM docs WHERE collection = ? AND id = ?');
    const now = Timestamp.now();
    const nowMs = Date.now();

    const run = conn.transaction(() =>
      ops.map((op): WriteResult => {
        const { collectionId: c, id } = op.ref;
        if (op.kind === 'delete') {
          del.run(c, id);
          return { writeTime: now };
        }
        const row = read.get(c, id) as { data: string } | undefined;
        const existing: DocumentData | undefined = row ? decode(JSON.parse(row.data)) : undefined;
        let next: Record<string, unknown>;

        if (op.kind === 'create') {
          if (existing) throw new FirestoreLikeError(6, `6 ALREADY_EXISTS: Document already exists: ${op.ref.path}`);
          next = resolveValue(op.data, undefined, now) as Record<string, unknown>;
        } else if (op.kind === 'update') {
          if (!existing) throw new FirestoreLikeError(5, `5 NOT_FOUND: No document to update: ${op.ref.path}`);
          next = { ...existing };
          applyUpdate(next, op.data, now);
        } else if (op.merge) {
          next = existing ? { ...existing } : {};
          mergeInto(next, op.data, now);
        } else {
          next = resolveValue(op.data, undefined, now) as Record<string, unknown>;
        }
        upsert.run(c, id, JSON.stringify(encode(next)), nowMs);
        return { writeTime: now };
      }),
    );
    return run();
  }

  /** Close the underlying connection (scripts/tests). */
  close(): void {
    this.db?.close();
    this.db = null;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export function openFirestore(file: string): Firestore {
  return new Firestore(file);
}

const globalForDb = globalThis as unknown as { __lmsDb?: Firestore };

/** App-wide database (reused across dev hot reloads). */
export function getDb(): Firestore {
  if (!globalForDb.__lmsDb) {
    const file = process.env.DB_PATH || path.join(process.cwd(), 'data', 'lms.db');
    globalForDb.__lmsDb = new Firestore(file);
  }
  return globalForDb.__lmsDb;
}

/** Serialisation helpers shared with the migration script. */
export const _internal = { encode, decode };
