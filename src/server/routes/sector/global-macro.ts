import { getAdminSecret } from "../../../../api/_auth.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { query } from "../../../../api/_db.js";
import { MACRO_INDICATOR_CATALOG } from "../../../lib/macro/catalog.js";
import { US_FRED_SERIES } from "../../../lib/macro/fred.js";
import { type HistoryResolution } from "../../../lib/macro/history.js";
import { readLatestMacroReadCache, readMacroHistoryReadCache } from "../../../lib/macro/readCache.js";
import { MACRO_REGIONS, aggregateGlobalRegimeFromRegional } from "../../../lib/macro/global.js";
import { buildGlobalUnrestOverlay, buildRegionalOverlays, buildSeriesMap } from "../../../lib/macro/overlayEngine.js";

const REGIONAL_OVERLAY_KEYS = [
  "liquidityOverlay",
  "creditFundingOverlay",
  "energyShockOverlay",
  "localUnrestOverlay",
  "safeHavenRiskOffOverlay",
  "inflationCostShockOverlay",
  "tradeSupplyChainStressOverlay",
] as const;

const GLOBAL_OVERLAY_KEYS = ["globalUnrestOverlay"] as const;

type OverlayHistoryPoint = {
  asOfDate: string;
  scores: Record<string, number | null>;
};

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

type RawSeriesPointRow = {
  series_key: string;
  date: string;
  value: number | null;
};

type InflationAnalysisPayload = {
  metadata: {
    actualInflationSeries: string;
    monetaryInflationSeries: string;
    goodsInflationSeries: string;
    assetInflationSeries: string;
    commodityInflationSeries: string;
    proxyNotes: string[];
  };
  points: Array<{
    date: string;
    actualInflation: number | null;
    monetaryInflation: number | null;
    goodsInflation: number | null;
    monetaryPressure: number | null;
    assetInflation: number | null;
    commodityInflation: number | null;
    consumerInflation: number | null;
    monetaryInflationGap: number | null;
  }>;
};

function computeYoY(points: Array<{ date: string; value: number | null }>) {
  if (points.length <= 12) return [] as Array<{ date: string; value: number | null }>;
  return points
    .map((row, index) => {
      const prev = index >= 12 ? points[index - 12] : null;
      if (!prev || row.value === null || prev.value === null || prev.value === 0) return { date: row.date, value: null };
      return { date: row.date, value: ((row.value / prev.value) - 1) * 100 };
    })
    .filter((row) => row.value !== null);
}

function monthlyAverageSeries(left: Array<{ date: string; value: number | null }>, right: Array<{ date: string; value: number | null }>) {
  const rightByMonth = new Map(right.map((row) => [row.date.slice(0, 7), row.value]));
  return left
    .map((row) => {
      const rv = rightByMonth.get(row.date.slice(0, 7));
      if (row.value === null || rv === null || rv === undefined) return null;
      return { date: row.date, value: (row.value + rv) / 2 };
    })
    .filter((row): row is { date: string; value: number } => row !== null);
}

async function loadInflationAnalysis(region: "US" | "EA" | "SE"): Promise<InflationAnalysisPayload> {
  const rows = (await query(
    `SELECT series_key, date, value
     FROM ${tables.macroRawDatapoints}
     WHERE source_type = 'auto'
       AND ((region = ?) OR (? = 'EA' AND region = 'US' AND series_key = 'commodity_index'))
     ORDER BY date ASC`,
    [region, region],
  )) as unknown as RawSeriesPointRow[];

  const seriesMap = new Map<string, Array<{ date: string; value: number | null }>>();
  for (const row of rows) {
    const key = `${String(row.series_key)}::${String(row.date).slice(0, 7)}`;
    const bucketKey = String(row.series_key);
    const bucket = seriesMap.get(bucketKey) ?? [];
    if (!bucket.some((point) => `${bucketKey}::${point.date.slice(0, 7)}` === key)) {
      bucket.push({ date: String(row.date), value: row.value === null ? null : Number(row.value) });
    }
    seriesMap.set(bucketKey, bucket);
  }

  const proxyNotes: string[] = [];
  const coreCpiYoyUs = seriesMap.get("core_cpi_yoy_us") ?? [];
  const hicpYoyEa = seriesMap.get("hicp_yoy_ea") ?? [];
  const kpifYoySe = seriesMap.get("kpif_yoy_se") ?? [];
  const m2Yoy = seriesMap.get("m2_yoy") ?? computeYoY(seriesMap.get("m2sl") ?? []);
  const fedBalanceSheetYoy = seriesMap.get("fed_balance_sheet_yoy") ?? computeYoY(seriesMap.get("fed_balance_sheet_total") ?? []);
  const m3Yoy = computeYoY(seriesMap.get("m3_ea") ?? []);
  const ecbBalanceSheetYoy = computeYoY(seriesMap.get("ecb_balance_sheet_ea") ?? []);
  const commodityIndexYoy = seriesMap.get("commodity_index_yoy") ?? computeYoY(seriesMap.get("commodity_index") ?? []);
  const oilYoy = seriesMap.get("oil_yoy") ?? computeYoY(seriesMap.get("oil_brent_usd") ?? []);
  const goldYoy = computeYoY(seriesMap.get("gold_usd") ?? []);

  let actualInflation = coreCpiYoyUs;
  let actualSeriesName = "Core CPI YoY (US)";
  let monetaryInflation = monthlyAverageSeries(m2Yoy, fedBalanceSheetYoy);
  let monetarySeriesName = "Average of M2 YoY and Fed balance sheet YoY";
  let goodsInflation = commodityIndexYoy.length > 0 ? commodityIndexYoy : oilYoy;
  let goodsSeriesName = commodityIndexYoy.length > 0 ? "Commodity index YoY" : "Oil YoY";
  let monetaryPressure = monetaryInflation;
  let assetInflation = goldYoy;
  let assetSeriesName = "Gold YoY";
  let commodityInflation = commodityIndexYoy;
  let commoditySeriesName = "Commodity index YoY";

  if (region === "EA") {
    actualInflation = hicpYoyEa;
    actualSeriesName = "HICP YoY (EA)";
    monetaryInflation = monthlyAverageSeries(m3Yoy, ecbBalanceSheetYoy);
    monetarySeriesName = "Average of M3 YoY and ECB balance sheet YoY";
    goodsInflation = commodityIndexYoy.length > 0 ? commodityIndexYoy : actualInflation;
    goodsSeriesName = commodityIndexYoy.length > 0 ? "Commodity index YoY (global proxy)" : "HICP YoY (fallback proxy)";
    monetaryPressure = monetaryInflation;
    assetInflation = goldYoy;
    assetSeriesName = "Gold YoY";
    commodityInflation = goodsInflation;
    commoditySeriesName = goodsSeriesName;
    if (commodityIndexYoy.length > 0) proxyNotes.push("EA commodity inflation uses global commodity index YoY sourced from US canonical ingest as a cross-region proxy.");
    proxyNotes.push("Asset inflation uses Gold YoY as a liquid market asset proxy because a robust EA-wide housing/equity series is not currently in canonical macro ingest.");
  }

  if (region === "SE") {
    actualInflation = kpifYoySe;
    actualSeriesName = "KPIF YoY (SE)";
    monetaryInflation = [];
    monetarySeriesName = "Unavailable (insufficient canonical monetary levels for robust YoY pair)";
    goodsInflation = [];
    goodsSeriesName = "Unavailable";
    monetaryPressure = monetaryInflation;
    assetInflation = goldYoy;
    assetSeriesName = "Gold YoY";
    commodityInflation = goodsInflation;
    commoditySeriesName = "Unavailable";
    proxyNotes.push("SE inflation charts are scaffolded, but monetary/goods split remains unavailable until SE canonical series coverage improves.");
  }

  const dateSet = new Set<string>();
  [actualInflation, monetaryInflation, goodsInflation, monetaryPressure, assetInflation, commodityInflation].forEach((series) => {
    series.forEach((point) => dateSet.add(point.date.slice(0, 10)));
  });
  const dates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));
  const mapByMonth = (series: Array<{ date: string; value: number | null }>) => new Map(series.map((point) => [point.date.slice(0, 7), point.value]));

  const actualByMonth = mapByMonth(actualInflation);
  const monetaryByMonth = mapByMonth(monetaryInflation);
  const goodsByMonth = mapByMonth(goodsInflation);
  const pressureByMonth = mapByMonth(monetaryPressure);
  const assetByMonth = mapByMonth(assetInflation);
  const commodityByMonth = mapByMonth(commodityInflation);

  return {
    metadata: {
      actualInflationSeries: actualSeriesName,
      monetaryInflationSeries: monetarySeriesName,
      goodsInflationSeries: goodsSeriesName,
      assetInflationSeries: assetSeriesName,
      commodityInflationSeries: commoditySeriesName,
      proxyNotes,
    },
    points: dates.map((date) => {
      const month = date.slice(0, 7);
      const actual = actualByMonth.get(month) ?? null;
      const monetary = monetaryByMonth.get(month) ?? null;
      return {
        date,
        actualInflation: actual,
        monetaryInflation: monetary,
        goodsInflation: goodsByMonth.get(month) ?? null,
        monetaryPressure: pressureByMonth.get(month) ?? null,
        assetInflation: assetByMonth.get(month) ?? null,
        commodityInflation: commodityByMonth.get(month) ?? null,
        consumerInflation: actual,
        monetaryInflationGap: actual !== null && monetary !== null ? monetary - actual : null,
      };
    }),
  };
}






async function loadRawSeriesRows(region: string) {
  return (await query(
    `SELECT series_key, date, value
     FROM ${tables.macroRawDatapoints}
     WHERE region = ? AND source_type = 'auto'
     ORDER BY series_key ASC, date ASC`,
    [region],
  )) as unknown as RawSeriesPointRow[];
}


function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function canonicalMonthlyFromRows(rows: RawSeriesPointRow[]): Array<{ date: string; value: number | null }> {
  const byMonth = new Map<string, { date: string; value: number | null }>();
  for (const row of rows) {
    const date = String(row.date);
    if (!isIsoDate(date)) continue;
    const month = date.slice(0, 7);
    const prev = byMonth.get(month);
    if (!prev || date > prev.date) byMonth.set(month, { date, value: row.value === null ? null : Number(row.value) });
  }
  return Array.from(byMonth.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function buildSeriesVerification(params: {
  rawSeriesRows: RawSeriesPointRow[];
  candidateSeriesKeys: string[];
  selectedSeriesKey: string;
  selectedSeries: Array<{ date: string; value: number | null }>;
  componentRawValue: number | null;
  componentScore: number | null;
  minObservations: number;
  scoringFunction: string;
  invert: boolean;
  sourceValidationStatus: "pass" | "fail";
  blockStatusBeforeFinalGuard: "pass" | "partial" | "missing";
  finalBlockStatus: "pass" | "partial" | "missing";
  finalGuardTriggered: boolean;
  finalGuardReason: string;
}) {
  const keySet = new Set(params.candidateSeriesKeys);
  const rows = params.rawSeriesRows.filter((row) => keySet.has(String(row.series_key)));
  const databaseSeriesKeyResolved = params.candidateSeriesKeys.find((key) => rows.some((row) => String(row.series_key) === key)) ?? params.selectedSeriesKey;
  const invalidDateCount = rows.filter((row) => !isIsoDate(String(row.date))).length;
  const validDateRows = rows.filter((row) => isIsoDate(String(row.date)));
  const nullValueRowCount = validDateRows.filter((row) => row.value === null).length;
  const nonNumericRowCount = validDateRows.filter((row) => row.value !== null && !Number.isFinite(Number(row.value))).length;
  const numericRows = validDateRows.filter((row) => row.value !== null && Number.isFinite(Number(row.value)));
  const duplicateDateCount = validDateRows.length - new Set(validDateRows.map((row) => String(row.date))).size;
  const sortedNumeric = [...numericRows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const latestRaw = sortedNumeric[sortedNumeric.length - 1] ?? null;

  const afterDateParse = validDateRows;
  const afterNumericFilter = numericRows;
  const dedupeMap = new Map<string, RawSeriesPointRow>();
  for (const row of afterNumericFilter) {
    const d = String(row.date);
    const prev = dedupeMap.get(d);
    if (!prev || d > String(prev.date)) dedupeMap.set(d, row);
  }
  const afterDedupe = Array.from(dedupeMap.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const monthlyBuilt = canonicalMonthlyFromRows(afterDedupe);
  const latestMonthly = monthlyBuilt.filter((row) => row.value !== null).slice(-1)[0] ?? null;
  const window = params.selectedSeries
    .filter((row) => row.value !== null && Number.isFinite(row.value as number))
    .slice(-120)
    .map((row) => row.value as number);
  const rawValue = params.componentRawValue;
  const computedPercentile = (rawValue === null || window.length < params.minObservations)
    ? null
    : (window.filter((value) => value <= rawValue).length / window.length) * 100;
  const finalSupportScore = params.componentScore;

  return {
    databaseSeriesKeyResolved,
    rawDbRowCount: rows.length,
    monthlyDbRowCount: monthlyBuilt.length,
    earliestRawDate: sortedNumeric[0]?.date ?? null,
    latestRawDate: latestRaw?.date ?? null,
    latestRawValue: latestRaw?.value ?? null,
    distinctSeriesKeys: Array.from(new Set(rows.map((row) => String(row.series_key)))),
    nullValueRowCount,
    nonNumericRowCount,
    duplicateDateCount,
    invalidDateCount,
    latest10RowsPreview: sortedNumeric.slice(-10).map((row) => ({ date: row.date, value: row.value })),
    formatShapeCheck: {
      hasDateField: rows.every((row) => typeof row.date === "string"),
      hasValueField: rows.every((row) => Object.prototype.hasOwnProperty.call(row, "value")),
      valueTypeDetected: rows.length === 0 ? "none" : typeof rows.find((row) => row.value !== null)?.value,
      parseableAsNumber: rows.some((row) => row.value !== null && Number.isFinite(Number(row.value))),
      canonicalDateParseOk: invalidDateCount === 0,
      monthlyBucketAssignable: afterDateParse.length > 0,
      latestObservationSelectable: latestMonthly !== null,
    },
    monthlyReducerTrace: {
      rawRowsIn: rows.length,
      rowsAfterDateParse: afterDateParse.length,
      rowsAfterNumericFilter: afterNumericFilter.length,
      rowsAfterDedupe: afterDedupe.length,
      rowsAfterMonthlyBucketing: monthlyBuilt.length,
      latestMonthlyPointChosen: Boolean(latestMonthly),
      chosenMonthlyDate: latestMonthly?.date ?? null,
      chosenMonthlyRawValue: latestMonthly?.value ?? null,
    },
    scorePipelineTrace: {
      rawValuePassedIntoScorer: rawValue,
      scoringFunctionUsed: params.scoringFunction,
      percentileWindowSize: 120,
      observationsAvailableInScoringWindow: window.length,
      enoughHistoryForPercentile: window.length >= params.minObservations,
      computedPercentile,
      finalSupportScore,
      scoreNullReason: finalSupportScore === null ? (rawValue === null ? "rawValue missing" : (window.length < params.minObservations ? "insufficient history" : "unknown")) : null,
    },
    gatingTrace: {
      sourceMatchPass: params.sourceValidationStatus === "pass",
      rawValuePass: typeof rawValue === "number" && Number.isFinite(rawValue),
      scorePass: typeof finalSupportScore === "number" && Number.isFinite(finalSupportScore),
      blockStatusBeforeFinalGuard: params.blockStatusBeforeFinalGuard,
      finalGuardTriggered: params.finalGuardTriggered,
      finalGuardReason: params.finalGuardReason,
      finalBlockStatus: params.finalBlockStatus,
    },
    sourceValidationStatus: params.sourceValidationStatus,
    computeValidationStatus: (typeof rawValue === "number" && Number.isFinite(rawValue) && typeof finalSupportScore === "number" && Number.isFinite(finalSupportScore)) ? "pass" : ((typeof rawValue === "number" && Number.isFinite(rawValue)) ? "incomplete" : "fail"),
    aggregationValidationStatus: params.finalBlockStatus === "pass" ? "pass" : (params.finalBlockStatus === "partial" ? "partial" : "fail"),
    dataPresentInDatabase: rows.length > 0 ? "yes" : "no",
    dataFormatUsable: (rows.length > 0 && invalidDateCount === 0 && afterNumericFilter.length > 0) ? "yes" : "no",
    monthlySeriesBuilt: monthlyBuilt.length > 0 ? "yes" : "no",
    rawValueExtracted: (typeof rawValue === "number" && Number.isFinite(rawValue)) ? "yes" : "no",
    scoreComputed: (typeof finalSupportScore === "number" && Number.isFinite(finalSupportScore)) ? "yes" : "no",
    blockedByFinalGuard: params.finalGuardTriggered ? "yes" : "no",
    blockedByWhat: params.finalGuardTriggered ? params.finalGuardReason : "none",
  };
}


function buildAcmTp10IngestVerification(params: {
  region: string;
  rawSeriesRows: RawSeriesPointRow[];
  latestIngestRun: Awaited<ReturnType<typeof getLatestIngestRun>>;
}) {
  const inUsIngestPlan = params.region === "US" && US_FRED_SERIES.some((entry) => entry.fredSeriesId === "ACMTP10");
  const run = params.latestIngestRun;
  const acmRun = run?.seriesResults?.find((item) => item.seriesId === "fred:acmtp10_us" || item.seriesId === "ACMTP10" || item.seriesKey === "acmtp10_us") ?? null;
  const candidateDbKeys = ["ACMTP10", "acmtp10_us", "acmtp10", "lu_repricing_us"];
  const byKey = Object.fromEntries(candidateDbKeys.map((key) => [key, params.rawSeriesRows.filter((row) => String(row.series_key) == key).length]));
  const savedKeys = Object.entries(byKey).filter(([,count]) => Number(count) > 0).map(([k]) => k);
  const savedUnderWrongKey = savedKeys.length > 0 && !savedKeys.includes("ACMTP10");
  const statusClass = !inUsIngestPlan
    ? "not_fetched"
    : !run
      ? "no_ingest_run_found"
      : !acmRun
        ? "fetched_but_not_saved_or_not_tracked"
        : (acmRun.fetchSuccess && Number(acmRun.observationsFetched ?? 0) > 0 && savedKeys.length === 0)
          ? "fetched_but_not_saved"
          : (savedUnderWrongKey ? "saved_under_wrong_key" : "ok");
  return {
    acmtp10InActiveIngestConfig: inUsIngestPlan,
    configMessage: inUsIngestPlan ? "ACMTP10 included in active ingest config" : "ACMTP10 not included in active ingest config",
    latestRunPresent: Boolean(run),
    latestRunTimestamp: run?.timestamp ?? null,
    fetchAttempted: Boolean(acmRun),
    fetchSuccess: acmRun?.fetchSuccess ?? null,
    observationsFetched: acmRun?.observationsFetched ?? null,
    seriesKeyFromIngestRun: acmRun?.seriesKey ?? null,
    rowsInsertedTotalInRun: run?.insertedRowCount ?? null,
    savedDbKeysObserved: savedKeys,
    rawDbRowCountByCandidateKey: byKey,
    savedUnderWrongKey,
    mismatchReason: savedUnderWrongKey ? `ACMTP10 saved under ${savedKeys.join(", ")} (expected canonical key ACMTP10 in overlay compute)` : "none",
    ingestionStateClass: statusClass,
    explicitState:
      statusClass === "not_fetched"
        ? "a) not fetched"
        : statusClass === "fetched_but_not_saved"
          ? "b) fetched but not saved"
          : statusClass === "saved_under_wrong_key"
            ? "c) saved under wrong key"
            : statusClass === "ok"
              ? "ingest path looks healthy"
              : "requires manual inspection",
  };
}


function buildEffectiveFedLiquidityRatioTrace(params: {
  rawSeriesRows: RawSeriesPointRow[];
  seriesMap: Map<string, Array<{ date: string; value: number | null }>>;
  runtimeComponent: { rawValue: number | null; score: number | null; debug?: Record<string, any> } | null;
}) {
  const sourceKeys = ["WALCL", "WDTGAL", "RRPONTSYD", "GDP"];
  const sourceRows = Object.fromEntries(sourceKeys.map((key) => [key, params.rawSeriesRows.filter((row) => String(row.series_key) === key)]));
  const rawStage = Object.fromEntries(sourceKeys.map((key) => {
    const rows = sourceRows[key] ?? [];
    const sorted = [...rows].filter((row) => isIsoDate(String(row.date))).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return [key, {
      rawRowCount: rows.length,
      earliestDate: sorted[0]?.date ?? null,
      latestDate: sorted[sorted.length - 1]?.date ?? null,
    }];
  }));
  const monthlyStage = Object.fromEntries(sourceKeys.map((key) => {
    const monthly = canonicalMonthlyFromRows(sourceRows[key] ?? []);
    return [key, {
      monthlyRowCount: monthly.length,
      monthlyNormalizationRule: key === "GDP" ? "quarterly_to_monthly_carry_forward" : "canonical_monthly_last_observation_per_month",
    }];
  }));

  const monthlyW = canonicalMonthlyFromRows(sourceRows.WALCL ?? []);
  const monthlyT = canonicalMonthlyFromRows(sourceRows.WDTGAL ?? []);
  const monthlyR = canonicalMonthlyFromRows(sourceRows.RRPONTSYD ?? []);
  const monthlyG = canonicalMonthlyFromRows(sourceRows.GDP ?? []);

  const monthSet = (rows: Array<{ date: string; value: number | null }>) => new Set(rows.filter((row) => row.value !== null && Number.isFinite(Number(row.value))).map((row) => String(row.date).slice(0, 7)));
  const setW = monthSet(monthlyW);
  const setT = monthSet(monthlyT);
  const setR = monthSet(monthlyR);
  const setG = monthSet(monthlyG);

  const triple = [...setW].filter((m) => setT.has(m) && setR.has(m)).sort((a, b) => a.localeCompare(b));
  const strictAll = triple.filter((m) => setG.has(m));

  const gdpExpanded = (() => {
    if (triple.length === 0 || monthlyG.length === 0) return [] as Array<{ date: string; value: number | null }>;
    const byMonth = new Map(monthlyG.map((row) => [String(row.date).slice(0, 7), row.value]));
    let cursor = new Date(`${triple[0]}-01T00:00:00Z`);
    const end = new Date(`${triple[triple.length - 1]}-01T00:00:00Z`);
    let latest: number | null = null;
    const out: Array<{ date: string; value: number | null }> = [];
    while (cursor <= end) {
      const month = cursor.toISOString().slice(0, 7);
      if (byMonth.has(month)) latest = byMonth.get(month) ?? latest;
      out.push({ date: `${month}-01`, value: latest });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return out;
  })();
  const setGExpanded = new Set(gdpExpanded.filter((row) => row.value !== null && Number.isFinite(Number(row.value))).map((row) => String(row.date).slice(0, 7)));
  const alignedAll = triple.filter((m) => setGExpanded.has(m));

  const derivedSeries = params.seriesMap.get("effective_fed_liquidity_ratio") ?? [];
  const derivedNumeric = derivedSeries.filter((row) => row.value !== null && Number.isFinite(row.value as number));
  const runtimeObsCount = Number(params.runtimeComponent?.debug?.totalNumericObservationsInSeries ?? 0);

  return {
    rawSourceStage: rawStage,
    monthlyNormalizationStage: monthlyStage,
    joinOverlapStage: {
      rowCountAfterJoiningWalclWdtgalRrp: triple.length,
      rowCountAfterAddingGdpMonthly: alignedAll.length,
      strictQuarterlyDateOverlapCount: strictAll.length,
      firstSurvivingMonthlyDate: alignedAll[0] ? `${alignedAll[0]}-01` : null,
      lastSurvivingMonthlyDate: alignedAll[alignedAll.length - 1] ? `${alignedAll[alignedAll.length - 1]}-01` : null,
      rowsDroppedAtEachStep: {
        droppedWhenJoiningWdtgal: Math.max(0, setW.size - [...setW].filter((m) => setT.has(m)).length),
        droppedWhenJoiningRrpontsyd: Math.max(0, [...setW].filter((m) => setT.has(m)).length - triple.length),
        droppedByStrictGdpQuarterlyOverlap: Math.max(0, triple.length - strictAll.length),
        droppedAfterGdpMonthlyCarryForward: Math.max(0, triple.length - alignedAll.length),
      },
      dropReasonNotes: {
        strictQuarterlyJoin: "requires exact month overlap with quarterly GDP; can collapse history",
        monthlyCarryForwardJoin: "uses canonical monthly grid + GDP carry-forward to preserve history",
      },
    },
    derivedConstructionStage: {
      rowCountEffectiveFedLiquidityBeforeGdpDivision: triple.length,
      rowCountEffectiveFedLiquidityRatioAfterGdpDivision: runtimeObsCount > 0 ? runtimeObsCount : alignedAll.length,
      nullCountEffectiveFedLiquidityRatio: runtimeObsCount > 0 ? 0 : Math.max(0, alignedAll.length - derivedNumeric.length),
      finalPersistedDerivedObservationCount: runtimeObsCount > 0 ? runtimeObsCount : derivedNumeric.length,
      beforeAfterComparison: {
        beforeStrictOverlapCount: strictAll.length,
        afterMonthlyAlignedCount: runtimeObsCount > 0 ? runtimeObsCount : alignedAll.length,
      },
      sourceOfTruth: runtimeObsCount > 0 ? "overlay_runtime_component" : "raw_series_map_fallback",
    },
  };
}

function buildOverlayVerificationDiagnostics(params: {
  region: string;
  rawSeriesRows: RawSeriesPointRow[];
  seriesMap: Map<string, Array<{ date: string; value: number | null }>>;
  overlayBundle: ReturnType<typeof buildRegionalOverlays>;
  latestIngestRun: Awaited<ReturnType<typeof getLatestIngestRun>>;
  acmtp10IngestHistory: Awaited<ReturnType<typeof getAcmTp10IngestHistory>>;
}) {
  const overlays = params.overlayBundle.overlays;
  const local = overlays.localUnrestOverlay;
  const credit = overlays.creditFundingOverlay;
  const localRepricingComp = local?.components.find((component) => component.id === "lu_repricing_us");
  const creditFundingComp = credit?.components.find((component) => component.id === "cr_fund_ted");
  const creditAccessComp = credit?.components.find((component) => component.id === "cr_access_1");
  const creditXccyComp = credit?.components.find((component) => component.id === "cr_fund_xccy");
  const creditPricingHyComp = credit?.components.find((component) => component.id === "cr_hy");
  const creditPricingIgComp = credit?.components.find((component) => component.id === "cr_ig");
  const creditFundingStatus: "pass" | "partial" | "missing" = typeof credit?.blockScores?.funding === "number"
    ? ([creditFundingComp?.signalStatus, creditXccyComp?.signalStatus].every((status) => status === "ok") ? "pass" : "partial")
    : "missing";

  const localGuard = local?.score === null && ((local?.blockScores?.signal ?? null) === null || (local?.blockScores?.repricing ?? null) === null);

  const classifyAcmTp10Failure = (repricing: any, ingest: any): string => {
    if (!ingest?.acmtp10InActiveIngestConfig) return "config_missing";
    if (ingest?.fetchAttempted && ingest?.fetchSuccess === false) return "fetch_failed";
    if (ingest?.fetchAttempted && Number(ingest?.observationsFetched ?? 0) === 0) return "zero_observations_from_provider";
    if ((repricing?.invalidDateCount ?? 0) > 0 || (repricing?.nonNumericRowCount ?? 0) > 0) return "parse_failed";
    const totalRows = Object.values(ingest?.rawDbRowCountByCandidateKey ?? {}).reduce((sum: number, item: any) => sum + Number(item ?? 0), 0);
    if (ingest?.fetchSuccess && Number(ingest?.observationsFetched ?? 0) > 0 && totalRows === 0) return "insert_failed";
    if (repricing?.dataPresentInDatabase === "yes" && repricing?.monthlySeriesBuilt === "no") return "alias_resolution_failed";
    if (repricing?.rawValueExtracted === "no" || repricing?.scoreComputed === "no") return "scorer_failed";
    return "scorer_failed";
  };

  const repricingVerification = buildSeriesVerification({
    rawSeriesRows: params.rawSeriesRows,
    candidateSeriesKeys: ["ACMTP10", "acmtp10_us", "acmtp10", "lu_repricing_us"],
    selectedSeriesKey: "ACMTP10",
    selectedSeries: params.seriesMap.get("ACMTP10") ?? [],
    componentRawValue: localRepricingComp?.rawValue ?? null,
    componentScore: localRepricingComp?.score ?? null,
    minObservations: 1,
    scoringFunction: "percentile10yLatest",
    invert: true,
    sourceValidationStatus: params.region === "US" && localRepricingComp?.exactSource === "ACMTP10" ? "pass" : "fail",
    blockStatusBeforeFinalGuard: typeof local?.blockScores?.repricing === "number" ? "pass" : "missing",
    finalBlockStatus: typeof local?.blockScores?.repricing === "number" ? "pass" : "missing",
    finalGuardTriggered: Boolean(localGuard),
    finalGuardReason: localGuard ? "required local unrest block score missing" : "none",
  });
  const acmIngestVerification = buildAcmTp10IngestVerification({
    region: params.region,
    rawSeriesRows: params.rawSeriesRows,
    latestIngestRun: params.latestIngestRun,
  });

  const liquidity = overlays.liquidityOverlay;
  const liqEffectiveComp = liquidity?.components.find((component) => component.id === "effective_fed_liquidity_ratio");
  const liqQuantityScore = liquidity?.blockScores?.quantity ?? null;
  const liqOverlayScore = liquidity?.score ?? null;
  const liqBlockStatus: "pass" | "partial" | "missing" = typeof liqQuantityScore === "number"
    ? ((liquidity?.runtime?.status === "partial" || (liquidity?.runtime?.blockAggregationInputs?.quantity ?? []).some((entry) => entry.signalStatus !== "ok")) ? "partial" : "pass")
    : "missing";
  const derivedRatioSeries = params.seriesMap.get("effective_fed_liquidity_ratio") ?? [];
  const derivedRatioNumeric = derivedRatioSeries.filter((point) => point.value !== null && Number.isFinite(point.value as number));
  const derivedLatest = derivedRatioNumeric.slice(-1)[0] ?? null;

  return {
    localUnrestOverlay: {
      repricing: {
        ...repricingVerification,
        ingestVerification: acmIngestVerification,
        historicalIngestVerification: params.acmtp10IngestHistory,
        finalClassification: classifyAcmTp10Failure(repricingVerification, acmIngestVerification),
      },
    },
    liquidityOverlay: {
      quantityAggregation: {
        blockScore: liqQuantityScore,
        runtimeStatus: liqBlockStatus,
        aggregationValidationStatus: liqBlockStatus === "pass" ? "pass" : (liqBlockStatus === "partial" ? "partial" : "fail"),
        blockAggregationInputs: liquidity?.runtime?.blockAggregationInputs?.quantity ?? [],
      },
      overlayScoreCalculation: {
        overlayScore: liqOverlayScore,
        aggregationValidationStatus: typeof liqOverlayScore === "number" ? "pass" : "fail",
        scoreFormula: liquidity?.runtime?.scoreFormula ?? null,
        aggregationWeights: liquidity?.runtime?.aggregationWeights ?? null,
      },
      effectiveFedLiquidityRatioTrace: {
        ...buildEffectiveFedLiquidityRatioTrace({ rawSeriesRows: params.rawSeriesRows, seriesMap: params.seriesMap, runtimeComponent: liqEffectiveComp ? { rawValue: liqEffectiveComp.rawValue, score: liqEffectiveComp.score, debug: liqEffectiveComp.debug as any } : null }),
        scoringStage: {
          observationsAvailableInPercentileWindow: liqEffectiveComp?.debug?.observationsAvailableInScoringWindow ?? 0,
          enoughHistoryForPercentile: Boolean(liqEffectiveComp?.debug?.enoughHistory),
          percentileComputed: typeof liqEffectiveComp?.debug?.percentile10yLatest === "number" ? "yes" : "no",
          supportScoreComputed: typeof liqEffectiveComp?.score === "number" ? "yes" : "no",
          noPercentileReason: typeof liqEffectiveComp?.debug?.percentile10yLatest === "number"
            ? "none"
            : ((liqEffectiveComp?.debug?.observationsAvailableInScoringWindow ?? 0) < (liqEffectiveComp?.debug?.minObservations ?? 120)
              ? "insufficient_history"
              : "missing_raw_value_or_alignment"),
          earliestDate: (liqEffectiveComp?.debug as any)?.earliestDateInSeries ?? derivedRatioNumeric[0]?.date ?? null,
          latestDate: liqEffectiveComp?.debug?.latestDate ?? derivedLatest?.date ?? null,
          latestValue: liqEffectiveComp?.rawValue ?? derivedLatest?.value ?? null,
        },
      },
    },
    creditFundingOverlay: {
      pricing: {
        hy: buildSeriesVerification({
          rawSeriesRows: params.rawSeriesRows,
          candidateSeriesKeys: ["BAMLH0A0HYM2"],
          selectedSeriesKey: "BAMLH0A0HYM2",
          selectedSeries: params.seriesMap.get("BAMLH0A0HYM2") ?? [],
          componentRawValue: creditPricingHyComp?.rawValue ?? null,
          componentScore: creditPricingHyComp?.score ?? null,
          minObservations: 24,
          scoringFunction: "percentile10yLatest",
          invert: true,
          sourceValidationStatus: creditPricingHyComp?.exactSource === "BAMLH0A0HYM2" ? "pass" : "fail",
          blockStatusBeforeFinalGuard: typeof credit?.blockScores?.pricing === "number" ? "pass" : "missing",
          finalBlockStatus: typeof credit?.blockScores?.pricing === "number" ? "pass" : "missing",
          finalGuardTriggered: false,
          finalGuardReason: "none",
        }),
        ig: buildSeriesVerification({
          rawSeriesRows: params.rawSeriesRows,
          candidateSeriesKeys: ["BAMLC0A0CM"],
          selectedSeriesKey: "BAMLC0A0CM",
          selectedSeries: params.seriesMap.get("BAMLC0A0CM") ?? [],
          componentRawValue: creditPricingIgComp?.rawValue ?? null,
          componentScore: creditPricingIgComp?.score ?? null,
          minObservations: 24,
          scoringFunction: "percentile10yLatest",
          invert: true,
          sourceValidationStatus: creditPricingIgComp?.exactSource === "BAMLC0A0CM" ? "pass" : "fail",
          blockStatusBeforeFinalGuard: typeof credit?.blockScores?.pricing === "number" ? "pass" : "missing",
          finalBlockStatus: typeof credit?.blockScores?.pricing === "number" ? "pass" : "missing",
          finalGuardTriggered: false,
          finalGuardReason: "none",
        }),
      },
      funding: buildSeriesVerification({
        rawSeriesRows: params.rawSeriesRows,
        candidateSeriesKeys: ["TEDRATE"],
        selectedSeriesKey: "TEDRATE",
        selectedSeries: params.seriesMap.get("TEDRATE") ?? [],
        componentRawValue: creditFundingComp?.rawValue ?? null,
        componentScore: creditFundingComp?.score ?? null,
        minObservations: 24,
        scoringFunction: "percentile10yLatest",
        invert: true,
        sourceValidationStatus: creditFundingComp?.exactSource?.includes("TEDRATE") ? "pass" : "fail",
        blockStatusBeforeFinalGuard: creditFundingStatus,
        finalBlockStatus: creditFundingStatus,
        finalGuardTriggered: false,
        finalGuardReason: "none",
      }),
      access: buildSeriesVerification({
        rawSeriesRows: params.rawSeriesRows,
        candidateSeriesKeys: ["DRTSCILM"],
        selectedSeriesKey: "DRTSCILM",
        selectedSeries: params.seriesMap.get("DRTSCILM") ?? [],
        componentRawValue: creditAccessComp?.rawValue ?? null,
        componentScore: creditAccessComp?.score ?? null,
        minObservations: 24,
        scoringFunction: "percentile10yLatest",
        invert: true,
        sourceValidationStatus: creditAccessComp?.exactSource?.includes("DRTSCILM") ? "pass" : "fail",
        blockStatusBeforeFinalGuard: typeof credit?.blockScores?.access === "number" ? "pass" : "missing",
        finalBlockStatus: typeof credit?.blockScores?.access === "number" ? "pass" : "missing",
        finalGuardTriggered: false,
        finalGuardReason: "none",
      }),
      xccyBasis: buildSeriesVerification({
        rawSeriesRows: params.rawSeriesRows,
        candidateSeriesKeys: ["EURUSD3MD156NWSG", "EURUSDBS3M"],
        selectedSeriesKey: creditXccyComp?.exactSource === "EURUSDBS3M" ? "EURUSDBS3M" : "EURUSD3MD156NWSG",
        selectedSeries: creditXccyComp?.exactSource === "EURUSDBS3M"
          ? (params.seriesMap.get("EURUSDBS3M") ?? [])
          : (params.seriesMap.get("EURUSD3MD156NWSG") ?? []),
        componentRawValue: creditXccyComp?.rawValue ?? null,
        componentScore: creditXccyComp?.score ?? null,
        minObservations: 24,
        scoringFunction: "percentile10yLatest",
        invert: true,
        sourceValidationStatus: creditXccyComp?.exactSource === "EURUSD3MD156NWSG" || creditXccyComp?.exactSource === "EURUSDBS3M" ? "pass" : "fail",
        blockStatusBeforeFinalGuard: creditFundingStatus,
        finalBlockStatus: creditFundingStatus,
        finalGuardTriggered: false,
        finalGuardReason: "none",
      }),
      overlayComputation: {
        runtimeCompleteness: credit?.runtime?.status === "complete" ? "full" : "partial",
        overlayScore: credit?.score ?? null,
        overlayLabel: credit?.label ?? "Not implemented",
        scoreFormula: credit?.runtime?.scoreFormula ?? "overlay_score = weighted_average(available block scores)",
        blockScores: credit?.blockScores ?? {},
        excludedBlocks: Object.entries(credit?.blockScores ?? {}).filter(([, score]) => score === null).map(([block]) => block),
        fundingIncludedInScore: typeof credit?.blockScores?.funding === "number",
        interpretationMode: typeof credit?.blockScores?.funding === "number"
          ? "full_or_partial_funding_included"
          : "pricing_and_access_only_until_funding_available",
        aggregationValidationStatus: typeof credit?.score === "number" ? "pass" : "fail",
        fundingMode: [creditFundingComp?.signalStatus === "ok", creditXccyComp?.signalStatus === "ok"].filter(Boolean).length === 2
          ? "TED + XCCY"
          : (creditFundingComp?.signalStatus === "ok" && creditXccyComp?.signalStatus !== "ok")
            ? "TED-only partial mode"
            : (creditFundingComp?.signalStatus !== "ok" && creditXccyComp?.signalStatus === "ok")
              ? "XCCY-only partial mode"
              : "unavailable",
        xccySourceSelected: creditXccyComp?.exactSource ?? "unavailable",
      },
    },
  };
}

function buildRegionalOverlayHistory(params: {
  region: "US" | "EA" | "SE";
  rawSeriesRows: RawSeriesPointRow[];
  maxPoints?: number;
}): OverlayHistoryPoint[] {
  const monthKeys = Array.from(new Set(params.rawSeriesRows.map((row) => String(row.date).slice(0, 7))))
    .sort((a, b) => a.localeCompare(b));
  const selectedMonths = monthKeys.slice(-Math.max(1, params.maxPoints ?? 24));
  const out: OverlayHistoryPoint[] = [];

  for (const month of selectedMonths) {
    const asOfDate = `${month}-28`;
    const filteredRows = params.rawSeriesRows.filter((row) => String(row.date).slice(0, 10) <= asOfDate);
    const bundle = buildRegionalOverlays(params.region, asOfDate, buildSeriesMap(filteredRows));
    const scores = Object.fromEntries(
      Object.entries(bundle.overlays).map(([key, value]) => [key, value.score ?? null]),
    );
    out.push({ asOfDate, scores });
  }

  return out;
}

function buildGlobalUnrestOverlayHistoryFromRegional(params: {
  usHistory: OverlayHistoryPoint[];
  eaHistory: OverlayHistoryPoint[];
}): OverlayHistoryPoint[] {
  const eaByDate = new Map(params.eaHistory.map((point) => [point.asOfDate, point]));
  const out: OverlayHistoryPoint[] = [];

  for (const usPoint of params.usHistory) {
    const eaPoint = eaByDate.get(usPoint.asOfDate);
    if (!eaPoint) continue;
    const pseudoUsBundle = {
      region: "US",
      asOfDate: usPoint.asOfDate,
      overlays: {
        localUnrestOverlay: { score: usPoint.scores.localUnrestOverlay ?? null },
        safeHavenRiskOffOverlay: { score: usPoint.scores.safeHavenRiskOffOverlay ?? null },
        energyShockOverlay: { score: usPoint.scores.energyShockOverlay ?? null },
      },
    } as any;
    const pseudoEaBundle = {
      region: "EA",
      asOfDate: eaPoint.asOfDate,
      overlays: {
        localUnrestOverlay: { score: eaPoint.scores.localUnrestOverlay ?? null },
        safeHavenRiskOffOverlay: { score: eaPoint.scores.safeHavenRiskOffOverlay ?? null },
        energyShockOverlay: { score: eaPoint.scores.energyShockOverlay ?? null },
      },
    } as any;
    const global = buildGlobalUnrestOverlay(usPoint.asOfDate, pseudoUsBundle, pseudoEaBundle);
    out.push({ asOfDate: usPoint.asOfDate, scores: { globalUnrestOverlay: global.score ?? null } });
  }

  return out;
}

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




async function getAcmTp10IngestHistory(region: string) {
  if (region !== "US") {
    return {
      everSuccessfulFetch: false,
      latestSuccessfulIngestRunForAcmTp10: null as string | null,
    };
  }
  const rows = (await query(
    `SELECT attempted_at, series_results_json
     FROM ${tables.macroIngestRuns}
     WHERE region = ?
     ORDER BY attempted_at DESC
     LIMIT 200`,
    [region],
  )) as Array<{ attempted_at?: string; series_results_json?: string | null }>;

  let latestSuccessfulIngestRunForAcmTp10: string | null = null;
  let everSuccessfulFetch = false;
  for (const row of rows) {
    const seriesResults = safeJsonParse<Array<{ seriesId?: string; seriesKey?: string; fetchSuccess?: boolean; observationsFetched?: number }>>(row.series_results_json ?? null, []);
    const acm = seriesResults.find((item) => item.seriesId === "fred:acmtp10_us" || item.seriesId === "ACMTP10" || item.seriesKey === "acmtp10_us");
    const ok = Boolean(acm?.fetchSuccess) && Number(acm?.observationsFetched ?? 0) > 0;
    if (ok) {
      everSuccessfulFetch = true;
      latestSuccessfulIngestRunForAcmTp10 = row.attempted_at ?? null;
      break;
    }
  }

  return {
    everSuccessfulFetch,
    latestSuccessfulIngestRunForAcmTp10,
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

async function readLatestSnapshot(region: string, allowLiveFallback: boolean, uiOverlayKeysRequested: string[]) {
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
  const acmtp10IngestHistory = await getAcmTp10IngestHistory(region);
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
  const expectedFromFred = region === "US" ? US_FRED_SERIES.map((entry) => entry.seriesKey) : [];
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
        region,
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

  const rawSeriesRows = await loadRawSeriesRows(region);
  const seriesMap = buildSeriesMap(rawSeriesRows);
  const overlayBundle = buildRegionalOverlays(region as "US" | "EA" | "SE", regimeRow.as_of_date, seriesMap);

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
    overlayBundle,
    overlays: overlayBundle,
    overlayHistory: buildRegionalOverlayHistory({
      region: region as "US" | "EA" | "SE",
      rawSeriesRows,
      maxPoints: 24,
    }),
    overlayEngineDiagnostics: (() => {
      const overlaysReturned = Object.keys(overlayBundle.overlays);
      const overlaysMissing = [...REGIONAL_OVERLAY_KEYS].filter((key) => !overlaysReturned.includes(key));
      const history = buildRegionalOverlayHistory({ region: region as "US" | "EA" | "SE", rawSeriesRows, maxPoints: 24 });
      const historyBuiltFor = overlaysReturned.filter((overlayKey) => history.some((point) => typeof point.scores[overlayKey] === "number"));
      const historyMissingFor = overlaysReturned.filter((overlayKey) => !historyBuiltFor.includes(overlayKey));
      const reasons: string[] = [];
      if (rawSeriesRows.length === 0) reasons.push("No raw series rows available for region");
      for (const [overlayKey, overlay] of Object.entries(overlayBundle.overlays)) {
        if (typeof overlay.score !== "number") reasons.push(`${overlayKey}: score is null; all included components missing/proxy or insufficient history`);
      }
      return {
        region,
        rawSeriesCount: new Set(rawSeriesRows.map((row) => row.series_key)).size,
        rawSeriesKeysSample: Array.from(new Set(rawSeriesRows.map((row) => row.series_key))).sort().slice(0, 25),
        buildersRun: [...REGIONAL_OVERLAY_KEYS],
        overlaysReturned,
        overlaysMissing,
        historyBuiltFor,
        historyMissingFor,
        reasons,
        verification: buildOverlayVerificationDiagnostics({
          region,
          rawSeriesRows,
          seriesMap,
          overlayBundle,
          latestIngestRun,
          acmtp10IngestHistory,
        }),
      };
    })(),
    overlayRuntimeProof: {
      overlayEngineUsed: true,
      bundlePresent: Boolean(overlayBundle && Object.keys(overlayBundle.overlays).length > 0),
      bundleKeys: Object.keys(overlayBundle.overlays),
      regionKeysPresent: Object.keys(overlayBundle.overlays),
      globalKeysPresent: [],
    },
    overlayRoutingDiagnostics: {
      overlayEngineUsed: true,
      overlayBundleKeys: Object.keys(overlayBundle.overlays),
      expectedOverlayBundleKeys: [...REGIONAL_OVERLAY_KEYS],
      legacyOverlayKeys: ["growthOverlay", "stressOverlay", "hardAssetOverlay"],
      uiOverlayKeysRequested,
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


async function readLatestGlobalSnapshot(allowLiveFallback: boolean, uiOverlayKeysRequested: string[]) {
  const regionalSnapshots = await Promise.all(MACRO_REGIONS.map(async (region) => [region, await readLatestSnapshot(region, allowLiveFallback, uiOverlayKeysRequested)] as const));
  const regionalMap = Object.fromEntries(regionalSnapshots);
  const asOfDate = MACRO_REGIONS
    .map((region) => regionalMap[region]?.regime?.asOfDate ?? null)
    .filter((x): x is string => Boolean(x))
    .sort()
    .slice(-1)[0] ?? null;

  if (!asOfDate) return null;

  const regime = aggregateGlobalRegimeFromRegional({
    asOfDate,
    regionalRegimes: Object.fromEntries(MACRO_REGIONS.map((r) => [r, regionalMap[r]?.regime])) as any,
  });

  const indicators = MACRO_REGIONS.flatMap((region) => (regionalMap[region]?.indicators ?? []).map((item: any) => ({ ...item, indicatorId: `${region}:${item.indicatorId}` })));
  const globalDrivers = regime.topDrivers.map((driver: any) => ({
    ...driver,
    indicatorId: `${driver.region}:${driver.indicatorId}`,
    title: `[${driver.region}] ${driver.title}`,
  }));

  const globalOverlayBundle = {
    region: "GLOBAL",
    asOfDate,
    overlays: {
      globalUnrestOverlay: buildGlobalUnrestOverlay(asOfDate, regionalMap.US?.overlays ?? null, regionalMap.EA?.overlays ?? null),
    },
  };

  return {
    regime: { ...regime, topDrivers: globalDrivers },
    overlayBundle: globalOverlayBundle,
    overlays: globalOverlayBundle,
    overlayHistory: buildGlobalUnrestOverlayHistoryFromRegional({
      usHistory: regionalMap.US?.overlayHistory ?? [],
      eaHistory: regionalMap.EA?.overlayHistory ?? [],
    }),
    overlayRuntimeProof: {
      overlayEngineUsed: true,
      bundlePresent: Boolean(globalOverlayBundle && Object.keys(globalOverlayBundle.overlays).length > 0),
      bundleKeys: Object.keys(globalOverlayBundle.overlays),
      regionKeysPresent: [],
      globalKeysPresent: Object.keys(globalOverlayBundle.overlays),
    },
    overlayRoutingDiagnostics: {
      overlayEngineUsed: true,
      overlayBundleKeys: Object.keys(globalOverlayBundle.overlays),
      expectedOverlayBundleKeys: [...GLOBAL_OVERLAY_KEYS],
      legacyOverlayKeys: ["growthOverlay", "stressOverlay", "hardAssetOverlay"],
      uiOverlayKeysRequested,
    },
    overlayEngineDiagnostics: {
      region: "GLOBAL",
      rawSeriesCount: (regionalMap.US?.overlayEngineDiagnostics?.rawSeriesCount ?? 0) + (regionalMap.EA?.overlayEngineDiagnostics?.rawSeriesCount ?? 0),
      rawSeriesKeysSample: [
        ...((regionalMap.US?.overlayEngineDiagnostics?.rawSeriesKeysSample ?? []) as string[]),
        ...((regionalMap.EA?.overlayEngineDiagnostics?.rawSeriesKeysSample ?? []) as string[]),
      ].slice(0, 25),
      buildersRun: [...GLOBAL_OVERLAY_KEYS],
      overlaysReturned: Object.keys(globalOverlayBundle.overlays),
      overlaysMissing: [],
      historyBuiltFor: buildGlobalUnrestOverlayHistoryFromRegional({
        usHistory: regionalMap.US?.overlayHistory ?? [],
        eaHistory: regionalMap.EA?.overlayHistory ?? [],
      }).length > 0 ? ["globalUnrestOverlay"] : [],
      historyMissingFor: buildGlobalUnrestOverlayHistoryFromRegional({
        usHistory: regionalMap.US?.overlayHistory ?? [],
        eaHistory: regionalMap.EA?.overlayHistory ?? [],
      }).length > 0 ? [] : ["globalUnrestOverlay"],
      reasons: [
        ...(regionalMap.US?.overlayEngineDiagnostics?.reasons ?? []),
        ...(regionalMap.EA?.overlayEngineDiagnostics?.reasons ?? []),
      ],
    },
    indicators,
    dataStatus: "snapshot",
    writePolicy: "read_only",
    stats: {
      rawPointCount: regionalMap.US?.stats?.rawPointCount ?? 0,
      seriesCount: indicators.length,
      indicatorCount: indicators.length,
      scoredCount: indicators.filter((i: any) => i.score !== null).length,
      partialData: true,
      snapshotAsOfDate: asOfDate,
      readMode: "snapshot",
    },
    debug: {
      snapshotStatus: { readMode: "snapshot", dataStatus: "snapshot", snapshotAsOfDate: asOfDate, snapshotHealth: "partial", fallbackLive: allowLiveFallback, primaryPath: true },
      rawDataStats: { rawPointCount: null, seriesCount: null, indicatorCount: indicators.length, scoredCount: indicators.filter((i: any) => i.score !== null).length, partialData: true },
      expectedVsFoundSeries: [],
      indicatorInputStatus: [],
      snapshotContent: { indicatorSnapshotCount: indicators.length, regimeSnapshotCount: 1, latestSnapshotTimestamp: asOfDate, snapshotIsEmpty: false },
      ingestionDebug: { endpointReachable: true, fredApiKeyPresent: String(process.env.FRED_API_KEY ?? "").trim().length > 0, adminSecretConfigured: Boolean(getAdminSecret()), latestAttempt: null },
      rootCauseHints: [],
      regionalCoverage: Object.fromEntries(MACRO_REGIONS.map((r) => [r, { available: Boolean(regionalMap[r]), indicatorCount: regionalMap[r]?.indicators?.length ?? 0 }])),
    },
  };
}

function trimSnapshotForNormalRead(snapshot: any, debugEnabled: boolean) {
  if (!snapshot || typeof snapshot !== "object" || debugEnabled) return snapshot;
  const clone: any = { ...snapshot };
  delete clone.debug;
  delete clone.overlayEngineDiagnostics;
  delete clone.overlayRuntimeProof;
  delete clone.overlayRoutingDiagnostics;
  if (clone.overlays && typeof clone.overlays === "object" && clone.overlays.overlays && typeof clone.overlays.overlays === "object") {
    const nextOverlays: Record<string, unknown> = {};
    for (const [overlayKey, overlayValue] of Object.entries(clone.overlays.overlays as Record<string, any>)) {
      if (!overlayValue || typeof overlayValue !== "object") {
        nextOverlays[overlayKey] = overlayValue;
        continue;
      }
      const overlayClone: any = { ...overlayValue };
      if (Array.isArray(overlayClone.components)) {
        overlayClone.components = overlayClone.components.map((component: any) => {
          if (!component || typeof component !== "object") return component;
          const componentClone = { ...component };
          delete (componentClone as any).debug;
          return componentClone;
        });
      }
      nextOverlays[overlayKey] = overlayClone;
    }
    clone.overlays = { ...clone.overlays, overlays: nextOverlays };
  }
  return clone;
}

export async function buildMacroLatestReadPayload(region: string) {
  if (region === "GLOBAL") {
    return {
      globalMacro: await readLatestGlobalSnapshot(false, []),
      inflationAnalysis: null,
      cachedAt: new Date().toISOString(),
    };
  }
  if (!["US", "EA", "SE"].includes(region)) return null;
  return {
    globalMacro: await readLatestSnapshot(region, false, []),
    inflationAnalysis: await loadInflationAnalysis(region as "US" | "EA" | "SE"),
    cachedAt: new Date().toISOString(),
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  await ensureSchema();

  const region = String(req.query?.region ?? "GLOBAL").toUpperCase();
  const debugEnabled = String(req.query?.debug ?? "0") === "1";
  const historyResolution = String(req.query?.historyResolution ?? "MONTHLY").toUpperCase() === "WEEKLY" ? "WEEKLY" : "MONTHLY";
  const historyRangeRaw = String(req.query?.historyRangeYears ?? (historyResolution === "MONTHLY" ? "20" : "3")).toUpperCase();
  const historyRangeYears = historyRangeRaw === "MAX"
    ? "MAX"
    : Number.isFinite(Number(historyRangeRaw))
      ? Number(historyRangeRaw)
      : (historyResolution === "MONTHLY" ? 20 : 3);

  const t0 = Date.now();
  const snapshotCache = await readLatestMacroReadCache(region);
  const snapshotReadMs = Date.now() - t0;

  const t1 = Date.now();
  const historyCache = await readMacroHistoryReadCache({
    region,
    resolution: historyResolution as HistoryResolution,
    rangeYears: historyRangeYears,
  });
  const historyReadMs = Date.now() - t1;

  const snapshotPayloadRaw = snapshotCache?.payload;
  const snapshotPayload = snapshotPayloadRaw && typeof snapshotPayloadRaw === "object"
    ? snapshotPayloadRaw as Record<string, unknown>
    : null;

  const globalMacroRaw = snapshotPayload && "globalMacro" in snapshotPayload
    ? snapshotPayload.globalMacro
    : snapshotPayloadRaw ?? null;
  const globalMacro = trimSnapshotForNormalRead(globalMacroRaw, debugEnabled);

  const inflationAnalysis = snapshotPayload && "inflationAnalysis" in snapshotPayload
    ? snapshotPayload.inflationAnalysis
    : null;
  const macroHistory = historyCache?.payload ?? {
    region,
    resolution: historyResolution,
    requestedRangeYears: historyRangeYears,
    points: [],
    intervals: { regime: [], overlays: { growth: [], stress: [], hardAsset: [] } },
    replay: { source: "cache_miss", recomputedAt: null },
  };

  const diagnostics = {
    readMode: "snapshot_cache_only",
    snapshotCacheHit: Boolean(snapshotCache),
    historyCacheHit: Boolean(historyCache),
    liveFallbackAttempted: false,
    snapshotReadMs,
    historyCacheReadMs: historyReadMs,
    payloadBytes: Buffer.byteLength(JSON.stringify({ globalMacro, macroHistory })),
    snapshotUpdatedAt: snapshotCache?.updatedAt ?? null,
    historyUpdatedAt: historyCache?.updatedAt ?? null,
  };

  if (!snapshotCache || !historyCache) {
    res.status(200).json({
      ok: true,
      globalMacro,
      macroHistory,
      inflationAnalysis,
      diagnostics: {
        ...diagnostics,
        stale: true,
        message: "Macro snapshot/history cache missing. Run /api/cron/macro-refresh or admin macro ingest + run-engine.",
      },
    });
    return;
  }

  res.status(200).json({
    ok: true,
    globalMacro,
    macroHistory,
    inflationAnalysis,
    diagnostics,
  });
}
