import { assertAdminSecret } from "../../../../api/_auth.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { query } from "../../../../api/_db.js";
import { runAndPersistMacroSnapshots } from "../../../lib/macro/pipeline.js";
import { computeMacroRegimeHistory } from "../../../lib/macro/history.js";
import { buildMacroLatestReadPayload } from "../sector/global-macro.js";
import { upsertLatestMacroReadCache, upsertMacroHistoryReadCache } from "../../../lib/macro/readCache.js";
import { GLOBAL_MACRO_TEMPLATE } from "../../../lib/macro/template.js";

const REGIONS = ["US", "EA", "SE"] as const;

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

async function rebuildRegion(region: typeof REGIONS[number]) {
  const startedAt = new Date().toISOString();
  const rawDebug = await getRawDataDebug(region);
  console.info("[admin-rebuild-macro-snapshot:data-source]", rawDebug);
  if (!rawDebug.dataFound) {
    const error = new Error(`Load failed: no stored raw datapoints for ${region}.`);
    (error as Error & { status?: number; debug?: unknown }).status = 409;
    (error as Error & { status?: number; debug?: unknown }).debug = rawDebug;
    throw error;
  }

  const summary = await runAndPersistMacroSnapshots({ region });
  if (summary.rawPointCount === 0 || !summary.asOfDate) {
    const error = new Error(`Load failed: engine snapshot write had no scorable rows for ${region}.`);
    (error as Error & { status?: number; debug?: unknown }).status = 409;
    (error as Error & { status?: number; debug?: unknown }).debug = {
      ...rawDebug,
      engineRawPointCount: summary.rawPointCount,
      engineAsOfDate: summary.asOfDate ?? null,
    };
    throw error;
  }

  const snapshotPayload = await buildMacroLatestReadPayload(region);
  const snapshotAsOf = (snapshotPayload as any)?.globalMacro?.regime?.asOfDate ?? summary.asOfDate ?? null;
  const cacheUpdatedAt = await upsertLatestMacroReadCache(region, snapshotAsOf, snapshotPayload);

  const monthly20 = await computeMacroRegimeHistory({ region, resolution: "MONTHLY", rangeYears: 20 });
  const weekly3 = await computeMacroRegimeHistory({ region, resolution: "WEEKLY", rangeYears: 3 });
  await upsertMacroHistoryReadCache({ region, resolution: "MONTHLY", rangeYears: 20, payload: monthly20 });
  await upsertMacroHistoryReadCache({ region, resolution: "WEEKLY", rangeYears: 3, payload: weekly3 });

  return {
    ok: true,
    region,
    startedAt,
    endedAt: new Date().toISOString(),
    mode: "rebuild_snapshot_no_ingest",
    dataTimestamp: rawDebug.dataTimestamp ?? await getLatestRawDate(region),
    snapshotAsOfDate: snapshotAsOf,
    snapshotUpdatedAt: cacheUpdatedAt,
    snapshotVersion: GLOBAL_MACRO_TEMPLATE.templateId,
    note: "This does NOT fetch new data.",
    writes: {
      indicatorWrites: summary.indicatorWrites,
      regimeWrites: summary.regimeWrites,
      historyMonthly20Points: monthly20.points.length,
      historyWeekly3Points: weekly3.points.length,
    },
  };
}

async function rebuildGlobal() {
  const startedAt = new Date().toISOString();
  const payload = await buildMacroLatestReadPayload("GLOBAL");
  const asOfDate = (payload as any)?.globalMacro?.regime?.asOfDate ?? null;
  if (!asOfDate) {
    const error = new Error("GLOBAL snapshot could not be rebuilt because regional snapshots are missing or stale.");
    (error as Error & { status?: number }).status = 409;
    throw error;
  }
  const snapshotUpdatedAt = await upsertLatestMacroReadCache("GLOBAL", asOfDate, payload);
  const monthly20 = await computeMacroRegimeHistory({ region: "GLOBAL", resolution: "MONTHLY", rangeYears: 20 });
  const weekly3 = await computeMacroRegimeHistory({ region: "GLOBAL", resolution: "WEEKLY", rangeYears: 3 });
  await upsertMacroHistoryReadCache({ region: "GLOBAL", resolution: "MONTHLY", rangeYears: 20, payload: monthly20 });
  await upsertMacroHistoryReadCache({ region: "GLOBAL", resolution: "WEEKLY", rangeYears: 3, payload: weekly3 });

  return {
    ok: true,
    region: "GLOBAL",
    startedAt,
    endedAt: new Date().toISOString(),
    mode: "rebuild_snapshot_no_ingest",
    dataTimestamp: asOfDate,
    snapshotAsOfDate: asOfDate,
    snapshotUpdatedAt,
    snapshotVersion: GLOBAL_MACRO_TEMPLATE.templateId,
    note: "This does NOT fetch new data.",
    writes: {
      historyMonthly20Points: monthly20.points.length,
      historyWeekly3Points: weekly3.points.length,
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
