import { query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import { runGlobalMacroEngine } from "./engine.js";
import { aggregateGlobalMacroRegime, MACRO_GLOBAL_REGION_WEIGHTS } from "./global.js";
import { classifyBlockBandFromTemplate, GLOBAL_MACRO_TEMPLATE } from "./template.js";
import type { MacroRegimeSnapshot, MacroSeriesInput } from "./types.ts";

type RawPointRow = {
  series_key: string;
  date: string;
  value: number | null;
};

type RegimeSnapshotRow = {
  as_of_date: string;
  region: string;
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


function safeJsonParse<T>(input: string | null, fallback: T): T {
  if (!input) return fallback;
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

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

  if (region === "GLOBAL") {
    const rows = (await query(
      `SELECT as_of_date, region, block_scores_json, macro_score_total, macro_confidence, core_regime_label,
              growth_overlay, stress_overlay, hard_asset_overlay, clear_signal_strength, speculative_signal_strength, top_drivers_json
       FROM ${tables.macroRegimeSnapshots}
       WHERE region IN ('US','EA','SE')
       ORDER BY as_of_date ASC`,
    )) as unknown as RegimeSnapshotRow[];
    if (rows.length === 0) return emptyResult(region, resolution, requestedRangeYears, 1);

    const allDates = Array.from(new Set(rows.map((row) => row.as_of_date))).sort((a, b) => a.localeCompare(b));
    const earliestRawDate = allDates[0] ?? null;
    const latestRawDate = allDates[allDates.length - 1] ?? null;
    if (!earliestRawDate || !latestRawDate) return emptyResult(region, resolution, requestedRangeYears, 1);

    const latestRaw = new Date(`${latestRawDate}T00:00:00.000Z`);
    const earliestRaw = new Date(`${earliestRawDate}T00:00:00.000Z`);
    const requestedRange = requestedRangeYears === "MAX"
      ? Math.max(1, Math.ceil((latestRaw.getTime() - earliestRaw.getTime()) / (365.25 * 86400000)))
      : Math.max(1, Math.min(30, Math.floor(requestedRangeYears)));
    const requestedStartDate = requestedRangeYears === "MAX"
      ? earliestRawDate
      : toIsoDate(new Date(Date.UTC(latestRaw.getUTCFullYear() - requestedRange, latestRaw.getUTCMonth(), latestRaw.getUTCDate())));

    const filteredDates = allDates.filter((date) => date >= requestedStartDate && date <= latestRawDate);

    const canonicalDates = resolution === "MONTHLY"
      ? Array.from(
        filteredDates.reduce((acc, date) => {
          acc.set(date.slice(0, 7), date);
          return acc;
        }, new Map<string, string>()).values(),
      )
      : Array.from(
        filteredDates.reduce((acc, date) => {
          acc.set(weekKey(date), date);
          return acc;
        }, new Map<string, string>()).values(),
      );

    const byDate = new Map<string, RegimeSnapshotRow[]>();
    for (const row of rows) {
      const bucket = byDate.get(row.as_of_date) ?? [];
      bucket.push(row);
      byDate.set(row.as_of_date, bucket);
    }

    const points: MacroHistoryPoint[] = [];
    for (const asOfDate of canonicalDates) {
      const bucket = byDate.get(asOfDate) ?? [];
      const regional = bucket
        .filter((item) => item.region in MACRO_GLOBAL_REGION_WEIGHTS)
        .map((item) => ({
          asOfDate,
          region: item.region,
          blockScores: safeJsonParse(item.block_scores_json, {
            A_FISCAL: null,
            B_MONETARY: null,
            C_INFLATION: null,
            D_CREDIBILITY: null,
          }),
          macroScoreTotal: item.macro_score_total,
          macroConfidence: Number(item.macro_confidence ?? 0),
          coreRegimeLabel: item.core_regime_label as MacroRegimeSnapshot["coreRegimeLabel"],
          growthOverlay: item.growth_overlay as MacroRegimeSnapshot["growthOverlay"],
          stressOverlay: item.stress_overlay as MacroRegimeSnapshot["stressOverlay"],
          hardAssetOverlay: item.hard_asset_overlay as MacroRegimeSnapshot["hardAssetOverlay"],
          clearSignalStrength: item.clear_signal_strength,
          speculativeSignalStrength: item.speculative_signal_strength,
          topDrivers: safeJsonParse(item.top_drivers_json, []),
          regimeExplanation: { title: item.core_regime_label, summary: item.core_regime_label, driverHighlights: [] },
        }));

      if (regional.length === 0) continue;
      const regime = aggregateGlobalMacroRegime(regional as MacroRegimeSnapshot[]);
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
        regimeChanged: false,
        overlayChanged: false,
        blockThresholdChanged: false,
        previousRegimeLabel: null,
        topDriver: regime.topDrivers[0]?.indicatorId ?? null,
        topDrivers: regime.topDrivers,
        regimeExplanation: regime.regimeExplanation,
      });
    }

    if (points.length === 0) return emptyResult(region, resolution, requestedRangeYears, requestedRange);

    for (let i = 1; i < points.length; i += 1) {
      points[i].regimeChanged = points[i - 1].coreRegimeLabel !== points[i].coreRegimeLabel;
      points[i].overlayChanged = points[i - 1].growthOverlay !== points[i].growthOverlay || points[i - 1].stressOverlay !== points[i].stressOverlay || points[i - 1].hardAssetOverlay !== points[i].hardAssetOverlay;
      points[i].previousRegimeLabel = points[i - 1].coreRegimeLabel;
    }

    const replayEarliestDateUsed = points[0]?.asOfDate ?? null;
    const replayLatestDateUsed = points[points.length - 1]?.asOfDate ?? null;
    const limitingIndicators = ["US", "EA", "SE"].flatMap((regional) => {
      const dates = rows.filter((row) => row.region === regional).map((row) => row.as_of_date).sort((a, b) => a.localeCompare(b));
      const start = dates[0] ?? null;
      const end = dates[dates.length - 1] ?? null;
      const out: Array<{ seriesKey: string; earliestDate: string | null; latestDate: string | null; pointCount: number; reason: "starts_after_replay_start" | "ends_before_latest" }> = [];
      if (replayEarliestDateUsed && start && start > replayEarliestDateUsed) out.push({ seriesKey: `region:${regional}`, earliestDate: start, latestDate: end, pointCount: dates.length, reason: "starts_after_replay_start" });
      if (replayLatestDateUsed && end && end < replayLatestDateUsed) out.push({ seriesKey: `region:${regional}`, earliestDate: start, latestDate: end, pointCount: dates.length, reason: "ends_before_latest" });
      return out;
    });

    return {
      ...emptyResult(region, resolution, requestedRangeYears, requestedRange),
      earliestRawDate,
      latestRawDate,
      replayEarliestDateUsed,
      replayLatestDateUsed,
      generatedPoints: points.length,
      regimeChanges: points.filter((pt) => pt.regimeChanged).length,
      overlayChanges: points.filter((pt) => pt.overlayChanged).length,
      dataCoveragePct: 100,
      limitingIndicators,
      rangeDebug: {
        requestedStartDate,
        actualStartDate: replayEarliestDateUsed,
        actualEndDate: replayLatestDateUsed,
        wasCappedByRawData: requestedStartDate < earliestRawDate,
        unfilledReason: limitingIndicators.length > 0 ? "Some regions have shorter snapshot history than replay window" : null,
      },
      intervals: {
        regime: mergeIntervals(points, (point) => point.coreRegimeLabel).map((it) => ({ startDate: it.startDate, endDate: it.endDate, coreRegimeLabel: it.value, pointCount: it.pointCount, topDriver: null, topDrivers: [], regimeExplanation: { title: String(it.value), summary: String(it.value), driverHighlights: [] } })),
        overlays: {
          growth: mergeIntervals(points, (point) => point.growthOverlay),
          stress: mergeIntervals(points, (point) => point.stressOverlay),
          hardAsset: mergeIntervals(points, (point) => point.hardAssetOverlay),
        },
      },
      points,
    };
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
