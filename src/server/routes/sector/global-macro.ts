import { getAdminSecret } from "../../../../api/_auth.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { query } from "../../../../api/_db.js";
import { MACRO_INDICATOR_CATALOG } from "../../../lib/macro/catalog.js";
import { US_FRED_SERIES } from "../../../lib/macro/fred.js";
import { runAndPersistMacroSnapshots } from "../../../lib/macro/pipeline.js";
import { computeMacroRegimeHistory, type HistoryResolution } from "../../../lib/macro/history.js";

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

type IngestRunRow = {
  attempted_at: string;
  region: string;
  mode: string;
  success: number | string;
  fred_api_key_present: number | string;
  admin_authorized: number | string;
  db_connected: number | string;
  fetch_started: number | string;
  fetch_succeeded: number | string;
  fetched_series: number | string;
  fetched_observation_count: number | string;
  insert_attempted: number | string;
  attempted_inserts: number | string;
  inserted_row_count: number | string;
  series_results_json: string | null;
  failing_step: string | null;
  error_message: string | null;
};

type GoldMacroRawStatsRow = {
  source: string;
  point_count: number | string;
  latest_date: string | null;
};

type GoldProviderMapRow = {
  provider: string;
  provider_symbol: string;
  provider_kind: string;
};

type GoldMonthlyStatsRow = {
  point_count: number | string;
  min_date: string | null;
  max_date: string | null;
};

type GoldEodMonthlyStatsRow = {
  month_count: number | string;
  min_yyyymm: string | null;
  max_yyyymm: string | null;
};



function buildRegimeExplanation(label: string, topDrivers: Array<{ title?: string; indicatorId: string }>) {
  const driverHighlights = topDrivers.slice(0, 3).map((driver) => driver.title ?? driver.indicatorId);
  if (label === "MonetaryDominance") return {
    title: "Monetary regime dominates",
    summary: "Penningpolitiska signaler väger tyngst relativt fiskal och inflationsdriven press.",
    driverHighlights,
  };
  if (label === "Balanced") return {
    title: "Balanced regime",
    summary: "Blocken är blandade och inga enskilda drivare dominerar tillräckligt för regimskifte.",
    driverHighlights,
  };
  if (label === "FiscalPressureBuilding") return {
    title: "Fiscal pressure is building",
    summary: "Fiskal belastning tillsammans med realräntor och inflationssignaler driver ett mer spänt makroklimat.",
    driverHighlights,
  };
  if (label === "FiscalDominanceRisk") return {
    title: "Fiscal dominance risk",
    summary: "Fiskal press och förtroendesignaler dominerar med högre systemstress i makrobilden.",
    driverHighlights,
  };
  return {
    title: "Data insufficient",
    summary: "För få poängsatta signaler för en robust regimförklaring.",
    driverHighlights,
  };
}

function normalizeDriverDirection(change1m: number | null, change3m: number | null, input?: unknown) {
  if (input === "rising" || input === "falling" || input === "stable" || input === "accelerating" || input === "decelerating") return input;
  const c1 = typeof change1m === "number" ? change1m : 0;
  const c3 = typeof change3m === "number" ? change3m : 0;
  if (Math.abs(c1) < 1e-9 && Math.abs(c3) < 1e-9) return "stable";
  if (c1 > 0 && c3 > 0) return Math.abs(c1) > Math.abs(c3 / 3) * 1.25 ? "accelerating" : "rising";
  if (c1 < 0 && c3 < 0) return Math.abs(c1) > Math.abs(c3 / 3) * 1.25 ? "decelerating" : "falling";
  return c1 > 0 ? "rising" : c1 < 0 ? "falling" : "stable";
}

function summarizeBlockStatus(catalog: Array<{ indicatorId: string; block: string; title: string }>, indicators: Array<{
  indicatorId: string;
  score: number | null;
  valueLatest: number | null;
  coverage10yPct: number;
}>) {
  const indicatorById = new Map(indicators.map((item) => [item.indicatorId, item]));
  const byBlock = new Map<string, Array<{ indicatorId: string; title: string; score: number | null; valueLatest: number | null; coverage10yPct: number }>>();

  for (const meta of catalog) {
    const row = indicatorById.get(meta.indicatorId);
    const bucket = byBlock.get(meta.block) ?? [];
    bucket.push({
      indicatorId: meta.indicatorId,
      title: meta.title,
      score: row?.score ?? null,
      valueLatest: row?.valueLatest ?? null,
      coverage10yPct: row?.coverage10yPct ?? 0,
    });
    byBlock.set(meta.block, bucket);
  }

  const output: Record<string, { status: "Scorable" | "Insufficient"; scored: number; total: number; reasons: string[] }> = {};
  for (const [block, rows] of byBlock.entries()) {
    const scored = rows.filter((item) => item.score !== null).length;
    const reasons: string[] = [];
    for (const item of rows) {
      if (item.score !== null) continue;
      if (item.valueLatest === null) reasons.push(`${item.indicatorId}: missing latest value`);
      else if (item.coverage10yPct < 80) reasons.push(`${item.indicatorId}: coverage ${item.coverage10yPct.toFixed(1)}% (<80%)`);
      else reasons.push(`${item.indicatorId}: score unavailable`);
    }
    output[block] = {
      status: scored > 0 ? "Scorable" : "Insufficient",
      scored,
      total: rows.length,
      reasons,
    };
  }
  return output;
}

function summarizeOverlayData(
  catalog: Array<{ indicatorId: string; overlay?: string; inputs?: string[] }>,
  indicators: Array<{ indicatorId: string; score: number | null; valueLatest: number | null; coverage10yPct: number }>,
  rawSeriesKeys: Set<string>,
) {
  const indicatorById = new Map(indicators.map((item) => [item.indicatorId, item]));
  const overlayKeys = ["growth", "stress", "hard_asset"] as const;
  const output: Record<string, {
    scoredInputs: string[];
    missingInputs: string[];
    usesFallback: boolean;
    fallbackReason: "none" | "source_missing" | "no_latest_value" | "insufficient_coverage" | "scoring_gate_blocked";
    blockedIndicators: Array<{ indicatorId: string; reason: string }>;
  }> = {};

  for (const overlay of overlayKeys) {
    const entries = catalog.filter((entry) => entry.overlay === overlay);
    const ids = entries.map((entry) => entry.indicatorId);
    const scoredInputs = ids.filter((id) => indicatorById.get(id)?.score !== null);
    const missingInputs = ids.filter((id) => indicatorById.get(id)?.score === null);
    const blockedIndicators = missingInputs.map((id) => {
      const row = indicatorById.get(id);
      const entry = entries.find((item) => item.indicatorId === id);
      const hasAnySource = (entry?.inputs ?? []).some((input) => rawSeriesKeys.has(input));
      if (!row || !hasAnySource) return { indicatorId: id, reason: "source_missing" };
      if (row.valueLatest === null) return { indicatorId: id, reason: "no_latest_value" };
      if (row.coverage10yPct < 80) return { indicatorId: id, reason: "insufficient_coverage" };
      return { indicatorId: id, reason: "scoring_gate_blocked" };
    });

    let fallbackReason: "none" | "source_missing" | "no_latest_value" | "insufficient_coverage" | "scoring_gate_blocked" = "none";
    if (scoredInputs.length === 0) {
      if (blockedIndicators.some((item) => item.reason === "insufficient_coverage")) fallbackReason = "insufficient_coverage";
      else if (blockedIndicators.some((item) => item.reason === "no_latest_value")) fallbackReason = "no_latest_value";
      else if (blockedIndicators.some((item) => item.reason === "source_missing")) fallbackReason = "source_missing";
      else if (blockedIndicators.length > 0) fallbackReason = "scoring_gate_blocked";
    }

    output[overlay] = {
      scoredInputs,
      missingInputs,
      usesFallback: scoredInputs.length === 0,
      fallbackReason,
      blockedIndicators,
    };
  }

  return output;
}

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

async function getLatestIngestRun(region: string) {
  const rows = (await query(
    `SELECT attempted_at, region, mode, success, fred_api_key_present, admin_authorized,
            db_connected, fetch_started, fetch_succeeded, fetched_series, fetched_observation_count,
            insert_attempted, attempted_inserts, inserted_row_count, series_results_json, failing_step, error_message
     FROM ${tables.macroIngestRuns}
     WHERE region = ?
     ORDER BY attempted_at DESC
     LIMIT 1`,
    [region],
  )) as unknown as IngestRunRow[];

  const row = rows[0];
  if (!row) return null;
  const attemptedInserts = Number(row.attempted_inserts ?? 0);
  const insertedRowCount = Number(row.inserted_row_count ?? 0);
  const duplicateOrUnchangedRows = Math.max(0, attemptedInserts - insertedRowCount);
  const fetchedObservationCount = Number(row.fetched_observation_count ?? 0);

  const seriesResults = safeJsonParse<Array<{
    seriesId: string;
    seriesKey: string;
    fetchSuccess: boolean;
    observationsFetched: number;
    errorMessage: string | null;
    meta?: Record<string, unknown>;
  }>>(row.series_results_json, []);
  const goldFetch = summarizeGoldFetchFromSeriesResults(seriesResults);

  return {
    timestamp: row.attempted_at,
    region: row.region,
    mode: row.mode,
    success: Number(row.success ?? 0) === 1,
    fredApiKeyPresent: Number(row.fred_api_key_present ?? 0) === 1,
    adminAuthorized: Number(row.admin_authorized ?? 0) === 1,
    dbConnected: Number(row.db_connected ?? 0) === 1,
    fetchStarted: Number(row.fetch_started ?? 0) === 1,
    fetchSucceeded: Number(row.fetch_succeeded ?? 0) === 1,
    fetchedSeries: Number(row.fetched_series ?? 0),
    fetchedObservationCount,
    insertAttempted: Number(row.insert_attempted ?? 0) === 1,
    attemptedInserts,
    insertedRowCount,
    duplicateOrUnchangedRows,
    seriesResults,
    goldFetch,
    failingStep: row.failing_step,
    errorMessage: row.error_message,
    insertSucceeded: insertedRowCount > 0,
    dedupeOnlyRun: attemptedInserts > 0 && insertedRowCount === 0,
    ingestOutcome: attemptedInserts === 0
      ? "nothing_to_write"
      : insertedRowCount > 0
        ? "inserted_new_rows"
        : "dedupe_or_unchanged_only",
  };
}



function summarizeGoldFetchFromSeriesResults(
  seriesResults: Array<{ seriesId: string; seriesKey: string; fetchSuccess: boolean; observationsFetched: number; meta?: Record<string, unknown> }>,
) {
  const goldRow = seriesResults.find((row) => row.seriesKey === "gold_usd");
  const meta = (goldRow?.meta ?? {}) as Record<string, unknown>;
  return {
    requestPattern: typeof meta.requestPattern === "string" ? meta.requestPattern : "single_request_with_explicit_from_to",
    endpoint: typeof meta.endpoint === "string" ? meta.endpoint : "historical-price-eod/full",
    symbol: typeof meta.symbol === "string" ? meta.symbol : "GCUSD",
    from: typeof meta.from === "string" ? meta.from : null,
    to: typeof meta.to === "string" ? meta.to : null,
    fetchedMinDate: typeof meta.fetchedMinDate === "string" ? meta.fetchedMinDate : null,
    fetchedMaxDate: typeof meta.fetchedMaxDate === "string" ? meta.fetchedMaxDate : null,
    fetchedRowCount: typeof meta.fetchedRowCount === "number"
      ? meta.fetchedRowCount
      : Number(goldRow?.observationsFetched ?? 0),
  };
}

async function getGoldSourceDiagnostics(region: string) {
  const tableExists = async (tableName: string) => {
    const rows = (await query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
      [tableName],
    )) as Array<{ name?: string }>;
    return Boolean(rows[0]?.name);
  };

  const macroRawRows = (await query(
    `SELECT source, COUNT(*) AS point_count, MAX(date) AS latest_date
     FROM ${tables.macroRawDatapoints}
     WHERE region = ? AND series_key = 'gold_usd'
     GROUP BY source
     ORDER BY source ASC`,
    [region],
  )) as unknown as GoldMacroRawStatsRow[];

  const providerRows = (await query(
    `SELECT provider, provider_symbol, provider_kind
     FROM price_provider_map
     WHERE price_key = 'XAU_USD_TOZ'
     LIMIT 1`,
  )) as unknown as GoldProviderMapRow[];

  const hasPriceHistoryMonthly = await tableExists("price_history_monthly");
  const hasPriceEodMonthly = await tableExists("price_eod_monthly");

  const monthlyRows = hasPriceHistoryMonthly
    ? ((await query(
      `SELECT COUNT(*) AS point_count, MIN(date_utc) AS min_date, MAX(date_utc) AS max_date
       FROM price_history_monthly
       WHERE price_key = 'XAU_USD_TOZ'`,
    )) as unknown as GoldMonthlyStatsRow[])
    : [];

  const eodRows = hasPriceEodMonthly
    ? ((await query(
      `SELECT COUNT(*) AS month_count, MIN(yyyymm) AS min_yyyymm, MAX(yyyymm) AS max_yyyymm
       FROM price_eod_monthly
       WHERE price_key = 'XAU_USD_TOZ'`,
    )) as unknown as GoldEodMonthlyStatsRow[])
    : [];

  const provider = providerRows[0] ?? null;
  const monthly = monthlyRows[0] ?? { point_count: 0, min_date: null, max_date: null };
  const eod = eodRows[0] ?? { month_count: 0, min_yyyymm: null, max_yyyymm: null };

  return {
    macroSeriesKey: "gold_usd",
    macroPipelineSource: "FMP",
    endpoint: "historical-price-eod/full",
    symbol: "GCUSD",
    macroRawBySource: macroRawRows.map((row) => ({
      source: row.source,
      pointCount: Number(row.point_count ?? 0),
      latestDate: row.latest_date ?? null,
    })),
    fmpMapping: provider
      ? {
        provider: provider.provider,
        providerSymbol: provider.provider_symbol,
        providerKind: provider.provider_kind,
      }
      : null,
    fmpMonthlyHistory: {
      table: "price_history_monthly",
      tablePresent: hasPriceHistoryMonthly,
      pointCount: Number(monthly.point_count ?? 0),
      minDate: monthly.min_date ?? null,
      maxDate: monthly.max_date ?? null,
    },
    fmpEodMonthlyBlobs: {
      table: "price_eod_monthly",
      tablePresent: hasPriceEodMonthly,
      monthCount: Number(eod.month_count ?? 0),
      minYyyymm: eod.min_yyyymm ?? null,
      maxYyyymm: eod.max_yyyymm ?? null,
    },
  };
}

async function readLatestSnapshot(region: string, allowLiveFallback: boolean) {
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
  const goldRangeRows = (await query(
    `SELECT MIN(date) AS min_date, MAX(date) AS max_date
     FROM ${tables.macroRawDatapoints}
     WHERE region = ? AND source_type = 'auto' AND series_key = 'gold_usd'`,
    [region],
  )) as Array<{ min_date?: string | null; max_date?: string | null }>;
  const goldDateRange = {
    minDate: goldRangeRows[0]?.min_date ?? null,
    maxDate: goldRangeRows[0]?.max_date ?? null,
  };
  const latestIngestRun = await getLatestIngestRun(region);
  const goldSourceDiagnostics = await getGoldSourceDiagnostics(region);

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
  const goldUsdSnapshot = indicators.find((item) => item.indicatorId === "gold_usd");
  const goldSpreadSnapshot = indicators.find((item) => item.indicatorId === "gold_minus_real_yield_spread");
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
  const blockStatus = summarizeBlockStatus(catalog, indicators);
  const overlayDataStatus = summarizeOverlayData(catalog, indicators, new Set(rawStats.bySeries.keys()));
  const indicatorInputStatus = catalog.map((entry) => {
    const snapshot = indicatorById.get(entry.indicatorId);
    const expectedInputs = entry.inputs;
    const foundInputs = expectedInputs.filter((input) => rawStats.bySeries.has(input));
    const valueLatest = snapshot?.valueLatest ?? null;
    const coverage10yPct = snapshot?.coverage10yPct ?? 0;
    const score = snapshot?.score ?? null;
    let dataStatus: "scorable" | "found_not_scoreable_coverage" | "found_not_scoreable_latest_missing" | "missing_series" | "score_unavailable" = "score_unavailable";
    if (score !== null) dataStatus = "scorable";
    else if (foundInputs.length === 0) dataStatus = "missing_series";
    else if (valueLatest === null) dataStatus = "found_not_scoreable_latest_missing";
    else if (coverage10yPct < 80) dataStatus = "found_not_scoreable_coverage";

    return {
      indicatorId: entry.indicatorId,
      title: entry.title,
      block: entry.block,
      signalClass: entry.signalClass,
      expectedInputs,
      foundInputs,
      valueLatest,
      coverage10yPct,
      score,
      dataStatus,
      nullReason: snapshot ? snapshot.nullReason : "No snapshot row",
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
  const snapshotHealth = rawStats.totalRawPointCount === 0 && snapshotIsEmpty
    ? "empty_invalid"
    : snapshotIsEmpty
      ? "empty"
      : partialData
        ? "partial"
        : "healthy";

  const clearCatalog = catalog.filter((entry) => entry.signalClass === "clear");
  const clearScored = indicators.filter((item) => {
    const meta = catalogById.get(item.indicatorId);
    return meta?.signalClass === "clear" && item.score !== null;
  }).length;
  const speculativeCatalog = catalog.filter((entry) => entry.signalClass === "speculative");
  const speculativeScored = indicators.filter((item) => {
    const meta = catalogById.get(item.indicatorId);
    return meta?.signalClass === "speculative" && item.score !== null;
  }).length;
  const overlayFallbackCount = Object.values(overlayDataStatus).filter((item) => item.usesFallback).length;
  const confidenceDiagnostics = {
    macroConfidence: Number(regimeRow.macro_confidence ?? 0),
    formula: "clear_signals_scored / clear_signals_total",
    clearSignalsScored: clearScored,
    clearSignalsTotal: clearCatalog.length,
    speculativeSignalsScored: speculativeScored,
    speculativeSignalsTotal: speculativeCatalog.length,
    overlayFallbackCount,
    note: "Current confidence model tracks clear-signal coverage only; overlay fallback does not directly penalize confidence.",
  };

  const rawTopDrivers = safeJsonParse<Array<Record<string, unknown>>>(regimeRow.top_drivers_json, []);
  const indicatorByIdForTopDrivers = new Map(indicators.map((item) => [item.indicatorId, item]));
  const normalizedTopDrivers = rawTopDrivers
    .map((driver) => {
      const indicatorId = String(driver.indicatorId ?? "").trim();
      if (!indicatorId) return null;
      const meta = catalogById.get(indicatorId);
      const snapshot = indicatorByIdForTopDrivers.get(indicatorId);
      const change1m = typeof driver.change1m === "number" ? driver.change1m : (snapshot?.change1m ?? null);
      const change3m = typeof driver.change3m === "number" ? driver.change3m : (snapshot?.change3m ?? null);
      const yoy = typeof driver.yoy === "number" ? driver.yoy : (snapshot?.yoy ?? null);
      const score = typeof driver.score === "number" ? driver.score : (snapshot?.score ?? 0);
      const percentile10y = typeof driver.percentile10y === "number" ? driver.percentile10y : (snapshot?.percentile10y ?? 50);
      const contribution = typeof driver.contribution === "number" ? driver.contribution : 0;
      return {
        indicatorId,
        title: typeof driver.title === "string" && driver.title.trim().length > 0 ? driver.title : (meta?.title ?? indicatorId),
        block: meta?.block ?? "D_CREDIBILITY",
        score,
        percentile10y,
        contribution,
        direction: normalizeDriverDirection(change1m, change3m, driver.direction),
        change1m,
        change3m,
        yoy,
        driverNote: typeof driver.driverNote === "string"
          ? driver.driverNote
          : typeof snapshot?.driverNote === "string"
            ? snapshot.driverNote
            : null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 5);

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
  if (latestIngestRun && !latestIngestRun.success) {
    rootCauseHints.push(`Latest ingest failed at step: ${latestIngestRun.failingStep ?? "unknown"}`);
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
      topDrivers: normalizedTopDrivers,
      regimeExplanation: buildRegimeExplanation(
        regimeRow.core_regime_label,
        normalizedTopDrivers.map((driver) => ({ indicatorId: driver.indicatorId, title: driver.title })),
      ),
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
        fallbackLive: allowLiveFallback,
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
      blockStatus,
      overlayDataStatus,
      confidenceDiagnostics,
      snapshotContent: {
        indicatorSnapshotCount,
        regimeSnapshotCount,
        latestSnapshotTimestamp: regimeRow.updated_at ?? regimeRow.as_of_date,
        snapshotIsEmpty,
      },
      ingestionDebug: {
        endpointReachable: true,
        fredApiKeyPresent: String(process.env.FRED_API_KEY ?? "").trim().length > 0,
        adminSecretConfigured: Boolean(getAdminSecret()),
        latestAttempt: latestIngestRun,
      },
      goldSourceDiagnostics,
      goldBackfillDebug: {
        requestPattern: latestIngestRun?.goldFetch?.requestPattern ?? "single_request_with_explicit_from_to",
        endpoint: latestIngestRun?.goldFetch?.endpoint ?? "historical-price-eod/full",
        symbol: latestIngestRun?.goldFetch?.symbol ?? "GCUSD",
        from: latestIngestRun?.goldFetch?.from ?? "2000-01-01",
        to: latestIngestRun?.goldFetch?.to ?? null,
        fetchedMinDate: latestIngestRun?.goldFetch?.fetchedMinDate ?? null,
        fetchedMaxDate: latestIngestRun?.goldFetch?.fetchedMaxDate ?? null,
        fetchedRowCount: latestIngestRun?.goldFetch?.fetchedRowCount ?? 0,
        storedRowCount: rawStats.bySeries.get("gold_usd")?.rawCount ?? 0,
        mergedMinDate: goldDateRange.minDate,
        mergedMaxDate: goldDateRange.maxDate,
        resultingCoverage10yPct: goldUsdSnapshot?.coverage10yPct ?? null,
        resultingSpreadCoverage10yPct: goldSpreadSnapshot?.coverage10yPct ?? null,
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
  const historyResolution = String(req.query?.historyResolution ?? "MONTHLY").toUpperCase() === "WEEKLY" ? "WEEKLY" : "MONTHLY";
  const historyRangeRaw = String(req.query?.historyRangeYears ?? (historyResolution === "MONTHLY" ? "20" : "3")).toUpperCase();
  const historyRangeYears = historyRangeRaw === "MAX"
    ? "MAX"
    : Number.isFinite(Number(historyRangeRaw))
      ? Number(historyRangeRaw)
      : (historyResolution === "MONTHLY" ? 20 : 3);

  const snapshot = await readLatestSnapshot(region, allowLiveFallback);
  if (snapshot) {
    const history = await computeMacroRegimeHistory({
      region,
      resolution: historyResolution as HistoryResolution,
      rangeYears: historyRangeYears,
    });
    res.status(200).json({ ok: true, globalMacro: snapshot, macroHistory: history });
    return;
  }

  if (!allowLiveFallback) {
    const history = await computeMacroRegimeHistory({
      region,
      resolution: historyResolution as HistoryResolution,
      rangeYears: historyRangeYears,
    });
    res.status(200).json({
      ok: true,
      globalMacro: null,
      macroHistory: history,
      diagnostics: {
        readMode: "empty_no_snapshot",
        message: "No snapshots found. Run /api/admin/macro/run-engine first.",
      },
    });
    return;
  }

  const live = await runAndPersistMacroSnapshots({ region });
  const fallbackSnapshot = await readLatestSnapshot(region, allowLiveFallback);

  if (!fallbackSnapshot) {
    const history = await computeMacroRegimeHistory({
      region,
      resolution: historyResolution as HistoryResolution,
      rangeYears: historyRangeYears,
    });
    res.status(200).json({
      ok: true,
      globalMacro: null,
      macroHistory: history,
      diagnostics: {
        readMode: live.emptyInvalid ? "live_fallback_empty_invalid" : "live_fallback_no_snapshot",
        wroteAny: live.wroteAny,
        rawPointCount: live.rawPointCount,
      },
    });
    return;
  }

  const history = await computeMacroRegimeHistory({
    region,
    resolution: historyResolution as HistoryResolution,
    rangeYears: historyRangeYears,
  });

  res.status(200).json({
    ok: true,
    globalMacro: fallbackSnapshot,
    macroHistory: history,
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
