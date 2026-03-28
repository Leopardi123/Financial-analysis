export type CommodityPricePoint = {
  date: string;
  value: number | null;
};

export type TrendDataCompleteness = "full" | "partial" | "insufficient";
export type DegradationLevel = "full" | "medium" | "minimal" | "insufficient";
export type TrendStructureState = "bullish_aligned" | "bullish_but_narrowing" | "bearish_short_term" | "mixed" | "insufficient";
export type TrendExpansionState = "expanding" | "narrowing" | "negative_short_spread" | "flat" | "insufficient";
export type TrendMomentumState = "accelerating" | "decelerating" | "stable" | "insufficient";
export type LongTrendDirection = "up" | "flat" | "down" | "insufficient";
export type ShortTrendMomentum = "accelerating" | "stable" | "decelerating" | "reversing" | "insufficient";
export type TrendSeriesFrequency = "daily" | "weekly" | "monthly" | "unknown";
export type TrendWindows = {
  shortTrendWindow: number;
  mediumTrendWindow: number;
  longTrendWindow: number;
};

export type CommodityTrendPoint = {
  date: string;
  sma50: number | null;
  sma200: number | null;
  sma500: number | null;
  indexSma50: number | null;
  indexSma200: number | null;
  indexSma500: number | null;
  spread50_200: number | null;
  spread200_500: number | null;
};

export type CommodityTrendStructure = {
  windowStartDate: string | null;
  windowEndDate: string | null;
  trendFrequency: TrendSeriesFrequency;
  trendWindows: TrendWindows;
  points: CommodityTrendPoint[];
  hasSma50Coverage: boolean;
  hasSma200Coverage: boolean;
  hasSma500Coverage: boolean;
  degradationLevel: DegradationLevel;
  trendDataCompleteness: TrendDataCompleteness;
  trendStructureState: TrendStructureState;
  trendExpansionState: TrendExpansionState;
  trendMomentumState: TrendMomentumState;
  longTrendDirection: LongTrendDirection;
  shortTrendMomentum: ShortTrendMomentum;
  trendCombinedInterpretation: string;
  structureInterpretation: string;
  expansionInterpretation: string;
  structureInfoLines: string[];
  expansionInfoLines: string[];
  missingHistoryReason: string | null;
  debug: {
    rawObservationCount: number;
    rawFromDate: string | null;
    rawToDate: string | null;
    windowObservationCount: number;
    sma50Computable: boolean;
    sma200Computable: boolean;
    sma500Computable: boolean;
    spread50_200ValidPoints: number;
    spread200_500ValidPoints: number;
    trendFrequency: TrendSeriesFrequency;
    shortTrendWindow: number;
    mediumTrendWindow: number;
    longTrendWindow: number;
    fallbackReason: string | null;
  };
};

function parseDate(date: string): Date | null {
  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function computeSma(values: Array<number | null>, period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  let validCount = 0;
  for (let i = 0; i < values.length; i += 1) {
    const next = values[i];
    if (typeof next === "number" && Number.isFinite(next)) {
      sum += next;
      validCount += 1;
    }
    if (i >= period) {
      const leaving = values[i - period];
      if (typeof leaving === "number" && Number.isFinite(leaving)) {
        sum -= leaving;
        validCount -= 1;
      }
    }
    if (i >= period - 1 && validCount === period) out[i] = sum / period;
  }
  return out;
}

function normalizeFromBase(series: Array<number | null>): Array<number | null> {
  const base = series.find((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (base === undefined || Math.abs(base) < 1e-12) return series.map(() => null);
  return series.map((value) => (typeof value === "number" && Number.isFinite(value) ? (value / base) * 100 : null));
}

function countValid(values: Array<number | null>): number {
  return values.filter((value) => typeof value === "number" && Number.isFinite(value)).length;
}

function dayDiff(from: string, to: string): number | null {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  if (!fromDate || !toDate) return null;
  const raw = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
  return Number.isFinite(raw) ? raw : null;
}

function detectTrendSeriesFrequency(points: CommodityPricePoint[]): TrendSeriesFrequency {
  if (points.length < 3) return "unknown";
  const deltas: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const diff = dayDiff(points[index - 1].date, points[index].date);
    if (typeof diff === "number" && Number.isFinite(diff) && diff > 0) deltas.push(diff);
  }
  if (deltas.length === 0) return "unknown";
  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 3) return "daily";
  if (median <= 10) return "weekly";
  return "monthly";
}

/**
 * Trendfönster uttrycks som 50d/200d/500d-proxy i observationsenheter per frekvens:
 * - daily: 50 / 200 / 500
 * - weekly: ~10 / ~40 / ~100
 * - monthly: ~3 / ~10 / ~24
 */
export function resolveTrendWindowsForFrequency(frequency: TrendSeriesFrequency): TrendWindows {
  if (frequency === "daily") return { shortTrendWindow: 50, mediumTrendWindow: 200, longTrendWindow: 500 };
  if (frequency === "weekly") return { shortTrendWindow: 10, mediumTrendWindow: 40, longTrendWindow: 100 };
  return { shortTrendWindow: 3, mediumTrendWindow: 10, longTrendWindow: 24 };
}

function trendDirection(values: Array<number | null>): "up" | "down" | "flat" | "insufficient" {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length < 2) return "insufficient";
  const delta = numeric[numeric.length - 1] - numeric[0];
  if (Math.abs(delta) < 1e-6) return "flat";
  return delta > 0 ? "up" : "down";
}

function latestDirection(values: Array<number | null>): "up" | "down" | "flat" | "insufficient" {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length < 2) return "insufficient";
  const previous = numeric[numeric.length - 2];
  const latest = numeric[numeric.length - 1];
  const delta = latest - previous;
  if (Math.abs(delta) < 1e-6) return "flat";
  return delta > 0 ? "up" : "down";
}

function latestDelta(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length < 2) return null;
  return numeric[numeric.length - 1] - numeric[numeric.length - 2];
}

function buildStructureState(args: {
  hasSma50Coverage: boolean;
  hasSma200Coverage: boolean;
  hasSma500Coverage: boolean;
  latest: CommodityTrendPoint | null;
  shortSpreadDirection: "up" | "down" | "flat" | "insufficient";
}): TrendStructureState {
  const { hasSma50Coverage, hasSma200Coverage, hasSma500Coverage, latest, shortSpreadDirection } = args;
  if (!hasSma50Coverage || !hasSma200Coverage || !latest) return "insufficient";
  const bullishShortMid = typeof latest.sma50 === "number" && typeof latest.sma200 === "number" && latest.sma50 > latest.sma200;
  if (
    bullishShortMid
    && hasSma500Coverage
    && typeof latest.sma200 === "number"
    && typeof latest.sma500 === "number"
    && latest.sma200 > latest.sma500
  ) {
    return shortSpreadDirection === "down" ? "bullish_but_narrowing" : "bullish_aligned";
  }
  if (!bullishShortMid) return "bearish_short_term";
  return "mixed";
}

function buildExpansionState(spread50_200: Array<number | null>, spread200_500: Array<number | null>): TrendExpansionState {
  const shortDirection = trendDirection(spread50_200);
  const shortLatest = [...spread50_200].reverse().find((value): value is number => typeof value === "number" && Number.isFinite(value));
  const longDirection = trendDirection(spread200_500);

  if (shortDirection === "insufficient") return "insufficient";
  if (typeof shortLatest === "number" && shortLatest < 0) return "negative_short_spread";
  if (shortDirection === "up" && (longDirection === "up" || longDirection === "insufficient")) return "expanding";
  if (shortDirection === "down" || longDirection === "down") return "narrowing";
  if (shortDirection === "flat") return "flat";
  return "insufficient";
}

export function buildTrendStructureInterpretation(model: CommodityTrendStructure): string {
  if (model.degradationLevel === "insufficient") return "Otillräcklig historik för att bedöma trendstruktur.";
  if (model.degradationLevel === "minimal") return "Endast kort trend finns tillgänglig. Visa med försiktighet tills mer historik finns.";
  if (model.degradationLevel === "medium") {
    const latest = model.points[model.points.length - 1] ?? null;
    if (latest && typeof latest.sma50 === "number" && typeof latest.sma200 === "number" && latest.sma50 > latest.sma200) {
      return "Kort trend ligger över mellantrend, vilket visar fortsatt styrka men lång trend saknar underlag.";
    }
    return "Kort trend har tappat mot mellantrend och lång trend saknar ännu underlag.";
  }
  switch (model.trendStructureState) {
    case "bullish_aligned":
      return "Kort, mellan och lång trend är i bullish ordning, vilket tyder på intakt trendstruktur.";
    case "bullish_but_narrowing":
      return "Trenden är fortfarande positiv men den korta styrkan mot mellantrend avtar.";
    case "bearish_short_term":
      return "Kort trend ligger under mellantrend, vilket signalerar kortsiktig svaghet i strukturen.";
    default:
      return "Trendstrukturen är blandad och visar ingen entydig riktning just nu.";
  }
}

export function buildTrendExpansionInterpretation(model: CommodityTrendStructure): string {
  if (model.trendCombinedInterpretation) return model.trendCombinedInterpretation;
  if (model.degradationLevel === "insufficient") return "Trendexpansion kan inte visas med nuvarande historik.";
  if (model.degradationLevel === "minimal") return "Otillräcklig data för lång trend.";
  if (model.degradationLevel === "medium") {
    const shortSpread = model.points.map((point) => point.spread50_200);
    const dir = trendDirection(shortSpread);
    const latestShort = [...shortSpread].reverse().find((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (typeof latestShort === "number" && latestShort < 0) return "Kort trend bryter ned – risk för trendvändning.";
    if (
      model.trendStructureState === "bullish_aligned"
      && model.trendExpansionState === "expanding"
      && model.trendMomentumState === "decelerating"
    ) {
      return "Trenden är fortsatt positiv, men kortsiktig momentum avtar. Det indikerar att uppgången tappar styrka trots att den övergripande strukturen är intakt.";
    }
    if (model.trendMomentumState === "decelerating") {
      return "Kortsiktig momentum avtar, vilket signalerar att trendexpansionen mattas av.";
    }
    if (dir === "down") return "Kort momentum avtar trots fortsatt positiv trendstruktur.";
    if (dir === "up") return "Otillräcklig data för lång trend.";
    return "Kort spread är stabil men lång spread saknar underlag för full trendexpansion.";
  }

  const shortSpread = model.points.map((point) => point.spread50_200);
  const longSpread = model.points.map((point) => point.spread200_500);
  const shortDirection = trendDirection(shortSpread);
  const longDirection = trendDirection(longSpread);
  const latestShort = [...shortSpread].reverse().find((value): value is number => typeof value === "number" && Number.isFinite(value));
  const latestLong = [...longSpread].reverse().find((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (typeof latestShort === "number" && latestShort < 0) return "Kort trend bryter ned – risk för trendvändning.";
  if (
    model.trendStructureState === "bullish_aligned"
    && model.trendExpansionState === "expanding"
    && model.trendMomentumState === "decelerating"
  ) {
    return "Trenden är fortsatt positiv, men kortsiktig momentum avtar. Det indikerar att uppgången tappar styrka trots att den övergripande strukturen är intakt.";
  }
  if (model.trendMomentumState === "decelerating") {
    return "Kortsiktig momentum avtar, vilket signalerar att trendexpansionen mattas av.";
  }
  if (typeof latestShort === "number" && latestShort > 0 && shortDirection === "down") return "Kort momentum avtar trots fortsatt positiv trendstruktur.";
  if (
    typeof latestShort === "number"
    && typeof latestLong === "number"
    && latestShort > 0
    && latestLong > 0
    && shortDirection === "up"
    && longDirection === "up"
  ) {
    return "Trenden stärks – både kort och lång trend divergerar.";
  }

  switch (model.trendExpansionState) {
    case "expanding":
      return "Trenden stärks – både kort och lång trend divergerar.";
    case "narrowing":
      return "Kort momentum avtar trots fortsatt positiv trendstruktur.";
    case "negative_short_spread":
      return "Kort trend bryter ned – risk för trendvändning.";
    case "flat":
      return "Spreadar är relativt platta och visar begränsad trendacceleration.";
    default:
      return "Otillräcklig data för lång trend.";
  }
}

function deriveLongTrendDirection(model: Pick<CommodityTrendStructure, "trendStructureState" | "trendExpansionState" | "degradationLevel">): LongTrendDirection {
  if (model.degradationLevel === "insufficient") return "insufficient";
  if (model.trendExpansionState === "negative_short_spread" || model.trendStructureState === "bearish_short_term") return "down";
  if (model.trendStructureState === "bullish_aligned" || model.trendStructureState === "bullish_but_narrowing") return "up";
  if (model.trendStructureState === "mixed") return "flat";
  return "insufficient";
}

function deriveShortTrendMomentum(model: Pick<CommodityTrendStructure, "trendMomentumState" | "trendExpansionState" | "trendStructureState" | "degradationLevel">): ShortTrendMomentum {
  if (model.degradationLevel === "insufficient") return "insufficient";
  if (model.trendExpansionState === "negative_short_spread" || model.trendStructureState === "bearish_short_term") return "reversing";
  if (model.trendMomentumState === "accelerating") return "accelerating";
  if (model.trendMomentumState === "decelerating") return "decelerating";
  if (model.trendMomentumState === "stable") return "stable";
  return "insufficient";
}

function buildCombinedTrendInterpretation(args: {
  longTrendDirection: LongTrendDirection;
  shortTrendMomentum: ShortTrendMomentum;
}): string {
  const { longTrendDirection, shortTrendMomentum } = args;
  if (longTrendDirection === "up" && shortTrendMomentum === "decelerating") {
    return "Den långsiktiga trendstrukturen är fortsatt positiv, men kortsiktig momentum avtar.";
  }
  if (longTrendDirection === "up" && shortTrendMomentum === "accelerating") {
    return "Den långsiktiga trendstrukturen är positiv och kortsiktig momentum förstärker uppgången.";
  }
  if (longTrendDirection === "down" && shortTrendMomentum === "decelerating") {
    return "Den långsiktiga trendstrukturen är negativ, även om nedgångstakten tillfälligt mattas av.";
  }
  if (longTrendDirection === "up" && shortTrendMomentum === "stable") {
    return "Den långsiktiga trendstrukturen är positiv medan kortsiktig momentum är stabil.";
  }
  if (longTrendDirection === "down" && shortTrendMomentum === "accelerating") {
    return "Den långsiktiga trendstrukturen är negativ och kortsiktig momentum förstärker nedgången.";
  }
  if (shortTrendMomentum === "reversing") {
    return "Den kortsiktiga momentumprofilen signalerar möjlig trendvändning mot den långsiktiga riktningen.";
  }
  if (longTrendDirection === "flat") {
    return "Den långsiktiga trendriktningen är sidledes och kortsiktig momentum ger ingen tydlig trenddominans.";
  }
  return "Trendbilden är otillräcklig för att separera långsiktig riktning och kortsiktig momentum.";
}

export function buildCommodityTrendStructure(pricePoints: CommodityPricePoint[], months = 5): CommodityTrendStructure {
  const sorted = [...pricePoints]
    .map((point) => ({ ...point, parsed: parseDate(point.date) }))
    .filter((point) => point.parsed !== null)
    .sort((a, b) => (a.parsed!.getTime() - b.parsed!.getTime()));

  const emptyBase: CommodityTrendStructure = {
    windowStartDate: null,
    windowEndDate: null,
    trendFrequency: "unknown",
    trendWindows: resolveTrendWindowsForFrequency("unknown"),
    points: [],
    hasSma50Coverage: false,
    hasSma200Coverage: false,
    hasSma500Coverage: false,
    degradationLevel: "insufficient",
    trendDataCompleteness: "insufficient",
    trendStructureState: "insufficient",
    trendExpansionState: "insufficient",
    trendMomentumState: "insufficient",
    longTrendDirection: "insufficient",
    shortTrendMomentum: "insufficient",
    trendCombinedInterpretation: "Trendbilden är otillräcklig för att separera långsiktig riktning och kortsiktig momentum.",
    structureInterpretation: "Otillräcklig historik för att bedöma trendstruktur.",
    expansionInterpretation: "Trendexpansion kan inte visas med nuvarande historik.",
    structureInfoLines: [],
    expansionInfoLines: [],
    missingHistoryReason: "Otillräcklig historik för att visa trendstruktur.",
    debug: {
      rawObservationCount: sorted.length,
      rawFromDate: sorted[0]?.date ?? null,
      rawToDate: sorted[sorted.length - 1]?.date ?? null,
      windowObservationCount: 0,
      sma50Computable: false,
      sma200Computable: false,
      sma500Computable: false,
      spread50_200ValidPoints: 0,
      spread200_500ValidPoints: 0,
      trendFrequency: "unknown",
      shortTrendWindow: resolveTrendWindowsForFrequency("unknown").shortTrendWindow,
      mediumTrendWindow: resolveTrendWindowsForFrequency("unknown").mediumTrendWindow,
      longTrendWindow: resolveTrendWindowsForFrequency("unknown").longTrendWindow,
      fallbackReason: "no_raw_points",
    },
  };

  if (sorted.length === 0) return emptyBase;

  const dates = sorted.map((point) => point.date);
  const values = sorted.map((point) => (typeof point.value === "number" && Number.isFinite(point.value) ? point.value : null));
  const trendFrequency = detectTrendSeriesFrequency(sorted);
  const trendWindows = resolveTrendWindowsForFrequency(trendFrequency);
  const sma50 = computeSma(values, trendWindows.shortTrendWindow);
  const sma200 = computeSma(values, trendWindows.mediumTrendWindow);
  const sma500 = computeSma(values, trendWindows.longTrendWindow);

  const endDate = sorted[sorted.length - 1].parsed!;
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - Math.max(1, months));

  const windowIndices = sorted
    .map((point, idx) => ({ idx, ts: point.parsed!.getTime() }))
    .filter((point) => point.ts >= startDate.getTime())
    .map((point) => point.idx);

  if (windowIndices.length === 0) {
    return {
      ...emptyBase,
      windowEndDate: dates[dates.length - 1] ?? null,
      debug: {
        ...emptyBase.debug,
        sma50Computable: countValid(sma50) > 0,
        sma200Computable: countValid(sma200) > 0,
        sma500Computable: countValid(sma500) > 0,
        trendFrequency,
        shortTrendWindow: trendWindows.shortTrendWindow,
        mediumTrendWindow: trendWindows.mediumTrendWindow,
        longTrendWindow: trendWindows.longTrendWindow,
        fallbackReason: "no_points_in_display_window",
      },
    };
  }

  const windowSma50 = windowIndices.map((index) => sma50[index]);
  const windowSma200 = windowIndices.map((index) => sma200[index]);
  const windowSma500 = windowIndices.map((index) => sma500[index]);
  const indexed50 = normalizeFromBase(windowSma50);
  const indexed200 = normalizeFromBase(windowSma200);
  const indexed500 = normalizeFromBase(windowSma500);

  const points: CommodityTrendPoint[] = windowIndices.map((index, i) => {
    const spread50_200 = typeof sma50[index] === "number" && typeof sma200[index] === "number" ? sma50[index]! - sma200[index]! : null;
    const spread200_500 = typeof sma200[index] === "number" && typeof sma500[index] === "number" ? sma200[index]! - sma500[index]! : null;
    return {
      date: dates[index],
      sma50: sma50[index],
      sma200: sma200[index],
      sma500: sma500[index],
      indexSma50: indexed50[i],
      indexSma200: indexed200[i],
      indexSma500: indexed500[i],
      spread50_200,
      spread200_500,
    };
  });

  const hasSma50Coverage = countValid(points.map((point) => point.sma50)) >= 2;
  const hasSma200Coverage = countValid(points.map((point) => point.sma200)) >= 2;
  const hasSma500Coverage = countValid(points.map((point) => point.sma500)) >= 2;

  const degradationLevel: DegradationLevel = hasSma50Coverage && hasSma200Coverage && hasSma500Coverage
    ? "full"
    : hasSma50Coverage && hasSma200Coverage
      ? "medium"
      : hasSma50Coverage
        ? "minimal"
        : "insufficient";

  const trendDataCompleteness: TrendDataCompleteness = degradationLevel === "full"
    ? "full"
    : degradationLevel === "insufficient"
      ? "insufficient"
      : "partial";

  const shortSpread = points.map((point) => point.spread50_200);
  const longSpread = points.map((point) => point.spread200_500);
  const shortSpreadDirection = trendDirection(shortSpread);
  const latest = points[points.length - 1] ?? null;

  const trendStructureState = buildStructureState({ hasSma50Coverage, hasSma200Coverage, hasSma500Coverage, latest, shortSpreadDirection });
  const trendExpansionState = buildExpansionState(shortSpread, longSpread);
  const deltaShortSpread = latestDelta(shortSpread);
  const shortSpreadLatestDirection = latestDirection(shortSpread);
  const trendMomentumState: TrendMomentumState = (deltaShortSpread ?? 0) > 1e-6
    ? "accelerating"
    : (deltaShortSpread ?? 0) < -1e-6
      ? "decelerating"
      : shortSpreadLatestDirection === "flat" || (deltaShortSpread !== null && Math.abs(deltaShortSpread) <= 1e-6)
        ? "stable"
        : shortSpreadLatestDirection === "insufficient"
          ? "insufficient"
          : "stable";
  const longTrendDirection = deriveLongTrendDirection({ trendStructureState, trendExpansionState, degradationLevel });
  const shortTrendMomentum = deriveShortTrendMomentum({ trendMomentumState, trendExpansionState, trendStructureState, degradationLevel });
  const trendCombinedInterpretation = buildCombinedTrendInterpretation({ longTrendDirection, shortTrendMomentum });

  const missingHistoryReason = degradationLevel === "full"
    ? null
    : degradationLevel === "medium"
      ? "Lång trend saknar tillräcklig historik, grafen visar kort vs mellantrend."
      : degradationLevel === "minimal"
        ? "Endast kort trend tillgänglig."
        : "Otillräcklig historik för att visa trendstruktur.";

  const model: CommodityTrendStructure = {
    windowStartDate: points[0]?.date ?? null,
    windowEndDate: points[points.length - 1]?.date ?? null,
    trendFrequency,
    trendWindows,
    points,
    hasSma50Coverage,
    hasSma200Coverage,
    hasSma500Coverage,
    degradationLevel,
    trendDataCompleteness,
    trendStructureState,
    trendExpansionState,
    trendMomentumState,
    longTrendDirection,
    shortTrendMomentum,
    trendCombinedInterpretation,
    structureInterpretation: "",
    expansionInterpretation: "",
    structureInfoLines: [],
    expansionInfoLines: [],
    missingHistoryReason,
    debug: {
      rawObservationCount: sorted.length,
      rawFromDate: sorted[0]?.date ?? null,
      rawToDate: sorted[sorted.length - 1]?.date ?? null,
      windowObservationCount: points.length,
      sma50Computable: countValid(sma50) > 0,
      sma200Computable: countValid(sma200) > 0,
      sma500Computable: countValid(sma500) > 0,
      spread50_200ValidPoints: countValid(shortSpread),
      spread200_500ValidPoints: countValid(longSpread),
      trendFrequency,
      shortTrendWindow: trendWindows.shortTrendWindow,
      mediumTrendWindow: trendWindows.mediumTrendWindow,
      longTrendWindow: trendWindows.longTrendWindow,
      fallbackReason: degradationLevel === "full" ? null : missingHistoryReason,
    },
  };

  model.structureInterpretation = buildTrendStructureInterpretation(model);
  model.expansionInterpretation = buildTrendExpansionInterpretation(model);
  model.structureInfoLines = [
    model.structureInterpretation,
    `Frekvens: ${model.trendFrequency}. Fönster (kort/mellan/lång): ${model.trendWindows.shortTrendWindow}/${model.trendWindows.mediumTrendWindow}/${model.trendWindows.longTrendWindow}.`,
    `Data completeness: ${model.trendDataCompleteness}.`,
    ...(model.degradationLevel !== "full" && model.missingHistoryReason ? [model.missingHistoryReason] : []),
  ];
  model.expansionInfoLines = [
    model.expansionInterpretation,
    ...(model.trendStructureState === "bullish_aligned"
      && model.trendExpansionState === "expanding"
      && model.trendMomentumState === "decelerating"
      ? ["Trenden är stark men tappar momentum."]
      : []),
    `Frekvens: ${model.trendFrequency}. Fönster (kort/mellan/lång): ${model.trendWindows.shortTrendWindow}/${model.trendWindows.mediumTrendWindow}/${model.trendWindows.longTrendWindow}.`,
    `Trend expansion state: ${model.trendExpansionState}.`,
    `Long trend direction: ${model.longTrendDirection}.`,
    `Short trend momentum: ${model.shortTrendMomentum}.`,
    `Combined trend interpretation: ${model.trendCombinedInterpretation}`,
    ...(model.degradationLevel === "medium" ? ["Lång spread (mellantrend-lång trend) kan inte bedömas fullt ut ännu."] : []),
  ];

  return model;
}
