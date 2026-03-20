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

type RebuildStageMetric = {
  stage: string;
  status: "start" | "end" | "error";
  startedAt: string;
  endedAt?: string;
  ms?: number;
  bytes?: number;
  notes?: string;
};

function summarizeStageDiagnostics(stages: RebuildStageMetric[]) {
  const completed = stages.filter((row) => row.status === "end");
  const errored = stages.filter((row) => row.status === "error");
  const lastCompletedStage = completed.length > 0 ? completed[completed.length - 1].stage : null;
  const failingStage = errored.length > 0 ? errored[errored.length - 1].stage : null;
  const stageTimings = stages
    .filter((row) => row.status === "end" || row.status === "error")
    .map((row) => ({ stage: row.stage, ms: row.ms ?? null, ok: row.status === "end" }));
  const stageSizes = stages
    .filter((row) => typeof row.bytes === "number")
    .map((row) => ({ stage: row.stage, approxBytes: row.bytes ?? null }));
  return {
    lastCompletedStage,
    failingStage,
    stageTimings,
    stageSizes,
  };
}

function jsonBytes(value: unknown) {
  try { return Buffer.byteLength(JSON.stringify(value ?? null)); } catch { return null; }
}

function trimDriverForHistory(driver: any) {
  if (!driver || typeof driver !== "object") return driver;
  return {
    indicatorId: typeof driver.indicatorId === "string" ? driver.indicatorId : null,
    title: typeof driver.title === "string" ? driver.title : null,
    block: typeof driver.block === "string" ? driver.block : null,
    direction: typeof driver.direction === "string" ? driver.direction : null,
    contribution: typeof driver.contribution === "number" ? driver.contribution : null,
  };
}

function compactHistoryPayloadForCache(payload: any) {
  if (!payload || typeof payload !== "object") return payload;
  const points = Array.isArray(payload.points)
    ? payload.points.map((point: any) => ({
      ...point,
      topDrivers: Array.isArray(point?.topDrivers) ? point.topDrivers.slice(0, 3).map(trimDriverForHistory) : [],
      regimeExplanation: point?.regimeExplanation && typeof point.regimeExplanation === "object"
        ? {
          title: typeof point.regimeExplanation.title === "string" ? point.regimeExplanation.title : "",
          summary: typeof point.regimeExplanation.summary === "string" ? point.regimeExplanation.summary : "",
          driverHighlights: Array.isArray(point.regimeExplanation.driverHighlights) ? point.regimeExplanation.driverHighlights.slice(0, 3) : [],
        }
        : point?.regimeExplanation ?? null,
    }))
    : [];
  const regimeIntervals = Array.isArray(payload?.intervals?.regime)
    ? payload.intervals.regime.map((interval: any) => ({
      ...interval,
      topDrivers: Array.isArray(interval?.topDrivers) ? interval.topDrivers.slice(0, 3).map(trimDriverForHistory) : [],
      regimeExplanation: interval?.regimeExplanation && typeof interval.regimeExplanation === "object"
        ? {
          title: typeof interval.regimeExplanation.title === "string" ? interval.regimeExplanation.title : "",
          summary: typeof interval.regimeExplanation.summary === "string" ? interval.regimeExplanation.summary : "",
          driverHighlights: Array.isArray(interval.regimeExplanation.driverHighlights) ? interval.regimeExplanation.driverHighlights.slice(0, 3) : [],
        }
        : interval?.regimeExplanation ?? null,
    }))
    : [];
  return {
    ...payload,
    points,
    intervals: {
      ...(payload.intervals ?? {}),
      regime: regimeIntervals,
      overlays: payload?.intervals?.overlays ?? { growth: [], stress: [], hardAsset: [] },
    },
  };
}

async function runStage<T>(stages: RebuildStageMetric[], stage: string, task: () => Promise<T> | T, bytesOf?: (value: T) => number | null) {
  const startedAt = new Date().toISOString();
  stages.push({ stage, status: "start", startedAt });
  const startMs = Date.now();
  try {
    const out = await task();
    stages.push({
      stage,
      status: "end",
      startedAt,
      endedAt: new Date().toISOString(),
      ms: Date.now() - startMs,
      bytes: bytesOf ? bytesOf(out) ?? undefined : undefined,
    });
    return out;
  } catch (error) {
    stages.push({
      stage,
      status: "error",
      startedAt,
      endedAt: new Date().toISOString(),
      ms: Date.now() - startMs,
      notes: (error as Error)?.message ?? "unknown_error",
    });
    throw error;
  }
}

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

async function getRebuildKeyStatus(region: typeof REGIONS[number] | "GLOBAL") {
  if (region === "GLOBAL") {
    const globalLatest = await query(
      `SELECT COUNT(*) AS row_count, MAX(updated_at) AS latest_updated_at
       FROM ${tables.macroLatestReadCache}
       WHERE region = 'GLOBAL'`,
      [],
    ) as unknown as Array<{ row_count: number | string; latest_updated_at: string | null }>;
    return {
      sourceSnapshotKey: "macro_regime_snapshots:{US,EA,SE}",
      sourceSnapshotExists: true,
      latestCacheKey: "macro_latest_read_cache:GLOBAL",
      latestCacheExists: Number(globalLatest[0]?.row_count ?? 0) > 0,
      latestCacheBytes: null,
      historyCacheKeyPrefix: "macro_history_read_cache:GLOBAL:*",
    };
  }

  const sourceRows = await query(
    `SELECT COUNT(*) AS row_count, MAX(as_of_date) AS latest_as_of_date
     FROM ${tables.macroRegimeSnapshots}
     WHERE region = ?`,
    [region],
  ) as unknown as Array<{ row_count: number | string; latest_as_of_date: string | null }>;
  const latestCacheRows = await query(
    `SELECT COUNT(*) AS row_count, MAX(LENGTH(payload_json)) AS payload_bytes
     FROM ${tables.macroLatestReadCache}
     WHERE region = ?`,
    [region],
  ) as unknown as Array<{ row_count: number | string; payload_bytes: number | null }>;
  const historyRows = await query(
    `SELECT COUNT(*) AS row_count, MAX(LENGTH(payload_json)) AS max_payload_bytes
     FROM ${tables.macroHistoryReadCache}
     WHERE region = ?`,
    [region],
  ) as unknown as Array<{ row_count: number | string; max_payload_bytes: number | null }>;
  return {
    sourceSnapshotKey: `macro_regime_snapshots:${region}`,
    sourceSnapshotExists: Number(sourceRows[0]?.row_count ?? 0) > 0,
    sourceSnapshotLatestAsOf: sourceRows[0]?.latest_as_of_date ?? null,
    latestCacheKey: `macro_latest_read_cache:${region}`,
    latestCacheExists: Number(latestCacheRows[0]?.row_count ?? 0) > 0,
    latestCacheBytes: latestCacheRows[0]?.payload_bytes ?? null,
    historyCacheKeyPrefix: `macro_history_read_cache:${region}:*`,
    historyCacheExists: Number(historyRows[0]?.row_count ?? 0) > 0,
    historyCacheMaxBytes: historyRows[0]?.max_payload_bytes ?? null,
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
  const stageMetrics: RebuildStageMetric[] = [];
  const attemptedOutputKey = `macro_latest_read_cache:${region}`;
  try {
    const rawDebug = await runStage(stageMetrics, "load_latest_source_snapshot_input", () => getRawDataDebug(region), (value) => jsonBytes(value));
    const keyStatus = await runStage(stageMetrics, "load_source_keys", () => getRebuildKeyStatus(region), (value) => jsonBytes(value));
    console.info("[admin-rebuild-macro-snapshot:data-source]", rawDebug);
    if (!rawDebug.dataFound && !keyStatus.sourceSnapshotExists) {
      const error = new Error(`No source snapshot found for region ${region}`);
      (error as Error & { status?: number; debug?: unknown }).status = 409;
      (error as Error & { status?: number; debug?: unknown }).debug = {
        region,
        attemptedInputKey: keyStatus.sourceSnapshotKey,
        attemptedOutputKey,
        keyStatus,
        failedStage: "load_source_keys",
      };
      throw error;
    }
    if (!rawDebug.dataFound) {
      const error = new Error(`No source raw datapoints found for region ${region}`);
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
      summary = await runStage(stageMetrics, "load_history_cache_input_and_persist_snapshot", () => runAndPersistMacroSnapshots({ region }));
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

    const snapshotBuildSubStages: RebuildStageMetric[] = [];
    let snapshotPayload = await runStage(
      stageMetrics,
      "build_globalMacro_payload",
      () => buildMacroLatestReadPayload(region, {
        reportStage: (event) => {
          snapshotBuildSubStages.push({
            stage: `${event.stage}`,
            status: event.status,
            startedAt: new Date().toISOString(),
            ms: event.ms,
            bytes: event.bytes,
          });
        },
      }),
      (value) => jsonBytes(value),
    );
    const snapshotAsOf = (snapshotPayload as any)?.globalMacro?.regime?.asOfDate ?? summary.asOfDate ?? null;
    let cacheUpdatedAt: string;
    try {
      cacheUpdatedAt = await runStage(
        stageMetrics,
        "serialize_write_snapshot",
        () => upsertLatestMacroReadCache(region, snapshotAsOf, snapshotPayload),
        (value) => Buffer.byteLength(String(value ?? "")),
      );
      snapshotPayload = null;
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
        snapshotBuildSubStages,
      };
      throw error;
    }

    const monthlyWrites: Array<{ rangeYears: 10 | 20 | "MAX"; points: number }> = [];
    for (const rangeYears of MONTHLY_HISTORY_RANGES) {
      let historyPayload: any = await runStage(
        stageMetrics,
        `build_macroHistory_payload:MONTHLY:${String(rangeYears)}`,
        () => computeMacroRegimeHistory({ region, resolution: "MONTHLY", rangeYears }),
        (value) => jsonBytes(value),
      );
      const compacted = compactHistoryPayloadForCache(historyPayload);
      historyPayload = null;
      await runStage(
        stageMetrics,
        `serialize_write_macroHistory:MONTHLY:${String(rangeYears)}`,
        () => upsertMacroHistoryReadCache({ region, resolution: "MONTHLY", rangeYears, payload: compacted }),
        () => jsonBytes(compacted),
      );
      monthlyWrites.push({ rangeYears, points: compacted.points?.length ?? 0 });
    }

    const weeklyWrites: Array<{ rangeYears: 1 | 3 | 5; points: number }> = [];
    for (const rangeYears of WEEKLY_HISTORY_RANGES) {
      let historyPayload: any = await runStage(
        stageMetrics,
        `build_macroHistory_payload:WEEKLY:${String(rangeYears)}`,
        () => computeMacroRegimeHistory({ region, resolution: "WEEKLY", rangeYears }),
        (value) => jsonBytes(value),
      );
      const compacted = compactHistoryPayloadForCache(historyPayload);
      historyPayload = null;
      await runStage(
        stageMetrics,
        `serialize_write_macroHistory:WEEKLY:${String(rangeYears)}`,
        () => upsertMacroHistoryReadCache({ region, resolution: "WEEKLY", rangeYears, payload: compacted }),
        () => jsonBytes(compacted),
      );
      weeklyWrites.push({ rangeYears, points: compacted.points?.length ?? 0 });
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
      diagnostics: {
        keyStatus,
        snapshotBuildSubStages,
        stageMetrics,
        ...summarizeStageDiagnostics(stageMetrics),
      },
    };
  } catch (error) {
    const existingDebug = (error as Error & { debug?: Record<string, unknown> }).debug ?? {};
    (error as Error & { debug?: unknown }).debug = {
      ...existingDebug,
      region,
      outputKey: attemptedOutputKey,
      stageMetrics,
      ...summarizeStageDiagnostics(stageMetrics),
    };
    throw error;
  }
}

async function rebuildGlobal() {
  const startedAt = new Date().toISOString();
  const stageMetrics: RebuildStageMetric[] = [];
  const attemptedOutputKey = "macro_latest_read_cache:GLOBAL";
  try {
    const snapshotInputDebug = await runStage(
      stageMetrics,
      "load_latest_source_snapshot_input",
      () => getRegionalSnapshotInputDebug(),
      (value) => jsonBytes(value),
    );
    const keyStatus = await runStage(stageMetrics, "load_source_keys", () => getRebuildKeyStatus("GLOBAL"), (value) => jsonBytes(value));
    if (!snapshotInputDebug.anyFound) {
      const error = new Error("No source snapshot found for region GLOBAL");
      (error as Error & { status?: number; debug?: unknown }).status = 409;
      (error as Error & { status?: number; debug?: unknown }).debug = {
        region: "GLOBAL",
        attemptedInputKey: snapshotInputDebug.attemptedInputKey,
        attemptedOutputKey,
        inputFound: false,
        inputShape: "macro_regime_snapshots rows by region",
        perRegion: snapshotInputDebug.byRegion,
        keyStatus,
        failedStage: "load_input",
      };
      throw error;
    }

    const snapshotBuildSubStages: RebuildStageMetric[] = [];
    let payload = await runStage(
      stageMetrics,
      "build_globalMacro_payload",
      () => buildMacroLatestReadPayload("GLOBAL", {
        reportStage: (event) => {
          snapshotBuildSubStages.push({
            stage: `${event.stage}`,
            status: event.status,
            startedAt: new Date().toISOString(),
            ms: event.ms,
            bytes: event.bytes,
          });
        },
      }),
      (value) => jsonBytes(value),
    );
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
    const snapshotUpdatedAt = await runStage(
      stageMetrics,
      "serialize_write_snapshot",
      () => upsertLatestMacroReadCache("GLOBAL", asOfDate, payload),
      (value) => Buffer.byteLength(String(value ?? "")),
    );
    payload = null;
    const monthlyWrites: Array<{ rangeYears: 10 | 20 | "MAX"; points: number }> = [];
    for (const rangeYears of MONTHLY_HISTORY_RANGES) {
      let historyPayload: any = await runStage(
        stageMetrics,
        `build_macroHistory_payload:MONTHLY:${String(rangeYears)}`,
        () => computeMacroRegimeHistory({ region: "GLOBAL", resolution: "MONTHLY", rangeYears }),
        (value) => jsonBytes(value),
      );
      const compacted = compactHistoryPayloadForCache(historyPayload);
      historyPayload = null;
      await runStage(
        stageMetrics,
        `serialize_write_macroHistory:MONTHLY:${String(rangeYears)}`,
        () => upsertMacroHistoryReadCache({ region: "GLOBAL", resolution: "MONTHLY", rangeYears, payload: compacted }),
        () => jsonBytes(compacted),
      );
      monthlyWrites.push({ rangeYears, points: compacted.points?.length ?? 0 });
    }

    const weeklyWrites: Array<{ rangeYears: 1 | 3 | 5; points: number }> = [];
    for (const rangeYears of WEEKLY_HISTORY_RANGES) {
      let historyPayload: any = await runStage(
        stageMetrics,
        `build_macroHistory_payload:WEEKLY:${String(rangeYears)}`,
        () => computeMacroRegimeHistory({ region: "GLOBAL", resolution: "WEEKLY", rangeYears }),
        (value) => jsonBytes(value),
      );
      const compacted = compactHistoryPayloadForCache(historyPayload);
      historyPayload = null;
      await runStage(
        stageMetrics,
        `serialize_write_macroHistory:WEEKLY:${String(rangeYears)}`,
        () => upsertMacroHistoryReadCache({ region: "GLOBAL", resolution: "WEEKLY", rangeYears, payload: compacted }),
        () => jsonBytes(compacted),
      );
      weeklyWrites.push({ rangeYears, points: compacted.points?.length ?? 0 });
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
      diagnostics: {
        keyStatus,
        snapshotBuildSubStages,
        stageMetrics,
        ...summarizeStageDiagnostics(stageMetrics),
      },
    };
  } catch (error) {
    const existingDebug = (error as Error & { debug?: Record<string, unknown> }).debug ?? {};
    (error as Error & { debug?: unknown }).debug = {
      ...existingDebug,
      region: "GLOBAL",
      outputKey: attemptedOutputKey,
      stageMetrics,
      ...summarizeStageDiagnostics(stageMetrics),
    };
    throw error;
  }
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
