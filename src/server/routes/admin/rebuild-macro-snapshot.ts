import { assertAdminSecret } from "../../../../api/_auth.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { query } from "../../../../api/_db.js";
import { runAndPersistMacroSnapshots } from "../../../lib/macro/pipeline.js";
import { computeMacroRegimeHistory } from "../../../lib/macro/history.js";
import { buildMacroLatestReadPayload } from "../sector/global-macro.js";
import { upsertLatestMacroReadCache, upsertMacroHistoryReadCache } from "../../../lib/macro/readCache.js";
import { GLOBAL_MACRO_TEMPLATE } from "../../../lib/macro/template.js";

const REGIONS = ["US", "EA", "SE"] as const;
const MONTHLY_HISTORY_RANGES: Array<10 | 20 | "MAX"> = [10, 20, "MAX"];
const WEEKLY_HISTORY_RANGES: Array<1 | 3 | 5> = [1, 3, 5];

type Region = typeof REGIONS[number] | "GLOBAL";

function parseRegion(input: unknown): Region | "ALL" {
  const value = String(input ?? "US").toUpperCase();
  if (value === "ALL") return "ALL";
  if (value === "GLOBAL") return "GLOBAL";
  if ((REGIONS as readonly string[]).includes(value)) return value as Region;
  return "US";
}

async function getLatestRawDate(region: string) {
  const rows = await query(
    `SELECT MAX(date) AS latest_date
     FROM ${tables.macroRawDatapoints}
     WHERE region = ? AND source_type = 'auto'`,
    [region],
  ) as unknown as Array<{ latest_date: string | null }>;
  return rows[0]?.latest_date ?? null;
}

async function getRawDataDebug(region: string) {
  const attemptedKey = `macro_raw_datapoints:${region}:source_type=auto`;
  const rows = await query(
    `SELECT COUNT(*) AS record_count, MAX(date) AS latest_date
     FROM ${tables.macroRawDatapoints}
     WHERE region = ? AND source_type = 'auto'`,
    [region],
  ) as unknown as Array<{ record_count: number | string; latest_date: string | null }>;
  const row = rows[0] ?? { record_count: 0, latest_date: null };
  const recordCount = Number(row.record_count ?? 0);
  const dataTimestamp = row.latest_date ?? null;
  return {
    region,
    attemptedKey,
    dataFound: recordCount > 0,
    recordCount,
    dataTimestamp,
  };
}

async function getRegionalSnapshotInputDebug() {
  const rows = await query(
    `SELECT region, COUNT(*) AS record_count, MAX(as_of_date) AS latest_as_of_date
     FROM ${tables.macroRegimeSnapshots}
     WHERE region IN ('US','EA','SE')
     GROUP BY region`,
  ) as unknown as Array<{ region: string; record_count: number | string; latest_as_of_date: string | null }>;
  const byRegion = Object.fromEntries(
    REGIONS.map((region) => {
      const row = rows.find((item) => item.region === region);
      return [region, {
        recordCount: Number(row?.record_count ?? 0),
        latestAsOfDate: row?.latest_as_of_date ?? null,
      }];
    }),
  );
  return {
    attemptedInputKey: "macro_regime_snapshots:{US,EA,SE}",
    byRegion,
    anyFound: REGIONS.some((region) => Number((byRegion as any)[region]?.recordCount ?? 0) > 0),
  };
}

async function rebuildRegion(region: typeof REGIONS[number]) {
  const startedAt = new Date().toISOString();
  const rawDebug = await getRawDataDebug(region);
  const attemptedOutputKey = `macro_latest_read_cache:${region}`;
  console.info("[admin-rebuild-macro-snapshot:data-source]", rawDebug);
  if (!rawDebug.dataFound) {
    const error = new Error(`Load failed: no stored raw datapoints for ${region}.`);
    (error as Error & { status?: number; debug?: unknown }).status = 409;
    (error as Error & { status?: number; debug?: unknown }).debug = {
      region,
      attemptedInputKey: rawDebug.attemptedKey,
      attemptedOutputKey,
      inputFound: false,
      inputShape: "macro_raw_datapoints rows",
      recordCount: rawDebug.recordCount,
      dataTimestamp: rawDebug.dataTimestamp,
      failedStage: "load_input",
    };
    throw error;
  }

  let summary: Awaited<ReturnType<typeof runAndPersistMacroSnapshots>>;
  try {
    summary = await runAndPersistMacroSnapshots({ region });
  } catch (cause) {
    const error = new Error(`Load failed: could not build snapshot inputs for ${region}.`);
    (error as Error & { status?: number; debug?: unknown; cause?: unknown }).status = 500;
    (error as Error & { status?: number; debug?: unknown; cause?: unknown }).cause = cause;
    (error as Error & { status?: number; debug?: unknown; cause?: unknown }).debug = {
      region,
      attemptedInputKey: rawDebug.attemptedKey,
      attemptedOutputKey,
      inputFound: true,
      inputShape: "macro_raw_datapoints rows",
      recordCount: rawDebug.recordCount,
      dataTimestamp: rawDebug.dataTimestamp,
      failedStage: "build_snapshot",
    };
    throw error;
  }

  if (summary.rawPointCount === 0 || !summary.asOfDate) {
    const error = new Error(`Load failed: engine snapshot write had no scorable rows for ${region}.`);
    (error as Error & { status?: number; debug?: unknown }).status = 409;
    (error as Error & { status?: number; debug?: unknown }).debug = {
      region,
      attemptedInputKey: rawDebug.attemptedKey,
      attemptedOutputKey,
      inputFound: true,
      inputShape: "macro_raw_datapoints rows",
      recordCount: rawDebug.recordCount,
      dataTimestamp: rawDebug.dataTimestamp,
      failedStage: "build_snapshot",
      engineRawPointCount: summary.rawPointCount,
      engineAsOfDate: summary.asOfDate ?? null,
    };
    throw error;
  }

  const snapshotPayload = await buildMacroLatestReadPayload(region);
  const snapshotAsOf = (snapshotPayload as any)?.globalMacro?.regime?.asOfDate ?? summary.asOfDate ?? null;
  let cacheUpdatedAt: string;
  try {
    cacheUpdatedAt = await upsertLatestMacroReadCache(region, snapshotAsOf, snapshotPayload);
  } catch (cause) {
    const error = new Error(`Load failed: could not write latest snapshot cache for ${region}.`);
    (error as Error & { status?: number; debug?: unknown; cause?: unknown }).status = 500;
    (error as Error & { status?: number; debug?: unknown; cause?: unknown }).cause = cause;
    (error as Error & { status?: number; debug?: unknown; cause?: unknown }).debug = {
      region,
      attemptedInputKey: rawDebug.attemptedKey,
      attemptedOutputKey,
      inputFound: true,
      inputShape: "macro_raw_datapoints rows",
      recordCount: rawDebug.recordCount,
      dataTimestamp: rawDebug.dataTimestamp,
      failedStage: "write_snapshot",
    };
    throw error;
  }

  const monthlyWrites: Array<{ rangeYears: 10 | 20 | "MAX"; points: number }> = [];
  for (const rangeYears of MONTHLY_HISTORY_RANGES) {
    const payload = await computeMacroRegimeHistory({ region, resolution: "MONTHLY", rangeYears });
    await upsertMacroHistoryReadCache({ region, resolution: "MONTHLY", rangeYears, payload });
    monthlyWrites.push({ rangeYears, points: payload.points.length });
  }

  const weeklyWrites: Array<{ rangeYears: 1 | 3 | 5; points: number }> = [];
  for (const rangeYears of WEEKLY_HISTORY_RANGES) {
    const payload = await computeMacroRegimeHistory({ region, resolution: "WEEKLY", rangeYears });
    await upsertMacroHistoryReadCache({ region, resolution: "WEEKLY", rangeYears, payload });
    weeklyWrites.push({ rangeYears, points: payload.points.length });
  }

  return {
    ok: true,
    region,
    startedAt,
    endedAt: new Date().toISOString(),
    mode: "rebuild_snapshot_no_ingest",
    dataTimestamp: rawDebug.dataTimestamp ?? await getLatestRawDate(region),
    snapshotAsOfDate: snapshotAsOf,
    snapshotUpdatedAt: cacheUpdatedAt,
    outputKey: attemptedOutputKey,
    cacheWritten: true,
    snapshotVersion: GLOBAL_MACRO_TEMPLATE.templateId,
    note: "This does NOT fetch new data.",
    writes: {
      indicatorWrites: summary.indicatorWrites,
      regimeWrites: summary.regimeWrites,
      latestCacheKey: `macro_latest_read_cache:${region}`,
      historyCacheKeys: [
        ...monthlyWrites.map((row) => `macro_history_read_cache:${region}:MONTHLY:${String(row.rangeYears)}`),
        ...weeklyWrites.map((row) => `macro_history_read_cache:${region}:WEEKLY:${String(row.rangeYears)}`),
      ],
      historyMonthly: monthlyWrites,
      historyWeekly: weeklyWrites,
    },
  };
}

async function rebuildGlobal() {
  const startedAt = new Date().toISOString();
  const snapshotInputDebug = await getRegionalSnapshotInputDebug();
  const attemptedOutputKey = "macro_latest_read_cache:GLOBAL";
  if (!snapshotInputDebug.anyFound) {
    const error = new Error("Load failed: no regional regime snapshots available for GLOBAL rebuild.");
    (error as Error & { status?: number; debug?: unknown }).status = 409;
    (error as Error & { status?: number; debug?: unknown }).debug = {
      region: "GLOBAL",
      attemptedInputKey: snapshotInputDebug.attemptedInputKey,
      attemptedOutputKey,
      inputFound: false,
      inputShape: "macro_regime_snapshots rows by region",
      perRegion: snapshotInputDebug.byRegion,
      failedStage: "load_input",
    };
    throw error;
  }

  const payload = await buildMacroLatestReadPayload("GLOBAL");
  const asOfDate = (payload as any)?.globalMacro?.regime?.asOfDate ?? null;
  if (!asOfDate) {
    const error = new Error("GLOBAL snapshot could not be rebuilt because regional snapshots are missing or stale.");
    (error as Error & { status?: number; debug?: unknown }).status = 409;
    (error as Error & { status?: number; debug?: unknown }).debug = {
      region: "GLOBAL",
      attemptedInputKey: snapshotInputDebug.attemptedInputKey,
      attemptedOutputKey,
      inputFound: true,
      inputShape: "macro_regime_snapshots rows by region",
      perRegion: snapshotInputDebug.byRegion,
      failedStage: "build_snapshot",
    };
    throw error;
  }
  const snapshotUpdatedAt = await upsertLatestMacroReadCache("GLOBAL", asOfDate, payload);
  const monthlyWrites: Array<{ rangeYears: 10 | 20 | "MAX"; points: number }> = [];
  for (const rangeYears of MONTHLY_HISTORY_RANGES) {
    const payload = await computeMacroRegimeHistory({ region: "GLOBAL", resolution: "MONTHLY", rangeYears });
    await upsertMacroHistoryReadCache({ region: "GLOBAL", resolution: "MONTHLY", rangeYears, payload });
    monthlyWrites.push({ rangeYears, points: payload.points.length });
  }

  const weeklyWrites: Array<{ rangeYears: 1 | 3 | 5; points: number }> = [];
  for (const rangeYears of WEEKLY_HISTORY_RANGES) {
    const payload = await computeMacroRegimeHistory({ region: "GLOBAL", resolution: "WEEKLY", rangeYears });
    await upsertMacroHistoryReadCache({ region: "GLOBAL", resolution: "WEEKLY", rangeYears, payload });
    weeklyWrites.push({ rangeYears, points: payload.points.length });
  }

  return {
    ok: true,
    region: "GLOBAL",
    startedAt,
    endedAt: new Date().toISOString(),
    mode: "rebuild_snapshot_no_ingest",
    dataTimestamp: asOfDate,
    snapshotAsOfDate: asOfDate,
    snapshotUpdatedAt,
    outputKey: attemptedOutputKey,
    cacheWritten: true,
    snapshotVersion: GLOBAL_MACRO_TEMPLATE.templateId,
    note: "This does NOT fetch new data.",
    writes: {
      latestCacheKey: "macro_latest_read_cache:GLOBAL",
      historyCacheKeys: [
        ...monthlyWrites.map((row) => `macro_history_read_cache:GLOBAL:MONTHLY:${String(row.rangeYears)}`),
        ...weeklyWrites.map((row) => `macro_history_read_cache:GLOBAL:WEEKLY:${String(row.rangeYears)}`),
      ],
      historyMonthly: monthlyWrites,
      historyWeekly: weeklyWrites,
    },
  };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    assertAdminSecret(req);
    await ensureSchema();

    const requested = parseRegion(req.query?.region ?? req.body?.region ?? "US");
    const startedAt = new Date().toISOString();
    console.info("[admin-rebuild-macro-snapshot]", { startedAt, requested, note: "This does NOT fetch new data." });

    const perRegion: Array<Record<string, unknown>> = [];

    if (requested === "ALL") {
      for (const region of REGIONS) {
        perRegion.push(await rebuildRegion(region));
      }
      perRegion.push(await rebuildGlobal());
    } else if (requested === "GLOBAL") {
      perRegion.push(await rebuildGlobal());
    } else {
      perRegion.push(await rebuildRegion(requested));
      perRegion.push(await rebuildGlobal());
    }

    const endedAt = new Date().toISOString();
    console.info("[admin-rebuild-macro-snapshot]", { startedAt, endedAt, requested, completed: perRegion.map((row) => row.region) });

    res.status(200).json({
      ok: true,
      requested,
      startedAt,
      endedAt,
      note: "This does NOT fetch new data.",
      perRegion,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    const debug = (error as Error & { debug?: unknown }).debug ?? null;
    res.status(status).json({
      ok: false,
      error: (error as Error).message,
      note: "No ingest fallback was attempted.",
      debug,
    });
  }
}
