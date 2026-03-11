import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { query } from "../../../../api/_db.js";
import { MACRO_INDICATOR_CATALOG } from "../../../lib/macro/catalog.js";
import { US_FRED_SERIES } from "../../../lib/macro/fred.js";
import { runAndPersistMacroSnapshots } from "../../../lib/macro/pipeline.js";

type RegimeSnapshotRow = {
  as_of_date: string;
  updated_at: string | null;
  block_scores_json: string | null;
  macro_score_total: number | null;
  macro_confidence: number | null;
  core_regime_label: string;
  growth_overlay: string;
  stress_overlay: string;
  hard_asset_overlay: string;
  clear_signal_strength: number | null;
  speculative_signal_strength: number | null;
  top_drivers_json: string | null;
};

type IndicatorSnapshotRow = {
  indicator_id: string;
  signal_class: string;
  source_type: string;
  data_date_latest: string | null;
  value_latest: number | null;
  change_1m: number | null;
  change_3m: number | null;
  yoy: number | null;
  percentile_10y: number | null;
  score: number | null;
  freshness_days: number | null;
  coverage_10y_pct: number | null;
  driver_note: string | null;
};

type RawStatsRow = {
  series_key: string;
  raw_count: number | string;
  latest_raw_date: string | null;
};

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getNullReason(indicator: { coverage10yPct: number; valueLatest: number | null; score: number | null }): string | null {
  if (indicator.score !== null) return null;
  if (indicator.valueLatest === null) return "Missing latest value";
  if (indicator.coverage10yPct < 80) return "Coverage under 80% on 10y window";
  return "Score unavailable";
}

async function getRawSeriesStats(region: string) {
  const rows = (await query(
    `SELECT series_key, COUNT(*) AS raw_count, MAX(date) AS latest_raw_date
     FROM ${tables.macroRawDatapoints}
     WHERE region = ? AND source_type = 'auto'
     GROUP BY series_key
     ORDER BY series_key ASC`,
    [region],
  )) as unknown as RawStatsRow[];

  const bySeries = new Map(
    rows.map((row) => [
      String(row.series_key),
      {
        rawCount: Number(row.raw_count ?? 0),
        latestRawDate: row.latest_raw_date ?? null,
      },
    ]),
  );

  return {
    totalRawPointCount: rows.reduce((sum, row) => sum + Number(row.raw_count ?? 0), 0),
    seriesCount: rows.length,
    bySeries,
  };
}

async function readLatestSnapshot(region: string) {
  const regimeRows = (await query(
    `SELECT as_of_date, updated_at, block_scores_json, macro_score_total, macro_confidence, core_regime_label,
            growth_overlay, stress_overlay, hard_asset_overlay,
            clear_signal_strength, speculative_signal_strength, top_drivers_json
     FROM ${tables.macroRegimeSnapshots}
     WHERE region = ?
     ORDER BY as_of_date DESC
     LIMIT 1`,
    [region],
  )) as unknown as RegimeSnapshotRow[];

  const regimeRow = regimeRows[0];
  if (!regimeRow) return null;

  const indicatorRows = (await query(
    `SELECT indicator_id, signal_class, source_type, data_date_latest, value_latest, change_1m, change_3m, yoy,
            percentile_10y, score, freshness_days, coverage_10y_pct, driver_note
     FROM ${tables.macroIndicatorSnapshots}
     WHERE region = ? AND as_of_date = ?
     ORDER BY indicator_id ASC`,
    [region, regimeRow.as_of_date],
  )) as unknown as IndicatorSnapshotRow[];

  const catalog = MACRO_INDICATOR_CATALOG.filter((entry) => entry.region === region);
  const catalogById = new Map(catalog.map((entry) => [entry.indicatorId, entry]));
  const rawStats = await getRawSeriesStats(region);

  const indicators = indicatorRows.map((row) => {
    const indicatorId = String(row.indicator_id);
    const meta = catalogById.get(indicatorId);
    const signalClass = String(row.signal_class ?? "speculative") === "clear" ? "clear" : "speculative";
    const sourceType = String(row.source_type ?? "auto") === "manual" ? "manual" : "auto";
    const coverage10yPct = Number(row.coverage_10y_pct ?? 0);
    const valueLatest = row.value_latest === null ? null : Number(row.value_latest);
    const score = row.score === null ? null : Number(row.score);
    return {
      indicatorId,
      title: meta?.title ?? indicatorId,
      block: meta?.block ?? "D_CREDIBILITY",
      signalClass,
      sourceType,
      dataDateLatest: row.data_date_latest ?? null,
      valueLatest,
      change1m: row.change_1m === null ? null : Number(row.change_1m),
      change3m: row.change_3m === null ? null : Number(row.change_3m),
      yoy: row.yoy === null ? null : Number(row.yoy),
      percentile10y: row.percentile_10y === null ? null : Number(row.percentile_10y),
      score: score as -2 | -1 | 0 | 1 | 2 | null,
      freshnessDays: row.freshness_days === null ? null : Number(row.freshness_days),
      coverage10yPct,
      driverNote: row.driver_note ?? null,
      nullReason: getNullReason({ coverage10yPct, valueLatest, score }),
    };
  });

  const scoredCount = indicators.filter((item) => item.score !== null).length;
  const expectedFromFred = US_FRED_SERIES.map((entry) => entry.seriesKey);
  const expectedFromIndicators = Array.from(new Set(catalog.flatMap((entry) => entry.inputs)));
  const expectedSeriesKeys = Array.from(new Set([...expectedFromFred, ...expectedFromIndicators])).sort();

  const expectedVsFoundSeries = expectedSeriesKeys.map((seriesKey) => {
    const stat = rawStats.bySeries.get(seriesKey);
    return {
      seriesKey,
      found: Boolean(stat),
      rawCount: stat?.rawCount ?? 0,
      latestRawDate: stat?.latestRawDate ?? null,
    };
  });

  const indicatorById = new Map(indicators.map((item) => [item.indicatorId, item]));
  const indicatorInputStatus = catalog.map((entry) => {
    const snapshot = indicatorById.get(entry.indicatorId);
    const expectedInputs = entry.inputs;
    const foundInputs = expectedInputs.filter((input) => rawStats.bySeries.has(input));
    return {
      indicatorId: entry.indicatorId,
      title: entry.title,
      block: entry.block,
      signalClass: entry.signalClass,
      expectedInputs,
      foundInputs,
      valueLatest: snapshot?.valueLatest ?? null,
      coverage10yPct: snapshot?.coverage10yPct ?? 0,
      nullReason: snapshot?.nullReason ?? "No snapshot row",
    };
  });

  const regimeCountRows = (await query(
    `SELECT COUNT(*) AS total FROM ${tables.macroRegimeSnapshots} WHERE region = ?`,
    [region],
  )) as Array<{ total?: number | string }>;
  const indicatorCountRows = (await query(
    `SELECT COUNT(*) AS total
     FROM ${tables.macroIndicatorSnapshots}
     WHERE region = ? AND as_of_date = ?`,
    [region, regimeRow.as_of_date],
  )) as Array<{ total?: number | string }>;

  const indicatorSnapshotCount = Number(indicatorCountRows[0]?.total ?? 0);
  const regimeSnapshotCount = Number(regimeCountRows[0]?.total ?? 0);
  const snapshotIsEmpty = indicatorSnapshotCount === 0 || indicators.every((item) => item.valueLatest === null);
  const partialData = indicators.length > 0 && scoredCount < indicators.length;
  const snapshotHealth = snapshotIsEmpty
    ? "empty"
    : partialData
      ? "partial"
      : "healthy";

  const rootCauseHints: string[] = [];
  if (rawStats.totalRawPointCount === 0) {
    rootCauseHints.push("No raw datapoints found");
  }
  if (rawStats.totalRawPointCount > 0 && expectedVsFoundSeries.some((item) => !item.found)) {
    rootCauseHints.push("Raw datapoints exist but expected series keys are missing");
  }
  if (snapshotIsEmpty) {
    rootCauseHints.push("Snapshot exists but empty");
  }
  if (indicatorInputStatus.some((item) => item.expectedInputs.length > 0 && item.foundInputs.length === 0)) {
    rootCauseHints.push("Derived or required input series missing for one or more indicators");
  }
  if (rootCauseHints.length === 0) {
    rootCauseHints.push("No obvious pipeline issue detected");
  }

  return {
    regime: {
      asOfDate: regimeRow.as_of_date,
      blockScores: safeJsonParse<Record<string, number | null>>(regimeRow.block_scores_json, {
        A_FISCAL: null,
        B_MONETARY: null,
        C_INFLATION: null,
        D_CREDIBILITY: null,
      }),
      macroScoreTotal: regimeRow.macro_score_total === null ? null : Number(regimeRow.macro_score_total),
      macroConfidence: Number(regimeRow.macro_confidence ?? 0),
      coreRegimeLabel: regimeRow.core_regime_label,
      growthOverlay: regimeRow.growth_overlay,
      stressOverlay: regimeRow.stress_overlay,
      hardAssetOverlay: regimeRow.hard_asset_overlay,
      clearSignalStrength: regimeRow.clear_signal_strength === null ? null : Number(regimeRow.clear_signal_strength),
      speculativeSignalStrength: regimeRow.speculative_signal_strength === null ? null : Number(regimeRow.speculative_signal_strength),
      topDrivers: safeJsonParse<Array<{ indicatorId: string; contribution: number }>>(regimeRow.top_drivers_json, []),
    },
    indicators,
    dataStatus: indicators.length > 0 ? "snapshot" : "insufficient",
    writePolicy: "read_only",
    stats: {
      rawPointCount: rawStats.totalRawPointCount,
      seriesCount: rawStats.seriesCount,
      indicatorCount: indicators.length,
      scoredCount,
      partialData,
      snapshotAsOfDate: regimeRow.as_of_date,
      readMode: "snapshot",
    },
    debug: {
      snapshotStatus: {
        readMode: "snapshot",
        dataStatus: indicators.length > 0 ? "snapshot" : "insufficient",
        snapshotAsOfDate: regimeRow.as_of_date,
        snapshotHealth,
        fallbackLive: false,
        primaryPath: true,
      },
      rawDataStats: {
        rawPointCount: rawStats.totalRawPointCount,
        seriesCount: rawStats.seriesCount,
        indicatorCount: indicators.length,
        scoredCount,
        partialData,
      },
      expectedVsFoundSeries,
      indicatorInputStatus,
      snapshotContent: {
        indicatorSnapshotCount,
        regimeSnapshotCount,
        latestSnapshotTimestamp: regimeRow.updated_at ?? regimeRow.as_of_date,
        snapshotIsEmpty,
      },
      rootCauseHints,
    },
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  await ensureSchema();

  const region = String(req.query?.region ?? "US").toUpperCase();
  const allowLiveFallback = String(req.query?.fallbackLive ?? "1") === "1";

  const snapshot = await readLatestSnapshot(region);
  if (snapshot) {
    res.status(200).json({ ok: true, globalMacro: snapshot });
    return;
  }

  if (!allowLiveFallback) {
    res.status(200).json({
      ok: true,
      globalMacro: null,
      diagnostics: {
        readMode: "empty_no_snapshot",
        message: "No snapshots found. Run /api/admin/macro/run-engine first.",
      },
    });
    return;
  }

  const live = await runAndPersistMacroSnapshots({ region });
  const fallbackSnapshot = await readLatestSnapshot(region);

  res.status(200).json({
    ok: true,
    globalMacro: fallbackSnapshot,
    diagnostics: {
      readMode: "live_fallback_then_snapshot",
      wroteAny: live.wroteAny,
      asOfDate: live.asOfDate,
      rawPointCount: live.rawPointCount,
      indicatorWrites: live.indicatorWrites,
      regimeWrites: live.regimeWrites,
    },
  });
}
