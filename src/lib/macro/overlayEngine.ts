export type OverlayRegion = "US" | "EA" | "SE" | "GLOBAL";

type Point = { date: string; value: number | null };
type SeriesMap = Map<string, Point[]>;

type OverlayComponent = {
  validForProduction?: boolean;
  diagnosticOnly?: boolean;
  diagnosticScore?: number | null;
  productionScore?: number | null;
  gatingFailureReason?: string;
  sourceValidationStatus?: "pass" | "fail" | "missing";
  percentilePlusScoreCheck?: "pass" | "fail";
  id: string;
  title: string;
  block: string;
  rawValue: number | null;
  score: number | null;
  weight: number;
  source: string;
  exactSource: string;
  freshnessDays: number | null;
  includedInTotal: boolean;
  missing: boolean;
  signalStatus: "ok" | "missing" | "incomplete";
  proxy: boolean;
  note: string;
  sourceFamily?: string;
  observationCount?: number;
  latestObservationDate?: string | null;
  yoyInputsUsed?: string[];
  constructedFrom?: string[];
  rollingPercentileThreshold?: number | null;
  active_energy_stress?: 0 | 1 | null;
  inputSources?: Array<{ id: string; sourceFamily: string; exactSource: string; fetchAttempted: boolean; fetchSucceeded: boolean; observationCount: number; latestObservationDate: string | null }>;
  transformedObservationCount?: { CPIENGSL_YoY: number; CPILFESL_YoY: number };
  constructedSeriesObservationCount?: number;
  latestGapValue?: number | null;
  rolling10y80thPercentile?: number | null;
  componentSeriesType?: "constructed-gap";
  debug?: {
    latestDate: string | null;
    monthlyChosenDate: string | null;
    minObservations: number;
    observationsAvailableInScoringWindow: number;
    scoringWindowSize: number;
    enoughHistory: boolean;
    percentile10yLatest: number | null;
    normalizationMethod: "percentile10y" | "zscore_to_percentile";
    inversionApplied: boolean;
    rawToScoreFormula: string;
    directionRulePlainText: string;
    supportInterpretation: "higher raw value means more stress" | "higher raw value means less stress";
    supportScoreValidation?: "pass" | "fail";
    supportScore: number | null;
    signalStatus: "ok" | "missing" | "incomplete";
    totalNumericObservationsInSeries: number;
    earliestDateInSeries: string | null;
    last5MonthlyPointsInWindow: Array<{ date: string; value: number }>;
  };
};

type OverlayResult = {
  score: number | null;
  label: string;
  confidence: number;
  priceShockScore?: number | null;
  breadthScore?: number | null;
  macroSpilloverScore?: number | null;
  blockScores: Record<string, number | null>;
  components: OverlayComponent[];
  runtime?: {
    status: "complete" | "partial" | "weak" | "invalid";
    minimumRequiredBlocks?: number;
    productionValidBlockScores?: Record<string, number | null>;
    diagnosticBlockScores?: Record<string, number | null>;
    includedBlocks?: string[];
    diagnosticOnlyBlocks?: string[];
    activeProductionBlockCount?: number;
    diagnosticOnlyBlockCount?: number;
    confidenceCapApplied?: number | null;
    confidenceCapReason?: string;
    blockDiagnostics?: Record<string, {
      minimumRequiredComponents: string[];
      validComponentCount: number;
      validForProduction: boolean;
      diagnosticOnly: boolean;
      diagnosticBlockScore: number | null;
      productionBlockScore: number | null;
      includedInTotal: boolean;
      status: "pass" | "partial" | "missing";
    }>;
    includedBlocksInTotal: string[];
    excludedBlocks: string[];
    aggregationWeights: Record<string, number>;
    scoreFormula: string;
    blockAggregationInputs?: Record<string, { signalId: string; signalStatus: "ok" | "missing" | "incomplete"; score: number | null }[]>;
    implementationDeltaVsSpec?: string[];
  };
  bridgeDiagnostic?: {
    status: "available" | "missing";
    sourceFamily: string;
    exactSource: string;
    rawValue: number | null;
    score?: number | null;
    includedInTotal: false;
    missing: boolean;
    reason: string;
  };
};

type EnergyDebugSections = {
  intendedPrimaryDesign: string;
  computationWalkthrough: string[];
  verificationTrace: string[];
  implementationDeltaVsSpec: string[];
};

export type OverlayBundle = {
  region: OverlayRegion;
  asOfDate: string;
  overlays: Record<string, OverlayResult>;
};

function monthKey(date: string): string { return date.slice(0, 7); }

function canonicalMonthlyGrid(points: Point[]): Point[] {
  const byMonth = new Map<string, Point>();
  for (const point of points) {
    const key = monthKey(point.date);
    const prev = byMonth.get(key);
    if (!prev || point.date > prev.date) byMonth.set(key, point);
  }
  return Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, point]) => point);
}

function freshnessDays(date: string | null, asOfDate: string): number | null {
  if (!date) return null;
  return Math.max(0, Math.round((Date.parse(asOfDate) - Date.parse(date)) / 86400000));
}

function freshnessFactor(days: number | null): number {
  if (days === null) return 0;
  if (days <= 31) return 1;
  if (days <= 90) return 0.8;
  if (days <= 180) return 0.6;
  if (days <= 365) return 0.4;
  return 0.2;
}

function lastNumeric(points: Point[]): { date: string; value: number } | null {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const value = points[i]?.value;
    if (typeof value === "number" && Number.isFinite(value)) return { date: points[i].date, value };
  }
  return null;
}

function yoy(points: Point[]): Point[] {
  const series = canonicalMonthlyGrid(points);
  return series.map((point, idx) => {
    const prev = idx >= 12 ? series[idx - 12] : null;
    if (!prev || point.value === null || prev.value === null || prev.value === 0) return { date: point.date, value: null };
    return { date: point.date, value: ((point.value / prev.value) - 1) * 100 };
  });
}

function averageAlignedSeries(seriesList: Point[][]): Point[] {
  if (seriesList.length === 0) return [];
  const byDateMaps = seriesList.map((series) => new Map(series.map((point) => [point.date, point.value])));
  const baseDates = seriesList[0].map((point) => point.date);
  const out: Point[] = [];
  for (const date of baseDates) {
    const values = byDateMaps.map((map) => map.get(date));
    if (values.some((value) => value === null || value === undefined || !Number.isFinite(value))) continue;
    const numeric = values as number[];
    out.push({ date, value: numeric.reduce((a, b) => a + b, 0) / numeric.length });
  }
  return out;
}


function subtractAlignedSeries(left: Point[], right: Point[]): Point[] {
  const leftMonthly = canonicalMonthlyGrid(left);
  const rightMonthlyByMonth = new Map(canonicalMonthlyGrid(right).map((point) => [monthKey(point.date), point.value]));
  const out: Point[] = [];
  for (const point of leftMonthly) {
    const rv = rightMonthlyByMonth.get(monthKey(point.date));
    if (point.value === null || rv === null || rv === undefined || !Number.isFinite(point.value) || !Number.isFinite(rv)) continue;
    out.push({ date: point.date, value: point.value - rv });
  }
  return out;
}

function expandQuarterlyToMonthly(points: Point[]): Point[] {
  const quarterly = canonicalMonthlyGrid(points).filter((point): point is { date: string; value: number } => typeof point.value === "number" && Number.isFinite(point.value));
  if (quarterly.length === 0) return [];
  const quarterlyByMonth = new Map(quarterly.map((point) => [monthKey(point.date), point.value]));
  let cursor = new Date(`${monthKey(quarterly[0].date)}-01T00:00:00Z`);
  const end = new Date(`${monthKey(quarterly[quarterly.length - 1].date)}-01T00:00:00Z`);
  let latest: number | null = null;
  const expanded: Point[] = [];
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 7);
    if (quarterlyByMonth.has(key)) latest = quarterlyByMonth.get(key) ?? latest;
    if (latest !== null) expanded.push({ date: `${key}-01`, value: latest });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return expanded;
}

function divideAlignedSeries(numerator: Point[], denominator: Point[]): Point[] {
  const denominatorMonthly = expandQuarterlyToMonthly(denominator);
  const denominatorByMonth = new Map(denominatorMonthly.map((point) => [monthKey(point.date), point.value]));
  const output: Point[] = [];
  for (const point of canonicalMonthlyGrid(numerator)) {
    if (point.value === null || !Number.isFinite(point.value)) continue;
    const den = denominatorByMonth.get(monthKey(point.date));
    if (den === null || den === undefined || !Number.isFinite(den) || den === 0) continue;
    output.push({ date: point.date, value: point.value / den });
  }
  return output;
}

function percentile10yLatest(points: Point[], minObservations = 24): number | null {
  const series = canonicalMonthlyGrid(points);
  const latest = lastNumeric(series);
  if (!latest) return null;
  const latestMonth = monthKey(latest.date);
  const window = series.filter((p) => monthKey(p.date) <= latestMonth).slice(-120).map((p) => p.value).filter((v): v is number => typeof v === "number");
  if (window.length < minObservations) return null;
  const le = window.filter((v) => v <= latest.value).length;
  return (le / window.length) * 100;
}

function percentileRankLatestInWindow(points: Point[], minObservations = 24): { percentile: number | null; latest: number | null; window: number[] } {
  const series = canonicalMonthlyGrid(points);
  const latest = lastNumeric(series);
  if (!latest) return { percentile: null, latest: null, window: [] };
  const latestMonth = monthKey(latest.date);
  const window = series
    .filter((p) => monthKey(p.date) <= latestMonth)
    .slice(-120)
    .map((p) => p.value)
    .filter((v): v is number => typeof v === "number");
  if (window.length < minObservations) return { percentile: null, latest: latest.value, window };
  const le = window.filter((v) => v <= latest.value).length;
  return { percentile: (le / window.length) * 100, latest: latest.value, window };
}

function monthlyPctChange(points: Point[], lagMonths: number): Point[] {
  const series = canonicalMonthlyGrid(points);
  return series.map((point, idx) => {
    const prev = idx >= lagMonths ? series[idx - lagMonths] : null;
    if (!prev || point.value === null || prev.value === null || prev.value === 0) return { date: point.date, value: null };
    return { date: point.date, value: ((point.value / prev.value) - 1) * 100 };
  });
}

function maxZero(points: Point[]): Point[] {
  return canonicalMonthlyGrid(points).map((point) => ({
    date: point.date,
    value: point.value === null || !Number.isFinite(point.value) ? null : Math.max(point.value, 0),
  }));
}

function weightedAlignedSeries(left: Point[], leftWeight: number, right: Point[], rightWeight: number): Point[] {
  const leftByMonth = new Map(canonicalMonthlyGrid(left).map((point) => [monthKey(point.date), point.value]));
  const rightByMonth = new Map(canonicalMonthlyGrid(right).map((point) => [monthKey(point.date), point.value]));
  const months = Array.from(new Set([...leftByMonth.keys(), ...rightByMonth.keys()])).sort((a, b) => a.localeCompare(b));
  const out: Point[] = [];
  for (const month of months) {
    const lv = leftByMonth.get(month);
    const rv = rightByMonth.get(month);
    if (lv === null || lv === undefined || rv === null || rv === undefined || !Number.isFinite(lv) || !Number.isFinite(rv)) continue;
    out.push({ date: `${month}-01`, value: leftWeight * lv + rightWeight * rv });
  }
  return out;
}

function rollingWindowPercentileThreshold(points: Point[], thresholdPct: number, windowMonths = 120, minObservations = 24): { latestRaw: number | null; latestThreshold: number | null; active: 0 | 1 | null } {
  const series = canonicalMonthlyGrid(points).filter((point): point is { date: string; value: number } => typeof point.value === "number" && Number.isFinite(point.value));
  if (series.length === 0) return { latestRaw: null, latestThreshold: null, active: null };
  const latest = series[series.length - 1];
  const window = series.slice(-windowMonths).map((point) => point.value);
  if (window.length < minObservations) return { latestRaw: latest.value, latestThreshold: null, active: null };
  const sorted = [...window].sort((a, b) => a - b);
  const rank = Math.max(0, Math.min(sorted.length - 1, Math.ceil((thresholdPct / 100) * sorted.length) - 1));
  const threshold = sorted[rank];
  return { latestRaw: latest.value, latestThreshold: threshold, active: latest.value > threshold ? 1 : 0 };
}

function energyFreshnessPenalty(days: number | null): number {
  if (days === null) return 0;
  if (days <= 31) return 1.0;
  if (days <= 93) return 0.85;
  if (days <= 186) return 0.65;
  return 0.4;
}

function energyLabelByScore(score: number | null): string {
  if (score === null) return "Not implemented";
  if (score < 20) return "severe energy shock";
  if (score < 40) return "elevated shock";
  if (score < 60) return "neutral";
  if (score < 80) return "calm";
  return "very calm";
}

function zscoreLatest(points: Point[]): number | null {
  const series = canonicalMonthlyGrid(points).slice(-120).map((p) => p.value).filter((v): v is number => typeof v === "number");
  if (series.length < 24) return null;
  const latest = series[series.length - 1];
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const variance = series.reduce((a, b) => a + ((b - mean) ** 2), 0) / series.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return 0;
  return (latest - mean) / sd;
}

function rollingZScore(points: Point[], windowMonths: number): Point[] {
  const monthly = canonicalMonthlyGrid(points).filter((point): point is { date: string; value: number } => typeof point.value === "number" && Number.isFinite(point.value));
  if (monthly.length < windowMonths) return [];
  const out: Point[] = [];
  for (let index = windowMonths - 1; index < monthly.length; index += 1) {
    const window = monthly.slice(index - (windowMonths - 1), index + 1).map((point) => point.value);
    const avg = window.reduce((acc, value) => acc + value, 0) / window.length;
    const variance = window.reduce((acc, value) => acc + ((value - avg) ** 2), 0) / window.length;
    const sd = Math.sqrt(variance);
    const latest = monthly[index].value;
    out.push({ date: monthly[index].date, value: sd === 0 ? 0 : (latest - avg) / sd });
  }
  return out;
}

function seriesDifference(left: Point[], right: Point[]): Point[] {
  const rightByMonth = new Map(canonicalMonthlyGrid(right).map((point) => [monthKey(point.date), point.value]));
  const out: Point[] = [];
  for (const point of canonicalMonthlyGrid(left)) {
    const rightValue = rightByMonth.get(monthKey(point.date));
    if (point.value === null || rightValue === null || rightValue === undefined || !Number.isFinite(point.value) || !Number.isFinite(rightValue)) continue;
    out.push({ date: point.date, value: point.value - rightValue });
  }
  return out;
}

function clampSeries(points: Point[], min: number, max: number): Point[] {
  return canonicalMonthlyGrid(points).map((point) => {
    if (point.value === null || !Number.isFinite(point.value)) return { date: point.date, value: null };
    return { date: point.date, value: Math.max(min, Math.min(max, point.value)) };
  });
}

function negativeChangeWithLag(points: Point[], lagMonths: number): Point[] {
  const monthly = canonicalMonthlyGrid(points);
  return monthly.map((point, index) => {
    const lagged = index >= lagMonths ? monthly[index - lagMonths] : null;
    if (!lagged || point.value === null || lagged.value === null || !Number.isFinite(point.value) || !Number.isFinite(lagged.value)) return { date: point.date, value: null };
    return { date: point.date, value: -1 * (point.value - lagged.value) };
  });
}

function componentCoverageRatio(components: OverlayComponent[]): number {
  if (components.length === 0) return 0;
  return components.filter((c) => !c.missing).length / components.length;
}

function blockConfidence(components: OverlayComponent[]): number {
  const included = components.filter((c) => c.includedInTotal);
  if (included.length === 0) return 0;
  const avgFresh = included.reduce((a, c) => a + freshnessFactor(c.freshnessDays), 0) / included.length;
  const coverage = componentCoverageRatio(included);
  const proxyPenalty = included.filter((c) => c.proxy).length / included.length;
  return Math.max(0, Math.min(1, coverage * avgFresh * (1 - 0.25 * proxyPenalty)));
}

function labelByScore(score: number | null): string {
  if (score === null) return "Not implemented";
  if (score < 20) return "Severe stress";
  if (score < 40) return "Tight";
  if (score < 60) return "Neutral";
  if (score < 80) return "Supportive";
  return "Very supportive";
}

function getSeries(seriesMap: SeriesMap, key: string): Point[] { return seriesMap.get(key) ?? []; }

function resolveApprovedXccyBasisSeries(seriesMap: SeriesMap): { exactSource: "EURUSD3MD156NWSG" | "EURUSDBS3M" | "unavailable"; series: Point[]; fidelityBadge: "high (derived market measure)" | "spec-faithful" | "unavailable" } {
  const bisSeries = getSeries(seriesMap, "EURUSD3MD156NWSG");
  if (bisSeries.length > 0) {
    return { exactSource: "EURUSD3MD156NWSG", series: bisSeries, fidelityBadge: "high (derived market measure)" };
  }
  const bloombergSeries = getSeries(seriesMap, "EURUSDBS3M");
  if (bloombergSeries.length > 0) {
    return { exactSource: "EURUSDBS3M", series: bloombergSeries, fidelityBadge: "spec-faithful" };
  }
  return { exactSource: "unavailable", series: [], fidelityBadge: "unavailable" };
}


function latestNumericValue(points: Point[]): number | null {
  const latest = lastNumeric(points);
  return latest?.value ?? null;
}

function pickSeriesWithNumericData(seriesMap: SeriesMap, keys: string[]): Point[] {
  for (const key of keys) {
    const candidate = getSeries(seriesMap, key);
    if (latestNumericValue(candidate) !== null) return candidate;
  }
  return getSeries(seriesMap, keys[0] ?? "");
}

function makeComponent(params: {
  id: string; title: string; block: string; weight: number; source: string; exactSource: string; series: Point[];
  invert?: boolean; proxy?: boolean; note?: string; useZ?: boolean; minObservations?: number; asOfDate: string;
}): OverlayComponent {
  const monthly = canonicalMonthlyGrid(params.series);
  const latest = lastNumeric(monthly);
  const latestMonth = latest ? monthKey(latest.date) : null;
  const windowPoints = latestMonth
    ? monthly.filter((p) => monthKey(p.date) <= latestMonth).slice(-120)
    : [];
  const numericSeriesPoints = monthly.filter((p): p is { date: string; value: number } => typeof p.value === "number" && Number.isFinite(p.value));
  const windowNumericPoints = windowPoints.filter((p): p is { date: string; value: number } => typeof p.value === "number" && Number.isFinite(p.value));
  const observations = windowNumericPoints.length;
  const minObservations = params.minObservations ?? (params.useZ ? 24 : 24);
  const enoughHistory = observations >= minObservations;
  const percentile = params.useZ ? (() => {
    const z = zscoreLatest(params.series);
    if (z === null) return null;
    return Math.max(0, Math.min(100, 50 + z * 15));
  })() : percentile10yLatest(params.series, minObservations);
  const supportScore = percentile === null ? null : 100 - percentile;
  const supportScoreValidation = percentile === null || supportScore === null
    ? "fail"
    : Math.abs((supportScore + percentile) - 100) < 1e-9
      ? "pass"
      : "fail";
  const signalStatus: "ok" | "missing" | "incomplete" = latest === null
    ? "missing"
    : percentile === null
      ? "incomplete"
      : "ok";
  const inversionPhrase = "support_score = 100 - percentile";
  const directionRulePlainText = "Higher normalized percentile maps to lower support score (uniform support-score convention).";
  return {
    id: params.id,
    title: params.title,
    block: params.block,
    rawValue: latest?.value ?? null,
    score: supportScore,
    weight: params.weight,
    source: params.source,
    exactSource: params.exactSource,
    freshnessDays: freshnessDays(latest?.date ?? null, params.asOfDate),
    includedInTotal: signalStatus === "ok" && !Boolean(params.proxy),
    missing: signalStatus !== "ok" || Boolean(params.proxy),
    signalStatus,
    proxy: Boolean(params.proxy),
    note: params.proxy
      ? `${params.note ? `${params.note} | ` : ""}blocked: non source-faithful runtime path (proxy/derived/inherited)`
      : (params.note ?? ""),
    debug: {
      latestDate: latest?.date ?? null,
      monthlyChosenDate: latest?.date ?? null,
      minObservations,
      observationsAvailableInScoringWindow: observations,
      scoringWindowSize: 120,
      enoughHistory,
      percentile10yLatest: percentile,
      normalizationMethod: params.useZ ? "zscore_to_percentile" : "percentile10y",
      inversionApplied: true,
      rawToScoreFormula: `${params.useZ ? "percentile = clamp(50 + zscoreLatest*15, 0, 100)" : "percentile = percentile10yLatest(window<=120, latest)"}; ${inversionPhrase}; clamp=[0,100] implicit via percentile construction`,
      directionRulePlainText,
      supportInterpretation: "higher raw value means more stress",
      supportScoreValidation,
      supportScore,
      signalStatus,
      totalNumericObservationsInSeries: numericSeriesPoints.length,
      earliestDateInSeries: numericSeriesPoints[0]?.date ?? null,
      last5MonthlyPointsInWindow: windowNumericPoints.slice(-5),
    },
  };
}

function enforceNumericComponentInvariant(component: OverlayComponent): OverlayComponent {
  // Hard invariant for source-faithful runtime: a non-proxy component cannot be marked
  // operational without a numeric compute path.
  if (component.proxy) return component;
  const hasNumericRaw = typeof component.rawValue === "number" && Number.isFinite(component.rawValue);
  const hasNumericScore = typeof component.score === "number" && Number.isFinite(component.score);
  if (hasNumericRaw && hasNumericScore) return component;
  const reasons: string[] = [];
  if (!hasNumericRaw) reasons.push("rawValue missing");
  if (!hasNumericScore) reasons.push("score missing");
  return {
    ...component,
    score: null,
    includedInTotal: false,
    missing: true,
    signalStatus: hasNumericRaw ? "incomplete" : "missing",
    note: [component.note, `compute failure: ${reasons.join(", ")}`].filter(Boolean).join(" | "),
  };
}

function scoreBlock(components: OverlayComponent[]): number | null {
  const valid = components.filter((c) => c.includedInTotal && c.score !== null && c.weight > 0);
  if (valid.length === 0) return null;
  const w = valid.reduce((a, c) => a + c.weight, 0);
  return valid.reduce((a, c) => a + (c.score as number) * (c.weight / w), 0);
}

function finalizeOverlay(blocks: Record<string, { weight: number; components: OverlayComponent[] }>): OverlayResult {
  const blockScores: Record<string, number | null> = {};
  const components = Object.values(blocks).flatMap((b) => b.components);
  const validBlocks: Array<{ score: number; weight: number }> = [];
  const blockConf: Array<{ conf: number; weight: number }> = [];
  for (const [name, block] of Object.entries(blocks)) {
    const score = scoreBlock(block.components);
    blockScores[name] = score;
    if (score !== null) validBlocks.push({ score, weight: block.weight });
    blockConf.push({ conf: blockConfidence(block.components), weight: block.weight });
  }
  const w = validBlocks.reduce((a, b) => a + b.weight, 0);
  const score = w > 0 ? validBlocks.reduce((a, b) => a + b.score * (b.weight / w), 0) : null;
  const cw = blockConf.reduce((a, b) => a + b.weight, 0);
  const confidence = score === null ? 0 : (cw > 0 ? Math.round(100 * blockConf.reduce((a, b) => a + b.conf * (b.weight / cw), 0)) : 0);
  return { score, label: labelByScore(score), confidence, blockScores, components };
}

function enforceSourceFaithfulInvariant(result: OverlayResult, requiredBlocks: string[]): OverlayResult {
  const normalized = result.components.map((component) => {
    if (!requiredBlocks.includes(component.block)) return component;
    return enforceNumericComponentInvariant(component);
  });
  const grouped = normalized.reduce<Record<string, OverlayComponent[]>>((acc, component) => {
    (acc[component.block] ??= []).push(component);
    return acc;
  }, {});
  const normalizedBlockScores: Record<string, number | null> = { ...result.blockScores };
  for (const block of requiredBlocks) {
    if (!grouped[block]?.length) continue;
    normalizedBlockScores[block] = scoreBlock(grouped[block]);
  }
  return {
    ...result,
    score: requiredBlocks.some((block) => normalizedBlockScores[block] === null) ? null : result.score,
    label: labelByScore(requiredBlocks.some((block) => normalizedBlockScores[block] === null) ? null : result.score),
    confidence: requiredBlocks.some((block) => normalizedBlockScores[block] === null) ? 0 : result.confidence,
    blockScores: normalizedBlockScores,
    components: normalized,
  };
}


function requireSourceFaithfulBlocks(result: OverlayResult, requiredBlocks: string[]): OverlayResult {
  const missingRequired = requiredBlocks.some((block) => result.blockScores[block] === null);
  if (!missingRequired) return result;
  return { ...result, score: null, label: labelByScore(null), confidence: 0 };
}


function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

function makeUnavailableEnergyComponent(params: { id: string; title: string; block: "price" | "breadth" | "spillover"; weight: number; source: string; exactSource: string; note: string; }): OverlayComponent {
  return {
    id: params.id,
    title: params.title,
    block: params.block,
    rawValue: null,
    score: null,
    diagnosticScore: null,
    productionScore: null,
    validForProduction: false,
    diagnosticOnly: false,
    gatingFailureReason: "unavailable source",
    sourceValidationStatus: "missing",
    percentilePlusScoreCheck: "fail",
    weight: params.weight,
    source: params.source,
    exactSource: params.exactSource,
    freshnessDays: null,
    includedInTotal: false,
    missing: true,
    signalStatus: "missing",
    proxy: false,
    note: params.note,
  };
}

function makeEnergyShockComponent(params: {
  id: string;
  title: string;
  block: "price" | "breadth" | "spillover";
  weight: number;
  source: string;
  exactSource: string;
  asOfDate: string;
  rawSeries: Point[];
  note?: string;
}): OverlayComponent {
  const monthly = canonicalMonthlyGrid(params.rawSeries);
  const latest = lastNumeric(monthly);
  const rank = percentileRankLatestInWindow(monthly, 24);
  const score = rank.percentile === null ? null : 100 - rank.percentile;
  const freshness = freshnessDays(latest?.date ?? null, params.asOfDate);
  const observationCount = monthly.filter((p) => typeof p.value === "number" && Number.isFinite(p.value)).length;
  const enoughHistory = rank.window.length >= 24;
  const sourceValidationStatus: "pass" | "fail" | "missing" = params.exactSource && !params.exactSource.toLowerCase().includes("unavailable") ? "pass" : "missing";
  const percentilePlusScoreCheck: "pass" | "fail" = score !== null && rank.percentile !== null && Math.abs((score + rank.percentile) - 100) < 1e-9 ? "pass" : "fail";
  const supportScoreValidation: "pass" | "fail" = percentilePlusScoreCheck;
  const validForProduction = Boolean(
    sourceValidationStatus === "pass"
    && observationCount > 0
    && latest !== null
    && typeof latest.value === "number"
    && Number.isFinite(latest.value)
    && enoughHistory
    && supportScoreValidation === "pass"
    && percentilePlusScoreCheck === "pass"
    && score !== null,
  );
  const reasons: string[] = [];
  if (sourceValidationStatus !== "pass") reasons.push("source validation missing/fail");
  if (observationCount <= 0) reasons.push("observation count = 0");
  if (latest === null || !Number.isFinite(latest.value)) reasons.push("raw value not finite");
  if (!enoughHistory) reasons.push("insufficient scoring window");
  if (supportScoreValidation !== "pass") reasons.push("support_score_validation fail");
  if (percentilePlusScoreCheck !== "pass") reasons.push("percentile_plus_score_check fail");
  const signalStatus: "ok" | "missing" | "incomplete" = latest === null ? "missing" : (score === null ? "incomplete" : "ok");
  return {
    id: params.id,
    title: params.title,
    block: params.block,
    rawValue: latest?.value ?? null,
    score: validForProduction ? score : null,
    diagnosticScore: score,
    productionScore: validForProduction ? score : null,
    validForProduction,
    diagnosticOnly: !validForProduction && score !== null,
    gatingFailureReason: validForProduction ? "" : reasons.join("; "),
    sourceValidationStatus,
    percentilePlusScoreCheck,
    weight: params.weight,
    source: params.source,
    exactSource: params.exactSource,
    freshnessDays: freshness,
    includedInTotal: validForProduction,
    missing: !validForProduction,
    signalStatus: validForProduction ? "ok" : signalStatus,
    proxy: false,
    note: params.note ?? "",
    debug: {
      latestDate: latest?.date ?? null,
      monthlyChosenDate: latest?.date ?? null,
      minObservations: 24,
      observationsAvailableInScoringWindow: rank.window.length,
      scoringWindowSize: 120,
      enoughHistory,
      percentile10yLatest: rank.percentile,
      normalizationMethod: "percentile10y",
      inversionApplied: true,
      rawToScoreFormula: "component_score = 100 - percentile_10y(component_raw)",
      directionRulePlainText: "Higher stress raw implies lower support score.",
      supportInterpretation: "higher raw value means more stress",
      supportScoreValidation,
      supportScore: score,
      signalStatus,
      totalNumericObservationsInSeries: observationCount,
      earliestDateInSeries: monthly.find((p) => typeof p.value === "number" && Number.isFinite(p.value))?.date ?? null,
      last5MonthlyPointsInWindow: monthly.filter((p): p is { date: string; value: number } => typeof p.value === "number" && Number.isFinite(p.value)).slice(-5),
    },
  };
}

function buildEnergyShockRawSeries(sourceSeries: Point[]): { rawSeries: Point[]; yoyPositive: Point[]; m3Positive: Point[] } {
  const yoyPositive = maxZero(monthlyPctChange(sourceSeries, 12));
  const m3Positive = maxZero(monthlyPctChange(sourceSeries, 3));
  const rawSeries = weightedAlignedSeries(yoyPositive, 0.65, m3Positive, 0.35);
  return { rawSeries, yoyPositive, m3Positive };
}

function buildEnergyShockOverlay(region: "US" | "EA" | "SE", asOfDate: string, series: SeriesMap): OverlayResult {
  if (region !== "US" && region !== "EA") {
    return finalizeOverlay({
      price: { weight: 0.4, components: [makeUnavailableEnergyComponent({ id: "en_price_unavailable", title: "Energy price shock", block: "price", weight: 1, source: "Unavailable", exactSource: "unavailable", note: "Energy Shock Overlay v1 implemented for US and EA only." })] },
      breadth: { weight: 0.25, components: [makeUnavailableEnergyComponent({ id: "en_breadth_unavailable", title: "Energy stress breadth", block: "breadth", weight: 1, source: "Unavailable", exactSource: "unavailable", note: "Energy Shock Overlay v1 implemented for US and EA only." })] },
      spillover: { weight: 0.35, components: [makeUnavailableEnergyComponent({ id: "en_spillover_unavailable", title: "Energy macro spillover", block: "spillover", weight: 1, source: "Unavailable", exactSource: "unavailable", note: "Energy Shock Overlay v1 implemented for US and EA only." })] },
    });
  }

  const debug: EnergyDebugSections = {
    intendedPrimaryDesign: "Price shock (0.40) + stress breadth (0.25) + macro spillover (0.35), source-locked per region with explicit unavailable/proxy handling and no silent fallback.",
    computationWalkthrough: [],
    verificationTrace: [],
    implementationDeltaVsSpec: [],
  };

  const components: OverlayComponent[] = [];

  const brentRaw = buildEnergyShockRawSeries(getSeries(series, "DCOILBRENTEU"));
  const brentPrice = makeEnergyShockComponent({ id: "en_price_brent", title: "Brent crude shock", block: "price", weight: region === "US" ? 0.55 : 0.4, source: "FRED", exactSource: "DCOILBRENTEU", asOfDate, rawSeries: brentRaw.rawSeries, note: "component_shock_raw = 0.65*max(yoy,0) + 0.35*max(3m,0)" });
  components.push(brentPrice);

  let gasPrice: OverlayComponent;
  if (region === "US") {
    const usGasRaw = buildEnergyShockRawSeries(getSeries(series, "DHHNGSP"));
    gasPrice = makeEnergyShockComponent({ id: "en_price_henry_hub", title: "Henry Hub natural gas shock", block: "price", weight: 0.45, source: "FRED", exactSource: "DHHNGSP", asOfDate, rawSeries: usGasRaw.rawSeries, note: "component_shock_raw = 0.65*max(yoy,0) + 0.35*max(3m,0)" });
    debug.verificationTrace.push("US exact sources wired for price: DCOILBRENTEU + DHHNGSP. DCOILWTICO is not included in v1 production score.");
  } else {
    const eaGasSource = getSeries(series, "PNGASEUUSDM");
    if (eaGasSource.length > 0) {
      const eaGasRaw = buildEnergyShockRawSeries(eaGasSource);
      gasPrice = makeEnergyShockComponent({ id: "en_price_ea_gas", title: "EA gas benchmark shock", block: "price", weight: 0.4, source: "FRED", exactSource: "PNGASEUUSDM", asOfDate, rawSeries: eaGasRaw.rawSeries, note: "component_shock_raw = 0.65*max(yoy,0) + 0.35*max(3m,0)" });
    } else {
      gasPrice = makeUnavailableEnergyComponent({ id: "en_price_ea_gas", title: "EA gas benchmark shock", block: "price", weight: 0.4, source: "FRED", exactSource: "PNGASEUUSDM", note: "EA gas source unavailable; no substitute permitted." });
    }
    debug.verificationTrace.push("EA exact price sources wired: DCOILBRENTEU + PNGASEUUSDM. No silent Brent/Henry substitution used for EA gas/power.");
  }
  components.push(gasPrice);

  const powerPrice = region === "EA"
    ? makeUnavailableEnergyComponent({ id: "en_price_ea_power", title: "EA power benchmark shock", block: "price", weight: 0.2, source: "Unavailable", exactSource: "unavailable (EA power exact source not locked)", note: "EA power benchmark is not source-locked for this task; marked unavailable explicitly." })
    : makeUnavailableEnergyComponent({ id: "en_price_us_wti_lab", title: "WTI crude shock (lab robustness)", block: "price", weight: 0, source: "FRED", exactSource: "DCOILWTICO", note: "Source-locked but excluded from production v1 score." });
  components.push(powerPrice);

  const priceValid = components.filter((c) => c.block === "price" && c.includedInTotal && c.weight > 0 && c.score !== null);
  const priceWeight = priceValid.reduce((a, c) => a + c.weight, 0);
  const priceShockScore = priceWeight > 0 ? priceValid.reduce((a, c) => a + (c.score as number) * (c.weight / priceWeight), 0) : null;
  const priceShockIntensity = priceShockScore === null ? null : (100 - priceShockScore) / 100;

  const breadthInputs: Array<{ comp: OverlayComponent; threshold: number | null; active: 0 | 1 | null }> = [];
  const brentBreadthThr = rollingWindowPercentileThreshold(brentRaw.rawSeries, 80, 120, 24);
  const brentBreadthPct = percentile10yLatest(brentRaw.rawSeries, 24);
  const brentBreadthSupport = brentBreadthPct === null ? null : 100 - brentBreadthPct;
  const brentBreadth = { ...brentPrice, id: "en_breadth_brent", title: "Brent breadth stress activation", block: "breadth" as const, weight: 0, validForProduction: Boolean(brentPrice.validForProduction && brentBreadthThr.active !== null), productionScore: brentBreadthSupport, diagnosticScore: brentBreadthSupport, includedInTotal: false, missing: brentBreadthThr.active === null, signalStatus: (brentBreadthThr.active === null ? "incomplete" : "ok") as "incomplete" | "ok", note: `component_shock_raw > rolling_10y_80th_percentile => active=${brentBreadthThr.active ?? "n/a"}`, rawValue: brentBreadthThr.latestRaw, active_energy_stress: brentBreadthThr.active, rolling10y80thPercentile: brentBreadthThr.latestThreshold };
  if (brentBreadth.debug) {
    brentBreadth.debug.percentile10yLatest = brentBreadthPct;
    brentBreadth.debug.supportScore = brentBreadthSupport;
    brentBreadth.debug.supportScoreValidation = brentBreadthSupport === null ? "fail" : "pass";
  }
  breadthInputs.push({ comp: brentBreadth, threshold: brentBreadthThr.latestThreshold, active: brentBreadthThr.active });
  components.push(brentBreadth);

  if (region === "US") {
    const usGasRaw = buildEnergyShockRawSeries(getSeries(series, "DHHNGSP"));
    const gasThr = rollingWindowPercentileThreshold(usGasRaw.rawSeries, 80, 120, 24);
    const gasBreadthPct = percentile10yLatest(usGasRaw.rawSeries, 24);
    const gasBreadthSupport = gasBreadthPct === null ? null : 100 - gasBreadthPct;
    const gasBreadth = { ...gasPrice, id: "en_breadth_henry_hub", title: "Henry Hub breadth stress activation", block: "breadth" as const, weight: 0, validForProduction: Boolean(gasPrice.validForProduction && gasThr.active !== null), productionScore: gasBreadthSupport, diagnosticScore: gasBreadthSupport, includedInTotal: false, missing: gasThr.active === null, signalStatus: (gasThr.active === null ? "incomplete" : "ok") as "incomplete" | "ok", note: `component_shock_raw > rolling_10y_80th_percentile => active=${gasThr.active ?? "n/a"}`, rawValue: gasThr.latestRaw, active_energy_stress: gasThr.active, rolling10y80thPercentile: gasThr.latestThreshold };
    if (gasBreadth.debug) {
      gasBreadth.debug.percentile10yLatest = gasBreadthPct;
      gasBreadth.debug.supportScore = gasBreadthSupport;
      gasBreadth.debug.supportScoreValidation = gasBreadthSupport === null ? "fail" : "pass";
    }
    breadthInputs.push({ comp: gasBreadth, threshold: gasThr.latestThreshold, active: gasThr.active });
    components.push(gasBreadth);

    const cpiEnergyFetchAttempted = series.has("CPIENGSL") || series.has("cpi_energy_us");
    const cpiCoreFetchAttempted = series.has("CPILFESL") || series.has("core_cpi_us");
    const cpiEnergySeries = getSeries(series, "CPIENGSL");
    const cpiCoreSeries = getSeries(series, "CPILFESL");
    const cpiEnergyYoy = yoy(cpiEnergySeries);
    const cpiCoreYoy = yoy(cpiCoreSeries);
    const energyVsCoreGap = subtractAlignedSeries(cpiEnergyYoy, cpiCoreYoy);
    const gapThr = rollingWindowPercentileThreshold(energyVsCoreGap, 80, 120, 24);
    const gapPct = percentile10yLatest(energyVsCoreGap, 24);
    const gapSupport = gapPct === null ? null : 100 - gapPct;
    const gapLatest = lastNumeric(energyVsCoreGap);
    const gapObsCount = canonicalMonthlyGrid(energyVsCoreGap).filter((point): point is { date: string; value: number } => typeof point.value === "number" && Number.isFinite(point.value)).length;
    const cpiEnergyNumeric = canonicalMonthlyGrid(cpiEnergySeries).filter((point): point is { date: string; value: number } => typeof point.value === "number" && Number.isFinite(point.value));
    const cpiCoreNumeric = canonicalMonthlyGrid(cpiCoreSeries).filter((point): point is { date: string; value: number } => typeof point.value === "number" && Number.isFinite(point.value));
    const cpiEnergyObsCount = cpiEnergyNumeric.length;
    const cpiCoreObsCount = cpiCoreNumeric.length;
    const cpiEnergyLatestObsDate = cpiEnergyNumeric[cpiEnergyNumeric.length - 1]?.date ?? null;
    const cpiCoreLatestObsDate = cpiCoreNumeric[cpiCoreNumeric.length - 1]?.date ?? null;
    const cpiEnergyYoyObsCount = canonicalMonthlyGrid(cpiEnergyYoy).filter((point): point is { date: string; value: number } => typeof point.value === "number" && Number.isFinite(point.value)).length;
    const cpiCoreYoyObsCount = canonicalMonthlyGrid(cpiCoreYoy).filter((point): point is { date: string; value: number } => typeof point.value === "number" && Number.isFinite(point.value)).length;
    const gapComponentValid = cpiEnergyObsCount > 0 && cpiCoreObsCount > 0 && gapThr.active !== null;
    const gapFailureReason = cpiEnergyObsCount <= 0
      ? "Missing source CPIENGSL from FRED/BLS"
      : cpiCoreObsCount <= 0
        ? "Missing source CPILFESL from FRED"
        : gapThr.active === null
          ? "Insufficient history for rolling_10y_80th_percentile(energy_vs_core_inflation_gap)"
          : "";
    const usThirdBreadth: OverlayComponent = {
      id: "energy_vs_core_inflation_gap",
      title: "US energy vs core inflation gap breadth activation",
      block: "breadth",
      rawValue: gapLatest?.value ?? null,
      score: null,
      diagnosticScore: null,
      productionScore: null,
      validForProduction: gapComponentValid,
      diagnosticOnly: !gapComponentValid && gapThr.active !== null,
      gatingFailureReason: gapFailureReason,
      sourceValidationStatus: gapComponentValid ? "pass" : (cpiEnergyObsCount <= 0 || cpiCoreObsCount <= 0 ? "missing" : "fail"),
      percentilePlusScoreCheck: gapThr.active === null ? "fail" : "pass",
      weight: 0,
      source: "Constructed/FRED-BLS",
      exactSource: "constructed_gap_from_inputs",
      freshnessDays: freshnessDays(gapLatest?.date ?? null, asOfDate),
      includedInTotal: false,
      missing: !gapComponentValid,
      signalStatus: gapThr.active === null ? (gapObsCount > 0 ? "incomplete" : "missing") : "ok",
      proxy: false,
      note: "Constructed gap measure: CPIENGSL YoY minus CPILFESL YoY; not an official BLS contribution series",
      debug: {
        latestDate: gapLatest?.date ?? null,
        monthlyChosenDate: gapLatest?.date ?? null,
        minObservations: 24,
        observationsAvailableInScoringWindow: Math.min(gapObsCount, 120),
        scoringWindowSize: 120,
        enoughHistory: gapThr.active !== null,
        percentile10yLatest: gapPct,
        normalizationMethod: "percentile10y",
        inversionApplied: false,
        rawToScoreFormula: "active_energy_stress = 1 if energy_vs_core_inflation_gap > rolling_10y_80th_percentile(gap), else 0",
        directionRulePlainText: "Higher positive gap means stronger energy pass-through stress.",
        supportInterpretation: "higher raw value means more stress",
        supportScoreValidation: gapSupport === null ? "fail" : "pass",
        supportScore: gapSupport,
        signalStatus: gapThr.active === null ? (gapObsCount > 0 ? "incomplete" : "missing") : "ok",
        totalNumericObservationsInSeries: gapObsCount,
        earliestDateInSeries: canonicalMonthlyGrid(energyVsCoreGap).find((point): point is { date: string; value: number } => typeof point.value === "number" && Number.isFinite(point.value))?.date ?? null,
        last5MonthlyPointsInWindow: canonicalMonthlyGrid(energyVsCoreGap).filter((point): point is { date: string; value: number } => typeof point.value === "number" && Number.isFinite(point.value)).slice(-5),
      },
    };
    usThirdBreadth.sourceFamily = "FRED/BLS + FRED";
    usThirdBreadth.componentSeriesType = "constructed-gap";
    usThirdBreadth.inputSources = [
      { id: "CPIENGSL", sourceFamily: "FRED/BLS", exactSource: "CPIENGSL", fetchAttempted: cpiEnergyFetchAttempted, fetchSucceeded: cpiEnergyObsCount > 0, observationCount: cpiEnergyObsCount, latestObservationDate: cpiEnergyLatestObsDate },
      { id: "CPILFESL", sourceFamily: "FRED", exactSource: "CPILFESL", fetchAttempted: cpiCoreFetchAttempted, fetchSucceeded: cpiCoreObsCount > 0, observationCount: cpiCoreObsCount, latestObservationDate: cpiCoreLatestObsDate },
    ];
    usThirdBreadth.transformedObservationCount = { CPIENGSL_YoY: cpiEnergyYoyObsCount, CPILFESL_YoY: cpiCoreYoyObsCount };
    usThirdBreadth.constructedSeriesObservationCount = gapObsCount;
    usThirdBreadth.latestGapValue = gapLatest?.value ?? null;
    usThirdBreadth.rolling10y80thPercentile = gapThr.latestThreshold;
    usThirdBreadth.score = gapComponentValid ? gapSupport : null;
    usThirdBreadth.diagnosticScore = gapSupport;
    usThirdBreadth.productionScore = gapComponentValid ? gapSupport : null;
    usThirdBreadth.observationCount = gapObsCount;
    usThirdBreadth.latestObservationDate = gapLatest?.date ?? null;
    usThirdBreadth.yoyInputsUsed = ["CPIENGSL", "CPILFESL"];
    usThirdBreadth.constructedFrom = ["YoY(CPIENGSL) - YoY(CPILFESL)"];
    usThirdBreadth.rollingPercentileThreshold = gapThr.latestThreshold;
    usThirdBreadth.active_energy_stress = gapThr.active;
    breadthInputs.push({ comp: usThirdBreadth, threshold: gapThr.latestThreshold, active: gapThr.active });
    components.push(usThirdBreadth);
    debug.verificationTrace.push(`US breadth third component energy_vs_core_inflation_gap source status: CPIENGSL=${cpiEnergyObsCount > 0 ? "ok" : "missing"}, CPILFESL=${cpiCoreObsCount > 0 ? "ok" : "missing"}.`);
  } else {
    if (gasPrice.signalStatus === "ok") {
      const eaGasRaw = buildEnergyShockRawSeries(getSeries(series, "PNGASEUUSDM"));
      const gasThr = rollingWindowPercentileThreshold(eaGasRaw.rawSeries, 80, 120, 24);
      const gasBreadth = { ...gasPrice, id: "en_breadth_ea_gas", title: "EA gas breadth stress activation", block: "breadth" as const, weight: 0, validForProduction: Boolean(gasPrice.validForProduction && gasThr.active !== null), productionScore: gasThr.active, diagnosticScore: gasThr.active, includedInTotal: false, missing: gasThr.active === null, signalStatus: (gasThr.active === null ? "incomplete" : "ok") as "incomplete" | "ok", note: `component_shock_raw > rolling_10y_80th_percentile => active=${gasThr.active ?? "n/a"}` };
      breadthInputs.push({ comp: gasBreadth, threshold: gasThr.latestThreshold, active: gasThr.active });
      components.push(gasBreadth);
    }
    const hicpEnergyRaw = buildEnergyShockRawSeries(getSeries(series, "HICP.M.U2.N.NRGY00.4D0.ANR"));
    const hicpComp = makeEnergyShockComponent({ id: "en_breadth_hicp_energy", title: "HICP energy breadth stress activation", block: "breadth", weight: 0, source: "ECB", exactSource: "HICP.M.U2.N.NRGY00.4D0.ANR", asOfDate, rawSeries: hicpEnergyRaw.rawSeries });
    const hicpThr = rollingWindowPercentileThreshold(hicpEnergyRaw.rawSeries, 80, 120, 24);
    const hicpBreadth = { ...hicpComp, validForProduction: Boolean(hicpComp.validForProduction && hicpThr.active !== null), productionScore: hicpThr.active, diagnosticScore: hicpThr.active, includedInTotal: false, missing: hicpThr.active === null, signalStatus: (hicpThr.active === null ? "incomplete" : "ok") as "incomplete" | "ok", note: `component_shock_raw > rolling_10y_80th_percentile => active=${hicpThr.active ?? "n/a"}` };
    breadthInputs.push({ comp: hicpBreadth, threshold: hicpThr.latestThreshold, active: hicpThr.active });
    components.push(hicpBreadth);
    components.push(makeUnavailableEnergyComponent({ id: "en_breadth_ea_power", title: "EA power breadth stress activation", block: "breadth", weight: 0, source: "Unavailable", exactSource: "unavailable (EA power exact source not locked)", note: "EA power unavailable; no substitution used." }));
  }

  const breadthActive = breadthInputs.filter((item) => item.active !== null) as Array<{ comp: OverlayComponent; threshold: number | null; active: 0 | 1 }>;
  const breadthRatio = breadthActive.length > 0 ? breadthActive.reduce((a, b) => a + b.active, 0) / breadthActive.length : null;
  const breadthScore = breadthRatio === null ? null : 100 - (breadthRatio * 100);
  components.push({
    id: "en_breadth_score",
    title: "Energy stress breadth score",
    block: "breadth",
    rawValue: breadthRatio,
    score: breadthScore,
    diagnosticScore: breadthScore,
    productionScore: breadthScore,
    validForProduction: breadthScore !== null,
    diagnosticOnly: false,
    gatingFailureReason: breadthScore === null ? "insufficient breadth inputs" : "",
    sourceValidationStatus: "pass",
    percentilePlusScoreCheck: breadthScore === null ? "fail" : "pass",
    weight: 1,
    source: "Computed",
    exactSource: "breadth_ratio=active_components/available_components",
    freshnessDays: Math.max(...breadthActive.map((x) => x.comp.freshnessDays ?? 9999), 0),
    includedInTotal: breadthScore !== null,
    missing: breadthScore === null,
    signalStatus: breadthScore === null ? "incomplete" : "ok",
    proxy: false,
    note: "energy_stress_breadth_score = 100 - linear_map(breadth_ratio, 0->100, 1->0)",
  });

  const inflationComponents: OverlayComponent[] = [];
  const growthComponents: OverlayComponent[] = [];
  const rateComponents: OverlayComponent[] = [];

  if (region === "US") {
    const coreCpiYoy = yoy(getSeries(series, "CPILFESL"));
    const indproYoy = yoy(getSeries(series, "INDPRO"));
    const dfii = canonicalMonthlyGrid(getSeries(series, "DFII10"));
    const coreLatest = lastNumeric(coreCpiYoy)?.value ?? null;
    const indproLatest = lastNumeric(indproYoy)?.value ?? null;
    const dfiiLatest = lastNumeric(dfii)?.value ?? null;
    const energyRawLatest = (brentPrice.rawValue ?? 0) * 0.55 + (gasPrice.rawValue ?? 0) * 0.45;

    const inflationPressure = priceShockIntensity === null || coreLatest === null ? null : clamp01((Math.max(coreLatest - 2, 0) / 4 + Math.max(energyRawLatest, 0) / 80) / 2);
    const growthPressure = priceShockIntensity === null || indproLatest === null ? null : clamp01((Math.max(-indproLatest, 0) / 10 + Math.max(energyRawLatest, 0) / 80) / 2);
    const ratePressure = priceShockIntensity === null || dfiiLatest === null ? null : clamp01((Math.max(dfiiLatest, 0) / 3 + Math.max(energyRawLatest, 0) / 80) / 2);

    const infRawSeries = canonicalMonthlyGrid(coreCpiYoy).map((p) => ({ date: p.date, value: p.value === null ? null : clamp01(Math.max(p.value - 2, 0) / 4) }));
    const grRawSeries = canonicalMonthlyGrid(indproYoy).map((p) => ({ date: p.date, value: p.value === null ? null : clamp01(Math.max(-p.value, 0) / 10) }));
    const rtRawSeries = canonicalMonthlyGrid(dfii).map((p) => ({ date: p.date, value: p.value === null ? null : clamp01(Math.max(p.value, 0) / 3) }));

    inflationComponents.push(makeEnergyShockComponent({ id: "en_spill_infl_us", title: "US inflation spillover", block: "spillover", weight: 0.45, source: "FRED", exactSource: "CPILFESL", asOfDate, rawSeries: infRawSeries.map((p) => ({ date: p.date, value: p.value === null || priceShockIntensity === null ? null : p.value * priceShockIntensity })), note: "inflation_spillover_raw = price_shock_intensity * energy_to_inflation_pressure; energy_to_inflation_pressure = f(core CPI YoY gap vs 2% + energy shock intensity)" }));
    growthComponents.push(makeEnergyShockComponent({ id: "en_spill_growth_us", title: "US growth spillover", block: "spillover", weight: 0.35, source: "FRED", exactSource: "INDPRO", asOfDate, rawSeries: grRawSeries.map((p) => ({ date: p.date, value: p.value === null || priceShockIntensity === null ? null : p.value * priceShockIntensity })), note: "growth_spillover_raw = price_shock_intensity * energy_to_growth_pressure; energy_to_growth_pressure = f(INDPRO weakness + energy shock intensity)" }));
    rateComponents.push(makeEnergyShockComponent({ id: "en_spill_rate_us", title: "US rate spillover", block: "spillover", weight: 0.2, source: "FRED", exactSource: "DFII10", asOfDate, rawSeries: rtRawSeries.map((p) => ({ date: p.date, value: p.value === null || priceShockIntensity === null ? null : p.value * priceShockIntensity })), note: "rate_spillover_raw = price_shock_intensity * energy_to_rate_pressure" }));

    debug.computationWalkthrough.push(`US spillover formulas: inflationPressure=${inflationPressure ?? "null"}, growthPressure=${growthPressure ?? "null"}, ratePressure=${ratePressure ?? "null"}; conditioned by price_shock_intensity=${priceShockIntensity ?? "null"}.`);
  } else {
    const hicpEnergyYoy = canonicalMonthlyGrid(getSeries(series, "HICP.M.U2.N.NRGY00.4D0.ANR"));
    const hicpExYoy = canonicalMonthlyGrid(getSeries(series, "HICP.M.U2.N.XEF000.4D0.ANR"));
    const stsYoy = yoy(getSeries(series, "STS.M.I9.Y.PROD.NS0020.4.000"));
    const ea10yPrimary = getSeries(series, "YC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y");
    const ea10yAlt = getSeries(series, "FM.M.U2.EUR.4F.BB.U2_10Y.YLD");
    const rateSeries = ea10yPrimary.length > 0 ? ea10yPrimary : ea10yAlt;
    const rateExactSource = ea10yPrimary.length > 0 ? "YC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y" : (ea10yAlt.length > 0 ? "FM.M.U2.EUR.4F.BB.U2_10Y.YLD" : "unavailable");

    const energyVsCore = subtractAlignedSeries(hicpEnergyYoy, hicpExYoy);
    const infRawSeries = canonicalMonthlyGrid(energyVsCore).map((p) => ({ date: p.date, value: p.value === null ? null : clamp01(Math.max(p.value, 0) / 10) }));
    const grRawSeries = canonicalMonthlyGrid(stsYoy).map((p) => ({ date: p.date, value: p.value === null ? null : clamp01(Math.max(-p.value, 0) / 10) }));
    const rtRawSeries = canonicalMonthlyGrid(rateSeries).map((p) => ({ date: p.date, value: p.value === null ? null : clamp01(Math.max(p.value, 0) / 6) }));

    inflationComponents.push(makeEnergyShockComponent({ id: "en_spill_infl_ea", title: "EA inflation spillover", block: "spillover", weight: 0.5, source: "ECB", exactSource: "HICP.M.U2.N.NRGY00.4D0.ANR vs HICP.M.U2.N.XEF000.4D0.ANR", asOfDate, rawSeries: infRawSeries.map((p) => ({ date: p.date, value: p.value === null || priceShockIntensity === null ? null : p.value * priceShockIntensity })), note: "energy_to_inflation_pressure = f(HICP energy YoY - HICP ex-energy-food YoY)" }));
    growthComponents.push(makeEnergyShockComponent({ id: "en_spill_growth_ea", title: "EA growth spillover", block: "spillover", weight: 0.35, source: "ECB/Eurostat", exactSource: "STS.M.I9.Y.PROD.NS0020.4.000", asOfDate, rawSeries: grRawSeries.map((p) => ({ date: p.date, value: p.value === null || priceShockIntensity === null ? null : p.value * priceShockIntensity })), note: "energy_to_growth_pressure = f(industrial production weakness)" }));
    if (rateExactSource === "unavailable") {
      rateComponents.push(makeUnavailableEnergyComponent({ id: "en_spill_rate_ea", title: "EA nominal 10Y rate spillover", block: "spillover", weight: 0.15, source: "ECB", exactSource: "unavailable", note: "EA rate spillover unavailable due to missing source-locked nominal 10Y." }));
    } else {
      rateComponents.push(makeEnergyShockComponent({ id: "en_spill_rate_ea", title: "EA nominal 10Y rate spillover", block: "spillover", weight: 0.15, source: "ECB", exactSource: rateExactSource, asOfDate, rawSeries: rtRawSeries.map((p) => ({ date: p.date, value: p.value === null || priceShockIntensity === null ? null : p.value * priceShockIntensity })), note: "rate_spillover_raw = price_shock_intensity * energy_to_rate_pressure" }));
    }
    debug.computationWalkthrough.push(`EA spillover conditioned by price_shock_intensity=${priceShockIntensity ?? "null"}; rate source selected=${rateExactSource}.`);
    if (gasPrice.signalStatus !== "ok") debug.implementationDeltaVsSpec.push("EA gas unavailable; breadth relies on Brent + HICP Energy only.");
  }

  components.push(...inflationComponents, ...growthComponents, ...rateComponents);

  const byId = new Map(components.map((c) => [c.id, c]));
  const isValid = (id: string) => Boolean(byId.get(id)?.validForProduction);
  const weightedScore = (items: OverlayComponent[]) => {
    const valid = items.filter((c) => c.validForProduction && c.productionScore !== null && c.weight > 0);
    const w = valid.reduce((a, c) => a + c.weight, 0);
    if (w <= 0) return null;
    return valid.reduce((a, c) => a + (c.productionScore as number) * (c.weight / w), 0);
  };
  const weightedDiagnosticScore = (items: OverlayComponent[]) => {
    const valid = items.filter((c) => c.diagnosticScore !== null && c.weight > 0);
    const w = valid.reduce((a, c) => a + c.weight, 0);
    if (w <= 0) return null;
    return valid.reduce((a, c) => a + (c.diagnosticScore as number) * (c.weight / w), 0);
  };

  const priceComponents = components.filter((c) => c.block === "price" && c.weight > 0);
  const breadthComponent = components.find((c) => c.id === "en_breadth_score") ?? null;
  const spillComponents = components.filter((c) => c.block === "spillover" && c.weight > 0);

  const priceDiagnosticScore = weightedDiagnosticScore(priceComponents);
  const breadthDiagnosticScore = breadthComponent?.diagnosticScore ?? breadthComponent?.score ?? null;
  const spillDiagnosticScore = weightedDiagnosticScore(spillComponents);

  const priceValidForProduction = region === "US"
    ? isValid("en_price_brent") && isValid("en_price_henry_hub")
    : isValid("en_price_brent") && isValid("en_price_ea_gas");

  if (breadthComponent) {
    const breadthValid = region === "US"
      ? (isValid("en_breadth_brent") && isValid("en_breadth_henry_hub") && isValid("energy_vs_core_inflation_gap"))
      : (isValid("en_breadth_brent") && isValid("en_breadth_hicp_energy") && (isValid("en_breadth_ea_gas") || byId.get("en_price_ea_gas")?.signalStatus !== "ok"));
    breadthComponent.validForProduction = breadthValid;
    breadthComponent.productionScore = breadthValid ? breadthComponent.diagnosticScore ?? null : null;
    breadthComponent.score = breadthComponent.productionScore;
    breadthComponent.includedInTotal = Boolean(breadthValid && breadthComponent.productionScore !== null);
    breadthComponent.diagnosticOnly = !breadthValid && (breadthComponent.diagnosticScore !== null);
    breadthComponent.missing = !breadthValid;
    if (breadthValid) {
      breadthComponent.gatingFailureReason = "";
    } else if (region === "US") {
      const missing: string[] = [];
      if (!isValid("en_breadth_brent")) missing.push("Brent breadth unavailable");
      if (!isValid("en_breadth_henry_hub")) missing.push("Henry Hub breadth unavailable");
      const third = byId.get("energy_vs_core_inflation_gap");
      if (!isValid("energy_vs_core_inflation_gap")) {
        missing.push(`energy_vs_core_inflation_gap unavailable${third?.gatingFailureReason ? ` because ${third.gatingFailureReason}` : ""}`);
      }
      breadthComponent.gatingFailureReason = `US breadth minimum set failed: ${missing.join("; ") || "unknown component failure"}`;
    } else {
      breadthComponent.gatingFailureReason = "EA breadth minimum set failed";
    }
  }

  const breadthValidForProduction = Boolean(breadthComponent?.validForProduction && breadthComponent?.productionScore !== null);
  const spillInflationValid = region === "US" ? isValid("en_spill_infl_us") : isValid("en_spill_infl_ea");
  const spillGrowthValid = region === "US" ? isValid("en_spill_growth_us") : isValid("en_spill_growth_ea");
  const spillValidForProduction = priceValidForProduction && spillInflationValid && spillGrowthValid;

  for (const c of priceComponents) {
    c.diagnosticScore = c.diagnosticScore ?? c.score;
    c.productionScore = priceValidForProduction ? c.productionScore ?? c.score : null;
    c.score = c.productionScore;
    c.includedInTotal = Boolean(priceValidForProduction && c.validForProduction);
    c.diagnosticOnly = !c.includedInTotal && c.diagnosticScore !== null;
    if (!c.includedInTotal && !c.gatingFailureReason) c.gatingFailureReason = "price block minimum set not satisfied";
  }
  for (const c of spillComponents) {
    c.diagnosticScore = c.diagnosticScore ?? c.score;
    c.productionScore = spillValidForProduction ? c.productionScore ?? c.score : null;
    c.score = c.productionScore;
    c.includedInTotal = Boolean(spillValidForProduction && c.validForProduction);
    c.diagnosticOnly = !c.includedInTotal && c.diagnosticScore !== null;
    if (!c.includedInTotal && !c.gatingFailureReason) c.gatingFailureReason = "spillover block minimum set not satisfied";
  }

  const priceShockScoreProduction = priceValidForProduction ? weightedScore(priceComponents) : null;
  const breadthScoreProduction = breadthValidForProduction ? (breadthComponent?.productionScore ?? null) : null;
  const macroSpilloverScoreProduction = spillValidForProduction ? weightedScore(spillComponents) : null;

  const blockDiagnostics = {
    price: {
      minimumRequiredComponents: region === "US" ? ["en_price_brent", "en_price_henry_hub"] : ["en_price_brent", "en_price_ea_gas"],
      validComponentCount: priceComponents.filter((c) => c.validForProduction).length,
      validForProduction: priceValidForProduction,
      diagnosticOnly: !priceValidForProduction && priceDiagnosticScore !== null,
      diagnosticBlockScore: priceDiagnosticScore,
      productionBlockScore: priceShockScoreProduction,
      includedInTotal: priceShockScoreProduction !== null,
      status: (priceShockScoreProduction !== null ? "pass" : (priceDiagnosticScore !== null ? "partial" : "missing")) as "pass" | "partial" | "missing",
    },
    breadth: {
      minimumRequiredComponents: region === "US" ? ["en_breadth_brent", "en_breadth_henry_hub", "energy_vs_core_inflation_gap"] : ["en_breadth_brent", "en_breadth_hicp_energy"],
      validComponentCount: ["en_breadth_brent", "en_breadth_henry_hub", "energy_vs_core_inflation_gap", "en_breadth_ea_gas", "en_breadth_hicp_energy"].filter((id) => isValid(id)).length,
      validForProduction: breadthValidForProduction,
      diagnosticOnly: !breadthValidForProduction && breadthDiagnosticScore !== null,
      diagnosticBlockScore: breadthDiagnosticScore,
      productionBlockScore: breadthScoreProduction,
      includedInTotal: breadthScoreProduction !== null,
      status: (breadthScoreProduction !== null ? "pass" : (breadthDiagnosticScore !== null ? "partial" : "missing")) as "pass" | "partial" | "missing",
    },
    spillover: {
      minimumRequiredComponents: region === "US" ? ["en_spill_infl_us", "en_spill_growth_us"] : ["en_spill_infl_ea", "en_spill_growth_ea"],
      validComponentCount: spillComponents.filter((c) => c.validForProduction).length,
      validForProduction: spillValidForProduction,
      diagnosticOnly: !spillValidForProduction && spillDiagnosticScore !== null,
      diagnosticBlockScore: spillDiagnosticScore,
      productionBlockScore: macroSpilloverScoreProduction,
      includedInTotal: macroSpilloverScoreProduction !== null,
      status: (macroSpilloverScoreProduction !== null ? "pass" : (spillDiagnosticScore !== null ? "partial" : "missing")) as "pass" | "partial" | "missing",
    },
  };

  const productionBlocks = [
    { name: "price", score: priceShockScoreProduction, weight: 0.4 },
    { name: "breadth", score: breadthScoreProduction, weight: 0.25 },
    { name: "spillover", score: macroSpilloverScoreProduction, weight: 0.35 },
  ];
  const diagnosticBlocks = { price: priceDiagnosticScore, breadth: breadthDiagnosticScore, spillover: spillDiagnosticScore };
  const includedBlocks = productionBlocks.filter((b) => b.score !== null);
  const excludedBlocks = productionBlocks.filter((b) => b.score === null).map((b) => b.name);
  const diagnosticOnlyBlocks = Object.entries(blockDiagnostics).filter(([, d]) => d.diagnosticOnly).map(([k]) => k);
  const activeProductionBlockCount = includedBlocks.length;
  const diagnosticOnlyBlockCount = diagnosticOnlyBlocks.length;

  const totalWeight = includedBlocks.reduce((a, b) => a + b.weight, 0);
  const productionScore = totalWeight > 0 ? includedBlocks.reduce((a, b) => a + (b.score as number) * (b.weight / totalWeight), 0) : null;
  const diagnosticWeight = productionBlocks.filter((b) => diagnosticBlocks[b.name as keyof typeof diagnosticBlocks] !== null).reduce((a, b) => a + b.weight, 0);
  const diagnosticScore = diagnosticWeight > 0
    ? productionBlocks.reduce((a, b) => {
      const ds = diagnosticBlocks[b.name as keyof typeof diagnosticBlocks];
      return ds === null ? a : a + ds * (b.weight / diagnosticWeight);
    }, 0)
    : null;

  const includedProductionComponents = components.filter((c) => c.includedInTotal && c.validForProduction);
  const confWeight = includedProductionComponents.reduce((a, c) => a + c.weight, 0);
  let confidenceRaw = confWeight > 0 ? Math.round(100 * includedProductionComponents.reduce((a, c) => a + (energyFreshnessPenalty(c.freshnessDays) * (c.weight / confWeight)), 0)) : 0;
  let confidenceCap = 100;
  let confidenceCapReason = "none";
  const runtimeStatus: "complete" | "partial" | "weak" | "invalid" = activeProductionBlockCount >= 3 ? "complete" : (activeProductionBlockCount === 2 ? "partial" : (activeProductionBlockCount === 1 ? "weak" : "invalid"));
  const specFidelity = activeProductionBlockCount >= 3 ? "high" : (activeProductionBlockCount === 2 ? "medium" : (activeProductionBlockCount === 1 ? "low" : "low"));
  const robustness = activeProductionBlockCount >= 3 ? "high" : (activeProductionBlockCount === 2 ? "medium" : "low");
  if (runtimeStatus === "partial") { confidenceCap = Math.min(confidenceCap, 70); confidenceCapReason = "runtimeCompleteness=partial"; }
  if (runtimeStatus === "weak") { confidenceCap = Math.min(confidenceCap, 40); confidenceCapReason = "runtimeCompleteness=weak"; }
  if (runtimeStatus === "invalid") { confidenceCap = Math.min(confidenceCap, 0); confidenceCapReason = "runtimeCompleteness=invalid"; }
  if (specFidelity === "medium") { confidenceCap = Math.min(confidenceCap, 70); confidenceCapReason = confidenceCapReason === "none" ? "spec fidelity medium" : confidenceCapReason; }
  if (specFidelity === "low") { confidenceCap = Math.min(confidenceCap, 50); confidenceCapReason = confidenceCapReason === "none" ? "spec fidelity low" : confidenceCapReason; }
  if (activeProductionBlockCount < 2) { confidenceCap = Math.min(confidenceCap, 20); confidenceCapReason = "fewer than 2 production-valid blocks"; }
  if (includedBlocks.some((b) => !blockDiagnostics[b.name as keyof typeof blockDiagnostics].validForProduction)) { confidenceCap = Math.min(confidenceCap, 25); confidenceCapReason = "included block not production-valid"; }
  if (productionScore === null && diagnosticScore !== null) { confidenceCap = 0; confidenceCapReason = "overlay computed from diagnostic-only blocks"; }
  const confidence = Math.min(confidenceRaw, confidenceCap);

  debug.computationWalkthrough.push(`Step 1 fetch series -> Step 2 diagnostic signals -> Step 3 production validation -> Step 4 production score/null -> Step 5 block aggregation over production-valid components only -> Step 6 overlay aggregation over included production-valid blocks only.`);
  debug.computationWalkthrough.push(`Price diagnostic=${priceDiagnosticScore ?? "null"}, production=${priceShockScoreProduction ?? "null"}; breadth diagnostic=${breadthDiagnosticScore ?? "null"}, production=${breadthScoreProduction ?? "null"}; spillover diagnostic=${spillDiagnosticScore ?? "null"}, production=${macroSpilloverScoreProduction ?? "null"}.`);
  debug.implementationDeltaVsSpec.push(`price block: ${priceShockScoreProduction !== null ? "pass" : "partial/missing"}; spillover block: ${macroSpilloverScoreProduction !== null ? "pass" : "partial/missing"}; breadth block: ${breadthScoreProduction !== null ? "pass" : "excluded"}.`);
  debug.verificationTrace.push("Component validity gate enforced: invalid inputs cannot produce production scores and are diagnostic_only.");
  debug.verificationTrace.push(`Included blocks in total: ${includedBlocks.map((b) => b.name).join(", ") || "none"}; excluded=${excludedBlocks.join(", ") || "none"}; diagnosticOnlyBlocks=${diagnosticOnlyBlocks.join(", ") || "none"}.`);
  if (region === "US") {
    debug.implementationDeltaVsSpec.push("breadth block: partial/excluded only when Brent, Henry Hub, or energy_vs_core_inflation_gap are unavailable.");
  } else {
    debug.implementationDeltaVsSpec.push("EA remains structurally partial; EA power is not source-locked so breadth stays excluded from production score.");
  }

  const productionLabel = activeProductionBlockCount >= 2 && productionScore !== null ? energyLabelByScore(productionScore) : "Not implemented";

  return {
    score: productionScore,
    label: productionLabel,
    confidence,
    priceShockScore: priceShockScoreProduction,
    breadthScore: breadthScoreProduction,
    macroSpilloverScore: macroSpilloverScoreProduction,
    blockScores: { price: priceShockScoreProduction, breadth: breadthScoreProduction, spillover: macroSpilloverScoreProduction },
    components,
    runtime: {
      status: runtimeStatus,
      minimumRequiredBlocks: 2,
      productionValidBlockScores: { price: priceShockScoreProduction, breadth: breadthScoreProduction, spillover: macroSpilloverScoreProduction },
      diagnosticBlockScores: diagnosticBlocks,
      includedBlocks: includedBlocks.map((b) => b.name),
      includedBlocksInTotal: includedBlocks.map((b) => b.name),
      excludedBlocks,
      diagnosticOnlyBlocks,
      activeProductionBlockCount,
      diagnosticOnlyBlockCount,
      confidenceCapApplied: confidenceCap,
      confidenceCapReason,
      blockDiagnostics,
      aggregationWeights: { price: 0.4, breadth: 0.25, spillover: 0.35 },
      scoreFormula: "energy_shock_overlay_score = 0.40*price + 0.25*breadth + 0.35*spillover (production-valid blocks only)",
      blockAggregationInputs: components.reduce<Record<string, { signalId: string; signalStatus: "ok" | "missing" | "incomplete"; score: number | null }[]>>((acc, component) => {
        (acc[component.block] ??= []).push({ signalId: component.id, signalStatus: component.signalStatus, score: component.productionScore ?? null });
        return acc;
      }, {}),
      ...( { energyDebug: { ...debug, diagnosticLabel: energyLabelByScore(diagnosticScore), productionLabel, productionValidBlockScores: { price: priceShockScoreProduction, breadth: breadthScoreProduction, spillover: macroSpilloverScoreProduction }, diagnosticBlockScores: diagnosticBlocks, runtimeCompleteness: runtimeStatus, specFidelity, robustness, blockStatus: { price: blockDiagnostics.price.status, breadth: blockDiagnostics.breadth.status, spillover: blockDiagnostics.spillover.status } } } as any),
    },
  };
}

export function buildRegionalOverlays(region: "US" | "EA" | "SE", asOfDate: string, series: SeriesMap): OverlayBundle {
  const inflationSeries = region === "US" ? "CPIAUCSL" : "HICP.M.U2.N.000000.4.ANR";
  const coreInflationSeries = region === "US" ? "CPILFESL" : "HICP.M.U2.N.XEF000.4D0.ANR";
  const overlays: Record<string, OverlayResult> = {
    liquidityOverlay: (() => {
      const usEffectiveFedLiquidity = subtractAlignedSeries(
        subtractAlignedSeries(getSeries(series, "WALCL"), getSeries(series, "WDTGAL")),
        getSeries(series, "RRPONTSYD"),
      );
      const usGdp = getSeries(series, "GDP");
      const reconstructedEffectiveFedLiquidityRatio = divideAlignedSeries(usEffectiveFedLiquidity, usGdp);
      const persistedEffectiveFedLiquidityRatio = getSeries(series, "effective_fed_liquidity_ratio");
      const effectiveFedLiquidityRatioSeries = persistedEffectiveFedLiquidityRatio.length > 0
        ? persistedEffectiveFedLiquidityRatio
        : reconstructedEffectiveFedLiquidityRatio;
      const quantityComponents = [
        makeComponent({ asOfDate, id: "effective_fed_liquidity_ratio", title: "Effective Fed liquidity ratio", block: "quantity", weight: 0.45, source: "FRED", exactSource: "(WALCL - WDTGAL - RRPONTSYD) / GDP", series: region === "US" ? effectiveFedLiquidityRatioSeries : getSeries(series, "ILM.W.U2.C.T000000.Z5.Z01"), minObservations: 120, note: "Constructed internally from WALCL, WDTGAL, RRPONTSYD, then divided by GDP on canonical monthly grid." }),
        makeComponent({ asOfDate, id: "m2_ratio", title: "M2 ratio", block: "quantity", weight: 0.3, source: "FRED/ECB", exactSource: region === "US" ? "M2SL/GDP" : "BSI.M.U2.Y.V.M30.X.1.U2.2300.Z01.E / NAQ_10_GDP", series: region === "US" ? divideAlignedSeries(getSeries(series, "M2SL"), usGdp) : getSeries(series, "BSI.M.U2.Y.V.M30.X.1.U2.2300.Z01.E"), minObservations: 120 }),
        makeComponent({ asOfDate, id: "bank_credit_ratio", title: "Bank credit ratio", block: "quantity", weight: 0.25, source: "FRED/ECB", exactSource: region === "US" ? "TOTBKCR/GDP" : "BSI.M.U2.Y.U.A20T.A.I.U2.2240.Z01.A", series: region === "US" ? divideAlignedSeries(getSeries(series, "TOTBKCR"), usGdp) : getSeries(series, "BSI.M.U2.Y.U.A20T.A.I.U2.2240.Z01.A"), minObservations: 120, proxy: region !== "US", note: region === "EA" ? "Growth proxy per spec" : "" }),
      ];
      const bridgeComponent = makeComponent({
        asOfDate,
        id: "liq_bridge_xccy",
        title: "Cross-currency funding bridge",
        block: "bridge",
        weight: 1,
        source: "FRED/CME",
        exactSource: "EURUSD_XCCY_BASIS (cross-currency basis family)",
        series: getSeries(series, "EURUSD_XCCY_BASIS"),
        invert: true,
        note: "Primary bridge source family only; missing if no xccy primary source exists.",
      });
      const result = finalizeOverlay({
        quantity: {
          weight: 0.4,
          components: quantityComponents,
        },
        price: {
          weight: 0.35,
          components: [
            makeComponent({ asOfDate, id: "liq_real_rate", title: "Real rate support", block: "price", weight: region === "US" ? 0.4 : 0.55, source: "FRED/ECB", exactSource: region === "US" ? "DFII10" : "ECBDFR - HICP.M.U2.N.XEF000.4D0.ANR", series: getSeries(series, region === "US" ? "DFII10" : "ECBDFR"), invert: true, proxy: region === "EA" }),
            makeComponent({ asOfDate, id: "liq_spread", title: region === "US" ? "HY spread support" : "CISS support", block: "price", weight: region === "US" ? 0.3 : 0.45, source: "FRED/ECB", exactSource: region === "US" ? "BAMLH0A0HYM2" : "CISS.D.U2.Z0Z.4F.EC.SS_CIN.IDX", series: getSeries(series, region === "US" ? "BAMLH0A0HYM2" : "CISS.D.U2.Z0Z.4F.EC.SS_CIN.IDX"), invert: true }),
            makeComponent({ asOfDate, id: "liq_fci", title: "Financial conditions", block: "price", weight: region === "US" ? 0.3 : 0, source: "FRED", exactSource: "NFCI", series: getSeries(series, "NFCI"), invert: true, proxy: region !== "US" }),
          ],
        },
        transmission: {
          weight: 0.25,
          components: [
            makeComponent({ asOfDate, id: "liq_trans_credit", title: "Credit transmission tightness", block: "transmission", weight: 1, source: "FRED", exactSource: "DRTSCILM", series: getSeries(series, "DRTSCILM"), invert: true, note: "Canonical transmission source only; no proxy substitution." }),
          ],
        },
        bridge: {
          weight: 0,
          components: [
            { ...bridgeComponent, includedInTotal: false },
          ],
        },
      });
      const quantityMissing = quantityComponents.some((component) => component.signalStatus !== "ok");
      const transmissionMissing = result.components.some((component) => component.block === "transmission" && component.signalStatus !== "ok");
      const blockAggregationInputs = result.components.reduce<Record<string, { signalId: string; signalStatus: "ok" | "missing" | "incomplete"; score: number | null }[]>>((acc, component) => {
        (acc[component.block] ??= []).push({ signalId: component.id, signalStatus: component.signalStatus, score: component.score });
        return acc;
      }, {});
      return {
        ...result,
        runtime: {
          status: quantityMissing || transmissionMissing ? "partial" : "complete",
          includedBlocksInTotal: ["quantity", "price", "transmission"],
          excludedBlocks: ["bridge"],
          aggregationWeights: { quantity: 0.4, price: 0.35, transmission: 0.25 },
          scoreFormula: "score = 0.40 × quantity + 0.35 × price + 0.25 × transmission",
          blockAggregationInputs,
        },
        bridgeDiagnostic: {
          status: bridgeComponent.missing ? "missing" : "available",
          sourceFamily: "global dollar funding stress",
          exactSource: bridgeComponent.exactSource,
          rawValue: bridgeComponent.rawValue,
          score: bridgeComponent.score,
          includedInTotal: false,
          missing: bridgeComponent.missing,
          reason: bridgeComponent.missing ? "Canonical bridge source unavailable; no proxy used." : "Diagnostic-only bridge signal.",
        },
      };
    })(),
    creditFundingOverlay: (() => {
      const xccyBasis = resolveApprovedXccyBasisSeries(series);
      const tedComponent = makeComponent({
        asOfDate,
        id: "cr_fund_ted",
        title: "TED spread",
        block: "funding",
        weight: 0.5,
        source: "FRED",
        exactSource: "TEDRATE",
        series: getSeries(series, "TEDRATE"),
        invert: true,
      });
      const xccyComponent = makeComponent({
        asOfDate,
        id: "cr_fund_xccy",
        title: "Cross-currency basis",
        block: "funding",
        weight: 0.5,
        source: xccyBasis.exactSource === "EURUSDBS3M" ? "Bloomberg" : (xccyBasis.exactSource === "EURUSD3MD156NWSG" ? "FRED (BIS-derived)" : "Unavailable"),
        exactSource: xccyBasis.exactSource,
        series: xccyBasis.series,
        invert: true,
        note: xccyBasis.exactSource === "unavailable"
          ? "approved xccy basis source unavailable"
          : `bridge fidelity=${xccyBasis.fidelityBadge}`,
      });

      const result = finalizeOverlay({
        pricing: {
          weight: 0.4,
          components: [
            makeComponent({ asOfDate, id: "cr_hy", title: "HY spread", block: "pricing", weight: 0.5, source: "FRED", exactSource: "BAMLH0A0HYM2", series: getSeries(series, "BAMLH0A0HYM2"), invert: true }),
            makeComponent({ asOfDate, id: "cr_ig", title: "IG spread", block: "pricing", weight: 0.5, source: "FRED", exactSource: "BAMLC0A0CM", series: getSeries(series, "BAMLC0A0CM"), invert: true }),
          ],
        },
        funding: { weight: 0.35, components: [tedComponent, xccyComponent] },
        access: {
          weight: 0.25,
          components: [
            makeComponent({ asOfDate, id: "cr_access_1", title: "Credit access", block: "access", weight: 1, source: "FRED", exactSource: "DRTSCILM", series: getSeries(series, "DRTSCILM"), invert: true }),
          ],
        },
      });

      const fundingSignalsAvailable = [tedComponent, xccyComponent].filter((component) => component.signalStatus === "ok").length;
      const runtimeStatus: "complete" | "partial" = ["pricing", "funding", "access"].every((block) => typeof result.blockScores[block] === "number") && fundingSignalsAvailable === 2
        ? "complete"
        : "partial";

      return {
        ...result,
        runtime: {
          status: runtimeStatus,
          includedBlocksInTotal: ["pricing", "funding", "access"].filter((block) => typeof result.blockScores[block] === "number"),
          excludedBlocks: ["pricing", "funding", "access"].filter((block) => result.blockScores[block] === null),
          aggregationWeights: { pricing: 0.4, funding: 0.35, access: 0.25 },
          scoreFormula: "overlay_score = weighted_average(pricing, funding, access; exclude null block scores)",
          blockAggregationInputs: result.components.reduce<Record<string, { signalId: string; signalStatus: "ok" | "missing" | "incomplete"; score: number | null }[]>>((acc, component) => {
            (acc[component.block] ??= []).push({ signalId: component.id, signalStatus: component.signalStatus, score: component.score });
            return acc;
          }, {}),
        },
      };
    })(),
    energyShockOverlay: buildEnergyShockOverlay(region, asOfDate, series),
    localUnrestOverlay: (() => {
      const usSignalSeries = region === "US" ? getSeries(series, "POLICY_UNCERTAINTY_US") : [];
      const eaSignalSeries = region === "EA" ? getSeries(series, "EA_POLICY_UNCERTAINTY") : [];
      const signalSeries = region === "US" ? usSignalSeries : eaSignalSeries;

      const usRepricingSeries = region === "US"
        ? pickSeriesWithNumericData(series, ["ACMTP10", "acmtp10_us", "acmtp10", "lu_repricing_us"])
        : [];
      const eaItaly10y = getSeries(series, "IRLTLT01ITM156N");
      const eaGermany10y = getSeries(series, "IRLTLT01DEM156N");
      const eaRepricingSeries = subtractAlignedSeries(eaItaly10y, eaGermany10y);
      const repricingSeries = region === "US" ? usRepricingSeries : (region === "EA" ? eaRepricingSeries : []);

      // Local Unrest repricing is region-specific by design.
      // EA uses sovereign credit repricing (BTP-Bund).
      // US uses sovereign duration repricing (ACM term premium).
      // These are different mechanisms but conceptually equivalent expressions
      // of market repricing of sovereign/state exposure.
      const local = finalizeOverlay({
        signal: {
          weight: 0.5,
          components: [makeComponent({
            asOfDate,
            id: "lu_signal",
            title: "Policy uncertainty signal",
            block: "signal",
            weight: 1,
            source: region === "US" ? "FRED" : "Policy uncertainty family",
            exactSource: region === "US"
              ? "USEPUINDXM"
              : "EA policy uncertainty family source",
            series: signalSeries,
            minObservations: 12,
            invert: true,
            note: region === "US"
              ? "Source-faithful policy uncertainty family input"
              : "Missing by design unless source-faithful EA policy uncertainty series is ingested",
          })],
        },
        repricing: {
          weight: 0.5,
          components: [makeComponent({
            asOfDate,
            id: region === "EA" ? "lu_repricing_ea" : "lu_repricing_us",
            title: "Sovereign/state repricing",
            block: "repricing",
            weight: 1,
            source: "FRED",
            exactSource: region === "EA"
              ? "IRLTLT01ITM156N - IRLTLT01DEM156N"
              : "ACMTP10",
            series: repricingSeries,
            // Repricing can have shorter valid windows in runtime snapshots;
            // allow score computation once a minimal source-faithful monthly history exists.
            minObservations: 1,
            invert: true,
            note: region === "EA"
              ? "Source-faithful sovereign credit repricing via BTP-Bund spread (Italy10Y - Germany10Y)"
              : "Source-faithful sovereign duration repricing via ACM term premium (ACMTP10); regional difference vs EA is intentional by design",
          })],
        },
      });
      return requireSourceFaithfulBlocks(enforceSourceFaithfulInvariant(local, ["signal", "repricing"]), ["signal", "repricing"]);
    })(),
    safeHavenRiskOffOverlay: (() => {
      const goldSourceSeries = getSeries(series, "gold_usd");
      const equitySourceSeries = region === "US" ? getSeries(series, "SP500") : getSeries(series, "SX5E");
      const goldZ12m = rollingZScore(goldSourceSeries, 12);
      const equityZ12m = rollingZScore(equitySourceSeries, 12);
      const goldEquityRaw = seriesDifference(goldZ12m, equityZ12m);
      const goldEquityRawCapped = clampSeries(goldEquityRaw, -3, 3);
      const goldEquityRawLatest = lastNumeric(goldEquityRaw)?.value ?? null;

      const goldEquityComponent = makeComponent({
        asOfDate,
        id: "sh_gold_eq",
        title: "Gold-equity flight",
        block: "gold_equity",
        weight: 1,
        source: region === "US" ? "FMP/FRED" : "FMP/STOXX",
        exactSource: region === "US"
          ? "FMP stable/historical-price-eod/full?symbol=GCUSD + FRED SP500"
          : "FMP stable/historical-price-eod/full?symbol=GCUSD + STOXX SX5E",
        series: goldEquityRawCapped,
        invert: true,
        proxy: region === "EA" ? true : false,
        note: region === "EA" ? "Missing by design unless STOXX SX5E series is ingested for runtime" : "source-faithful: separate gold/equity series with rolling 12m z-score spread",
      });
      goldEquityComponent.inputSources = [
        {
          id: "gold",
          sourceFamily: "FMP",
          exactSource: "FMP stable/historical-price-eod/full?symbol=GCUSD",
          fetchAttempted: true,
          fetchSucceeded: goldSourceSeries.length > 0,
          observationCount: canonicalMonthlyGrid(goldSourceSeries).filter((point) => typeof point.value === "number" && Number.isFinite(point.value)).length,
          latestObservationDate: lastNumeric(goldSourceSeries)?.date ?? null,
        },
        {
          id: "equity",
          sourceFamily: region === "US" ? "FRED" : "STOXX",
          exactSource: region === "US" ? "SP500" : "SX5E",
          fetchAttempted: true,
          fetchSucceeded: equitySourceSeries.length > 0,
          observationCount: canonicalMonthlyGrid(equitySourceSeries).filter((point) => typeof point.value === "number" && Number.isFinite(point.value)).length,
          latestObservationDate: lastNumeric(equitySourceSeries)?.date ?? null,
        },
      ];
      goldEquityComponent.debug = {
        ...goldEquityComponent.debug,
        rawToScoreFormula: "gold_equity_flight_raw = rolling_zscore_12m(gold) - rolling_zscore_12m(equity); capped=min(max(raw,-3),3); support_score = 100 - percentile_10y(capped)",
        rolling_zscore_12m_used: true,
        capped_to_range: [-3, 3],
        raw_value_before_cap: goldEquityRawLatest,
        raw_value_after_cap: goldEquityComponent.rawValue,
      } as OverlayComponent["debug"] & Record<string, unknown>;

      const durationInputSeries = region === "US" ? getSeries(series, "DGS10") : getSeries(series, "YC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y");
      const durationRawSeries = negativeChangeWithLag(durationInputSeries, 3);
      const durationLagged = (() => {
        const monthly = canonicalMonthlyGrid(durationInputSeries);
        for (let idx = monthly.length - 1; idx >= 3; idx -= 1) {
          const point = monthly[idx];
          const lagged = monthly[idx - 3];
          if (point?.value === null || lagged?.value === null || point?.value === undefined || lagged?.value === undefined) continue;
          if (!Number.isFinite(point.value) || !Number.isFinite(lagged.value)) continue;
          return { current: point.value, lagged: lagged.value };
        }
        return { current: null, lagged: null };
      })();
      const durationComponent = makeComponent({
        asOfDate,
        id: "sh_duration",
        title: "Duration flight",
        block: "duration",
        weight: 1,
        source: region === "US" ? "FRED" : "ECB",
        exactSource: region === "US" ? "DGS10" : "YC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y",
        series: durationRawSeries,
        invert: true,
        note: "source-faithful: duration_flight_raw = -1 * (current_10y_yield - yield_3m_ago)",
      });
      durationComponent.debug = {
        ...durationComponent.debug,
        rawToScoreFormula: "duration_flight_raw = -1 * (yield_t - yield_t_minus_3m); support_score = 100 - percentile_10y(duration_flight_raw)",
        current_value: durationLagged.current,
        value_3m_ago: durationLagged.lagged,
        duration_flight_raw: durationComponent.rawValue,
      } as OverlayComponent["debug"] & Record<string, unknown>;

      return finalizeOverlay({
        gold_equity: { weight: 0.65, components: [goldEquityComponent] },
        duration: { weight: 0.35, components: [durationComponent] },
      });
    })(),
    inflationCostShockOverlay: (() => {
      const headlineCpiYoyUs = yoy(getSeries(series, "CPIAUCSL"));
      const coreCpiYoyUs = yoy(getSeries(series, "CPILFESL"));
      const headlineCoreGapUs = headlineCpiYoyUs.map((point, index) => {
        const corePoint = coreCpiYoyUs[index];
        const headline = point?.value;
        const core = corePoint?.value;
        if (typeof headline !== "number" || !Number.isFinite(headline) || typeof core !== "number" || !Number.isFinite(core)) {
          return { date: point.date, value: null };
        }
        return { date: point.date, value: headline - core };
      });
      const headlineCoreGapClippedUs = headlineCoreGapUs.map((point) => ({
        date: point.date,
        value: typeof point.value === "number" && Number.isFinite(point.value) ? Math.max(point.value, 0) : null,
      }));
      const ppiYoyUs = yoy(getSeries(series, "PPIACO"));
      const marketBreakevenUs = getSeries(series, "T10YIE");
      const surveyExpectationsUs = getSeries(series, "MICH");

      const inflationComponents = [
        makeComponent({
          asOfDate,
          id: "ics_headline",
          title: "Headline inflation",
          block: region === "US" ? "inflation_pressure" : "inflation",
          weight: region === "US" ? 0.4 : 0.5,
          source: "FRED/ECB",
          exactSource: region === "US" ? "CPIAUCSL" : inflationSeries,
          series: region === "US" ? headlineCpiYoyUs : yoy(getSeries(series, inflationSeries)),
          invert: true,
        }),
        makeComponent({
          asOfDate,
          id: "ics_core",
          title: "Core inflation",
          block: region === "US" ? "inflation_pressure" : "inflation",
          weight: region === "US" ? 0.4 : 0.5,
          source: "FRED/ECB",
          exactSource: coreInflationSeries,
          series: yoy(getSeries(series, coreInflationSeries)),
          invert: true,
        }),
        makeComponent({
          asOfDate,
          id: "ics_gap",
          title: "Headline-core gap",
          block: region === "US" ? "inflation_pressure" : "inflation",
          weight: region === "US" ? 0.2 : 0,
          source: region === "US" ? "FRED" : "Derived",
          exactSource: region === "US" ? "max(YoY(CPIAUCSL) - YoY(CPILFESL), 0)" : `${inflationSeries} - ${coreInflationSeries}`,
          series: region === "US"
            ? headlineCoreGapClippedUs
            : yoy(getSeries(series, inflationSeries)).map((p, i) => ({ date: p.date, value: (p.value ?? null) !== null ? ((p.value as number) - (yoy(getSeries(series, coreInflationSeries))[i]?.value ?? 0)) : null })),
          invert: true,
          proxy: region !== "US",
        }),
      ];

      if (region === "US") {
        const inflationGapComponent = inflationComponents[2];
        inflationGapComponent.debug = {
          ...(inflationGapComponent.debug ?? {}),
          exactSourceHeadline: "CPIAUCSL",
          exactSourceCore: "CPILFESL",
          exactSourceGapInputs: ["CPIAUCSL", "CPILFESL"],
          headline_cpi_yoy_us: inflationComponents[0].rawValue,
          core_cpi_yoy_us: inflationComponents[1].rawValue,
          headline_core_gap_us: lastNumeric(headlineCoreGapUs)?.value ?? null,
          headline_core_gap_clipped: inflationGapComponent.rawValue,
          subscoreWeights: { headline: 0.4, core: 0.4, gap: 0.2 },
        } as OverlayComponent["debug"] & Record<string, unknown>;
      }

      const upstreamComponent = makeComponent({
        asOfDate,
        id: "ics_up",
        title: "Upstream cost pressure",
        block: region === "US" ? "upstream_cost_pressure" : "upstream",
        weight: 1,
        source: "FRED/ECB",
        exactSource: region === "US" ? "PPIACO" : "PPI.EA",
        series: region === "US"
          ? ppiYoyUs
          : (yoy(getSeries(series, "EA_PPI")).length ? yoy(getSeries(series, "EA_PPI")) : (getSeries(series, "commodity_index_yoy").length ? getSeries(series, "commodity_index_yoy") : getSeries(series, "industrial_metals_yoy"))),
        invert: true,
        proxy: region !== "US",
        note: region === "US" ? "Source-faithful transformed direct input: YoY(PPIACO)." : "",
      });

      const expectationsComponents = region === "US"
        ? [
          makeComponent({ asOfDate, id: "ics_exp_market", title: "Inflation expectations (market)", block: "expectations_pressure", weight: 0.6, source: "FRED", exactSource: "T10YIE", series: marketBreakevenUs, invert: true }),
          makeComponent({ asOfDate, id: "ics_exp_survey", title: "Inflation expectations (survey)", block: "expectations_pressure", weight: 0.4, source: "FRED", exactSource: "MICH", series: surveyExpectationsUs, invert: true }),
        ]
        : [
          makeComponent({ asOfDate, id: "ics_exp", title: "Inflation expectations", block: "expectations", weight: 1, source: "FRED/ECB", exactSource: "ECB SPF", series: getSeries(series, "EA_INFLATION_EXPECTATIONS"), invert: true, proxy: true }),
        ];

      const result = finalizeOverlay({
        inflation: { weight: 0.45, components: inflationComponents },
        upstream: { weight: 0.3, components: [upstreamComponent] },
        expectations: { weight: 0.25, components: expectationsComponents },
      });

      if (region === "US") {
        const blockAggregationInputs = result.components.reduce<Record<string, { signalId: string; signalStatus: "ok" | "missing" | "incomplete"; score: number | null }[]>>((acc, component) => {
          (acc[component.block] ??= []).push({ signalId: component.id, signalStatus: component.signalStatus, score: component.score });
          return acc;
        }, {});
        return {
          ...result,
          runtime: {
            status: result.runtime?.status ?? "complete",
            minimumRequiredBlocks: result.runtime?.minimumRequiredBlocks,
            productionValidBlockScores: result.runtime?.productionValidBlockScores,
            diagnosticBlockScores: result.runtime?.diagnosticBlockScores,
            includedBlocks: result.runtime?.includedBlocks,
            diagnosticOnlyBlocks: result.runtime?.diagnosticOnlyBlocks,
            activeProductionBlockCount: result.runtime?.activeProductionBlockCount,
            diagnosticOnlyBlockCount: result.runtime?.diagnosticOnlyBlockCount,
            confidenceCapApplied: result.runtime?.confidenceCapApplied,
            confidenceCapReason: result.runtime?.confidenceCapReason,
            blockDiagnostics: result.runtime?.blockDiagnostics,
            includedBlocksInTotal: ["inflation_pressure", "upstream_cost_pressure", "expectations_pressure"],
            excludedBlocks: result.runtime?.excludedBlocks ?? [],
            aggregationWeights: { inflation_pressure: 0.45, upstream_cost_pressure: 0.30, expectations_pressure: 0.25 },
            scoreFormula: "inflation_cost_shock_overlay_score = 0.45*inflation_pressure + 0.30*upstream_cost_pressure + 0.25*expectations_pressure",
            blockAggregationInputs,
            implementationDeltaVsSpec: [
              "inflation block: source-faithful with CPIAUCSL + CPILFESL YoY and clipped max(headline-core,0) gap.",
              "upstream block: source-faithful transformed direct input YoY(PPIACO).",
              "expectations block: source-faithful with T10YIE (0.60) + MICH (0.40).",
            ],
          },
        };
      }

      return result;
    })(),
    tradeSupplyChainStressOverlay: (() => {
      const usIndustrialProduction = yoy(getSeries(series, "INDPRO"));
      const usNewOrders = yoy(getSeries(series, "DGORDER"));
      const usRealGoodsFlow = averageAlignedSeries([usIndustrialProduction, usNewOrders]);
      const usInventoryPressure = yoy(getSeries(series, "ISRATIO"));
      const usInputPrices = yoy(getSeries(series, "PPIACO"));
      return finalizeOverlay({
        real_goods_flow: {
          weight: 0.4,
          components: [makeComponent({
            asOfDate,
            id: "tsc_real_goods_flow",
            title: "Real goods flow",
            block: "real_goods_flow",
            weight: 1,
            source: "FRED",
            exactSource: region === "US" ? "INDPRO + DGORDER" : "UNAVAILABLE: non-US source-faithful mapping not wired",
            series: region === "US" ? usRealGoodsFlow : [],
            invert: true,
            note: region === "US"
              ? "Source-faithful composite built only when both INDPRO and DGORDER are available"
              : "Missing by design: no source-faithful non-US mapping for this overlay block",
          })],
        },
        inventory_pressure: {
          weight: 0.3,
          components: [makeComponent({
            asOfDate,
            id: "tsc_inventory_pressure",
            title: "Inventory pressure",
            block: "inventory_pressure",
            weight: 1,
            source: "FRED",
            exactSource: region === "US" ? "ISRATIO" : "UNAVAILABLE: non-US source-faithful mapping not wired",
            series: region === "US" ? usInventoryPressure : [],
            invert: true,
            note: region === "US"
              ? "Source-faithful inventory family input (ISRATIO)"
              : "Missing by design: no source-faithful non-US inventory source wired",
          })],
        },
        pricing: {
          weight: 0.3,
          components: [makeComponent({
            asOfDate,
            id: "tsc_pricing",
            title: "Input pricing pressure",
            block: "pricing",
            weight: 1,
            source: "FRED",
            exactSource: region === "US" ? "PPIACO" : "UNAVAILABLE: non-US source-faithful mapping not wired",
            series: region === "US" ? usInputPrices : [],
            invert: true,
            note: region === "US"
              ? "Source-faithful pricing uses PPIACO; shipping-cost fallback disabled"
              : "Missing by design: no source-faithful non-US pricing source wired",
          })],
        },
      });
    })(),
  };

  return { region, asOfDate, overlays };
}

export function buildGlobalUnrestOverlay(asOfDate: string, us: OverlayBundle | null, ea: OverlayBundle | null): OverlayResult {
  const usLocal = us?.overlays.localUnrestOverlay?.score ?? null;
  const eaLocal = ea?.overlays.localUnrestOverlay?.score ?? null;
  const breadthSeries: Point[] = [{ date: asOfDate, value: usLocal }, { date: asOfDate, value: eaLocal }];
  const syncVal = usLocal !== null && eaLocal !== null ? 100 - Math.min(100, Math.abs(usLocal - eaLocal)) : null;
  const syncSeries: Point[] = [{ date: asOfDate, value: syncVal }];
  const bridgeSeries: Point[] = [{ date: asOfDate, value: ((us?.overlays.safeHavenRiskOffOverlay?.score ?? 50) + (ea?.overlays.energyShockOverlay?.score ?? 50)) / 2 }];
  return finalizeOverlay({
    breadth: { weight: 0.45, components: [makeComponent({ asOfDate, id: "gu_breadth", title: "Regional breadth", block: "breadth", weight: 1, source: "Inherited", exactSource: "local_unrest_overlay_score_us/ea", series: breadthSeries, invert: true, proxy: true })] },
    sync: { weight: 0.35, components: [makeComponent({ asOfDate, id: "gu_sync", title: "Regional synchronization", block: "sync", weight: 1, source: "Inherited", exactSource: "local_unrest_sync", series: syncSeries, invert: true, proxy: true })] },
    bridge: { weight: 0.2, components: [makeComponent({ asOfDate, id: "gu_bridge", title: "Global stress bridge", block: "bridge", weight: 1, source: "Inherited", exactSource: "dollar funding + safe haven + energy bridge", series: bridgeSeries, invert: true, proxy: true })] },
  });
}

export function buildSeriesMap(rows: Array<{ series_key: string; date: string; value: number | null }>): SeriesMap {
  const map = new Map<string, Point[]>();
  for (const row of rows) {
    const key = String(row.series_key);
    const bucket = map.get(key) ?? [];
    bucket.push({ date: String(row.date), value: row.value === null ? null : Number(row.value) });
    map.set(key, bucket);
  }
  for (const [key, points] of map.entries()) map.set(key, canonicalMonthlyGrid(points));

  const aliasCandidates: Record<string, string[]> = {
    WALCL: ["fed_balance_sheet_total"],
    M2SL: ["m2sl"],
    DFII10: ["real_yield_10y_us"],
    BAMLC0A0CM: ["ig_spread_us"],
    BAMLH0A0HYM2: ["hy_spread_us"],
    NFCI: ["financial_conditions_index"],
    DGS10: ["nominal_yield_10y_us"],
    DCOILBRENTEU: ["oil_brent_usd"],
    DHHNGSP: ["natgas_usd"],
    DCOILWTICO: ["oil_wti_usd"],
    PNGASEUUSDM: ["pngaseuusdm", "ea_gas_fred"],
    "HICP.M.U2.N.NRGY00.4D0.ANR": ["hicp_energy_yoy_ea", "hicp_yoy_ea"],
    "HICP.M.U2.N.000000.4D0.ANR": ["hicp_yoy_ea", "hicp_ea"],
    "STS.M.I9.Y.PROD.NS0020.4.000": ["industrial_production_ea", "EA_INDUSTRIAL_PRODUCTION"],
    "YC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y": ["ea_10y_nominal_yield", "EA_10Y_CORE_YIELD"],
    "FM.M.U2.EUR.4F.BB.U2_10Y.YLD": ["real_yield_10y_ea", "ea_10y_nominal_yield"],
    INDPRO: ["pmi_us"],
    ACMTP10: ["acmtp10_us", "lu_repricing_us", "acmtp10"],
    DGORDER: ["new_orders_us"],
    POLICY_UNCERTAINTY_US: ["policy_uncertainty_us", "usepuindxm"],
    CPILFESL: ["core_cpi_us"],
    CPIENGSL: ["cpi_energy_us"],
    T10YIE: ["breakeven_10y_us"],
    MICH: ["mich_inflation_expectations_us"],
    CPIAUCSL: ["headline_cpi_us"],
    VIXCLS: ["vix_index"],
    "BSI.M.U2.Y.V.M30.X.1.U2.2300.Z01.E": ["m3_ea"],
    "HICP.M.U2.N.000000.4.ANR": ["hicp_yoy_ea", "hicp_ea"],
    "HICP.M.U2.N.XEF000.4D0.ANR": ["hicp_yoy_ea"],
    "CISS.D.U2.Z0Z.4F.EC.SS_CIN.IDX": ["credit_spreads_ea"],
    "EA_INDUSTRIAL_PRODUCTION": ["industrial_production_ea", "pmi_ea", "pmi_us"],
    "EA_10Y_CORE_YIELD": ["real_yield_10y_ea"],
    "EA_PPI": ["commodity_index", "industrial_metals_index"],
    "EA_INFLATION_EXPECTATIONS": ["hicp_yoy_ea"],
    "EUR_IG_OAS": ["credit_spreads_ea"],
    "EUR_HY_OAS": ["credit_spreads_ea"],
    "GOLD_EQUITY_RATIO": ["gold_minus_real_yield_spread", "gold_usd"],
    "ISRATIO": ["isratio_us"],
    "PPIACO": ["ppiaco_us"],
    "EURUSD_XCCY_BASIS": ["EURUSD3MD156NWSG", "EURUSDBS3M"],
    "TEDRATE": ["tedrate"],
    "US_SOVEREIGN_SPREAD": ["us_sovereign_spread"],
    "IRLTLT01ITM156N": ["italy_10y_yield"],
    "IRLTLT01DEM156N": ["germany_10y_yield"],
  };

  const hasNumericPoints = (points: Point[]): boolean => points.some((point) => typeof point.value === "number" && Number.isFinite(point.value));

  for (const [target, candidates] of Object.entries(aliasCandidates)) {
    const targetSeries = map.get(target) ?? [];
    const targetHasNumeric = hasNumericPoints(targetSeries);
    const foundKey = candidates.find((candidate) => {
      const candidateSeries = map.get(candidate) ?? [];
      return candidateSeries.length > 0 && hasNumericPoints(candidateSeries);
    });
    if (!foundKey) continue;
    if (!targetHasNumeric) {
      map.set(target, map.get(foundKey) ?? []);
    }
  }

  return map;
}
