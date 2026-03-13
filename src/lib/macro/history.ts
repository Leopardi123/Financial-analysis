import { query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import { runGlobalMacroEngine } from "./engine.js";
import { classifyBlockBandFromTemplate, classifyCoreRegimeFromTemplate, GLOBAL_MACRO_TEMPLATE } from "./template.js";
import { MACRO_REGIONS, GLOBAL_REGION_WEIGHTS, aggregateGlobalBlockScores } from "./global.js";
import type { InflationSplitSnapshot, MacroRegimeSnapshot, MacroSeriesInput } from "./types.ts";

type RawPointRow = {
  series_key: string;
  date: string;
  value: number | null;
};

export type HistoryResolution = "WEEKLY" | "MONTHLY";

type RegimeInterval = {
  startDate: string;
  endDate: string;
  coreRegimeLabel: MacroRegimeSnapshot["coreRegimeLabel"];
  pointCount: number;
  topDriver: string | null;
  topDrivers: MacroRegimeSnapshot["topDrivers"];
  regimeExplanation: MacroRegimeSnapshot["regimeExplanation"];
};

type OverlayInterval<T extends string> = {
  startDate: string;
  endDate: string;
  value: T;
  pointCount: number;
};

export type MacroHistoryPoint = {
  asOfDate: string;
  macroScoreTotal: number | null;
  macroConfidence: number;
  coreRegimeLabel: MacroRegimeSnapshot["coreRegimeLabel"];
  fiscalScore: number | null;
  monetaryScore: number | null;
  inflationScore: number | null;
  credibilityScore: number | null;
  growthOverlay: MacroRegimeSnapshot["growthOverlay"];
  stressOverlay: MacroRegimeSnapshot["stressOverlay"];
  hardAssetOverlay: MacroRegimeSnapshot["hardAssetOverlay"];
  regimeChanged: boolean;
  overlayChanged: boolean;
  blockThresholdChanged: boolean;
  previousRegimeLabel: MacroRegimeSnapshot["coreRegimeLabel"] | null;
  topDriver: string | null;
  topDrivers: MacroRegimeSnapshot["topDrivers"];
  regimeExplanation: MacroRegimeSnapshot["regimeExplanation"];
  inflationSplit: InflationSplitSnapshot | null;
  aldenPipeline: {
    monetaryInflation: number | null;
    assetInflation: number | null;
    commodityInflation: number | null;
    consumerInflation: number | null;
    monetaryInflationSeries: string | null;
    assetInflationSeries: string | null;
    commodityInflationSeries: string | null;
    consumerInflationSeries: string | null;
    monetaryInflationGap: number | null;
  } | null;
};

export type MacroHistoryResult = {
  region: string;
  resolution: HistoryResolution;
  rangeYears: number;
  requestedRangeYears: number | "MAX";
  earliestRawDate: string | null;
  latestRawDate: string | null;
  replayEarliestDateUsed: string | null;
  replayLatestDateUsed: string | null;
  generatedPoints: number;
  regimeChanges: number;
  overlayChanges: number;
  blockThresholdChanges: number;
  dataCoveragePct: number;
  missingHistoryIndicators: string[];
  limitingIndicators: Array<{
    seriesKey: string;
    earliestDate: string | null;
    latestDate: string | null;
    pointCount: number;
    reason: "starts_after_replay_start" | "ends_before_latest";
  }>;
  rangeDebug: {
    requestedStartDate: string | null;
    actualStartDate: string | null;
    actualEndDate: string | null;
    wasCappedByRawData: boolean;
    unfilledReason: string | null;
  };
  intervals: {
    regime: RegimeInterval[];
    overlays: {
      growth: OverlayInterval<MacroRegimeSnapshot["growthOverlay"]>[];
      stress: OverlayInterval<MacroRegimeSnapshot["stressOverlay"]>[];
      hardAsset: OverlayInterval<MacroRegimeSnapshot["hardAssetOverlay"]>[];
    };
  };
  template: {
    templateId: string;
    updatedAt: string;
    thresholds: {
      monetaryDominanceMax: number;
      balancedMax: number;
      fiscalPressureMax: number;
    };
  };
  replay: {
    recomputedAt: string;
    source: "direct_compute" | "cache";
  };
  points: MacroHistoryPoint[];
};

function bySeries(rawPoints: RawPointRow[]): MacroSeriesInput[] {
  const map = new Map<string, MacroSeriesInput>();
  for (const row of rawPoints) {
    const key = String(row.series_key);
    const bucket = map.get(key) ?? { seriesKey: key, points: [] };
    bucket.points.push({ date: String(row.date), value: row.value === null ? null : Number(row.value) });
    map.set(key, bucket);
  }
  return Array.from(map.values());
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function enumerateReplayDates(start: Date, end: Date, resolution: HistoryResolution): string[] {
  const replayDates: string[] = [];

  if (resolution === "WEEKLY") {
    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 7)) {
      replayDates.push(toIsoDate(cursor));
    }
    return replayDates;
  }

  for (
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    cursor <= end;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  ) {
    const asOf = endOfMonth(cursor);
    if (asOf >= start && asOf <= end) replayDates.push(toIsoDate(asOf));
  }

  return replayDates;
}


function latestSeriesValue(series: MacroSeriesInput | undefined, asOfDate: string): number | null {
  if (!series) return null;
  let latest: number | null = null;
  for (const point of series.points) {
    if (point.date > asOfDate) break;
    if (typeof point.value === "number" && Number.isFinite(point.value)) latest = point.value;
  }
  return latest;
}

function pickSeriesValue(
  seriesMap: Map<string, MacroSeriesInput>,
  asOfDate: string,
  candidates: string[],
): { value: number | null; seriesKey: string | null } {
  for (const key of candidates) {
    const value = latestSeriesValue(seriesMap.get(key), asOfDate);
    if (value !== null) return { value, seriesKey: key };
  }
  return { value: null, seriesKey: null };
}

function computeAldenPipeline(
  region: string,
  asOfDate: string,
  seriesMap: Map<string, MacroSeriesInput>,
) {
  if (region !== "US" && region !== "EA") return null;

  const monetary = region === "US"
    ? pickSeriesValue(seriesMap, asOfDate, ["m2_yoy"])
    : pickSeriesValue(seriesMap, asOfDate, ["m3_growth_ea"]);

  const asset = region === "US"
    ? pickSeriesValue(seriesMap, asOfDate, ["housing_price_yoy_us", "sp500_yoy_us"])
    : pickSeriesValue(seriesMap, asOfDate, ["housing_price_yoy_ea", "stoxx50_yoy_ea"]);

  const commodity = region === "US"
    ? pickSeriesValue(seriesMap, asOfDate, ["commodity_index_yoy"])
    : pickSeriesValue(seriesMap, asOfDate, ["commodity_index_yoy"]);

  const consumer = region === "US"
    ? pickSeriesValue(seriesMap, asOfDate, ["core_cpi_yoy_us"])
    : pickSeriesValue(seriesMap, asOfDate, ["hicp_yoy_ea"]);

  const gap = monetary.value !== null && consumer.value !== null
    ? monetary.value - consumer.value
    : null;

  return {
    monetaryInflation: monetary.value,
    assetInflation: asset.value,
    commodityInflation: commodity.value,
    consumerInflation: consumer.value,
    monetaryInflationSeries: monetary.seriesKey,
    assetInflationSeries: asset.seriesKey,
    commodityInflationSeries: commodity.seriesKey,
    consumerInflationSeries: consumer.seriesKey,
    monetaryInflationGap: gap,
  };
}

function mergeIntervals<T>(
  points: MacroHistoryPoint[],
  valueOf: (point: MacroHistoryPoint) => T,
): Array<{ startDate: string; endDate: string; value: T; pointCount: number }> {
  if (points.length === 0) return [];
  const out: Array<{ startDate: string; endDate: string; value: T; pointCount: number }> = [];
  let current = {
    startDate: points[0].asOfDate,
    endDate: points[0].asOfDate,
    value: valueOf(points[0]),
    pointCount: 1,
  };

  for (let index = 1; index < points.length; index += 1) {
    const next = points[index];
    const value = valueOf(next);
    if (value === current.value) {
      current.endDate = next.asOfDate;
      current.pointCount += 1;
      continue;
    }
    out.push(current);
    current = {
      startDate: next.asOfDate,
      endDate: next.asOfDate,
      value,
      pointCount: 1,
    };
  }

  out.push(current);
  return out;
}


function weightedAverage(values: Array<{ value: number | null; weight: number }>): number | null {
  const valid = values.filter((item) => typeof item.value === "number" && Number.isFinite(item.value));
  if (valid.length === 0) return null;
  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;
  return valid.reduce((sum, item) => sum + (item.value as number) * item.weight, 0) / totalWeight;
}

function globalHistoryFromRegional(
  resolution: HistoryResolution,
  requestedRangeYears: number | "MAX",
  regional: Record<string, MacroHistoryResult>,
): MacroHistoryResult {
  const dateSet = new Set<string>();
  for (const region of MACRO_REGIONS) {
    for (const p of (regional[region]?.points ?? [])) dateSet.add(p.asOfDate);
  }
  const dates = Array.from(dateSet).sort((a,b)=>a.localeCompare(b));
  const points: MacroHistoryPoint[] = [];
  let regimeChanges = 0;
  let overlayChanges = 0;
  let blockThresholdChanges = 0;

  for (const asOfDate of dates) {
    const regionalPoints = Object.fromEntries(MACRO_REGIONS.map((region)=>[region, regional[region]?.points.find((p)=>p.asOfDate===asOfDate)]));
    const blockScores = aggregateGlobalBlockScores({
      US: regionalPoints.US ? { A_FISCAL: regionalPoints.US.fiscalScore, B_MONETARY: regionalPoints.US.monetaryScore, C_INFLATION: regionalPoints.US.inflationScore, D_CREDIBILITY: regionalPoints.US.credibilityScore } : undefined,
      EA: regionalPoints.EA ? { A_FISCAL: regionalPoints.EA.fiscalScore, B_MONETARY: regionalPoints.EA.monetaryScore, C_INFLATION: regionalPoints.EA.inflationScore, D_CREDIBILITY: regionalPoints.EA.credibilityScore } : undefined,
      SE: regionalPoints.SE ? { A_FISCAL: regionalPoints.SE.fiscalScore, B_MONETARY: regionalPoints.SE.monetaryScore, C_INFLATION: regionalPoints.SE.inflationScore, D_CREDIBILITY: regionalPoints.SE.credibilityScore } : undefined,
    });
    const validBlocks = Object.values(blockScores).filter((v): v is number => typeof v === "number");
    const macroScoreTotal = validBlocks.length ? validBlocks.reduce((a,b)=>a+b,0)/validBlocks.length : null;
    const macroConfidence = Math.round(weightedAverage(MACRO_REGIONS.map((region)=>({ value: regionalPoints[region]?.macroConfidence ?? null, weight: GLOBAL_REGION_WEIGHTS[region]}))) ?? 0);
    const coreRegimeLabel = classifyCoreRegimeFromTemplate(macroScoreTotal, GLOBAL_MACRO_TEMPLATE);
    const prev = points[points.length - 1] ?? null;
    const growthOverlay = "Neutral" as const;
    const stressOverlay = "Medium" as const;
    const hardAssetOverlay = "Neutral" as const;
    const regimeChanged = Boolean(prev && prev.coreRegimeLabel !== coreRegimeLabel);
    const overlayChanged = false;
    const blockThresholdChanged = Boolean(prev && (
      classifyBlockBandFromTemplate(prev.fiscalScore, GLOBAL_MACRO_TEMPLATE) !== classifyBlockBandFromTemplate(blockScores.A_FISCAL, GLOBAL_MACRO_TEMPLATE)
      || classifyBlockBandFromTemplate(prev.monetaryScore, GLOBAL_MACRO_TEMPLATE) !== classifyBlockBandFromTemplate(blockScores.B_MONETARY, GLOBAL_MACRO_TEMPLATE)
      || classifyBlockBandFromTemplate(prev.inflationScore, GLOBAL_MACRO_TEMPLATE) !== classifyBlockBandFromTemplate(blockScores.C_INFLATION, GLOBAL_MACRO_TEMPLATE)
      || classifyBlockBandFromTemplate(prev.credibilityScore, GLOBAL_MACRO_TEMPLATE) !== classifyBlockBandFromTemplate(blockScores.D_CREDIBILITY, GLOBAL_MACRO_TEMPLATE)
    ));
    if (regimeChanged) regimeChanges += 1;
    if (overlayChanged) overlayChanges += 1;
    if (blockThresholdChanged) blockThresholdChanges += 1;
    points.push({
      asOfDate, macroScoreTotal, macroConfidence, coreRegimeLabel,
      fiscalScore: blockScores.A_FISCAL, monetaryScore: blockScores.B_MONETARY, inflationScore: blockScores.C_INFLATION, credibilityScore: blockScores.D_CREDIBILITY,
      growthOverlay, stressOverlay, hardAssetOverlay,
      regimeChanged, overlayChanged, blockThresholdChanged, previousRegimeLabel: prev?.coreRegimeLabel ?? null,
      topDriver: null, topDrivers: [],
      regimeExplanation: { title: "Global macro aggregation", summary: "Global timeline is aggregated from regional engines.", driverHighlights: [] },
      inflationSplit: null,
      aldenPipeline: null,
    });
  }

  return {
    region: "GLOBAL",
    resolution,
    rangeYears: typeof requestedRangeYears === 'number' ? requestedRangeYears : (regional.US?.rangeYears ?? 1),
    requestedRangeYears,
    earliestRawDate: [regional.US?.earliestRawDate, regional.EA?.earliestRawDate, regional.SE?.earliestRawDate].filter(Boolean).sort()[0] ?? null,
    latestRawDate: [regional.US?.latestRawDate, regional.EA?.latestRawDate, regional.SE?.latestRawDate].filter(Boolean).sort().slice(-1)[0] ?? null,
    replayEarliestDateUsed: points[0]?.asOfDate ?? null,
    replayLatestDateUsed: points[points.length-1]?.asOfDate ?? null,
    generatedPoints: points.length, regimeChanges, overlayChanges, blockThresholdChanges,
    dataCoveragePct: points.length > 0 ? 100 : 0,
    missingHistoryIndicators: [], limitingIndicators: [],
    rangeDebug: { requestedStartDate: null, actualStartDate: points[0]?.asOfDate ?? null, actualEndDate: points[points.length-1]?.asOfDate ?? null, wasCappedByRawData: false, unfilledReason: null },
    intervals: {
      regime: mergeIntervals(points, (p)=>p.coreRegimeLabel).map((i)=>({ startDate: i.startDate, endDate: i.endDate, coreRegimeLabel: i.value, pointCount: i.pointCount, topDriver: null, topDrivers: [], regimeExplanation: { title: "Global macro aggregation", summary: "Global timeline is aggregated from regional engines.", driverHighlights: [] } })),
      overlays: {
        growth: mergeIntervals(points, (p)=>p.growthOverlay).map((i)=>({ startDate: i.startDate, endDate: i.endDate, value: i.value, pointCount: i.pointCount })),
        stress: mergeIntervals(points, (p)=>p.stressOverlay).map((i)=>({ startDate: i.startDate, endDate: i.endDate, value: i.value, pointCount: i.pointCount })),
        hardAsset: mergeIntervals(points, (p)=>p.hardAssetOverlay).map((i)=>({ startDate: i.startDate, endDate: i.endDate, value: i.value, pointCount: i.pointCount })),
      },
    },
    template: { templateId: GLOBAL_MACRO_TEMPLATE.templateId, updatedAt: GLOBAL_MACRO_TEMPLATE.updatedAt, thresholds: { monetaryDominanceMax: GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.monetaryDominanceMax, balancedMax: GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.balancedMax, fiscalPressureMax: GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.fiscalPressureMax } },
    replay: { recomputedAt: new Date().toISOString(), source: "direct_compute" },
    points,
  };
}
function emptyResult(region: string, resolution: HistoryResolution, requestedRangeYears: number | "MAX", rangeYears: number): MacroHistoryResult {
  return {
    region,
    resolution,
    rangeYears,
    requestedRangeYears,
    earliestRawDate: null,
    latestRawDate: null,
    replayEarliestDateUsed: null,
    replayLatestDateUsed: null,
    generatedPoints: 0,
    regimeChanges: 0,
    overlayChanges: 0,
    blockThresholdChanges: 0,
    dataCoveragePct: 0,
    missingHistoryIndicators: [],
    limitingIndicators: [],
    rangeDebug: {
      requestedStartDate: null,
      actualStartDate: null,
      actualEndDate: null,
      wasCappedByRawData: false,
      unfilledReason: "No raw datapoints found",
    },
    intervals: {
      regime: [],
      overlays: {
        growth: [],
        stress: [],
        hardAsset: [],
      },
    },
    template: {
      templateId: GLOBAL_MACRO_TEMPLATE.templateId,
      updatedAt: GLOBAL_MACRO_TEMPLATE.updatedAt,
      thresholds: {
        monetaryDominanceMax: GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.monetaryDominanceMax,
        balancedMax: GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.balancedMax,
        fiscalPressureMax: GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.fiscalPressureMax,
      },
    },
    replay: {
      recomputedAt: new Date().toISOString(),
      source: "direct_compute",
    },
    points: [],
  };
}

export async function computeMacroRegimeHistory(params: {
  region: string;
  resolution: HistoryResolution;
  rangeYears: number | "MAX";
}): Promise<MacroHistoryResult> {
  const region = params.region.toUpperCase();
  const resolution = params.resolution;
  const requestedRangeYears = params.rangeYears;

  if (region === "GLOBAL") {
    const regionalEntries = await Promise.all(MACRO_REGIONS.map(async (r) => [r, await computeMacroRegimeHistory({ region: r, resolution, rangeYears: requestedRangeYears })] as const));
    return globalHistoryFromRegional(resolution, requestedRangeYears, Object.fromEntries(regionalEntries));
  }

  const rawPoints = (await query(
    `SELECT series_key, date, value
     FROM ${tables.macroRawDatapoints}
     WHERE region = ? AND source_type = 'auto'
     ORDER BY series_key ASC, date ASC`,
    [region],
  )) as unknown as RawPointRow[];

  if (rawPoints.length === 0) return emptyResult(region, resolution, requestedRangeYears, 1);

  const series = bySeries(rawPoints);
  const seriesMap = new Map(series.map((entry) => [entry.seriesKey, entry]));
  const seriesCoverage = series.map((entry) => {
    const dates = entry.points.map((point) => point.date).sort((a, b) => a.localeCompare(b));
    return {
      seriesKey: entry.seriesKey,
      earliestDate: dates[0] ?? null,
      latestDate: dates[dates.length - 1] ?? null,
      pointCount: dates.length,
    };
  });

  const sortedDates = rawPoints.map((row) => row.date).sort((a, b) => a.localeCompare(b));
  const earliestRawDate = sortedDates[0] ?? null;
  const latestRawDate = sortedDates[sortedDates.length - 1] ?? null;
  if (!earliestRawDate || !latestRawDate) return emptyResult(region, resolution, requestedRangeYears, 1);

  const earliestRaw = new Date(`${earliestRawDate}T00:00:00.000Z`);
  const latestRaw = new Date(`${latestRawDate}T00:00:00.000Z`);

  const requestedRange = requestedRangeYears === "MAX"
    ? Math.max(1, Math.ceil((latestRaw.getTime() - earliestRaw.getTime()) / (365.25 * 86400000)))
    : Math.max(1, Math.min(30, Math.floor(requestedRangeYears)));

  const requestedStartDate = requestedRangeYears === "MAX"
    ? earliestRawDate
    : toIsoDate(new Date(Date.UTC(latestRaw.getUTCFullYear() - requestedRange, latestRaw.getUTCMonth(), latestRaw.getUTCDate())));

  const historyStart = requestedRangeYears === "MAX"
    ? earliestRaw
    : new Date(Date.UTC(latestRaw.getUTCFullYear() - requestedRange, latestRaw.getUTCMonth(), latestRaw.getUTCDate()));

  const replayDates = enumerateReplayDates(historyStart, latestRaw, resolution);

  const points: MacroHistoryPoint[] = [];
  let regimeChanges = 0;
  let overlayChanges = 0;
  let blockThresholdChanges = 0;

  for (const asOfDate of replayDates) {
    const { regime } = runGlobalMacroEngine({
      region,
      asOfDate,
      series,
    });

    const prev = points[points.length - 1] ?? null;
    const regimeChanged = Boolean(prev && prev.coreRegimeLabel !== regime.coreRegimeLabel);
    const overlayChanged = Boolean(
      prev
      && (
        prev.growthOverlay !== regime.growthOverlay
        || prev.stressOverlay !== regime.stressOverlay
        || prev.hardAssetOverlay !== regime.hardAssetOverlay
      ),
    );

    const blockThresholdChanged = Boolean(
      prev
      && (
        classifyBlockBandFromTemplate(prev.fiscalScore, GLOBAL_MACRO_TEMPLATE) !== classifyBlockBandFromTemplate(regime.blockScores.A_FISCAL, GLOBAL_MACRO_TEMPLATE)
        || classifyBlockBandFromTemplate(prev.monetaryScore, GLOBAL_MACRO_TEMPLATE) !== classifyBlockBandFromTemplate(regime.blockScores.B_MONETARY, GLOBAL_MACRO_TEMPLATE)
        || classifyBlockBandFromTemplate(prev.inflationScore, GLOBAL_MACRO_TEMPLATE) !== classifyBlockBandFromTemplate(regime.blockScores.C_INFLATION, GLOBAL_MACRO_TEMPLATE)
        || classifyBlockBandFromTemplate(prev.credibilityScore, GLOBAL_MACRO_TEMPLATE) !== classifyBlockBandFromTemplate(regime.blockScores.D_CREDIBILITY, GLOBAL_MACRO_TEMPLATE)
      ),
    );

    if (regimeChanged) regimeChanges += 1;
    if (overlayChanged) overlayChanges += 1;
    if (blockThresholdChanged) blockThresholdChanges += 1;

    points.push({
      asOfDate,
      macroScoreTotal: regime.macroScoreTotal,
      macroConfidence: regime.macroConfidence,
      coreRegimeLabel: regime.coreRegimeLabel,
      fiscalScore: regime.blockScores.A_FISCAL,
      monetaryScore: regime.blockScores.B_MONETARY,
      inflationScore: regime.blockScores.C_INFLATION,
      credibilityScore: regime.blockScores.D_CREDIBILITY,
      growthOverlay: regime.growthOverlay,
      stressOverlay: regime.stressOverlay,
      hardAssetOverlay: regime.hardAssetOverlay,
      regimeChanged,
      overlayChanged,
      blockThresholdChanged,
      previousRegimeLabel: prev?.coreRegimeLabel ?? null,
      topDriver: regime.topDrivers[0]?.indicatorId ?? null,
      topDrivers: regime.topDrivers,
      regimeExplanation: regime.regimeExplanation,
      inflationSplit: regime.inflationSplit ?? null,
      aldenPipeline: computeAldenPipeline(region, asOfDate, seriesMap),
    });
  }

  const replayEarliestDateUsed = points[0]?.asOfDate ?? null;
  const replayLatestDateUsed = points[points.length - 1]?.asOfDate ?? null;
  const coverage = replayDates.length > 0 ? Math.round((points.length / replayDates.length) * 1000) / 10 : 0;
  const missingHistoryIndicators = seriesCoverage.filter((entry) => entry.pointCount < 24).map((entry) => entry.seriesKey);

  const limitingIndicators = seriesCoverage
    .flatMap((entry) => {
      const reasons: Array<"starts_after_replay_start" | "ends_before_latest"> = [];
      if (replayEarliestDateUsed && entry.earliestDate && entry.earliestDate > replayEarliestDateUsed) reasons.push("starts_after_replay_start");
      if (replayLatestDateUsed && entry.latestDate && entry.latestDate < replayLatestDateUsed) reasons.push("ends_before_latest");
      return reasons.map((reason) => ({ ...entry, reason }));
    })
    .sort((a, b) => a.seriesKey.localeCompare(b.seriesKey));

  const regimeIntervalsRaw = mergeIntervals(points, (point) => point.coreRegimeLabel);
  const regimeIntervals: RegimeInterval[] = regimeIntervalsRaw.map((entry) => {
    const intervalPoints = points.filter((point) => point.asOfDate >= entry.startDate && point.asOfDate <= entry.endDate);
    const topDriver = intervalPoints[intervalPoints.length - 1]?.topDriver ?? null;
    return {
      startDate: entry.startDate,
      endDate: entry.endDate,
      coreRegimeLabel: entry.value,
      pointCount: entry.pointCount,
      topDriver,
      topDrivers: intervalPoints[intervalPoints.length - 1]?.topDrivers ?? [],
      regimeExplanation: intervalPoints[intervalPoints.length - 1]?.regimeExplanation ?? {
        title: "Data insufficient",
        summary: "För få poängsatta signaler för en robust regimförklaring.",
        driverHighlights: [],
      },
    };
  });

  const growthOverlayIntervals = mergeIntervals(points, (point) => point.growthOverlay).map((entry) => ({
    startDate: entry.startDate,
    endDate: entry.endDate,
    value: entry.value,
    pointCount: entry.pointCount,
  }));
  const stressOverlayIntervals = mergeIntervals(points, (point) => point.stressOverlay).map((entry) => ({
    startDate: entry.startDate,
    endDate: entry.endDate,
    value: entry.value,
    pointCount: entry.pointCount,
  }));
  const hardAssetOverlayIntervals = mergeIntervals(points, (point) => point.hardAssetOverlay).map((entry) => ({
    startDate: entry.startDate,
    endDate: entry.endDate,
    value: entry.value,
    pointCount: entry.pointCount,
  }));

  const isMax = requestedRangeYears === "MAX";
  const wasCappedByRawData = isMax ? false : (requestedStartDate ? requestedStartDate < earliestRawDate : false);
  const unfilledReason = !isMax && wasCappedByRawData
    ? "Requested range starts before earliest raw data"
    : limitingIndicators.length > 0
      ? "Some indicators have shorter coverage than full replay window"
      : null;

  return {
    region,
    resolution,
    rangeYears: requestedRange,
    requestedRangeYears,
    earliestRawDate,
    latestRawDate,
    replayEarliestDateUsed,
    replayLatestDateUsed,
    generatedPoints: points.length,
    regimeChanges,
    overlayChanges,
    blockThresholdChanges,
    dataCoveragePct: coverage,
    missingHistoryIndicators,
    limitingIndicators,
    rangeDebug: {
      requestedStartDate,
      actualStartDate: replayEarliestDateUsed,
      actualEndDate: replayLatestDateUsed,
      wasCappedByRawData,
      unfilledReason,
    },
    intervals: {
      regime: regimeIntervals,
      overlays: {
        growth: growthOverlayIntervals,
        stress: stressOverlayIntervals,
        hardAsset: hardAssetOverlayIntervals,
      },
    },
    template: {
      templateId: GLOBAL_MACRO_TEMPLATE.templateId,
      updatedAt: GLOBAL_MACRO_TEMPLATE.updatedAt,
      thresholds: {
        monetaryDominanceMax: GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.monetaryDominanceMax,
        balancedMax: GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.balancedMax,
        fiscalPressureMax: GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.fiscalPressureMax,
      },
    },
    replay: {
      recomputedAt: new Date().toISOString(),
      source: "direct_compute",
    },
    points,
  };
}
