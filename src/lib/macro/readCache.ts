import { execute, query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";

export type CachedMacroReadPayload = {
  asOfDate: string | null;
  payload: unknown;
  updatedAt: string;
  payloadBytes: number;
  rowsReturned: number;
};

type ReadCacheTimingOptions = {
  onTiming?: (step: string, ms: number) => void;
};

export class MacroCacheReadError extends Error {
  queryName: string;
  tableName: string;
  key: string;
  rowsReturned: number | null;
  payloadBytes: number | null;
  constructor(input: {
    message: string;
    queryName: string;
    tableName: string;
    key: string;
    rowsReturned?: number | null;
    payloadBytes?: number | null;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "MacroCacheReadError";
    this.queryName = input.queryName;
    this.tableName = input.tableName;
    this.key = input.key;
    this.rowsReturned = input.rowsReturned ?? null;
    this.payloadBytes = input.payloadBytes ?? null;
    if (input.cause !== undefined) (this as any).cause = input.cause;
  }
}

const MAX_CACHE_PAYLOAD_BYTES = 6 * 1024 * 1024;

function historyRangeKey(rangeYears: number | "MAX") {
  return typeof rangeYears === "number" ? String(rangeYears) : "MAX";
}

export async function upsertLatestMacroReadCache(region: string, asOfDate: string | null, payload: unknown) {
  const updatedAt = new Date().toISOString();
  await execute(
    `INSERT INTO ${tables.macroLatestReadCache} (region, as_of_date, payload_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(region) DO UPDATE SET
       as_of_date = excluded.as_of_date,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    [region, asOfDate, JSON.stringify(payload), updatedAt],
  );
  return updatedAt;
}

export async function readLatestMacroReadCache(region: string, options?: ReadCacheTimingOptions): Promise<CachedMacroReadPayload | null> {
  const key = `region=${region}`;
  const tMeta = Date.now();
  let metaRows: Array<{ as_of_date: string | null; updated_at: string; payload_bytes: number }> = [];
  try {
    metaRows = (await query(
      `SELECT as_of_date, updated_at, LENGTH(payload_json) AS payload_bytes
       FROM ${tables.macroLatestReadCache}
       WHERE region = ?
       LIMIT 1`,
      [region],
    )) as unknown as Array<{ as_of_date: string | null; updated_at: string; payload_bytes: number }>;
  } catch (cause) {
    throw new MacroCacheReadError({
      message: `Failed latest cache metadata query for ${key}`,
      queryName: "read_cache.latest.meta_query",
      tableName: tables.macroLatestReadCache,
      key,
      cause,
    });
  }
  options?.onTiming?.("read_cache.latest.meta_query", Date.now() - tMeta);

  const row = metaRows[0];
  if (!row) return null;
  const payloadBytes = Number(row.payload_bytes ?? 0);
  if (payloadBytes > MAX_CACHE_PAYLOAD_BYTES) {
    throw new MacroCacheReadError({
      message: `Latest cache payload exceeds safety limit (${payloadBytes} bytes)`,
      queryName: "read_cache.latest.payload_size_guard",
      tableName: tables.macroLatestReadCache,
      key,
      rowsReturned: metaRows.length,
      payloadBytes,
    });
  }

  const tQuery = Date.now();
  let payloadRows: Array<{ payload_json: string }> = [];
  try {
    payloadRows = (await query(
      `SELECT payload_json
       FROM ${tables.macroLatestReadCache}
       WHERE region = ?
       LIMIT 1`,
      [region],
    )) as unknown as Array<{ payload_json: string }>;
  } catch (cause) {
    throw new MacroCacheReadError({
      message: `Failed latest cache payload query for ${key}`,
      queryName: "read_cache.latest.payload_query",
      tableName: tables.macroLatestReadCache,
      key,
      rowsReturned: metaRows.length,
      payloadBytes,
      cause,
    });
  }
  options?.onTiming?.("read_cache.latest.payload_query", Date.now() - tQuery);
  const payloadRow = payloadRows[0];
  if (!payloadRow) return null;

  const tParse = Date.now();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(String(payloadRow.payload_json ?? "null"));
  } catch (cause) {
    throw new MacroCacheReadError({
      message: `Failed latest cache JSON parse for ${key}`,
      queryName: "read_cache.latest.parse",
      tableName: tables.macroLatestReadCache,
      key,
      rowsReturned: payloadRows.length,
      payloadBytes,
      cause,
    });
  }
  options?.onTiming?.("read_cache.latest.parse", Date.now() - tParse);
  return {
    asOfDate: row.as_of_date ?? null,
    payload: parsed,
    updatedAt: String(row.updated_at),
    payloadBytes,
    rowsReturned: payloadRows.length,
  };
}

export async function upsertMacroHistoryReadCache(params: {
  region: string;
  resolution: "WEEKLY" | "MONTHLY";
  rangeYears: number | "MAX";
  payload: unknown;
}) {
  const updatedAt = new Date().toISOString();
  await execute(
    `INSERT INTO ${tables.macroHistoryReadCache} (region, resolution, range_key, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(region, resolution, range_key) DO UPDATE SET
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    [params.region, params.resolution, historyRangeKey(params.rangeYears), JSON.stringify(params.payload), updatedAt],
  );
  return updatedAt;
}

export async function readMacroHistoryReadCache(params: {
  region: string;
  resolution: "WEEKLY" | "MONTHLY";
  rangeYears: number | "MAX";
}, options?: ReadCacheTimingOptions) {
  const rangeKey = historyRangeKey(params.rangeYears);
  const key = `region=${params.region},resolution=${params.resolution},range=${rangeKey}`;
  const tMeta = Date.now();
  let metaRows: Array<{ updated_at: string; payload_bytes: number }> = [];
  try {
    metaRows = (await query(
      `SELECT updated_at, LENGTH(payload_json) AS payload_bytes
       FROM ${tables.macroHistoryReadCache}
       WHERE region = ? AND resolution = ? AND range_key = ?
       LIMIT 1`,
      [params.region, params.resolution, rangeKey],
    )) as unknown as Array<{ updated_at: string; payload_bytes: number }>;
  } catch (cause) {
    throw new MacroCacheReadError({
      message: `Failed history cache metadata query for ${key}`,
      queryName: "read_cache.history.meta_query",
      tableName: tables.macroHistoryReadCache,
      key,
      cause,
    });
  }
  options?.onTiming?.("read_cache.history.meta_query", Date.now() - tMeta);

  const row = metaRows[0];
  if (!row) return null;
  const payloadBytes = Number(row.payload_bytes ?? 0);
  if (payloadBytes > MAX_CACHE_PAYLOAD_BYTES) {
    throw new MacroCacheReadError({
      message: `History cache payload exceeds safety limit (${payloadBytes} bytes)`,
      queryName: "read_cache.history.payload_size_guard",
      tableName: tables.macroHistoryReadCache,
      key,
      rowsReturned: metaRows.length,
      payloadBytes,
    });
  }

  const tQuery = Date.now();
  let payloadRows: Array<{ payload_json: string }> = [];
  try {
    payloadRows = (await query(
      `SELECT payload_json
       FROM ${tables.macroHistoryReadCache}
       WHERE region = ? AND resolution = ? AND range_key = ?
       LIMIT 1`,
      [params.region, params.resolution, rangeKey],
    )) as unknown as Array<{ payload_json: string }>;
  } catch (cause) {
    throw new MacroCacheReadError({
      message: `Failed history cache payload query for ${key}`,
      queryName: "read_cache.history.payload_query",
      tableName: tables.macroHistoryReadCache,
      key,
      rowsReturned: metaRows.length,
      payloadBytes,
      cause,
    });
  }
  options?.onTiming?.("read_cache.history.payload_query", Date.now() - tQuery);
  const payloadRow = payloadRows[0];
  if (!payloadRow) return null;

  const tParse = Date.now();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(String(payloadRow.payload_json ?? "null"));
  } catch (cause) {
    throw new MacroCacheReadError({
      message: `Failed history cache JSON parse for ${key}`,
      queryName: "read_cache.history.parse",
      tableName: tables.macroHistoryReadCache,
      key,
      rowsReturned: payloadRows.length,
      payloadBytes,
      cause,
    });
  }
  options?.onTiming?.("read_cache.history.parse", Date.now() - tParse);
  return {
    payload: parsed,
    updatedAt: String(row.updated_at),
    payloadBytes,
    rowsReturned: payloadRows.length,
  };
}
