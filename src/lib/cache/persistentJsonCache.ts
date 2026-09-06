import { execute, query } from '../../../api/_db.js';

const TABLE = 'runtime_json_cache_v1';
let ensureTablePromise: Promise<void> | null = null;

type CacheRow = {
  fingerprint?: unknown;
  payload_json?: unknown;
  expires_at_utc?: unknown;
};

async function ensureTable(): Promise<void> {
  if (!ensureTablePromise) {
    ensureTablePromise = execute(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (
        namespace TEXT NOT NULL,
        identity TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at_utc TEXT NOT NULL,
        expires_at_utc TEXT NOT NULL,
        PRIMARY KEY (namespace, identity)
      )`,
    ).then(() => undefined).catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }
  return ensureTablePromise;
}

export async function readPersistentJsonCache<T>(args: {
  namespace: string;
  identity: string;
  fingerprint: string;
  nowUtc?: string;
}): Promise<T | null> {
  try {
    await ensureTable();
    const nowUtc = args.nowUtc ?? new Date().toISOString();
    const rows = await query(
      `SELECT fingerprint, payload_json, expires_at_utc
       FROM ${TABLE}
       WHERE namespace = ? AND identity = ?
       LIMIT 1`,
      [args.namespace, args.identity],
    ) as unknown as CacheRow[];
    const row = rows[0];
    if (!row || String(row.fingerprint ?? '') !== args.fingerprint) return null;
    const expiresAtUtc = String(row.expires_at_utc ?? '');
    if (!expiresAtUtc || expiresAtUtc <= nowUtc) return null;
    if (typeof row.payload_json !== 'string') return null;
    return JSON.parse(row.payload_json) as T;
  } catch {
    // Runtime caching is an optimization only. Canonical economics must still run
    // when Turso/cache access is unavailable.
    return null;
  }
}

export async function writePersistentJsonCache(args: {
  namespace: string;
  identity: string;
  fingerprint: string;
  payload: unknown;
  ttlMs: number;
  nowMs?: number;
}): Promise<void> {
  try {
    await ensureTable();
    const nowMs = args.nowMs ?? Date.now();
    const createdAtUtc = new Date(nowMs).toISOString();
    const expiresAtUtc = new Date(nowMs + Math.max(1_000, args.ttlMs)).toISOString();
    await execute(
      `INSERT INTO ${TABLE} (
        namespace, identity, fingerprint, payload_json, created_at_utc, expires_at_utc
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(namespace, identity) DO UPDATE SET
        fingerprint = excluded.fingerprint,
        payload_json = excluded.payload_json,
        created_at_utc = excluded.created_at_utc,
        expires_at_utc = excluded.expires_at_utc`,
      [
        args.namespace,
        args.identity,
        args.fingerprint,
        JSON.stringify(args.payload),
        createdAtUtc,
        expiresAtUtc,
      ],
    );
  } catch {
    // Never make a correct canonical result fail because the optional cache could
    // not be persisted.
  }
}
