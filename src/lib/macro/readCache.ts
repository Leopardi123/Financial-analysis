import { execute, query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";

export type CachedMacroReadPayload = {
  asOfDate: string | null;
  payload: unknown;
  updatedAt: string;
};

type ReadCacheTimingOptions = {
  onTiming?: (step: string, ms: number) => void;
};

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
  const tQuery = Date.now();
  const rows = await query(
    `SELECT as_of_date, payload_json, updated_at
     FROM ${tables.macroLatestReadCache}
     WHERE region = ?
     LIMIT 1`,
    [region],
  ) as unknown as Array<{ as_of_date: string | null; payload_json: string; updated_at: string }>;
  options?.onTiming?.("read_cache.latest.query", Date.now() - tQuery);

  const row = rows[0];
  if (!row) return null;
  const tParse = Date.now();
  const parsed = JSON.parse(String(row.payload_json ?? "null"));
  options?.onTiming?.("read_cache.latest.parse", Date.now() - tParse);
  return {
    asOfDate: row.as_of_date ?? null,
    payload: parsed,
    updatedAt: String(row.updated_at),
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
  const tQuery = Date.now();
  const rows = await query(
    `SELECT payload_json, updated_at
     FROM ${tables.macroHistoryReadCache}
     WHERE region = ? AND resolution = ? AND range_key = ?
     LIMIT 1`,
    [params.region, params.resolution, historyRangeKey(params.rangeYears)],
  ) as unknown as Array<{ payload_json: string; updated_at: string }>;
  options?.onTiming?.("read_cache.history.query", Date.now() - tQuery);

  const row = rows[0];
  if (!row) return null;
  const tParse = Date.now();
  const parsed = JSON.parse(String(row.payload_json ?? "null"));
  options?.onTiming?.("read_cache.history.parse", Date.now() - tParse);
  return {
    payload: parsed,
    updatedAt: String(row.updated_at),
  };
}
