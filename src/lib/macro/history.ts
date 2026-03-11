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
  earliestRawDate: string | null;
  latestRawDate: string | null;
  generatedPoints: number;
  regimeChanges: number;
  overlayChanges: number;
  blockThresholdChanges: number;
  dataCoveragePct: number;
  missingHistoryIndicators: string[];
  template: {
    templateId: string;
    updatedAt: string;
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

function emptyResult(region: string, resolution: HistoryResolution, rangeYears: number): MacroHistoryResult {
  return {
    region,
    resolution,
    rangeYears,
    earliestRawDate: null,
    latestRawDate: null,
    generatedPoints: 0,
    regimeChanges: 0,
    overlayChanges: 0,
    blockThresholdChanges: 0,
    dataCoveragePct: 0,
    missingHistoryIndicators: [],
    template: {
      templateId: GLOBAL_MACRO_TEMPLATE.templateId,
      updatedAt: GLOBAL_MACRO_TEMPLATE.updatedAt,
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
  rangeYears: number;
}): Promise<MacroHistoryResult> {
  const region = params.region.toUpperCase();
  const resolution = params.resolution;
  const rangeYears = Math.max(1, Math.min(30, Math.floor(params.rangeYears)));

  const rawPoints = (await query(
    `SELECT series_key, date, value
     FROM ${tables.macroRawDatapoints}
     WHERE region = ? AND source_type = 'auto'
     ORDER BY series_key ASC, date ASC`,
    [region],
  )) as unknown as RawPointRow[];

  if (rawPoints.length === 0) return emptyResult(region, resolution, rangeYears);

  const sortedDates = rawPoints.map((row) => row.date).sort((a, b) => a.localeCompare(b));
  const earliestRawDate = sortedDates[0] ?? null;
  const latestRawDate = sortedDates[sortedDates.length - 1] ?? null;
  if (!latestRawDate) return emptyResult(region, resolution, rangeYears);

  const latest = new Date(`${latestRawDate}T00:00:00.000Z`);
  const historyStart = new Date(Date.UTC(latest.getUTCFullYear() - rangeYears, latest.getUTCMonth(), latest.getUTCDate()));

  const replayDates = enumerateReplayDates(historyStart, latest, resolution);
  const series = bySeries(rawPoints);

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

  const coverage = replayDates.length > 0 ? Math.round((points.length / replayDates.length) * 1000) / 10 : 0;
  const missingHistoryIndicators = series.filter((entry) => entry.points.length < 24).map((entry) => entry.seriesKey);

  return {
    region,
    resolution,
    rangeYears,
    earliestRawDate,
    latestRawDate,
    generatedPoints: points.length,
    regimeChanges,
    overlayChanges,
    blockThresholdChanges,
    dataCoveragePct: coverage,
    missingHistoryIndicators,
    template: {
      templateId: GLOBAL_MACRO_TEMPLATE.templateId,
      updatedAt: GLOBAL_MACRO_TEMPLATE.updatedAt,
    },
    replay: {
      recomputedAt: new Date().toISOString(),
      source: "direct_compute",
    },
    points,
  };
}
