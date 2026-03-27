import { MACRO_INDICATOR_CATALOG, SIGNAL_CLASS_WEIGHT } from "./catalog.ts";
import {
  classifyCoreRegimeFromTemplate,
  classifyOverlayFromTemplate,
  GLOBAL_MACRO_TEMPLATE,
} from "./template.ts";
import type {
  MacroDriverDirection,
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


function computeDerivedChanges(monthly: Array<{ month: string; date: string; value: number | null }>) {
  const valid = monthly.filter((point): point is { month: string; date: string; value: number } => typeof point.value === "number");
  if (valid.length === 0) return { change1m: null, change3m: null, yoy: null };
  const latest = valid[valid.length - 1];
  const prev1m = valid.length > 1 ? valid[valid.length - 2] : null;
  const prev3m = valid.length > 3 ? valid[valid.length - 4] : null;
  const prev12m = valid.length > 12 ? valid[valid.length - 13] : null;
  return {
    change1m: prev1m ? latest.value - prev1m.value : null,
    change3m: prev3m ? latest.value - prev3m.value : null,
    yoy: prev12m ? latest.value - prev12m.value : null,
  };
}

function resolveDriverDirection(change1m: number | null, change3m: number | null): MacroDriverDirection {
  if (change1m === null && change3m === null) return "stable";
  const c1 = change1m ?? 0;
  const c3 = change3m ?? 0;
  if (Math.abs(c1) < 1e-9 && Math.abs(c3) < 1e-9) return "stable";
  if (c1 > 0 && c3 > 0) {
    return Math.abs(c1) > Math.abs(c3 / 3) * 1.25 ? "accelerating" : "rising";
  }
  if (c1 < 0 && c3 < 0) {
    return Math.abs(c1) > Math.abs(c3 / 3) * 1.25 ? "decelerating" : "falling";
  }
  return Math.abs(c1) < Math.abs(c3 / 3) * 0.5 ? "stable" : (c1 > 0 ? "rising" : "falling");
}

function buildRegimeExplanation(label: MacroRegimeSnapshot["coreRegimeLabel"], topDrivers: MacroRegimeSnapshot["topDrivers"]) {
  const driverHighlights = topDrivers.slice(0, 3).map((driver) => driver.title);
  if (label === "MonetaryDominance") {
    return {
      title: "Monetary regime dominates",
      summary: "Penningpolitiska signaler väger tyngst relativt fiskal och inflationsdriven press.",
      driverHighlights,
    };
  }
  if (label === "Balanced") {
    return {
      title: "Balanced regime",
      summary: "Blocken är blandade och inga enskilda drivare dominerar tillräckligt för regimskifte.",
      driverHighlights,
    };
  }
  if (label === "FiscalPressureBuilding") {
    return {
      title: "Fiscal pressure is building",
      summary: "Fiskal belastning tillsammans med realräntor och inflationssignaler driver ett mer spänt makroklimat.",
      driverHighlights,
    };
  }
  if (label === "FiscalDominanceRisk") {
    return {
      title: "Fiscal dominance risk",
      summary: "Fiskal press och förtroendesignaler dominerar med högre systemstress i makrobilden.",
      driverHighlights,
    };
  }
  return {
    title: "Data insufficient",
    summary: "För få poängsatta signaler för en robust regimförklaring.",
    driverHighlights,
  };
}

function latestValueForInput(seriesMap: Map<string, MacroSeriesInput>, input: string, asOfDate: string) {
  const series = seriesMap.get(input);
  if (!series) return null;
  const asOfMonth = monthKey(asOfDate);
  const monthly = toCanonicalMonthly(series.points).filter((point) => point.month <= asOfMonth && point.date <= asOfDate);
  if (monthly.length === 0) return null;
  return monthly;
}

function computeIndicatorSnapshot(
  entry: MacroIndicatorCatalogEntry,
  seriesMap: Map<string, MacroSeriesInput>,
  asOfDate: string,
): MacroIndicatorSnapshot {
  const monthly = latestValueForInput(seriesMap, entry.inputs[0], asOfDate);
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
      change1m: null,
      change3m: null,
      yoy: null,
    };
  }

  const trailing = monthly.slice(-TEN_YEAR_MONTHS);
  const validValues = trailing.map((p) => p.value).filter((v): v is number => typeof v === "number");
  const derived = computeDerivedChanges(trailing);
  const cadenceMonths = estimateCadenceMonths(trailing);
  const expectedPointCount = Math.max(1, Math.round(TEN_YEAR_MONTHS / cadenceMonths));
  const coverage10yPct = Math.max(0, Math.min(100, (validValues.length / expectedPointCount) * 100));
  const latestValid = [...trailing].reverse().find((point) => typeof point.value === "number") ?? null;
  const valueLatest = latestValid?.value ?? null;
  const freshnessDays = latestValid ? Math.max(0, Math.round((Date.parse(asOfDate) - Date.parse(latestValid.date)) / 86400000)) : null;

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
      change1m: derived.change1m,
      change3m: derived.change3m,
      yoy: derived.yoy,
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
    change1m: derived.change1m,
    change3m: derived.change3m,
    yoy: derived.yoy,
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
  const catalogById = new Map(catalog.map((entry) => [entry.indicatorId, entry]));
  for (const item of indicators) {
    const meta = catalogById.get(item.indicatorId);
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
      const meta = catalogById.get(item.indicatorId)!;
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
    .filter((item) => item.contribution !== null && item.score !== null && item.percentile10y !== null)
    .map((item) => {
      const meta = catalogById.get(item.indicatorId)!;
      return {
        region,
        indicatorId: item.indicatorId,
        title: meta.title,
        block: meta.block,
        score: item.score as -2 | -1 | 0 | 1 | 2,
        percentile10y: item.percentile10y as number,
        contribution: item.contribution as number,
        direction: resolveDriverDirection(item.change1m ?? null, item.change3m ?? null),
        change1m: item.change1m ?? null,
        change3m: item.change3m ?? null,
        yoy: item.yoy ?? null,
        driverNote: null,
      };
    })
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5);

  function overlayAverage(type: OverlayType): number | null {
    const items = indicators.filter((snapshot) => {
      const meta = catalogById.get(snapshot.indicatorId);
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
    coreRegimeLabel: classifyCoreRegimeFromTemplate(macroScoreTotal, GLOBAL_MACRO_TEMPLATE),
    growthOverlay: classifyOverlayFromTemplate("growth", overlayAverage("growth"), GLOBAL_MACRO_TEMPLATE),
    stressOverlay: classifyOverlayFromTemplate("stress", overlayAverage("stress"), GLOBAL_MACRO_TEMPLATE),
    hardAssetOverlay: classifyOverlayFromTemplate("hard_asset", overlayAverage("hard_asset"), GLOBAL_MACRO_TEMPLATE),
    clearSignalStrength,
    speculativeSignalStrength,
    topDrivers,
    regimeExplanation: buildRegimeExplanation(
      classifyCoreRegimeFromTemplate(macroScoreTotal, GLOBAL_MACRO_TEMPLATE),
      topDrivers,
    ),
  };

  return { regime, indicators };
}
