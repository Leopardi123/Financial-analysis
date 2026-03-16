export type OverlayRegion = "US" | "EA" | "SE" | "GLOBAL";

type Point = { date: string; value: number | null };
type SeriesMap = Map<string, Point[]>;

type OverlayComponent = {
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
  proxy: boolean;
  note: string;
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
    last5MonthlyPointsInWindow: Array<{ date: string; value: number }>;
  };
};

type OverlayResult = {
  score: number | null;
  label: string;
  confidence: number;
  blockScores: Record<string, number | null>;
  components: OverlayComponent[];
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
  const rightByDate = new Map(right.map((point) => [point.date, point.value]));
  const out: Point[] = [];
  for (const point of left) {
    const rv = rightByDate.get(point.date);
    if (point.value === null || rv === null || rv === undefined || !Number.isFinite(point.value) || !Number.isFinite(rv)) continue;
    out.push({ date: point.date, value: point.value - rv });
  }
  return out;
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
  const windowNumericPoints = windowPoints.filter((p): p is { date: string; value: number } => typeof p.value === "number" && Number.isFinite(p.value));
  const observations = windowNumericPoints.length;
  const minObservations = params.minObservations ?? (params.useZ ? 24 : 24);
  const enoughHistory = observations >= minObservations;
  const percentile = params.useZ ? (() => {
    const z = zscoreLatest(params.series);
    if (z === null) return null;
    return Math.max(0, Math.min(100, 50 + z * 15));
  })() : percentile10yLatest(params.series, minObservations);
  const base = percentile === null ? null : (params.invert ? 100 - percentile : percentile);
  const inversionPhrase = params.invert ? "score = 100 - percentile" : "score = percentile";
  const directionRulePlainText = params.invert
    ? "Higher normalized percentile maps to lower support score (stress-convention inversion enabled)."
    : "Higher normalized percentile maps to higher support score (no inversion).";
  return {
    id: params.id,
    title: params.title,
    block: params.block,
    rawValue: latest?.value ?? null,
    score: base,
    weight: params.weight,
    source: params.source,
    exactSource: params.exactSource,
    freshnessDays: freshnessDays(latest?.date ?? null, params.asOfDate),
    includedInTotal: base !== null && !Boolean(params.proxy),
    missing: base === null || Boolean(params.proxy),
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
      inversionApplied: Boolean(params.invert),
      rawToScoreFormula: `${params.useZ ? "percentile = clamp(50 + zscoreLatest*15, 0, 100)" : "percentile = percentile10yLatest(window<=120, latest)"}; ${inversionPhrase}; clamp=[0,100] implicit via percentile construction`,
      directionRulePlainText,
      supportInterpretation: params.invert ? "higher raw value means more stress" : "higher raw value means less stress",
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

export function buildRegionalOverlays(region: "US" | "EA" | "SE", asOfDate: string, series: SeriesMap): OverlayBundle {
  const inflationSeries = region === "US" ? "core_cpi_us" : "HICP.M.U2.N.000000.4.ANR";
  const coreInflationSeries = region === "US" ? "CPILFESL" : "HICP.M.U2.N.XEF000.4D0.ANR";
  const overlays: Record<string, OverlayResult> = {
    liquidityOverlay: finalizeOverlay({
      quantity: {
        weight: 0.4,
        components: [
          makeComponent({ asOfDate, id: "liq_balance", title: "Central bank balance ratio", block: "quantity", weight: 0.45, source: "FRED/ECB", exactSource: region === "US" ? "WALCL/GDP" : "ILM.W.U2.C.T000000.Z5.Z01 + NAQ_10_GDP", series: getSeries(series, region === "US" ? "WALCL" : "ILM.W.U2.C.T000000.Z5.Z01") }),
          makeComponent({ asOfDate, id: "liq_m3", title: "Broad money ratio", block: "quantity", weight: 0.3, source: "FRED/ECB", exactSource: region === "US" ? "M2SL/GDP" : "BSI.M.U2.Y.V.M30.X.1.U2.2300.Z01.E / NAQ_10_GDP", series: getSeries(series, region === "US" ? "M2SL" : "BSI.M.U2.Y.V.M30.X.1.U2.2300.Z01.E") }),
          makeComponent({ asOfDate, id: "liq_credit", title: "Bank credit/loan support", block: "quantity", weight: 0.25, source: "FRED/ECB", exactSource: region === "US" ? "TOTBKCR/GDP" : "BSI.M.U2.Y.U.A20T.A.I.U2.2240.Z01.A", series: region === "US" ? getSeries(series, "TOTBKCR") : getSeries(series, "BSI.M.U2.Y.U.A20T.A.I.U2.2240.Z01.A"), proxy: region !== "US", note: region === "EA" ? "Growth proxy per spec" : "" }),
        ],
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
          makeComponent({ asOfDate, id: "liq_trans_dollar", title: "Dollar transmission pressure", block: "transmission", weight: 1, source: "FRED", exactSource: "DTWEXBGS", series: getSeries(series, "DTWEXBGS"), invert: true, note: "Primary transmission source only; no proxy substitution." }),
        ],
      },
      bridge: {
        weight: 0.1,
        components: [
          makeComponent({
            asOfDate,
            id: "liq_bridge_xccy",
            title: "Cross-currency funding bridge",
            block: "bridge",
            weight: 1,
            source: "FRED/CME",
            exactSource: "DRTSCILM / cross-currency basis family",
            series: getSeries(series, "DRTSCILM").length
              ? getSeries(series, "DRTSCILM")
              : getSeries(series, "EURUSD_XCCY_BASIS"),
            invert: true,
            note: "Primary bridge source family only; missing if no xccy primary source exists.",
          }),
        ],
      },
    }),
    creditFundingOverlay: finalizeOverlay({
      pricing: { weight: 0.3, components: [
        makeComponent({ asOfDate, id: "cr_hy", title: "HY spread", block: "pricing", weight: 0.5, source: "FRED/ECB", exactSource: region === "US" ? "BAMLH0A0HYM2" : "EUR HY OAS", series: getSeries(series, region === "US" ? "BAMLH0A0HYM2" : "EUR_HY_OAS"), invert: true }),
        makeComponent({ asOfDate, id: "cr_ig", title: "IG spread", block: "pricing", weight: 0.5, source: "FRED/ECB", exactSource: region === "US" ? "BAMLC0A0CM" : "EUR_IG_OAS", series: getSeries(series, region === "US" ? "BAMLC0A0CM" : "EUR_IG_OAS"), invert: true }),
      ]},
      funding: { weight: 0.3, components: [
        makeComponent({ asOfDate, id: "cr_fund_1", title: "Funding stress", block: "funding", weight: 0.6, source: "FRED/ECB", exactSource: region === "US" ? "TEDRATE" : "EURIBOR_OIS", series: getSeries(series, region === "US" ? "TEDRATE" : "EURIBOR_OIS").length ? getSeries(series, region === "US" ? "TEDRATE" : "EURIBOR_OIS") : getSeries(series, region === "US" ? "financial_conditions_index" : "credit_spreads_ea"), invert: true, proxy: region === "US" }),
        makeComponent({ asOfDate, id: "cr_fund_2", title: "Dollar funding bridge", block: "funding", weight: 0.4, source: "CME", exactSource: "EUR/USD Cross Currency Basis", series: getSeries(series, "EURUSD_XCCY_BASIS"), invert: true, proxy: true }),
      ]},
      access: { weight: 0.4, components: [
        makeComponent({ asOfDate, id: "cr_access_1", title: "Lending standards", block: "access", weight: 0.7, source: "FRED/ECB", exactSource: region === "US" ? "DRTSCILM" : "BLS.Q.U2.ALL.A.K.A.A2A.A.2250.Z.Z", series: getSeries(series, region === "US" ? "DRTSCILM" : "BLS.Q.U2.ALL.A.K.A.A2A.A.2250.Z.Z").length ? getSeries(series, region === "US" ? "DRTSCILM" : "BLS.Q.U2.ALL.A.K.A.A2A.A.2250.Z.Z") : getSeries(series, region === "US" ? "pmi_momentum_us" : "credit_spreads_ea"), invert: true }),
        makeComponent({ asOfDate, id: "cr_access_2", title: "Sovereign-bank nexus", block: "access", weight: 0.3, source: "ECB", exactSource: region === "EA" ? "IT10Y-DE10Y spread" : "Proxy not required", series: getSeries(series, region === "EA" ? "EA_SOVEREIGN_NEXUS_SPREAD" : ""), invert: true, proxy: region !== "EA" }),
      ]},
    }),
    energyShockOverlay: finalizeOverlay({
      price: { weight: 0.4, components: [makeComponent({ asOfDate, id: "en_oil", title: "Energy price shock", block: "price", weight: 1, source: "FRED", exactSource: "DCOILBRENTEU YoY/3m", series: yoy(getSeries(series, "DCOILBRENTEU")), invert: true })] },
      breadth: { weight: 0.25, components: [makeComponent({ asOfDate, id: "en_breadth", title: "Energy breadth", block: "breadth", weight: 1, source: "Proxy", exactSource: "Energy breadth proxy", series: getSeries(series, "ENERGY_BREADTH_PROXY").length ? getSeries(series, "ENERGY_BREADTH_PROXY") : (getSeries(series, "natgas_yoy").length ? getSeries(series, "natgas_yoy") : getSeries(series, "industrial_metals_yoy")), invert: true, proxy: true })] },
      spillover: { weight: 0.35, components: [makeComponent({ asOfDate, id: "en_spill", title: "Macro spillover", block: "spillover", weight: 1, source: "FRED/ECB", exactSource: `${inflationSeries} / industrial spillover`, series: yoy(getSeries(series, inflationSeries)), invert: true, proxy: true })] },
    }),
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
    safeHavenRiskOffOverlay: finalizeOverlay({
      gold_equity: { weight: 0.65, components: [makeComponent({ asOfDate, id: "sh_gold_eq", title: "Gold-equity flight", block: "gold_equity", weight: 1, source: "FRED", exactSource: "GOLD/SP500 ratio", series: getSeries(series, "GOLD_EQUITY_RATIO"), invert: true, proxy: true })] },
      duration: { weight: 0.35, components: [makeComponent({ asOfDate, id: "sh_duration", title: "Duration flight", block: "duration", weight: 1, source: "FRED/ECB", exactSource: region === "US" ? "US10Y yield" : "DE10Y yield", series: getSeries(series, region === "US" ? "DGS10" : "EA_10Y_CORE_YIELD"), invert: true })] },
    }),
    inflationCostShockOverlay: finalizeOverlay({
      inflation: { weight: 0.45, components: [
        makeComponent({ asOfDate, id: "ics_headline", title: "Headline inflation", block: "inflation", weight: region === "US" ? 0.4 : 0.5, source: "FRED/ECB", exactSource: inflationSeries, series: yoy(getSeries(series, inflationSeries)), invert: true }),
        makeComponent({ asOfDate, id: "ics_core", title: "Core inflation", block: "inflation", weight: region === "US" ? 0.4 : 0.5, source: "FRED/ECB", exactSource: coreInflationSeries, series: yoy(getSeries(series, coreInflationSeries)), invert: true }),
        makeComponent({ asOfDate, id: "ics_gap", title: "Headline-core gap", block: "inflation", weight: region === "US" ? 0.2 : 0, source: "Derived", exactSource: `${inflationSeries} - ${coreInflationSeries}`, series: yoy(getSeries(series, inflationSeries)).map((p, i) => ({ date: p.date, value: (p.value ?? null) !== null ? ((p.value as number) - (yoy(getSeries(series, coreInflationSeries))[i]?.value ?? 0)) : null })), invert: true, proxy: true }),
      ]},
      upstream: { weight: 0.3, components: [makeComponent({ asOfDate, id: "ics_up", title: "Upstream cost pressure", block: "upstream", weight: 1, source: "FRED/ECB", exactSource: region === "US" ? "PPIACO" : "PPI.EA", series: yoy(getSeries(series, region === "US" ? "PPIACO" : "EA_PPI")).length ? yoy(getSeries(series, region === "US" ? "PPIACO" : "EA_PPI")) : (getSeries(series, "commodity_index_yoy").length ? getSeries(series, "commodity_index_yoy") : getSeries(series, "industrial_metals_yoy")), invert: true, proxy: true })] },
      expectations: { weight: 0.25, components: [makeComponent({ asOfDate, id: "ics_exp", title: "Inflation expectations", block: "expectations", weight: 1, source: "FRED/ECB", exactSource: region === "US" ? "T10YIE + survey" : "ECB SPF", series: getSeries(series, region === "US" ? "T10YIE" : "EA_INFLATION_EXPECTATIONS"), invert: true, proxy: region !== "US" })] },
    }),
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
    INDPRO: ["pmi_us"],
    ACMTP10: ["acmtp10_us", "lu_repricing_us", "acmtp10"],
    DGORDER: ["new_orders_us"],
    POLICY_UNCERTAINTY_US: ["policy_uncertainty_us", "usepuindxm"],
    CPILFESL: ["core_cpi_us"],
    T10YIE: ["breakeven_10y_us"],
    CPIAUCSL: ["core_cpi_us"],
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
