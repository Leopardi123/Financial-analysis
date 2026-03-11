import { MACRO_INDICATOR_CATALOG, SIGNAL_CLASS_WEIGHT } from "./catalog.ts";
import type {
  MacroIndicatorCatalogEntry,
  MacroIndicatorSnapshot,
  MacroRegimeSnapshot,
  MacroSeriesInput,
  OverlayType,
} from "./types.ts";

const TEN_YEAR_MONTHS = 120;
const MIN_COVERAGE_PCT = 80;

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function monthIndex(month: string): number {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthPart = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(monthPart)) return 0;
  return year * 12 + (monthPart - 1);
}

function estimateCadenceMonths(monthly: Array<{ month: string; date: string; value: number | null }>): number {
  if (monthly.length < 2) return 1;
  const monthGaps: number[] = [];
  for (let index = 1; index < monthly.length; index += 1) {
    const gap = monthIndex(monthly[index].month) - monthIndex(monthly[index - 1].month);
    if (gap > 0) monthGaps.push(gap);
  }
  if (monthGaps.length === 0) return 1;
  monthGaps.sort((a, b) => a - b);
  const median = monthGaps[Math.floor(monthGaps.length / 2)] ?? 1;
  return Math.max(1, Math.min(12, median));
}

function lastDayOfMonth(month: string): string {
  return `${month}-28`;
}

function toCanonicalMonthly(points: Array<{ date: string; value: number | null }>) {
  const map = new Map<string, { date: string; value: number | null }>();
  for (const point of points) {
    const key = monthKey(point.date);
    const prev = map.get(key);
    if (!prev || point.date > prev.date) {
      map.set(key, point);
    }
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, point]) => ({ month, date: point.date, value: point.value }));
}

function scoreFromPercentile(percentile: number): -2 | -1 | 0 | 1 | 2 {
  if (percentile <= 10) return -2;
  if (percentile <= 30) return -1;
  if (percentile < 70) return 0;
  if (percentile < 90) return 1;
  return 2;
}

function percentileRank(series: number[], value: number): number {
  if (series.length === 0) return 50;
  const leCount = series.filter((entry) => entry <= value).length;
  return (leCount / series.length) * 100;
}

function classifyCoreRegime(score: number | null): MacroRegimeSnapshot["coreRegimeLabel"] {
  if (score === null) return "DataInsufficient";
  if (score <= 35) return "MonetaryDominance";
  if (score <= 55) return "Balanced";
  if (score <= 75) return "FiscalPressureBuilding";
  return "FiscalDominanceRisk";
}

function overlayLabel(type: "growth", weightedAverageScore: number | null): "Weak" | "Neutral" | "Strong";
function overlayLabel(type: "stress", weightedAverageScore: number | null): "Low" | "Medium" | "High";
function overlayLabel(type: "hard_asset", weightedAverageScore: number | null): "Weak" | "Neutral" | "Strong";
function overlayLabel(type: OverlayType, weightedAverageScore: number | null) {
  if (type === "growth") {
    if (weightedAverageScore === null || weightedAverageScore <= -0.5) return "Weak";
    if (weightedAverageScore < 0.5) return "Neutral";
    return "Strong";
  }
  if (type === "stress") {
    if (weightedAverageScore === null || weightedAverageScore <= -0.5) return "Low";
    if (weightedAverageScore < 0.5) return "Medium";
    return "High";
  }
  if (weightedAverageScore === null || weightedAverageScore <= -0.5) return "Weak";
  if (weightedAverageScore < 0.5) return "Neutral";
  return "Strong";
}

function latestValueForInput(seriesMap: Map<string, MacroSeriesInput>, input: string) {
  const series = seriesMap.get(input);
  if (!series) return null;
  const monthly = toCanonicalMonthly(series.points);
  if (monthly.length === 0) return null;
  return monthly;
}

function computeIndicatorSnapshot(
  entry: MacroIndicatorCatalogEntry,
  seriesMap: Map<string, MacroSeriesInput>,
  asOfDate: string,
): MacroIndicatorSnapshot {
  const monthly = latestValueForInput(seriesMap, entry.inputs[0]);
  if (!monthly) {
    return {
      asOfDate,
      region: entry.region,
      indicatorId: entry.indicatorId,
      signalClass: entry.signalClass,
      sourceType: "auto",
      valueLatest: null,
      percentile10y: null,
      score: null,
      freshnessDays: null,
      coverage10yPct: 0,
      contribution: null,
    };
  }

  const trailing = monthly.slice(-TEN_YEAR_MONTHS);
  const validValues = trailing.map((p) => p.value).filter((v): v is number => typeof v === "number");
  const cadenceMonths = estimateCadenceMonths(trailing);
  const expectedPointCount = Math.max(1, Math.round(TEN_YEAR_MONTHS / cadenceMonths));
  const coverage10yPct = Math.max(0, Math.min(100, (validValues.length / expectedPointCount) * 100));
  const latest = trailing[trailing.length - 1];
  const valueLatest = latest?.value ?? null;
  const freshnessDays = latest ? Math.max(0, Math.round((Date.parse(asOfDate) - Date.parse(latest.date)) / 86400000)) : null;

  if (coverage10yPct < MIN_COVERAGE_PCT || valueLatest === null) {
    return {
      asOfDate,
      region: entry.region,
      indicatorId: entry.indicatorId,
      signalClass: entry.signalClass,
      sourceType: "auto",
      valueLatest,
      percentile10y: null,
      score: null,
      freshnessDays,
      coverage10yPct,
      contribution: null,
    };
  }

  const percentile10y = percentileRank(validValues, valueLatest);
  const score = scoreFromPercentile(percentile10y);
  const contribution = score * entry.blockWeight * SIGNAL_CLASS_WEIGHT[entry.signalClass];

  return {
    asOfDate,
    region: entry.region,
    indicatorId: entry.indicatorId,
    signalClass: entry.signalClass,
    sourceType: "auto",
    valueLatest,
    percentile10y,
    score,
    freshnessDays,
    coverage10yPct,
    contribution,
  };
}

export function runGlobalMacroEngine({
  region,
  asOfDate,
  series,
}: {
  region: string;
  asOfDate?: string;
  series: MacroSeriesInput[];
}): { regime: MacroRegimeSnapshot; indicators: MacroIndicatorSnapshot[] } {
  const snapshotDate = asOfDate ?? lastDayOfMonth(new Date().toISOString().slice(0, 7));
  const catalog = MACRO_INDICATOR_CATALOG.filter((entry) => entry.region === region);
  const seriesMap = new Map(series.map((entry) => [entry.seriesKey, entry]));
  const indicators = catalog.map((entry) => computeIndicatorSnapshot(entry, seriesMap, snapshotDate));

  const byBlock = new Map<string, MacroIndicatorSnapshot[]>();
  for (const item of indicators) {
    const meta = catalog.find((entry) => entry.indicatorId === item.indicatorId);
    if (!meta) continue;
    const bucket = byBlock.get(meta.block) ?? [];
    bucket.push(item);
    byBlock.set(meta.block, bucket);
  }

  const blockScores = {
    A_FISCAL: null,
    B_MONETARY: null,
    C_INFLATION: null,
    D_CREDIBILITY: null,
  } as MacroRegimeSnapshot["blockScores"];

  for (const block of Object.keys(blockScores) as Array<keyof typeof blockScores>) {
    const bucket = byBlock.get(block) ?? [];
    const valid = bucket.filter((item) => item.score !== null);
    if (valid.length === 0) continue;
    const weighted = valid.reduce((acc, item) => {
      const meta = catalog.find((entry) => entry.indicatorId === item.indicatorId)!;
      const weight = meta.blockWeight * SIGNAL_CLASS_WEIGHT[meta.signalClass];
      return { sum: acc.sum + (item.score as number) * weight, w: acc.w + weight };
    }, { sum: 0, w: 0 });
    const avgScore = weighted.w > 0 ? weighted.sum / weighted.w : 0;
    blockScores[block] = Math.max(0, Math.min(100, ((avgScore + 2) / 4) * 100));
  }

  const validBlockScores = Object.values(blockScores).filter((value): value is number => typeof value === "number");
  const macroScoreTotal = validBlockScores.length > 0
    ? validBlockScores.reduce((acc, value) => acc + value, 0) / validBlockScores.length
    : null;

  const clearSignals = indicators.filter((item) => item.signalClass === "clear" && item.score !== null);
  const speculativeSignals = indicators.filter((item) => item.signalClass === "speculative" && item.score !== null);
  const clearSignalStrength = clearSignals.length > 0
    ? clearSignals.reduce((acc, item) => acc + (item.score as number), 0) / clearSignals.length
    : null;
  const speculativeSignalStrength = speculativeSignals.length > 0
    ? speculativeSignals.reduce((acc, item) => acc + (item.score as number), 0) / speculativeSignals.length
    : null;

  const macroConfidence = Math.round((clearSignals.length / Math.max(1, catalog.filter((c) => c.signalClass === "clear").length)) * 100);

  const topDrivers = indicators
    .filter((item) => item.contribution !== null)
    .map((item) => ({ indicatorId: item.indicatorId, contribution: item.contribution as number }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5);

  function overlayAverage(type: OverlayType): number | null {
    const items = indicators.filter((snapshot) => {
      const meta = catalog.find((entry) => entry.indicatorId === snapshot.indicatorId);
      return meta?.overlay === type && snapshot.score !== null;
    });
    if (items.length === 0) return null;
    const sum = items.reduce((acc, item) => acc + (item.score as number), 0);
    return sum / items.length;
  }

  const regime: MacroRegimeSnapshot = {
    asOfDate: snapshotDate,
    region,
    blockScores,
    macroScoreTotal,
    macroConfidence,
    coreRegimeLabel: classifyCoreRegime(macroScoreTotal),
    growthOverlay: overlayLabel("growth", overlayAverage("growth")),
    stressOverlay: overlayLabel("stress", overlayAverage("stress")),
    hardAssetOverlay: overlayLabel("hard_asset", overlayAverage("hard_asset")),
    clearSignalStrength,
    speculativeSignalStrength,
    topDrivers,
  };

  return { regime, indicators };
}
