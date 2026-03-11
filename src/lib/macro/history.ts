import { query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import { runGlobalMacroEngine } from "./engine.js";
import { classifyBlockBandFromTemplate, GLOBAL_MACRO_TEMPLATE } from "./template.js";
import type { MacroRegimeSnapshot, MacroSeriesInput } from "./types.ts";

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

  const rawPoints = (await query(
    `SELECT series_key, date, value
     FROM ${tables.macroRawDatapoints}
     WHERE region = ? AND source_type = 'auto'
     ORDER BY series_key ASC, date ASC`,
    [region],
  )) as unknown as RawPointRow[];

  if (rawPoints.length === 0) return emptyResult(region, resolution, requestedRangeYears, 1);

  const series = bySeries(rawPoints);
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
