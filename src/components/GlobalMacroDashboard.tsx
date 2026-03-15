import { useEffect, useMemo, useState, type ReactNode } from "react";
import ChartCard from "./ChartCard";

type GlobalMacroPayload = {
  regime: {
    asOfDate: string;
    coreRegimeLabel: string;
    macroScoreTotal: number | null;
    macroConfidence: number;
    growthOverlay: string;
    stressOverlay: string;
    hardAssetOverlay: string;
    blockScores: {
      A_FISCAL: number | null;
      B_MONETARY: number | null;
      C_INFLATION: number | null;
      D_CREDIBILITY: number | null;
    };
    clearSignalStrength: number | null;
    speculativeSignalStrength: number | null;
    topDrivers: Array<{ region?: string; indicatorId: string; title: string; block: "A_FISCAL" | "B_MONETARY" | "C_INFLATION" | "D_CREDIBILITY"; score: number; percentile10y: number; contribution: number; direction: "rising" | "falling" | "stable" | "accelerating" | "decelerating"; change1m: number | null; change3m: number | null; yoy: number | null; driverNote: string | null }>;
    regimeExplanation: { title: string; summary: string; driverHighlights: string[] };
  };
  overlayBundle?: {
    region: string;
    asOfDate: string;
    overlays: Record<string, { score: number | null; label: string; confidence: number; blockScores: Record<string, number | null>; components: Array<{ id: string; title: string; block: string; rawValue: number | null; score: number | null; weight: number; source: string; exactSource: string; freshnessDays: number | null; includedInTotal: boolean; missing: boolean; proxy: boolean; note: string; }>; }>;
  };
  overlays?: {
    region: string;
    asOfDate: string;
    overlays: Record<string, { score: number | null; label: string; confidence: number; blockScores: Record<string, number | null>; components: Array<{ id: string; title: string; block: string; rawValue: number | null; score: number | null; weight: number; source: string; exactSource: string; freshnessDays: number | null; includedInTotal: boolean; missing: boolean; proxy: boolean; note: string; }>; }>;
  };
  overlayHistory?: Array<{ asOfDate: string; scores: Record<string, number | null> }>;
  overlayRuntimeProof?: {
    overlayEngineUsed: boolean;
    bundlePresent: boolean;
    bundleKeys: string[];
    regionKeysPresent: string[];
    globalKeysPresent: string[];
  };
  overlayBlockDiagnostics?: Record<string, Array<{
    overlay: string;
    block: string;
    status: "pass" | "proxy" | "missing";
    expectedSource: string;
    actualSourceUsed: string;
    reason: string;
    failedAt: string | null;
  }>>;
  overlayEngineDiagnostics?: {
    region: string;
    rawSeriesCount: number;
    rawSeriesKeysSample: string[];
    buildersRun: string[];
    overlaysReturned: string[];
    overlaysMissing: string[];
    historyBuiltFor: string[];
    historyMissingFor: string[];
    reasons: string[];
  };
  indicators: Array<{
    indicatorId: string;
    title: string;
    block: "A_FISCAL" | "B_MONETARY" | "C_INFLATION" | "D_CREDIBILITY";
    signalClass: "clear" | "speculative";
    sourceType: "auto" | "manual";
    score: number | null;
    percentile10y: number | null;
    freshnessDays: number | null;
    coverage10yPct: number;
    nullReason?: string | null;
  }>;
  dataStatus: string;
  overlayRoutingDiagnostics?: {
    overlayEngineUsed: boolean;
    overlayBundleKeys: string[];
    expectedOverlayBundleKeys?: string[];
    legacyOverlayKeys: string[];
    uiOverlayKeysRequested: string[];
  };
  stats?: {
    rawPointCount: number;
    seriesCount: number;
    indicatorCount: number;
    scoredCount: number;
    partialData: boolean;
    snapshotAsOfDate?: string;
    readMode?: string;
  };
  debug?: {
    snapshotStatus: {
      readMode: string;
      dataStatus: string;
      snapshotAsOfDate: string | null;
      snapshotHealth: "healthy" | "partial" | "empty" | "empty_invalid" | "invalid";
      fallbackLive: boolean;
      primaryPath: boolean;
    };
    rawDataStats: {
      rawPointCount: number | null;
      seriesCount: number | null;
      indicatorCount: number;
      scoredCount: number;
      partialData: boolean;
    };
    expectedVsFoundSeries: Array<{
      seriesKey: string;
      found: boolean;
      rawCount: number;
      latestRawDate: string | null;
    }>;
    indicatorInputStatus: Array<{
      indicatorId: string;
      title: string;
      block: string;
      signalClass: string;
      expectedInputs: string[];
      foundInputs: string[];
      valueLatest: number | null;
      coverage10yPct: number;
      score: number | null;
      dataStatus: "scorable" | "found_not_scoreable_coverage" | "found_not_scoreable_latest_missing" | "missing_series" | "score_unavailable";
      nullReason: string | null;
    }>;
    blockStatus?: Record<string, { status: "Scorable" | "Insufficient"; scored: number; total: number; reasons: string[] }>;
    overlayDataStatus?: Record<string, { scoredInputs: string[]; missingInputs: string[]; usesFallback: boolean; fallbackReason: "none" | "source_missing" | "no_latest_value" | "insufficient_coverage" | "scoring_gate_blocked"; blockedIndicators: Array<{ indicatorId: string; reason: string }> }>;
    confidenceDiagnostics?: {
      macroConfidence: number;
      formula: string;
      clearSignalsScored: number;
      clearSignalsTotal: number;
      speculativeSignalsScored: number;
      speculativeSignalsTotal: number;
      overlayFallbackCount: number;
      note: string;
    };
    snapshotContent: {
      indicatorSnapshotCount: number;
      regimeSnapshotCount: number;
      latestSnapshotTimestamp: string | null;
      snapshotIsEmpty: boolean;
    };
    ingestionDebug: {
      endpointReachable: boolean;
      fredApiKeyPresent: boolean;
      adminSecretConfigured: boolean;
      latestAttempt: {
        timestamp: string;
        region: string;
        mode: string;
        success: boolean;
        fredApiKeyPresent: boolean;
        adminAuthorized: boolean;
        dbConnected: boolean;
        fetchStarted: boolean;
        fetchSucceeded: boolean;
        fetchedSeries: number;
        fetchedObservationCount: number;
        insertAttempted: boolean;
        attemptedInserts: number;
        insertedRowCount: number;
        duplicateOrUnchangedRows: number;
        dedupeOnlyRun: boolean;
        ingestOutcome: "nothing_to_write" | "inserted_new_rows" | "dedupe_or_unchanged_only";
        insertSucceeded: boolean;
        seriesResults: Array<{
          seriesId: string;
          seriesKey: string;
          fetchSuccess: boolean;
          observationsFetched: number;
          errorMessage: string | null;
        }>;
        failingStep: string | null;
        errorMessage: string | null;
      } | null;
    };
    goldSourceDiagnostics?: {
      macroSeriesKey: string;
      macroPipelineSource: string;
      endpoint?: string;
      symbol?: string;
      macroRawBySource: Array<{ source: string; pointCount: number; latestDate: string | null }>;
      fmpMapping: { provider: string; providerSymbol: string; providerKind: string } | null;
      fmpMonthlyHistory: { table: string; tablePresent: boolean; pointCount: number; minDate: string | null; maxDate: string | null };
      fmpEodMonthlyBlobs: { table: string; tablePresent: boolean; monthCount: number; minYyyymm: string | null; maxYyyymm: string | null };
    };
    rootCauseHints: string[];
    goldBackfillDebug?: {
      requestPattern: string;
      endpoint: string;
      symbol: string;
      from: string | null;
      to: string | null;
      fetchedMinDate: string | null;
      fetchedMaxDate: string | null;
      fetchedRowCount: number;
      storedRowCount: number;
      mergedMinDate: string | null;
      mergedMaxDate: string | null;
      resultingCoverage10yPct: number | null;
      resultingSpreadCoverage10yPct: number | null;
    };

  };

};



type MacroHistoryPayload = {
  region: string;
  resolution: "WEEKLY" | "MONTHLY";
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
    regime: Array<{ startDate: string; endDate: string; coreRegimeLabel: string; pointCount: number; topDriver: string | null }>;
    overlays: {
      growth: Array<{ startDate: string; endDate: string; value: string; pointCount: number }>;
      stress: Array<{ startDate: string; endDate: string; value: string; pointCount: number }>;
      hardAsset: Array<{ startDate: string; endDate: string; value: string; pointCount: number }>;
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
  points: Array<{
    asOfDate: string;
    macroScoreTotal: number | null;
    macroConfidence: number;
    coreRegimeLabel: string;
    fiscalScore: number | null;
    monetaryScore: number | null;
    inflationScore: number | null;
    credibilityScore: number | null;
    growthOverlay: string;
    stressOverlay: string;
    hardAssetOverlay: string;
    regimeChanged: boolean;
    overlayChanged: boolean;
    blockThresholdChanged: boolean;
    previousRegimeLabel: string | null;
    topDriver: string | null;
    topDrivers: Array<{ region?: string; indicatorId: string; title: string; block: "A_FISCAL" | "B_MONETARY" | "C_INFLATION" | "D_CREDIBILITY"; score: number; percentile10y: number; contribution: number; direction: string; change1m: number | null; change3m: number | null; yoy: number | null; driverNote: string | null }>;
    regimeExplanation: { title: string; summary: string; driverHighlights: string[] };
  }>;
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


function ExpandablePanel({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>{title}</summary>
      <div style={{ marginTop: 8 }}>{children}</div>
    </details>
  );
}

function AdminSection({ children }: { children: ReactNode }) {
  return (
    <section style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "10px 12px", marginTop: 12, background: "#f8fafc" }}>
      <ExpandablePanel title="Admin">{children}</ExpandablePanel>
    </section>
  );
}

export default function GlobalMacroDashboard() {
  const [globalMacro, setGlobalMacro] = useState<GlobalMacroPayload | null>(null);
  const [globalMacroRaw, setGlobalMacroRaw] = useState<Record<string, unknown> | null>(null);
  const [macroHistory, setMacroHistory] = useState<MacroHistoryPayload | null>(null);
  const [inflationAnalysis, setInflationAnalysis] = useState<InflationAnalysisPayload | null>(null);
  const [historyResolution, setHistoryResolution] = useState<"WEEKLY" | "MONTHLY">("MONTHLY");
  const [historyRangeYears, setHistoryRangeYears] = useState<number | "MAX">(10);
  const [selectedRegion, setSelectedRegion] = useState<"GLOBAL" | "US" | "EA" | "SE">("GLOBAL");
  const [globalMacroLoading, setGlobalMacroLoading] = useState(false);
  const [globalMacroError, setGlobalMacroError] = useState<string | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [ingestRunningMode, setIngestRunningMode] = useState<"backfill" | "latest" | null>(null);
  const [engineRunning, setEngineRunning] = useState(false);
  const [adminSecretInput, setAdminSecretInput] = useState("");
  const [ingestRunResult, setIngestRunResult] = useState<Record<string, unknown> | null>(null);
  const [engineRunResult, setEngineRunResult] = useState<Record<string, unknown> | null>(null);
  const [selectedRegimeInterval, setSelectedRegimeInterval] = useState<{
    coreRegimeLabel: string;
    startDate: string;
    endDate: string;
    pointCount: number;
    topDriver: string | null;
    upFactors: string[];
    downFactors: string[];
    topDrivers: Array<{ title: string; direction: string; block: string; contribution: number }>;
    explanation: string;
  } | null>(null);
  const [focusedBlockSeries, setFocusedBlockSeries] = useState<"A_FISCAL" | "B_MONETARY" | "C_INFLATION" | "D_CREDIBILITY" | null>(null);
  const [blockHoverIndex, setBlockHoverIndex] = useState<number | null>(null);

  const uiOverlayKeysRequested = useMemo(() => (selectedRegion === "GLOBAL"
    ? ["globalUnrestOverlay"]
    : [
      "liquidityOverlay",
      "creditFundingOverlay",
      "energyShockOverlay",
      "localUnrestOverlay",
      "safeHavenRiskOffOverlay",
      "inflationCostShockOverlay",
      "tradeSupplyChainStressOverlay",
    ]), [selectedRegion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = new URLSearchParams(window.location.search);
    setDebugEnabled(query.get("debug") === "1");
  }, []);


  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("globalMacro.debugAdminSecret") ?? "";
    if (saved) setAdminSecretInput(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("globalMacro.debugAdminSecret", adminSecretInput);
  }, [adminSecretInput]);

  useEffect(() => {
    if (historyResolution === "MONTHLY" && historyRangeYears !== 10 && historyRangeYears !== 20 && historyRangeYears !== "MAX") {
      setHistoryRangeYears(10);
    }
    if (historyResolution === "WEEKLY" && historyRangeYears !== 1 && historyRangeYears !== 3 && historyRangeYears !== 5) {
      setHistoryRangeYears(3);
    }
  }, [historyResolution, historyRangeYears, selectedRegion, uiOverlayKeysRequested]);

  async function loadGlobalMacro() {    setGlobalMacroLoading(true);
    setGlobalMacroError(null);
    try {
      const overlayKeysParam = encodeURIComponent(uiOverlayKeysRequested.join(","));
      const response = await fetch(`/api/sector/global-macro?region=${selectedRegion}&historyResolution=${historyResolution}&historyRangeYears=${String(historyRangeYears)}&uiOverlayKeysRequested=${overlayKeysParam}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(String(payload?.error ?? "Kunde inte ladda Global Macro"));
      }
      setGlobalMacro(payload.globalMacro ?? null);
      setMacroHistory(payload.macroHistory ?? null);
      setInflationAnalysis(payload.inflationAnalysis ?? null);
      setGlobalMacroRaw(payload);
    } catch (error) {
      setGlobalMacro(null);
      setMacroHistory(null);
      setGlobalMacroRaw(null);
      setInflationAnalysis(null);
      setGlobalMacroError(error instanceof Error ? error.message : "Okänt fel vid Global Macro-hämtning");
    } finally {
      setGlobalMacroLoading(false);
    }
  }

  useEffect(() => {
    void loadGlobalMacro();
  }, [historyResolution, historyRangeYears, selectedRegion, uiOverlayKeysRequested]);

  const globalMacroIndicators = globalMacro?.indicators ?? [];
  const scoredCount = globalMacroIndicators.filter((item) => item.score !== null).length;
  const isPartialData =
    globalMacro?.stats?.partialData ??
    (globalMacroIndicators.length > 0 && scoredCount < globalMacroIndicators.length);
  const isNoData = !globalMacroLoading && !globalMacroError && (!globalMacro || globalMacroIndicators.length === 0);
  const activeOverlayBundle = globalMacro?.overlayBundle ?? globalMacro?.overlays ?? null;
  const overlayEntries = Object.entries(activeOverlayBundle?.overlays ?? {});
  const overlayHistoryPoints = globalMacro?.overlayHistory ?? [];
  const overlayKeysForCharts = selectedRegion === "GLOBAL"
    ? ["globalUnrestOverlay"]
    : [
      "liquidityOverlay",
      "creditFundingOverlay",
      "energyShockOverlay",
      "safeHavenRiskOffOverlay",
      "inflationCostShockOverlay",
      "tradeSupplyChainStressOverlay",
      "localUnrestOverlay",
    ];
  const overlaySanity = overlayEntries.map(([overlayKey, overlay]) => {
    const blockRows = Object.entries(overlay.blockScores ?? {}).map(([block, score]) => ({
      block,
      score: typeof score === "number" ? score : null,
      components: (overlay.components ?? []).filter((component) => component.block === block),
    }));
    const realBlocks = blockRows.filter((row) => row.score !== null && row.components.some((component) => !component.proxy && !component.missing)).length;
    const proxyBlocks = blockRows.filter((row) => row.score !== null && row.components.every((component) => component.proxy || component.missing)).length;
    const missingBlocks = blockRows.filter((row) => row.score === null).length;
    const lowRobustness = realBlocks < 2 || (proxyBlocks / Math.max(1, blockRows.length)) > 0.6;
    const negative = (overlay.components ?? [])
      .filter((component) => typeof component.score === "number")
      .sort((a, b) => (a.score as number) - (b.score as number))
      .slice(0, 3)
      .map((component) => `${component.id}:${(component.score as number).toFixed(1)}`);
    const normalizationInputs = blockRows.map((row) => `${row.block}=${row.score === null ? "null" : row.score.toFixed(1)}`);
    return { overlayKey, realBlocks, proxyBlocks, missingBlocks, lowRobustness, negative, normalizationInputs };
  });

  type IntendedSeriesSpec = {
    id: string;
    block: string;
    linkedMacroFamily?: string;
    primarySources: string[];
    aliasFamily: string[];
    note?: string;
  };

  type OverlayDesignSpec = {
    intendedPrimaryBlocks: string[];
    intendedSeries: IntendedSeriesSpec[];
    logicSummary: string;
  };

  const overlayDesignSpec: Record<string, OverlayDesignSpec> = {
    liquidityOverlay: {
      intendedPrimaryBlocks: ["quantity", "price", "bridge", "transmission"],
      intendedSeries: [
        { id: "balance_sheet_gdp", block: "quantity", linkedMacroFamily: "B_MONETARY", primarySources: ["WALCL/GDP"], aliasFamily: ["walcl", "balance_sheet_gdp", "fed_balance_sheet"] },
        { id: "m2_gdp", block: "quantity", linkedMacroFamily: "B_MONETARY", primarySources: ["M2SL/GDP"], aliasFamily: ["m2sl", "m2_gdp", "money_supply_gdp"] },
        { id: "bank_credit_gdp", block: "quantity", linkedMacroFamily: "B_MONETARY", primarySources: ["TOTBKCR/GDP"], aliasFamily: ["totbkcr", "bank_credit_gdp"] },
        { id: "real_yield_10y", block: "price", linkedMacroFamily: "B_MONETARY", primarySources: ["DFII10"], aliasFamily: ["real_yield_10y", "dfii10", "real_yield"] },
        { id: "financial_conditions", block: "price", linkedMacroFamily: "B_MONETARY", primarySources: ["NFCI"], aliasFamily: ["financial_conditions", "nfci", "fci"] },
        { id: "hy_spread", block: "price", linkedMacroFamily: "B_MONETARY", primarySources: ["BAMLH0A0HYM2"], aliasFamily: ["hy_spread", "bamlh0a0hym2", "high_yield_spread"] },
        { id: "xccy_basis_bridge", block: "bridge", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["DRTSCILM / xccy-basis family"], aliasFamily: ["xccy_basis", "drtscilm", "bridge"] },
        { id: "dollar_index", block: "transmission", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["DTWEXBGS"], aliasFamily: ["dollar_index", "dtwexbgs", "usd_broad_index", "usd_strength"] },
      ],
      logicSummary: "Likviditet, realränta, spread och dollarvillkor driver overlayns kärna.",
    },
    creditFundingOverlay: {
      intendedPrimaryBlocks: ["pricing", "funding"],
      intendedSeries: [
        { id: "hy_spread", block: "pricing", linkedMacroFamily: "B_MONETARY", primarySources: ["BAMLH0A0HYM2"], aliasFamily: ["hy_spread", "bamlh0a0hym2"] },
        { id: "ig_spread", block: "pricing", linkedMacroFamily: "B_MONETARY", primarySources: ["BAMLC0A0CM"], aliasFamily: ["ig_spread", "bamlc0a0cm"] },
        { id: "ted_spread", block: "funding", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["TEDRATE"], aliasFamily: ["ted_spread", "tedrate"] },
        { id: "xccy_basis", block: "funding", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["DRTSCILM"], aliasFamily: ["xccy_basis", "drtscilm", "cross_currency_basis"], note: "Kan köras via proxy om xccy ej komplett." },
      ],
      logicSummary: "Kredit- och fundingstress via HY/IG-spreadar, TED och xccy-basis.",
    },
    energyShockOverlay: {
      intendedPrimaryBlocks: ["price", "spillover"],
      intendedSeries: [
        { id: "oil_price", block: "price", linkedMacroFamily: "C_INFLATION", primarySources: ["DCOILBRENTEU"], aliasFamily: ["oil_price", "dcoilbrenteu", "dcoilwtico"] },
        { id: "gas_price", block: "price", linkedMacroFamily: "C_INFLATION", primarySources: ["NG / regional gas source"], aliasFamily: ["gas_price", "natural_gas", "ttf", "ng"] },
        { id: "energy_cost_pass", block: "spillover", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["PPIACO (energy pass-through family)"], aliasFamily: ["energy_breadth", "energy_ppi", "ppiaco"] },
      ],
      logicSummary: "Energiinput och genomslag till kostnads-/förtroendeblock.",
    },
    localUnrestOverlay: {
      intendedPrimaryBlocks: ["signal", "repricing"],
      intendedSeries: [
        { id: "policy_uncertainty", block: "signal", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["policy uncertainty family"], aliasFamily: ["policy_uncertainty"] },
        { id: "sovereign_repricing", block: "repricing", linkedMacroFamily: "A_FISCAL", primarySources: ["sovereign repricing family"], aliasFamily: ["repricing"] },
      ],
      logicSummary: "Local Unrest uses policy uncertainty + sovereign/state repricing. EA repricing uses sovereign credit spread (BTP-Bund); US repricing uses sovereign duration term premium (ACMTP10).",
    },
    safeHavenRiskOffOverlay: {
      intendedPrimaryBlocks: ["gold_equity", "duration", "usd"],
      intendedSeries: [
        { id: "safe_haven_flow", block: "gold_equity", linkedMacroFamily: "B_MONETARY", primarySources: ["GOLD", "gold family"], aliasFamily: ["safe_haven_flow", "gold", "gold_price"] },
        { id: "equity_risk", block: "gold_equity", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["SP500 / risk asset family"], aliasFamily: ["vix_like", "sp500", "spx_vol_proxy", "vixcls"] },
        { id: "duration_bid", block: "duration", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["duration / rates family"], aliasFamily: ["duration", "real_yield", "rates_proxy"] },
        { id: "usd_strength", block: "usd", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["DTWEXBGS"], aliasFamily: ["usd_strength", "dtwexbgs", "usd_broad_index"] },
      ],
      logicSummary: "Risk-off-flöden via safe-haven, equities och durationdynamik.",
    },
    inflationCostShockOverlay: {
      intendedPrimaryBlocks: ["upstream", "expectations"],
      intendedSeries: [
        { id: "cpi", block: "upstream", linkedMacroFamily: "C_INFLATION", primarySources: ["CPIAUCSL / regional CPI"], aliasFamily: ["cpi", "cpiaucsl", "cp0000ez19m086nest"] },
        { id: "ppi", block: "upstream", linkedMacroFamily: "C_INFLATION", primarySources: ["PPIACO"], aliasFamily: ["ppi", "ppiaco"] },
        { id: "inflation_expectations", block: "expectations", linkedMacroFamily: "A_FISCAL", primarySources: ["T10YIE", "survey expectations source"], aliasFamily: ["inflation_expectations", "t10yie", "breakeven"] },
      ],
      logicSummary: "Kostnadschock via CPI/PPI och inflationsförväntningar.",
    },
    tradeSupplyChainStressOverlay: {
      intendedPrimaryBlocks: ["real_goods_flow", "inventory_pressure", "pricing"],
      intendedSeries: [
        { id: "industrial_production", block: "real_goods_flow", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["INDPRO"], aliasFamily: ["industrial_production", "indpro"] },
        { id: "new_orders", block: "real_goods_flow", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["new orders source"], aliasFamily: ["new_orders", "dgorder", "new_orders_proxy"] },
        { id: "inventories", block: "inventory_pressure", linkedMacroFamily: "C_INFLATION", primarySources: ["ISRATIO / inventory family"], aliasFamily: ["inventories", "isratio", "inventories_orders"] },
        { id: "input_prices", block: "pricing", linkedMacroFamily: "C_INFLATION", primarySources: ["PPIACO / shipping-cost family"], aliasFamily: ["supply_chain_price_stress", "ppiaco", "shipping_proxy"] },
      ],
      logicSummary: "Real goods flow + orders/inventories + inputkostnadstryck.",
    },
    globalUnrestOverlay: {
      intendedPrimaryBlocks: ["regional_composite"],
      intendedSeries: [
        { id: "regional_unrest_us", block: "regional_composite", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["US localUnrestOverlay"], aliasFamily: ["regional_unrest_us", "localunrestoverlay_us"] },
        { id: "regional_unrest_ea", block: "regional_composite", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["EA localUnrestOverlay"], aliasFamily: ["regional_unrest_ea", "localunrestoverlay_ea"] },
        { id: "regional_unrest_se", block: "regional_composite", linkedMacroFamily: "A_FISCAL", primarySources: ["SE localUnrestOverlay"], aliasFamily: ["regional_unrest_se", "localunrestoverlay_se"] },
      ],
      logicSummary: "Sammanslagen global unrest från regionala overlay-inputs.",
    },
  };

  function regionScopedOverlaySpec(overlayKey: string): OverlayDesignSpec {
    const base = overlayDesignSpec[overlayKey] ?? {
      intendedPrimaryBlocks: [],
      intendedSeries: [],
      logicSummary: "No explicit design spec registered.",
    };
    if (overlayKey !== "localUnrestOverlay") return base;

    if (selectedRegion === "US") {
      return {
        ...base,
        intendedSeries: [
          { id: "policy_uncertainty", block: "signal", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["USEPUINDXM"], aliasFamily: ["policy_uncertainty", "policy_uncertainty_us", "usepuindxm"] },
          { id: "sovereign_repricing", block: "repricing", linkedMacroFamily: "A_FISCAL", primarySources: ["ACMTP10"], aliasFamily: ["repricing", "lu_repricing_us", "acmtp10", "acmtp10_us"], note: "US repricing is sovereign duration risk repricing via ACM term premium (intentional regional design difference vs EA)." },
        ],
      };
    }

    if (selectedRegion === "EA") {
      return {
        ...base,
        intendedSeries: [
          { id: "policy_uncertainty", block: "signal", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["EA policy uncertainty family"], aliasFamily: ["policy_uncertainty", "ea_policy_uncertainty"] },
          { id: "sovereign_repricing", block: "repricing", linkedMacroFamily: "A_FISCAL", primarySources: ["IRLTLT01ITM156N", "IRLTLT01DEM156N"], aliasFamily: ["repricing", "lu_repricing_ea", "irl tlt01itm156n", "irl tlt01dem156n", "italy_10y_yield", "germany_10y_yield"], note: "EA repricing is sovereign credit risk repricing via BTP-Bund spread (Italy10Y - Germany10Y)." },
        ],
      };
    }

    return {
      ...base,
      intendedSeries: [
        { id: "policy_uncertainty", block: "signal", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["policy uncertainty family"], aliasFamily: ["policy_uncertainty"] },
        { id: "sovereign_repricing", block: "repricing", linkedMacroFamily: "A_FISCAL", primarySources: ["region-specific sovereign repricing source"], aliasFamily: ["repricing"], note: "Region-specific repricing source not yet defined" },
      ],
    };
  }

  function normalizeToken(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  }

  function valueContainsAlias(value: string, alias: string): boolean {
    const v = normalizeToken(value);
    const a = normalizeToken(alias);
    return v.includes(a) || a.includes(v);
  }

  function inferFallbackUsage(items: Array<{ proxy?: boolean; note?: string; id?: string; source?: string; exactSource?: string }>, _aliasMatched: boolean): "none" | "alias mapping" | "proxy source" | "derived approximation" | "inherited overlay input" {
    const text = items.map((item) => `${item.note ?? ""} ${item.id ?? ""} ${item.source ?? ""} ${item.exactSource ?? ""}`.toLowerCase()).join(" |");
    if (text.includes("inherited") || text.includes("regional_unrest") || text.includes("overlay input")) return "inherited overlay input";
    if (text.includes("derived") || text.includes("approx")) return "derived approximation";
    const hasExplicitProxy = items.some((item) => item.proxy);
    const mentionsProxy = text.includes("proxy") && !text.includes("no proxy") && !text.includes("without proxy");
    if (hasExplicitProxy || mentionsProxy) return "proxy source";
    return "none";
  }

  function inferBlockerType(args: {
    availability: "available" | "partial" | "unavailable" | "not_applicable";
    fallback: "none" | "alias mapping" | "proxy source" | "derived approximation" | "inherited overlay input";
    runtimeHasSeries: boolean;
    aliasMatched: boolean;
    reasonText: string;
    regionSpecificSourceFaithful?: boolean;
  }): "no blocker" | "alias mapping only" | "exact source family differs" | "proxy currently used" | "intended source not ingested" | "intended source not wired to overlay" | "inherited overlay used instead" | "derived approximation used" {
    const text = args.reasonText.toLowerCase();
    if (args.fallback === "inherited overlay input") return "inherited overlay used instead";
    if (args.fallback === "derived approximation") return "derived approximation used";
    if (args.fallback === "proxy source") return "proxy currently used";
    if (args.regionSpecificSourceFaithful) return "no blocker";
    if (args.fallback === "alias mapping" && args.availability === "available") return "alias mapping only";
    if (args.availability === "unavailable" && (text.includes("ingest") || text.includes("not ingested") || text.includes("missing"))) return "intended source not ingested";
    if (args.availability !== "available" && args.runtimeHasSeries) return "exact source family differs";
    if (args.availability !== "available") return "intended source not wired to overlay";
    if (args.aliasMatched) return "alias mapping only";
    return "no blocker";
  }

  const overlayDebugRows = uiOverlayKeysRequested.map((overlayKey) => {
    const overlay = activeOverlayBundle?.overlays?.[overlayKey] ?? null;
    const spec = regionScopedOverlaySpec(overlayKey);
    const runtimeBlockDiagnostics = globalMacro?.overlayBlockDiagnostics?.[overlayKey] ?? [];
    const actualComponents = overlay?.components ?? [];

    const seriesRows = spec.intendedSeries.map((seriesSpec) => {
      const matched = actualComponents.filter((component) => {
        const hay = [component.id, component.source, component.exactSource, component.note].filter(Boolean).map(String);
        return seriesSpec.aliasFamily.some((alias) => hay.some((value) => valueContainsAlias(value, alias)));
      });
      const blockRuntimePool = actualComponents.filter((component) => component.block === seriesSpec.block && !component.missing);
      const runtimePool = matched.length > 0 ? matched : blockRuntimePool;
      const runtimeSeriesUsed = Array.from(new Set(runtimePool.map((component) => component.id))).join(", ") || "—";
      const runtimeSourceUsed = Array.from(new Set(runtimePool.map((component) => component.exactSource || component.source))).join(", ") || "—";
      const aliasMatched = matched.length > 0;
      const anyStrictAvailable = matched.some((component) => !component.missing);
      const anyPartial = matched.some((component) => component.missing);
      const availability: "available" | "partial" | "unavailable" = anyStrictAvailable
        ? "available"
        : anyPartial
          ? "partial"
          : "unavailable";
      const fallbackUsage = inferFallbackUsage(runtimePool, aliasMatched && runtimeSeriesUsed !== "—" && !runtimePool.some((component) => component.proxy));
      const reasonText = runtimePool.map((component) => component.note).filter((note): note is string => Boolean(note)).join(" | ")
        || (availability === "unavailable"
          ? "intended primary source not present in current overlay runtime inputs"
          : fallbackUsage === "alias mapping"
            ? "intended source resolved through canonical alias mapping"
            : "no blocker");
      // Local Unrest repricing is region-specific by design.
      // US uses ACMTP10 as sovereign duration risk repricing.
      // EA uses BTP-Bund as sovereign credit risk repricing.
      // These are different mechanisms but equivalent expressions of state/sovereign risk repricing.
      // US ACMTP10 must not be rejected as a source mismatch merely because EA uses a spread-based source family.
      const localUnrestRepricingSourceFaithful = overlayKey === "localUnrestOverlay"
        && seriesSpec.block === "repricing"
        && fallbackUsage === "none"
        && runtimeSeriesUsed !== "—"
        && ((selectedRegion === "US" && /acmtp10/i.test(runtimeSourceUsed))
          || (selectedRegion === "EA" && /IRLTLT01ITM156N|IRLTLT01DEM156N/i.test(runtimeSourceUsed)));
      const blockerType = inferBlockerType({
        availability,
        fallback: fallbackUsage,
        runtimeHasSeries: runtimeSeriesUsed !== "—",
        aliasMatched,
        reasonText,
        regionSpecificSourceFaithful: localUnrestRepricingSourceFaithful,
      });
      const mappingType = localUnrestRepricingSourceFaithful
        ? "direct"
        : availability === "unavailable"
          ? (runtimeSeriesUsed !== "—" ? "alternative family" : "not mapped")
          : fallbackUsage === "alias mapping"
            ? "alias mapping"
            : fallbackUsage === "proxy source"
              ? "proxy"
              : fallbackUsage === "derived approximation"
                ? "derived"
                : fallbackUsage === "inherited overlay input"
                  ? "inherited"
                  : "direct";
      return {
        id: seriesSpec.id,
        block: seriesSpec.block,
        linkedMacroFamily: seriesSpec.linkedMacroFamily ?? "—",
        intendedPrimarySources: seriesSpec.primarySources.join(", "),
        aliasFamily: seriesSpec.aliasFamily.join(", ") || "—",
        availability,
        runtimeSeriesUsed,
        runtimeSourceUsed,
        mappingType,
        proxy: fallbackUsage === "proxy source" ? "yes" : "no",
        fallbackUsage,
        blockerType,
        note: [seriesSpec.note, reasonText].filter(Boolean).join(" | "),
      };
    });

    const isMacroPseudoBlock = (value: string): boolean => ["A_FISCAL", "B_MONETARY", "C_INFLATION", "D_CREDIBILITY"].includes(value);
    const blockKeys = Array.from(new Set([
      ...Object.keys(overlay?.blockScores ?? {}).filter((block) => !isMacroPseudoBlock(block)),
      ...runtimeBlockDiagnostics.map((row) => row.block).filter((block) => !isMacroPseudoBlock(block)),
      ...spec.intendedPrimaryBlocks,
      ...spec.intendedSeries.map((series) => series.block),
    ]));

    const blockRows = blockKeys.map((block) => {
      const scoreValue = overlay?.blockScores?.[block] ?? null;
      const diagnostics = runtimeBlockDiagnostics.find((item) => item.block === block);
      const exactSeries = seriesRows.filter((row) => row.block === block);
      const blockSeries = exactSeries.length > 0 ? exactSeries : seriesRows;
      const availabilityCounts = {
        available: blockSeries.filter((row) => row.availability === "available").length,
        partial: blockSeries.filter((row) => row.availability === "partial").length,
        unavailable: blockSeries.filter((row) => row.availability === "unavailable").length,
      };
      const sourceAvailabilityBase: "available" | "partial" | "unavailable" = blockSeries.length === 0
        ? "unavailable"
        : availabilityCounts.available === blockSeries.length
          ? "available"
          : (availabilityCounts.available + availabilityCounts.partial) > 0
            ? "partial"
            : "unavailable";

      const blockComponents = actualComponents.filter((component) => component.block === block);
      const hasRuntime = (typeof scoreValue === "number") || blockComponents.some((component) => !component.missing) || diagnostics?.status === "pass" || diagnostics?.status === "proxy";

      const fallbackUsedSet = Array.from(new Set(blockSeries.map((row) => row.fallbackUsage).filter((value) => value !== "none")));
      const fallbackUsed = fallbackUsedSet.length > 0 ? fallbackUsedSet.join(" + ") : "none";
      const intendedPrimarySources = blockSeries.flatMap((row) => row.intendedPrimarySources.split(",").map((item) => item.trim())).filter(Boolean);
      const currentRuntimeSources = Array.from(new Set(blockSeries.map((row) => row.runtimeSourceUsed).filter((item) => item && item !== "—"))).join(", ") || diagnostics?.actualSourceUsed || "—";
      // Local Unrest repricing gating is region-specific by design.
      // US uses ACMTP10 (sovereign duration repricing), while EA uses BTP-Bund spread IDs.
      // If the region-correct source is present with no proxy/fallback, this block must not be marked missing.
      const localUnrestRepricingBlockSourceFaithful = overlayKey === "localUnrestOverlay"
        && block === "repricing"
        && typeof scoreValue === "number"
        && fallbackUsed === "none"
        && !blockComponents.some((component) => component.proxy)
        && ((selectedRegion === "US" && /ACMTP10/i.test(currentRuntimeSources))
          || (selectedRegion === "EA" && /IRLTLT01ITM156N|IRLTLT01DEM156N/i.test(currentRuntimeSources)));
      const sourceAvailability: "available" | "partial" | "unavailable" = localUnrestRepricingBlockSourceFaithful
        ? "available"
        : sourceAvailabilityBase;
      const runtimeStatus: "pass" | "proxy" | "missing" = localUnrestRepricingBlockSourceFaithful
        ? "pass"
        : !hasRuntime
          ? "missing"
          : (blockComponents.some((component) => component.proxy) || blockSeries.some((row) => row.fallbackUsage !== "none" && row.fallbackUsage !== "alias mapping") || diagnostics?.status === "proxy")
            ? "proxy"
            : "pass";
      const availabilityRatio = blockSeries.length === 0 ? 0 : (availabilityCounts.available + availabilityCounts.partial * 0.5) / blockSeries.length;
      const proxyShare = blockSeries.length === 0 ? 1 : blockSeries.filter((row) => row.fallbackUsage === "proxy source" || row.fallbackUsage === "derived approximation" || row.fallbackUsage === "inherited overlay input").length / blockSeries.length;
      const specFidelity: "high" | "medium" | "low" = runtimeStatus === "missing"
        ? "low"
        : availabilityRatio >= 0.6 && proxyShare <= 0.34
          ? "high"
          : availabilityRatio >= 0.3
            ? "medium"
            : "low";
      const reason = diagnostics?.reason
        || blockSeries.map((row) => row.note).filter(Boolean).join(" | ")
        || (runtimeStatus === "pass" && sourceAvailability !== "available"
          ? "runtime pass with partial spec coverage via alias/alternative source family"
          : runtimeStatus === "proxy"
            ? "runtime works but at least one component uses proxy/derived/inherited input"
            : "block cannot be computed with meaningful runtime data");
      const blockerPriority = localUnrestRepricingBlockSourceFaithful
        ? "no blocker"
        : (blockSeries.map((row) => row.blockerType).find((type) => type !== "no blocker")
          || inferBlockerType({ availability: sourceAvailability, fallback: fallbackUsedSet[0] as any || "none", runtimeHasSeries: currentRuntimeSources !== "—", aliasMatched: false, reasonText: reason }));

      return {
        block,
        linkedMacroFamily: Array.from(new Set(blockSeries.map((row) => row.linkedMacroFamily).filter((item) => item && item !== "—"))).join(", ") || "—",
        runtimeStatus,
        specFidelity,
        intendedPrimarySources: intendedPrimarySources.length > 0 ? Array.from(new Set(intendedPrimarySources)).join(", ") : (diagnostics?.expectedSource || "—"),
        runtimeSources: currentRuntimeSources,
        sourceAvailability,
        fallbackUsed,
        blockerType: blockerPriority,
        reason,
        score: typeof scoreValue === "number" ? scoreValue.toFixed(1) : "—",
      };
    });

    const runnableBlocks = blockRows.filter((row) => row.runtimeStatus !== "missing").length;
    const runtimeCompleteness: "full" | "partial" | "weak" = blockRows.length === 0
      ? "weak"
      : runnableBlocks === blockRows.length
        ? "full"
        : runnableBlocks >= Math.ceil(blockRows.length / 2)
          ? "partial"
          : "weak";
    const overlayFidelityScore = blockRows.length === 0 ? 0 : blockRows.reduce((sum, row) => sum + (row.specFidelity === "high" ? 1 : row.specFidelity === "medium" ? 0.5 : 0), 0) / blockRows.length;
    const specFidelity: "high" | "medium" | "low" = overlayFidelityScore >= 0.75 ? "high" : overlayFidelityScore >= 0.4 ? "medium" : "low";
    const runtimeProxyComponentRatio = actualComponents.length === 0 ? 1 : actualComponents.filter((component) => component.proxy).length / actualComponents.length;
    const blockProxyRatio = blockRows.length === 0 ? 1 : blockRows.filter((row) => row.fallbackUsed.includes("proxy source") || row.fallbackUsed.includes("derived approximation") || row.fallbackUsed.includes("inherited overlay input")).length / blockRows.length;
    const criticalBlocksByOverlay: Record<string, string[]> = {
      localUnrestOverlay: ["signal", "repricing"],
      tradeSupplyChainStressOverlay: ["real_goods_flow", "pricing"],
      safeHavenRiskOffOverlay: ["gold_equity", "duration"],
      liquidityOverlay: ["bridge", "transmission"],
    };
    const criticalBlocks = criticalBlocksByOverlay[overlayKey] ?? [];
    const criticalProxyHit = blockRows.some((row) => criticalBlocks.includes(row.block) && (row.fallbackUsed.includes("proxy source") || row.fallbackUsed.includes("derived approximation") || row.fallbackUsed.includes("inherited overlay input")));
    const proxyRatio = Math.max(runtimeProxyComponentRatio, blockProxyRatio);
    const proxyDependence: "none" | "low" | "medium" | "high" = proxyRatio === 0
      ? "none"
      : (proxyRatio > 0.6 || (criticalProxyHit && proxyRatio >= 0.34))
        ? "high"
        : proxyRatio <= 0.25
          ? "low"
          : "medium";
    const robustness: "high" | "medium" | "low" = runtimeCompleteness === "full" && proxyDependence !== "high" && specFidelity !== "low"
      ? "high"
      : runtimeCompleteness === "weak" || proxyDependence === "high"
        ? "low"
        : "medium";
    const fidelityBadge = specFidelity === "high"
      ? "Spec-faithful"
      : runtimeCompleteness === "weak"
        ? "Structurally incomplete"
        : proxyDependence === "high"
          ? "Proxy-heavy"
          : "Near-spec";

    const exactDifferences = blockRows
      .filter((row) => row.blockerType !== "no blocker" || row.sourceAvailability !== "available")
      .map((row) => overlayKey === "localUnrestOverlay" && row.block === "repricing" && /ACMTP10/i.test(row.runtimeSources) && row.fallbackUsed === "none"
        ? "repricing: direct source-faithful match via ACMTP10"
        : `${row.block}: ${row.blockerType}; availability=${row.sourceAvailability}; fallback=${row.fallbackUsed}`);
    const matchesSpec = blockRows
      .filter((row) => row.specFidelity === "high" || (row.specFidelity === "medium" && row.sourceAvailability === "available"))
      .map((row) => `${row.block}: runtime=${row.runtimeStatus}, primary sources present (${row.intendedPrimarySources})`);
    const whyDiffExists = Array.from(new Set(blockRows.flatMap((row) => {
      const reasons: string[] = [];
      if (row.fallbackUsed.includes("alias mapping")) reasons.push("alias mapped source used");
      if (row.fallbackUsed.includes("proxy source")) reasons.push(`${row.block} uses proxy source`);
      if (row.fallbackUsed.includes("derived approximation")) reasons.push(`${row.block} uses derived approximation`);
      if (row.fallbackUsed.includes("inherited overlay input")) reasons.push(`${row.block} built from inherited overlay`);
      if (row.blockerType === "intended source not ingested") reasons.push(`${row.block} source not ingested`);
      if (row.blockerType === "exact source family differs") reasons.push(`${row.block} exact source family differs`);
      if (overlayKey === "localUnrestOverlay" && row.block === "repricing" && /ACMTP10/i.test(row.runtimeSources) && row.fallbackUsed === "none") reasons.push("repricing direct source-faithful match via ACMTP10");
      if (row.blockerType === "intended source not wired to overlay") reasons.push(`${row.block} source not yet wired`);
      return reasons;
    })));
    const impact = proxyDependence === "high"
      ? "Interpret with caution: proxy-heavy signal can shift faster than intended design baseline."
      : specFidelity === "low"
        ? "Interpretation risk is elevated: runtime deviates materially from intended spec."
        : "Interpretation remains broadly aligned with spec; monitor listed deltas.";

    return {
      overlayKey,
      overlay,
      spec,
      runtimeCompleteness,
      specFidelity,
      proxyDependence,
      robustness,
      fidelityBadge,
      blockRows,
      seriesRows,
      implementationDelta: [
        `intended design: ${spec.logicSummary}`,
        `current runtime implementation: ${Array.from(new Set(actualComponents.map((component) => `${component.id} (${component.exactSource || component.source})`))).slice(0, 8).join(", ") || "no runtime components"}`,
        `what matches spec: ${matchesSpec.join(" | ") || "no clear high-fidelity block match"}`,
        `exact differences: ${exactDifferences.join(" | ") || "none"}`,
        `why differences exist: ${whyDiffExists.join(" | ") || "no blocker"}`,
        `impact on interpretation: ${impact}`,
      ],
    };
  });

  const blockRows = useMemo(() => {
    return [
      { key: "A_FISCAL", label: "Fiscal" },
      { key: "B_MONETARY", label: "Monetary" },
      { key: "C_INFLATION", label: "Inflation" },
      { key: "D_CREDIBILITY", label: "Credibility" },
    ] as const;
  }, []);

  function blockStateLabel(score: number | null): string {
    if (score === null) return "Insufficient";
    if (score <= 35) return "Low";
    if (score <= 55) return "Neutral";
    if (score <= 75) return "Elevated";
    return "High";
  }

  function blockLevelPercent(score: number | null): number {
    if (score === null) return 0;
    return Math.max(0, Math.min(100, score));
  }

  function renderOverlayHistoryChart(overlayKey: string) {
    const valid = overlayHistoryPoints
      .map((point) => ({ asOfDate: point.asOfDate, score: point.scores?.[overlayKey] ?? null }))
      .filter((point) => typeof point.score === "number") as Array<{ asOfDate: string; score: number }>;
    if (valid.length < 2) {
      return <div className="status empty">No history available yet</div>;
    }
    const width = 560;
    const height = 160;
    const left = 38;
    const right = 14;
    const top = 12;
    const bottom = 24;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const points = valid.map((point, index) => {
      const x = left + (index / Math.max(1, valid.length - 1)) * plotW;
      const y = top + (1 - Math.max(0, Math.min(100, point.score)) / 100) * plotH;
      return `${x},${y}`;
    }).join(" ");
    return (
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxWidth: 580, height: 170, display: "block" }}>
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = top + (1 - tick / 100) * plotH;
          return <g key={`${overlayKey}-tick-${tick}`}><line x1={left} y1={y} x2={width - right} y2={y} stroke="#d1d5db" strokeWidth={1} /><text x={left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#64748b">{tick}</text></g>;
        })}
        <polyline fill="none" stroke="#0ea5e9" strokeWidth={2.2} points={points} strokeLinecap="round" strokeLinejoin="round" />
        <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} stroke="#475569" strokeWidth={1} />
        <text x={left} y={height - 6} fontSize={10} fill="#64748b">{valid[0]?.asOfDate ?? ""}</text>
        <text x={width - right} y={height - 6} fontSize={10} fill="#64748b" textAnchor="end">{valid[valid.length - 1]?.asOfDate ?? ""}</text>
      </svg>
    );
  }

  const pipelineDebug = globalMacro?.debug ?? null;
  const historyPoints = macroHistory?.points ?? [];
  const regimeIntervals = macroHistory?.intervals.regime ?? [];
  const overlayIntervals = macroHistory?.intervals.overlays ?? { growth: [], stress: [], hardAsset: [] };
  const latestHistoryPoint = historyPoints[historyPoints.length - 1] ?? null;
  const latestRegimeInterval = regimeIntervals[regimeIntervals.length - 1] ?? null;
  const timelineStartDate = macroHistory?.replayEarliestDateUsed ?? macroHistory?.rangeDebug.actualStartDate ?? null;
  const timelineEndDate = macroHistory?.replayLatestDateUsed ?? macroHistory?.rangeDebug.actualEndDate ?? null;
  const timelineWindow = useMemo(() => {
    if (!timelineStartDate || !timelineEndDate) return null;
    const start = new Date(`${timelineStartDate}T00:00:00.000Z`).getTime();
    const end = new Date(`${timelineEndDate}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return { start, end };
  }, [timelineStartDate, timelineEndDate]);
  const pointByDate = useMemo(() => new Map(historyPoints.map((item) => [item.asOfDate, item])), [historyPoints]);

  function regimeColor(regime: string) {
    if (regime === "MonetaryDominance") return "#5a6a80";
    if (regime === "Balanced") return "#6e7b64";
    if (regime === "FiscalPressureBuilding") return "#8c7450";
    if (regime === "FiscalDominanceRisk") return "#7a5851";
    return "#5b5b58";
  }

  function regimeExplanation(regime: string) {
    if (regime === "MonetaryDominance") return "Likviditet och penningpolitik bär marknadsklimatet, medan fiskal press är mer dämpad.";
    if (regime === "Balanced") return "Makroklimatet är relativt balanserat mellan tillväxt, inflation och finansieringsvillkor.";
    if (regime === "FiscalPressureBuilding") return "Finansierings- och inflationspress börjar dominera och höjer känsligheten i riskmiljön.";
    if (regime === "FiscalDominanceRisk") return "Fiskal och finansiell stress väger tungt, vilket ofta innebär ett stramare och mer defensivt marknadsläge.";
    return "Regimen indikerar ett övergångsläge i makrobilden.";
  }


  function segmentPosition(startDate: string, endDate: string): { left: number; width: number } {
    if (!timelineWindow) return { left: 0, width: 100 };
    const total = Math.max(1, timelineWindow.end - timelineWindow.start);
    const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
    const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
    const left = Math.max(0, ((start - timelineWindow.start) / total) * 100);
    const rawWidth = ((Math.max(start, end) - start) / total) * 100;
    const width = Math.max(1.2, rawWidth);
    return { left, width: Math.min(100 - left, width) };
  }

  function latestOverlayDate(intervals: Array<{ endDate: string }>): string {
    return intervals.length > 0 ? intervals[intervals.length - 1].endDate : "—";
  }


  const blockSeriesMeta = [
    { key: "A_FISCAL" as const, label: "Fiscal", color: "#6f86a8", valueOf: (point: MacroHistoryPayload["points"][number]) => point.fiscalScore },
    { key: "B_MONETARY" as const, label: "Monetary", color: "#5f7f63", valueOf: (point: MacroHistoryPayload["points"][number]) => point.monetaryScore },
    { key: "C_INFLATION" as const, label: "Inflation", color: "#a27a4a", valueOf: (point: MacroHistoryPayload["points"][number]) => point.inflationScore },
    { key: "D_CREDIBILITY" as const, label: "Credibility", color: "#7b6676", valueOf: (point: MacroHistoryPayload["points"][number]) => point.credibilityScore },
  ];

  const axisTicks = useMemo(() => {
    if (historyPoints.length === 0) return [] as Array<{ index: number; date: string; label: string }>;
    const desired = historyResolution === "MONTHLY" ? 8 : 10;
    const total = historyPoints.length;
    const step = Math.max(1, Math.floor((total - 1) / Math.max(1, desired - 1)));
    const idx = new Set<number>([0, total - 1]);
    for (let i = step; i < total - 1; i += step) idx.add(i);
    return Array.from(idx).sort((a, b) => a - b).map((index) => {
      const date = historyPoints[index]?.asOfDate ?? "";
      return { index, date, label: historyResolution === "MONTHLY" ? date.slice(0, 7) : date };
    });
  }, [historyPoints, historyResolution]);

  const inflationRows = inflationAnalysis?.points ?? [];
  const inflationSplitData = useMemo(() => {
    if (inflationRows.length === 0) return null;
    return [
      ["Date", "Goods inflation", "Monetary inflation", "Actual inflation"],
      ...inflationRows.map((row) => [new Date(`${row.date}T00:00:00.000Z`), row.goodsInflation, row.monetaryInflation, row.actualInflation]),
    ] as (string | number | Date | null)[][];
  }, [inflationRows]);

  const lynAldenData = useMemo(() => {
    if (inflationRows.length === 0) return null;
    return [
      ["Date", "Monetary pressure", "Asset inflation", "Commodity inflation", "Consumer inflation"],
      ...inflationRows.map((row) => [new Date(`${row.date}T00:00:00.000Z`), row.monetaryPressure, row.assetInflation, row.commodityInflation, row.consumerInflation]),
    ] as (string | number | Date | null)[][];
  }, [inflationRows]);

  const inflationGapData = useMemo(() => {
    if (inflationRows.length === 0) return null;
    return [
      ["Date", "Monetary inflation gap", { type: "string", role: "tooltip" }],
      ...inflationRows.map((row) => {
        const gapLabel = typeof row.monetaryInflationGap === "number"
          ? row.monetaryInflationGap > 2
            ? "latent inflation pressure"
            : row.monetaryInflationGap > 0
              ? "broad inflation manifestation"
              : row.monetaryInflationGap > -1
                ? "CPI catching up"
                : "disinflationary narrowing"
          : "insufficient data";
        return [
          new Date(`${row.date}T00:00:00.000Z`),
          row.monetaryInflationGap,
          `Date: ${row.date}
Monetary inflation: ${row.monetaryInflation ?? "—"}
Actual inflation: ${row.actualInflation ?? "—"}
Gap: ${row.monetaryInflationGap ?? "—"}
Signal: ${gapLabel}`,
        ];
      }),
    ] as (string | number | Date | null)[][];
  }, [inflationRows]);

  async function runIngest(mode: "backfill" | "latest", region: "US" | "EA" | "SE") {
    setIngestRunningMode(mode);
    setIngestRunResult(null);
    try {
      const response = await fetch(`/api/admin/macro/ingest?mode=${mode}&region=${region}`, {
        method: "POST",
        headers: adminSecretInput.trim()
          ? { "x-admin-secret": adminSecretInput.trim() }
          : undefined,
      });
      const payload = await response.json();
      setIngestRunResult({
        status: response.status,
        ok: response.ok,
        payload,
        mode,
        region,
        timestamp: new Date().toISOString(),
        authMethodUsed: adminSecretInput.trim() ? "x-admin-secret header (manual debug input)" : "none",
        adminActionAuth: response.ok ? "OK" : "Failed",
      });
      await loadGlobalMacro();
    } catch (error) {
      setIngestRunResult({
        status: 0,
        ok: false,
        mode,
        region,
        timestamp: new Date().toISOString(),
        authMethodUsed: adminSecretInput.trim() ? "x-admin-secret header (manual debug input)" : "none",
        adminActionAuth: "Failed",
        payload: { error: error instanceof Error ? error.message : "Unknown ingest error" },
      });
    } finally {
      setIngestRunningMode(null);
    }
  }

  async function runEngine(region: "US" | "EA" | "SE") {
    setEngineRunning(true);
    setEngineRunResult(null);
    try {
      const response = await fetch(`/api/admin/macro/run-engine?region=${region}`, {
        method: "POST",
        headers: adminSecretInput.trim()
          ? { "x-admin-secret": adminSecretInput.trim() }
          : undefined,
      });
      const payload = await response.json();
      setEngineRunResult({
        status: response.status,
        ok: response.ok,
        payload,
        region,
        timestamp: new Date().toISOString(),
        authMethodUsed: adminSecretInput.trim() ? "x-admin-secret header (manual debug input)" : "none",
        adminActionAuth: response.ok ? "OK" : "Failed",
      });
      await loadGlobalMacro();
    } catch (error) {
      setEngineRunResult({
        status: 0,
        ok: false,
        region,
        timestamp: new Date().toISOString(),
        authMethodUsed: adminSecretInput.trim() ? "x-admin-secret header (manual debug input)" : "none",
        adminActionAuth: "Failed",
        payload: { error: error instanceof Error ? error.message : "Unknown engine-run error" },
      });
    } finally {
      setEngineRunning(false);
    }
  }

  return (
    <div className="sector-dashboard">
      <div className="sector-grid">
        <div className="sector-card macro-premium-card">
          <h3>Global Macro Dashboard</h3>
          <p className="bread">Global Macro tolkar det makroekonomiska klimatet över tid genom att väga samman finansiering, räntor, inflation, trovärdighet och marknadsstress. Målet är att ge en lugn men skarp lägesbild av vilken regim marknaden befinner sig i – och på sikt knyta den till riskklimat, bull/bear-faser och den bredare kapitalmiljön.</p>

          <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 8, marginBottom: 8 }}>
            {["GLOBAL", "US", "EA", "SE"].map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => setSelectedRegion(region as "GLOBAL" | "US" | "EA" | "SE")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: selectedRegion === region ? "1px solid #111" : "1px solid #d0d7de",
                  background: selectedRegion === region ? "#111" : "#fff",
                  color: selectedRegion === region ? "#fff" : "#111",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  scrollSnapAlign: "start",
                }}
              >
                {region}
              </button>
            ))}
          </div>

          {globalMacroLoading && <div className="status">Laddar Global Macro…</div>}
          {globalMacroError && <div className="status">Kunde inte ladda Global Macro: {globalMacroError}</div>}
          {isNoData && <div className="status empty">Ingen macrodata hittades ännu. Sektionen är aktiv men endpointen returnerade tomt.</div>}

          {!globalMacroLoading && !globalMacroError && globalMacro && (
            <>
              {isPartialData && (
                <div className="status">Partial data: {scoredCount}/{globalMacroIndicators.length} indikatorer är poängsatta.</div>
              )}

              <section style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "12px 12px 8px", marginBottom: 14, background: "#f8fafc" }}>
                <h4 style={{ marginTop: 0 }}>New Overlay Engine</h4>
                <div style={{ fontSize: 13, marginBottom: 10 }}>Teknisk admin/drift-debug finns i <strong>Admin</strong>.</div>

                <div style={{ marginBottom: 12 }}>
                  <strong>Overlay cards</strong>
                  {uiOverlayKeysRequested.length === 0 ? (
                    <div className="status empty">No overlay keys requested.</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginTop: 8 }}>
                      {uiOverlayKeysRequested.map((overlayKey) => {
                        const overlay = activeOverlayBundle?.overlays?.[overlayKey];
                        if (!overlay) {
                          return <div key={overlayKey} className="status empty">{overlayKey}: overlay missing from payload</div>;
                        }
                        const components = overlay.components ?? [];
                        const missingCount = components.filter((component) => component.missing).length;
                        const proxyCount = components.filter((component) => component.proxy).length;
                        return (
                          <div key={overlayKey} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
                            <div style={{ fontWeight: 700 }}>{overlayKey}</div>
                            <div>score: {typeof overlay.score === "number" ? overlay.score.toFixed(1) : "—"}</div>
                            <div>label: {overlay.label || "—"}</div>
                            <div>confidence: {overlay.confidence}%</div>
                            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                              block scores: {Object.entries(overlay.blockScores).map(([block, score]) => `${block}=${typeof score === "number" ? score.toFixed(1) : "—"}`).join(", ") || "—"}
                            </div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>proxy/missing count: {proxyCount}/{missingCount}</div>
                            {overlaySanity.find((entry) => entry.overlayKey === overlayKey)?.lowRobustness && <div className="status" style={{ marginTop: 6 }}>low robustness</div>}
                            {typeof overlay.score !== "number" && <div className="status empty" style={{ marginTop: 6 }}>Overlay present but missing score data.</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <strong>Overlay history graphs</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 8 }}>
                    {overlayKeysForCharts.map((overlayKey) => (
                      <div key={`chart-${overlayKey}`} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{overlayKey}</div>
                        {renderOverlayHistoryChart(overlayKey)}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <strong>Sanity & calibration diagnostics</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, marginTop: 8 }}>
                    {overlaySanity.map((item) => (
                      <div key={`sanity-${item.overlayKey}`} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
                        <div style={{ fontWeight: 700 }}>{item.overlayKey}</div>
                        <div>total score: {typeof activeOverlayBundle?.overlays?.[item.overlayKey]?.score === "number" ? activeOverlayBundle?.overlays?.[item.overlayKey]?.score?.toFixed(1) : "—"}</div>
                        <div>active real blocks: {item.realBlocks}</div>
                        <div>proxy blocks: {item.proxyBlocks}</div>
                        <div>missing blocks: {item.missingBlocks}</div>
                        <div>dominant negative contributors: {item.negative.join(", ") || "—"}</div>
                        <div>normalization inputs: {item.normalizationInputs.join(" | ") || "—"}</div>
                        {item.lowRobustness && <div className="status" style={{ marginTop: 6 }}>low robustness</div>}
                      </div>
                    ))}
                  </div>
                </div>

              </section>

              <section style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "12px 12px 8px", marginBottom: 14, background: "#f8fafc" }}>
                <h4 style={{ marginTop: 0 }}>Overlay Debug</h4>
                {overlayDebugRows.map((row) => (
                  <div key={`overlay-debug-${row.overlayKey}`} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", marginBottom: 12, background: "#fff" }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{row.overlayKey}</div>
                    <ul style={{ marginTop: 4 }}>
                      <li>total score: {typeof row.overlay?.score === "number" ? row.overlay.score.toFixed(1) : "—"}</li>
                      <li>label: {row.overlay?.label ?? "—"}</li>
                      <li>confidence: {row.overlay?.confidence ?? "—"}%</li>
                      <li>runtime completeness: {row.runtimeCompleteness}</li>
                      <li>spec fidelity: {row.specFidelity}</li>
                      <li>robustness: {row.robustness}</li>
                      <li>proxy dependence: {row.proxyDependence}</li>
                      <li>fidelity badge: <strong>{row.fidelityBadge}</strong></li>
                    </ul>

                    <div style={{ fontSize: 12, marginBottom: 8 }}>
                      <strong>Intended primary design</strong><br />
                      Blocks: {row.spec.intendedPrimaryBlocks.join(", ") || "—"}<br />
                      Series: {row.spec.intendedSeries.map((series) => series.id).join(", ") || "—"}<br />
                      Intended source families: {Array.from(new Set(row.spec.intendedSeries.flatMap((series) => series.primarySources))).join(", ") || "—"}<br />
                      Logic: {row.spec.logicSummary}
                    </div>

                    <div style={{ overflowX: "auto", marginBottom: 8 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>overlay</th>
                            <th>block</th>
                            <th>runtime status</th>
                            <th>spec fidelity</th>
                            <th>linked macro family</th>
                            <th>intended primary sources</th>
                            <th>current runtime sources</th>
                            <th>source availability</th>
                            <th>fallback used</th>
                            <th>reason</th>
                            <th>blocker type</th>
                            <th>score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.blockRows.map((block) => (
                            <tr key={`overlay-block-${row.overlayKey}-${block.block}`}>
                              <td>{row.overlayKey}</td>
                              <td>{block.block}</td>
                              <td>{block.runtimeStatus}</td>
                              <td>{block.specFidelity}</td>
                              <td>{block.linkedMacroFamily}</td>
                              <td>{block.intendedPrimarySources}</td>
                              <td>{block.runtimeSources}</td>
                              <td>{block.sourceAvailability}</td>
                              <td>{block.fallbackUsed}</td>
                              <td>{block.reason}</td>
                              <td>{block.blockerType}</td>
                              <td>{block.score}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ overflowX: "auto", marginBottom: 8 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>intended series</th>
                            <th>aliases (intended family)</th>
                            <th>availability in current pipeline</th>
                            <th>current runtime source</th>
                            <th>current runtime series</th>
                            <th>mapping type</th>
                            <th>proxy</th>
                            <th>fallback used</th>
                            <th>reason</th>
                            <th>blocker type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.seriesRows.map((series) => (
                            <tr key={`overlay-series-${row.overlayKey}-${series.id}`}>
                              <td>{series.id}</td>
                              <td>{series.aliasFamily}</td>
                              <td>{series.availability}</td>
                              <td>{series.runtimeSourceUsed}</td>
                              <td>{series.runtimeSeriesUsed}</td>
                              <td>{series.mappingType}</td>
                              <td>{series.proxy}</td>
                              <td>{series.fallbackUsage}</td>
                              <td>{series.note || "—"}</td>
                              <td>{series.blockerType}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ fontSize: 12 }}>
                      <strong>Implementation delta vs spec</strong>
                      <ul>
                        {row.implementationDelta.map((gap) => (
                          <li key={`${row.overlayKey}-${gap}`}>{gap}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </section>

              <h4>Summary</h4>
              <ul>
                <li>Core Regime: <strong>{globalMacro.regime.coreRegimeLabel}</strong></li>
                <li>Macro score: {typeof globalMacro.regime.macroScoreTotal === "number" ? globalMacro.regime.macroScoreTotal.toFixed(1) : "—"}</li>
                <li>Confidence: {globalMacro.regime.macroConfidence}%</li>
                
                <li>Data status: {globalMacro.dataStatus}</li>
              </ul>

              <div style={{ fontSize: 12, marginBottom: 8 }}><strong>Legacy overlays finns kvar i Admin.</strong></div>

              <h4>Blockrad</h4>
              <div className="metric-list">
                <ul>
                  {blockRows.map((block) => {
                    const score = globalMacro.regime.blockScores[block.key];
                    return (
                      <li key={block.key}>
                        <strong>{block.label}</strong> — score: {typeof score === "number" ? score.toFixed(1) : "—"} ({blockStateLabel(score)})
                        <div style={{ height: 6, background: "#e2e8f0", borderRadius: 6, marginTop: 4 }}>
                          <div style={{ height: 6, width: `${blockLevelPercent(score)}%`, background: "#0ea5e9", borderRadius: 6 }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <details>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>▸ Top drivers + signal split</summary>
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, marginBottom: 8 }}>
                    <strong>{globalMacro.regime.regimeExplanation.title}:</strong> {globalMacro.regime.regimeExplanation.summary}
                  </div>
                  {globalMacro.regime.topDrivers.length === 0 ? (
                    <div className="status empty">Inga top drivers tillgängliga ännu.</div>
                  ) : (
                    <ul>
                      {globalMacro.regime.topDrivers.slice(0, 5).map((driver) => (
                        <li key={driver.indicatorId}>
                          <strong>{driver.title ?? driver.indicatorId}</strong> ({driver.block ?? "D_CREDIBILITY"})
                          {typeof driver.contribution === "number" ? ` · contrib ${driver.contribution.toFixed(2)}` : ""}
                          {typeof driver.percentile10y === "number" ? ` · pctl ${driver.percentile10y.toFixed(1)}` : ""}
                          {driver.direction ? ` · ${driver.direction}` : ""}
                          {typeof driver.change1m === "number" ? ` · 1m ${driver.change1m.toFixed(2)}` : ""}
                          {typeof driver.change3m === "number" ? ` · 3m ${driver.change3m.toFixed(2)}` : ""}
                          {typeof driver.yoy === "number" ? ` · YoY ${driver.yoy.toFixed(2)}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}

                  <h4>Signal split</h4>
                  <ul>
                    <li>Clear signals: {globalMacroIndicators.filter((item) => item.signalClass === "clear").length} | strength {globalMacro.regime.clearSignalStrength ?? "—"}</li>
                    <li>Speculative signals: {globalMacroIndicators.filter((item) => item.signalClass === "speculative").length} | strength {globalMacro.regime.speculativeSignalStrength ?? "—"}</li>
                  </ul>
                </div>
              </details>


              <h4>Macro Regime History</h4>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <label>
                  Resolution
                  <select value={historyResolution} onChange={(event) => setHistoryResolution(event.target.value as "WEEKLY" | "MONTHLY")} style={{ marginLeft: 6 }}>
                    <option value="MONTHLY">MONTHLY</option>
                    <option value="WEEKLY">WEEKLY</option>
                  </select>
                </label>
                <label>
                  Range
                  <select value={String(historyRangeYears)} onChange={(event) => setHistoryRangeYears(event.target.value === "MAX" ? "MAX" : Number(event.target.value))} style={{ marginLeft: 6 }}>
                    {historyResolution === "MONTHLY" ? (
                      <>
                        <option value={10}>10 år</option>
                        <option value={20}>20 år</option>
                        <option value="MAX">Max</option>
                      </>
                    ) : (
                      <>
                        <option value={1}>1 år</option>
                        <option value={3}>3 år</option>
                        <option value={5}>5 år</option>
                      </>
                    )}
                  </select>
                </label>
              </div>

              {macroHistory && historyPoints.length > 0 ? (
                <>
                  <h5>1) Macro Score History</h5>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>
                    <strong>Score zones:</strong> ≤{macroHistory.template.thresholds.monetaryDominanceMax} MonetaryDominance, {macroHistory.template.thresholds.monetaryDominanceMax + 1}–{macroHistory.template.thresholds.balancedMax} Balanced, {macroHistory.template.thresholds.balancedMax + 1}–{macroHistory.template.thresholds.fiscalPressureMax} FiscalPressureBuilding, &gt;{macroHistory.template.thresholds.fiscalPressureMax} FiscalDominanceRisk.
                  </div>
                  <div style={{ border: "1px solid #8e8678", borderRadius: 10, padding: "8px 10px", background: "#2f2b27", marginBottom: 8 }}>
                    <svg viewBox="0 0 1000 320" style={{ width: "100%", height: "360px", display: "block" }} role="img" aria-label="Macro score history med regimebakgrund">
                      {regimeIntervals.map((interval) => {
                        const pos = segmentPosition(interval.startDate, interval.endDate);
                        return (
                          <g key={`regime-bg-${interval.startDate}-${interval.endDate}-${interval.coreRegimeLabel}`}>
                            <rect
                              x={72 + (pos.left / 100) * 900}
                              y={28}
                              width={(pos.width / 100) * 900}
                              height={240}
                              fill={regimeColor(interval.coreRegimeLabel)}
                              fillOpacity={0.6}
                              stroke="#ffffff"
                              strokeWidth={0.5}
                              onClick={() => {
                                const startPoint = pointByDate.get(interval.startDate);
                                const endPoint = pointByDate.get(interval.endDate);
                                const deltas = [
                                  { key: "Fiscal", delta: (endPoint?.fiscalScore ?? 0) - (startPoint?.fiscalScore ?? 0) },
                                  { key: "Monetary", delta: (endPoint?.monetaryScore ?? 0) - (startPoint?.monetaryScore ?? 0) },
                                  { key: "Inflation", delta: (endPoint?.inflationScore ?? 0) - (startPoint?.inflationScore ?? 0) },
                                  { key: "Credibility", delta: (endPoint?.credibilityScore ?? 0) - (startPoint?.credibilityScore ?? 0) },
                                ];
                                const endTopDrivers = endPoint?.topDrivers ?? [];
                                setSelectedRegimeInterval({
                                  coreRegimeLabel: interval.coreRegimeLabel,
                                  startDate: interval.startDate,
                                  endDate: interval.endDate,
                                  pointCount: interval.pointCount,
                                  topDriver: interval.topDriver,
                                  upFactors: deltas.filter((item) => item.delta > 2).map((item) => `${item.key} ↑`).slice(0, 3),
                                  downFactors: deltas.filter((item) => item.delta < -2).map((item) => `${item.key} ↓`).slice(0, 3),
                                  topDrivers: endTopDrivers.slice(0, 5).map((driver) => ({ title: driver.title ?? driver.indicatorId, direction: driver.direction ?? "stable", block: driver.block ?? "D_CREDIBILITY", contribution: typeof driver.contribution === "number" ? driver.contribution : 0 })),
                                  explanation: endPoint?.regimeExplanation?.summary ?? regimeExplanation(interval.coreRegimeLabel),
                                });
                              }}
                              style={{ cursor: "pointer" }}
                            />
                          </g>
                        );
                      })}

                      {[0, 25, 50, 75, 100].map((tick) => (
                        <g key={`score-y-${tick}`}>
                          <line x1={72} y1={28 + (1 - tick / 100) * 240} x2={972} y2={28 + (1 - tick / 100) * 240} stroke="#62584d" strokeWidth={1} />
                          <text x={52} y={32 + (1 - tick / 100) * 240} textAnchor="end" fontSize={11} fill="#d6cfc4">{tick}</text>
                        </g>
                      ))}

                      <polyline
                        fill="none"
                        stroke="#f0ede7"
                        strokeWidth={2.5}
                        points={historyPoints
                          .filter((point) => typeof point.macroScoreTotal === "number")
                          .map((point) => {
                            const x = 72 + (segmentPosition(point.asOfDate, point.asOfDate).left / 100) * 900;
                            const y = 28 + (1 - (point.macroScoreTotal ?? 0) / 100) * 240;
                            return `${x},${y}`;
                          })
                          .join(" ")}
                      />

                      {historyPoints.filter((point) => point.regimeChanged && typeof point.macroScoreTotal === "number").map((point) => {
                        const x = 72 + (segmentPosition(point.asOfDate, point.asOfDate).left / 100) * 900;
                        const y = 28 + (1 - (point.macroScoreTotal ?? 0) / 100) * 240;
                        return <circle key={`score-change-${point.asOfDate}`} cx={x} cy={y} r={3.2} fill="#8f5f55" />;
                      })}

                      <line x1={72} y1={268} x2={972} y2={268} stroke="#b8afa1" strokeWidth={1} />
                      {axisTicks.map((tick) => {
                        const x = 72 + ((historyPoints.length <= 1 ? 0 : tick.index / (historyPoints.length - 1)) * 900);
                        return (
                          <g key={`score-x-${tick.index}`}>
                            <line x1={x} y1={268} x2={x} y2={272} stroke="#b8afa1" strokeWidth={1} />
                            <text x={x} y={289} textAnchor="middle" fontSize={11} fill="#d6cfc4">{tick.label}</text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8, fontSize: 12 }}>
                    {(["MonetaryDominance", "Balanced", "FiscalPressureBuilding", "FiscalDominanceRisk"] as const).map((regime) => (
                      <span key={regime} style={{ padding: "2px 8px", borderRadius: 999, background: regimeColor(regime) }}>{regime}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 8 }}>
                    Latest punkt: <strong>{latestHistoryPoint?.asOfDate ?? "—"}</strong> | Regim <strong>{latestHistoryPoint?.coreRegimeLabel ?? "—"}</strong> | Score <strong>{typeof latestHistoryPoint?.macroScoreTotal === "number" ? latestHistoryPoint.macroScoreTotal.toFixed(1) : "—"}</strong> | Top driver <strong>{latestHistoryPoint?.topDriver ?? "—"}</strong>
                  </div>
                  {selectedRegimeInterval && (
                    <div style={{ marginBottom: 12, fontSize: 12, border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
                      <strong>{selectedRegimeInterval.coreRegimeLabel}</strong> · {selectedRegimeInterval.startDate} → {selectedRegimeInterval.endDate} · {selectedRegimeInterval.pointCount} punkter<br />
                      Top driver: <strong>{selectedRegimeInterval.topDriver ?? "—"}</strong><br />
                      Förklaring: {selectedRegimeInterval.explanation}<br />
                      Faktorer upp: {selectedRegimeInterval.upFactors.join(", ") || "Inga tydliga uppdrivare"} · Faktorer ned: {selectedRegimeInterval.downFactors.join(", ") || "Inga tydliga motrörelser"}
                      <ul>
                        {selectedRegimeInterval.topDrivers.map((driver) => (
                          <li key={`${driver.title}-${driver.block}`}>{driver.title} ({driver.block}) · {driver.direction} · contrib {driver.contribution.toFixed(2)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <h5>2) Block History (Neon Focus)</h5>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    {blockSeriesMeta.map((series) => {
                      const isFocused = focusedBlockSeries === series.key;
                      const isDimmed = focusedBlockSeries !== null && !isFocused;
                      return (
                        <button
                          key={`focus-${series.key}`}
                          type="button"
                          onClick={() => setFocusedBlockSeries((prev) => (prev === series.key ? null : series.key))}
                          style={{
                            border: `1px solid ${series.color}`,
                            background: isFocused ? series.color : "#332f2a",
                            color: isFocused ? "#f3eee5" : "#d8d0c3",
                            opacity: isDimmed ? 0.42 : 1,
                            borderRadius: 999,
                            padding: "5px 12px",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          {series.label}
                        </button>
                      );
                    })}
                    <button type="button" onClick={() => setFocusedBlockSeries(null)} style={{ border: "1px solid #8b8376", background: "#2f2b27", color: "#d8d0c3", borderRadius: 999, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>
                      Återställ fokus
                    </button>
                  </div>
                  <div style={{ border: "1px solid #8e8678", borderRadius: 10, padding: "8px 10px", background: "#2f2b27", marginBottom: 8 }}>
                    <svg
                      viewBox="0 0 1000 320"
                      style={{ width: "100%", height: "340px", display: "block" }}
                      onMouseMove={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left - 72) / 900));
                        setBlockHoverIndex(Math.round(ratio * Math.max(0, historyPoints.length - 1)));
                      }}
                      onMouseLeave={() => setBlockHoverIndex(null)}
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left - 72) / 900));
                        setBlockHoverIndex(Math.round(ratio * Math.max(0, historyPoints.length - 1)));
                      }}
                    >
                      {[0, 25, 50, 75, 100].map((tick) => (
                        <g key={`block-y-${tick}`}>
                          <line x1={72} y1={28 + (1 - tick / 100) * 240} x2={972} y2={28 + (1 - tick / 100) * 240} stroke="#5f564a" strokeWidth={1} />
                          <text x={62} y={32 + (1 - tick / 100) * 240} textAnchor="end" fontSize={11} fill="#d6cfc4">{tick}</text>
                        </g>
                      ))}

                      {blockSeriesMeta.map((series) => {
                        const focused = focusedBlockSeries === series.key;
                        const dimmed = focusedBlockSeries !== null && !focused;
                        const points = historyPoints
                          .map((point, index) => {
                            const value = series.valueOf(point);
                            if (typeof value !== "number") return null;
                            const x = 72 + ((historyPoints.length <= 1 ? 0 : index / (historyPoints.length - 1)) * 900);
                            const y = 28 + (1 - value / 100) * 240;
                            return `${x},${y}`;
                          })
                          .filter((item): item is string => item !== null)
                          .join(" ");
                        return (
                          <polyline
                            key={`block-line-${series.key}`}
                            fill="none"
                            stroke={series.color}
                            strokeWidth={focused ? 3.8 : 1.8}
                            strokeOpacity={dimmed ? 0.14 : focused ? 1 : 0.46}
                            points={points}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      })}

                      {blockHoverIndex !== null && historyPoints[blockHoverIndex] && (
                        <line
                          x1={72 + ((historyPoints.length <= 1 ? 0 : blockHoverIndex / (historyPoints.length - 1)) * 900)}
                          y1={28}
                          x2={72 + ((historyPoints.length <= 1 ? 0 : blockHoverIndex / (historyPoints.length - 1)) * 900)}
                          y2={268}
                          stroke="#cfc5b3"
                          strokeWidth={1}
                          strokeDasharray="4 4"
                        />
                      )}

                      <line x1={72} y1={268} x2={972} y2={268} stroke="#b8afa1" strokeWidth={1} />
                      {axisTicks.map((tick) => {
                        const x = 72 + ((historyPoints.length <= 1 ? 0 : tick.index / (historyPoints.length - 1)) * 900);
                        return (
                          <g key={`block-x-${tick.index}`}>
                            <line x1={x} y1={268} x2={x} y2={272} stroke="#b8afa1" strokeWidth={1} />
                            <text x={x} y={289} textAnchor="middle" fontSize={11} fill="#d6cfc4">{tick.label}</text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                  {blockHoverIndex !== null && historyPoints[blockHoverIndex] && (
                    <div style={{ fontSize: 12, marginBottom: 12, border: "1px solid #8e8678", borderRadius: 8, padding: "8px 10px", background: "#2f2b27", color: "#ece4d7" }}>
                      <strong>{historyPoints[blockHoverIndex].asOfDate}</strong> · Fiscal {historyPoints[blockHoverIndex].fiscalScore ?? "—"} · Monetary {historyPoints[blockHoverIndex].monetaryScore ?? "—"} · Inflation {historyPoints[blockHoverIndex].inflationScore ?? "—"} · Credibility {historyPoints[blockHoverIndex].credibilityScore ?? "—"}
                    </div>
                  )}

                  <h5>3) Legacy Overlay Timelines</h5>
                  <div className="status" style={{ marginBottom: 8 }}>Legacy overlay-tidslinjer och debug finns i Admin.</div>

                  <details>
                    <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>▸ 4) Regime Change Log</summary>
                    <div style={{ overflowX: "auto", marginBottom: 8, marginTop: 8 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Från</th>
                          <th>Till</th>
                          <th>Overlay change</th>
                          <th>Viktigaste driver</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyPoints.filter((point) => point.regimeChanged).map((point) => (
                          <tr key={`change-${point.asOfDate}`}>
                            <td>{point.asOfDate}</td>
                            <td>{point.previousRegimeLabel ?? "—"}</td>
                            <td>{point.coreRegimeLabel}</td>
                            <td>{point.overlayChanged ? "Ja" : "Nej"}</td>
                            <td>{point.topDriver ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </details>
                </>
              ) : (
                <div className="status empty">Ingen historik kunde genereras för vald period/upplösning.</div>
              )}

              <details>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>▸ Indicator drilldown</summary>
                {globalMacroIndicators.length === 0 ? (
                <div className="status empty">Inga indikatorer returnerades från endpointen.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Indicator</th>
                        <th>Block</th>
                        <th>Signal class</th>
                        <th>Score</th>
                        <th>Percentile</th>
                        <th>Freshness</th>
                        <th>Coverage</th>
                        <th>Source</th>
                        <th>Null reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {globalMacroIndicators.map((indicator) => (
                        <tr key={indicator.indicatorId}>
                          <td>{indicator.title}</td>
                          <td>{indicator.block}</td>
                          <td>{indicator.signalClass}</td>
                          <td>{indicator.score ?? "—"}</td>
                          <td>{typeof indicator.percentile10y === "number" ? indicator.percentile10y.toFixed(1) : "—"}</td>
                          <td>{indicator.freshnessDays ?? "—"}d</td>
                          <td>{indicator.coverage10yPct.toFixed(1)}%</td>
                          <td>{indicator.sourceType}</td>
                          <td>{indicator.nullReason ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              </details>
            </>
          )}
          {selectedRegion !== "GLOBAL" && (
            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Inflation</summary>
              <div style={{ marginTop: 12, display: "grid", gap: 18 }}>
                <ChartCard
                  title="Inflation split"
                  chartType="LineChart"
                  height={360}
                  data={inflationSplitData}
                  unitLabel="YoY %"
                  unitKind="percent"
                  options={{
                    colors: ["#6f86a8", "#5f7f63", "#a27a4a"],
                    vAxis: { format: "#,##0.0'%'" },
                  }}
                  infoSections={[
                    {
                      heading: "Introduktion",
                      lines: [
                        "Varuinflation = pristryck från energi, råvaror, varor och insatskostnader.",
                        "Monetär inflation = pristryck från likviditet, penningmängd, kredit och balansräkningsdynamik.",
                        `Faktisk inflation följer regional referens: ${inflationAnalysis?.metadata.actualInflationSeries ?? "—"}.`,
                      ],
                    },
                    {
                      heading: "Tolkning",
                      lines: [
                        "Hög varuinflation + låg monetär inflation tyder på mer kostnadsdriven inflation.",
                        "Låg varuinflation + hög monetär inflation tyder på uppbyggt monetärt tryck.",
                        "När båda är höga är inflationsregimen bred; när båda är låga är inflationsklimatet svagt.",
                        "Om faktisk inflation ligger under båda kan inflation vara latent; ligger den över kan en separat prischock vara i spel.",
                      ],
                    },
                  ]}
                />

                <ChartCard
                  title="LynAldenology: Inflation"
                  chartType="LineChart"
                  height={360}
                  data={lynAldenData}
                  unitLabel="YoY %"
                  unitKind="percent"
                  options={{
                    colors: ["#5f7f63", "#7b6676", "#6f86a8", "#a27a4a"],
                    vAxis: { format: "#,##0.0'%'" },
                  }}
                  infoSections={[
                    {
                      heading: "Money → Assets → Commodities → Consumer prices",
                      lines: [
                        "Monetary pressure visar uppbyggt monetärt tryck i systemet.",
                        "Asset inflation visar om likviditet först går in i tillgångar.",
                        "Commodity inflation visar om trycket spiller över i råvaror.",
                        "Consumer inflation visar när trycket når konsumentpriser.",
                      ],
                    },
                    {
                      heading: "Så läser du kedjan",
                      lines: [
                        "Hög monetary pressure men låg consumer inflation betyder ofta tidig fas i kedjan.",
                        "Hög asset inflation men låg CPI/HICP betyder att likviditet främst driver tillgångar.",
                        "Hög commodity inflation efter monetärt uppsving signalerar transmission till real ekonomi.",
                        "Hög consumer inflation efter asset/commodity-trend indikerar senare fas i inflationsprocessen.",
                      ],
                    },
                  ]}
                />

                <ChartCard
                  title="Monetary Inflation Gap"
                  chartType="AreaChart"
                  height={360}
                  data={inflationGapData}
                  unitLabel="pp"
                  unitKind="percent"
                  options={{
                    colors: ["#6f86a8"],
                    areaOpacity: 0.18,
                    vAxis: { format: "#,##0.0' pp'" },
                    hAxis: { gridlines: { color: "#d5dcc5" } },
                    series: { 0: { lineWidth: 2.5 } },
                    intervals: { style: "area" },
                    baseline: 0,
                    baselineColor: "#2f2b27",
                  }}
                  infoSections={[
                    {
                      heading: "Vad gapet visar",
                      lines: [
                        "Positivt gap = monetärt tryck större än observerad inflation.",
                        "Negativt gap = prisinflationen är högre än det monetära tryckmåttet.",
                        "Nära noll = monetärt tryck och faktisk inflation ligger nära varandra.",
                      ],
                    },
                    {
                      heading: "Signaler",
                      lines: [
                        "Högt positivt gap kan signalera latent inflation innan CPI/HICP fullt reagerar.",
                        "Snabbt fallande gap kan betyda att CPI hinner ikapp eller att åtstramning biter.",
                        "Snabbt stigande gap fungerar som tidig inflationssignal i makrolagret.",
                      ],
                    },
                  ]}
                />

                {inflationAnalysis?.metadata.proxyNotes?.length ? (
                  <div style={{ fontSize: 12, border: "1px solid #d0d7de", borderRadius: 8, padding: "10px 12px", background: "#f8fafc" }}>
                    <strong>Proxy notes:</strong>
                    <ul style={{ margin: "6px 0 0 18px" }}>
                      {inflationAnalysis.metadata.proxyNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                    <div style={{ marginTop: 6 }}>
                      <strong>Series:</strong> Actual: {inflationAnalysis.metadata.actualInflationSeries} · Monetary: {inflationAnalysis.metadata.monetaryInflationSeries} · Goods: {inflationAnalysis.metadata.goodsInflationSeries} · Asset: {inflationAnalysis.metadata.assetInflationSeries} · Commodity: {inflationAnalysis.metadata.commodityInflationSeries}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          )}

          <section style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "10px 12px", marginTop: 12, background: "#f8fafc" }}>
            <h4 style={{ marginTop: 0 }}>Legacy Debug</h4>
            <ul>
              <li>growth={globalMacro?.regime.growthOverlay ?? "—"}, stress={globalMacro?.regime.stressOverlay ?? "—"}, hard_asset={globalMacro?.regime.hardAssetOverlay ?? "—"}</li>
              <li>Legacy overlay intervals — growth: {overlayIntervals.growth.length}, stress: {overlayIntervals.stress.length}, hard_asset: {overlayIntervals.hardAsset.length}</li>
              <li>Latest growth interval end: {latestOverlayDate(overlayIntervals.growth)}</li>
              <li>Latest stress interval end: {latestOverlayDate(overlayIntervals.stress)}</li>
              <li>Latest hard asset interval end: {latestOverlayDate(overlayIntervals.hardAsset)}</li>
            </ul>

            <ExpandablePanel title="Pipeline / Snapshot / Ingestion / Source Debug" defaultOpen={false}>
            <div style={{ marginTop: 10 }}>
              <h4>Snapshot status</h4>
              <ul>
                <li>readMode: {pipelineDebug?.snapshotStatus.readMode ?? "—"}</li>
                <li>dataStatus: {pipelineDebug?.snapshotStatus.dataStatus ?? globalMacro?.dataStatus ?? "—"}</li>
                <li>snapshotAsOfDate: {pipelineDebug?.snapshotStatus.snapshotAsOfDate ?? globalMacro?.stats?.snapshotAsOfDate ?? "null"}</li>
                <li>snapshotHealth: {pipelineDebug?.snapshotStatus.snapshotHealth ?? "invalid"}</li>
                <li>fallbackLive: {String(pipelineDebug?.snapshotStatus.fallbackLive ?? false)}</li>
                <li>primaryPathSnapshot: {String(pipelineDebug?.snapshotStatus.primaryPath ?? false)}</li>
              </ul>

              <h4>Raw data stats</h4>
              <ul>
                <li>rawPointCount: {String(pipelineDebug?.rawDataStats.rawPointCount ?? null)}</li>
                <li>seriesCount: {String(pipelineDebug?.rawDataStats.seriesCount ?? null)}</li>
                <li>indicatorCount: {String(pipelineDebug?.rawDataStats.indicatorCount ?? globalMacroIndicators.length)}</li>
                <li>scoredCount: {String(pipelineDebug?.rawDataStats.scoredCount ?? scoredCount)}</li>
                <li>partialData: {String(pipelineDebug?.rawDataStats.partialData ?? isPartialData)}</li>
              </ul>

              <h4>Expected vs found series</h4>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>expectedSeriesKey</th>
                      <th>found</th>
                      <th>rawCount</th>
                      <th>latestRawDate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pipelineDebug?.expectedVsFoundSeries ?? []).map((row) => (
                      <tr key={row.seriesKey}>
                        <td>{row.seriesKey}</td>
                        <td>{row.found ? "yes" : "no"}</td>
                        <td>{row.rawCount}</td>
                        <td>{row.latestRawDate ?? "null"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h4>Indicator input status</h4>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>indicatorId</th>
                      <th>title</th>
                      <th>block</th>
                      <th>signalClass</th>
                      <th>expected input series</th>
                      <th>found input series</th>
                      <th>valueLatest</th>
                      <th>coverage10yPct</th>
                      <th>dataStatus</th>
                      <th>nullReason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pipelineDebug?.indicatorInputStatus ?? []).map((row) => (
                      <tr key={row.indicatorId}>
                        <td>{row.indicatorId}</td>
                        <td>{row.title}</td>
                        <td>{row.block}</td>
                        <td>{row.signalClass}</td>
                        <td>{row.expectedInputs.join(", ") || "—"}</td>
                        <td>{row.foundInputs.join(", ") || "—"}</td>
                        <td>{row.valueLatest ?? "null"}</td>
                        <td>{row.coverage10yPct.toFixed(1)}%</td>
                        <td>{row.dataStatus}</td>
                        <td>{row.nullReason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h4>Block status</h4>
              <ul>
                {Object.entries(pipelineDebug?.blockStatus ?? {}).map(([block, status]) => (
                  <li key={block}>
                    {block}: {status.status} ({status.scored}/{status.total} scored)
                    {status.reasons.length > 0 ? ` — ${status.reasons.join("; ")}` : ""}
                  </li>
                ))}
              </ul>

              <h4>Overlay data status</h4>
              <ul>
                {Object.entries(pipelineDebug?.overlayDataStatus ?? {}).map(([overlay, status]) => (
                  <li key={overlay}>
                    {overlay}: scored inputs [{status.scoredInputs.join(", ") || "none"}], missing [{status.missingInputs.join(", ") || "none"}], usesFallback={String(status.usesFallback)}, fallbackReason={status.fallbackReason}{status.blockedIndicators.length > 0 ? `, blocked=[${status.blockedIndicators.map((item) => `${item.indicatorId}:${item.reason}`).join("; ")}]` : ""}
                  </li>
                ))}
              </ul>

              <h4>Confidence diagnostics</h4>
              <ul>
                <li>macroConfidence: {pipelineDebug?.confidenceDiagnostics?.macroConfidence ?? "—"}%</li>
                <li>formula: {pipelineDebug?.confidenceDiagnostics?.formula ?? "—"}</li>
                <li>clear signals: {pipelineDebug?.confidenceDiagnostics ? `${pipelineDebug.confidenceDiagnostics.clearSignalsScored}/${pipelineDebug.confidenceDiagnostics.clearSignalsTotal}` : "—"}</li>
                <li>speculative signals: {pipelineDebug?.confidenceDiagnostics ? `${pipelineDebug.confidenceDiagnostics.speculativeSignalsScored}/${pipelineDebug.confidenceDiagnostics.speculativeSignalsTotal}` : "—"}</li>
                <li>overlay fallback count: {pipelineDebug?.confidenceDiagnostics?.overlayFallbackCount ?? "—"}</li>
                <li>note: {pipelineDebug?.confidenceDiagnostics?.note ?? "—"}</li>
              </ul>

              <h4>Snapshot content</h4>
              <ul>
                <li>indicator snapshots: {pipelineDebug?.snapshotContent.indicatorSnapshotCount ?? "—"}</li>
                <li>regime snapshots: {pipelineDebug?.snapshotContent.regimeSnapshotCount ?? "—"}</li>
                <li>history region: {macroHistory?.region ?? selectedRegion}</li>
                <li>history selected resolution: {macroHistory?.resolution ?? historyResolution}</li>
                <li>history requested range: {String(macroHistory?.requestedRangeYears ?? historyRangeYears)}</li>
                <li>history actual rendered range: {(macroHistory?.rangeDebug.actualStartDate ?? "—")} → {(macroHistory?.rangeDebug.actualEndDate ?? "—")}</li>
                <li>history earliest raw date used: {macroHistory?.replayEarliestDateUsed ?? "—"}</li>
                <li>history latest raw date used: {macroHistory?.replayLatestDateUsed ?? "—"}</li>
                <li>history earliest raw available: {macroHistory?.earliestRawDate ?? "—"}</li>
                <li>history latest raw available: {macroHistory?.latestRawDate ?? "—"}</li>
                <li>history unfilled reason: {macroHistory?.rangeDebug.unfilledReason ?? "none"}</li>
                <li>history limiting indicators: {(macroHistory?.limitingIndicators ?? []).map((item) => `${item.seriesKey}:${item.reason}`).join(", ") || "none"}</li>
                <li>history raw regime points: {macroHistory?.generatedPoints ?? 0}</li>
                <li>history merged regime intervals: {macroHistory?.intervals.regime.length ?? 0}</li>
                <li>history true regime changes: {macroHistory?.regimeChanges ?? 0}</li>
                <li>history raw overlay points: {macroHistory?.generatedPoints ?? 0}</li>
                <li>history merged overlay intervals: {(macroHistory?.intervals.overlays.growth.length ?? 0) + (macroHistory?.intervals.overlays.stress.length ?? 0) + (macroHistory?.intervals.overlays.hardAsset.length ?? 0)}</li>
                <li>history overlay rendering mode: timeline_intervals</li>
                <li>history score thresholds: ≤{macroHistory?.template.thresholds.monetaryDominanceMax ?? "—"} / ≤{macroHistory?.template.thresholds.balancedMax ?? "—"} / ≤{macroHistory?.template.thresholds.fiscalPressureMax ?? "—"}</li>
                <li>history latest interval regime: {latestRegimeInterval?.coreRegimeLabel ?? "—"}</li>
                <li>history latest interval top driver: {latestRegimeInterval?.topDriver ?? "—"}</li>
                <li>history data coverage: {macroHistory?.dataCoveragePct ?? 0}%</li>
                <li>history missing indicators: {(macroHistory?.missingHistoryIndicators ?? []).join(", ") || "none"}</li>
                <li>history template/ruleset: {macroHistory?.template?.templateId ?? "—"} (updated {macroHistory?.template?.updatedAt ?? "—"})</li>
                <li>history recomputed at: {macroHistory?.replay?.recomputedAt ?? "—"}</li>
                <li>history source: {macroHistory?.replay?.source ?? "direct_compute"}</li>
                <li>latest snapshot timestamp: {pipelineDebug?.snapshotContent.latestSnapshotTimestamp ?? "null"}</li>
                <li>snapshotIsEmpty: {String(pipelineDebug?.snapshotContent.snapshotIsEmpty ?? true)}</li>
              </ul>

              <h4>Root cause hints</h4>
              <ul>
                {(pipelineDebug?.rootCauseHints ?? ["No debug hints available"]).map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>

              <h4>Ingestion debug</h4>
              <ul>
                <li>admin ingest endpoint reachable: {String(pipelineDebug?.ingestionDebug.endpointReachable ?? false)}</li>
                <li>FRED_API_KEY exists: {String(pipelineDebug?.ingestionDebug.fredApiKeyPresent ?? false)}</li>
                <li>admin secret configured: {String(pipelineDebug?.ingestionDebug.adminSecretConfigured ?? false)}</li>
                <li>Admin action auth: {String((ingestRunResult as { adminActionAuth?: string } | null)?.adminActionAuth ?? (engineRunResult as { adminActionAuth?: string } | null)?.adminActionAuth ?? "Unknown")}</li>
                <li>Auth method used: {String((ingestRunResult as { authMethodUsed?: string } | null)?.authMethodUsed ?? (engineRunResult as { authMethodUsed?: string } | null)?.authMethodUsed ?? "none")}</li>
              </ul>
              {pipelineDebug?.ingestionDebug.latestAttempt ? (
                <ul>
                  <li>latest attempt timestamp: {pipelineDebug.ingestionDebug.latestAttempt.timestamp}</li>
                  <li>region: {pipelineDebug.ingestionDebug.latestAttempt.region}</li>
                  <li>mode: {pipelineDebug.ingestionDebug.latestAttempt.mode}</li>
                  <li>success: {String(pipelineDebug.ingestionDebug.latestAttempt.success)}</li>
                  <li>fetched rows: {pipelineDebug.ingestionDebug.latestAttempt.fetchedObservationCount}</li>
                  <li>attempted inserts: {pipelineDebug.ingestionDebug.latestAttempt.attemptedInserts}</li>
                  <li>new rows inserted: {pipelineDebug.ingestionDebug.latestAttempt.insertedRowCount}</li>
                  <li>duplicate/unchanged rows skipped: {pipelineDebug.ingestionDebug.latestAttempt.duplicateOrUnchangedRows}</li>
                  <li>dedupe-only run: {String(pipelineDebug.ingestionDebug.latestAttempt.dedupeOnlyRun)}</li>
                  <li>ingest outcome: {pipelineDebug.ingestionDebug.latestAttempt.ingestOutcome}</li>
                  <li>insert succeeded: {String(pipelineDebug.ingestionDebug.latestAttempt.insertSucceeded)}</li>
                  <li>admin authorized: {String(pipelineDebug.ingestionDebug.latestAttempt.adminAuthorized)}</li>
                  <li>failing step: {pipelineDebug.ingestionDebug.latestAttempt.failingStep ?? "none"}</li>
                  <li>error message: {pipelineDebug.ingestionDebug.latestAttempt.errorMessage ?? "none"}</li>
                </ul>
              ) : (
                <div className="status empty">No ingest attempts logged yet.</div>
              )}

              {pipelineDebug?.ingestionDebug.latestAttempt && (
                <>
                  <h4>Per-series fetch results</h4>
                  <div style={{ overflowX: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>series id</th>
                          <th>series key</th>
                          <th>fetch success</th>
                          <th>observations fetched</th>
                          <th>error message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pipelineDebug.ingestionDebug.latestAttempt.seriesResults.map((row) => (
                          <tr key={`${row.seriesId}-${row.seriesKey}`}>
                            <td>{row.seriesId}</td>
                            <td>{row.seriesKey}</td>
                            <td>{row.fetchSuccess ? "yes" : "no"}</td>
                            <td>{row.observationsFetched}</td>
                            <td>{row.errorMessage ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                </>
              )}

              <h4>Gold backfill debug</h4>
              <ul>
                <li>request pattern: {pipelineDebug?.goldBackfillDebug?.requestPattern ?? "—"}</li>
                <li>endpoint: {pipelineDebug?.goldBackfillDebug?.endpoint ?? "—"}</li>
                <li>symbol: {pipelineDebug?.goldBackfillDebug?.symbol ?? "—"}</li>
                <li>from/to used: {(pipelineDebug?.goldBackfillDebug?.from ?? "—")} → {(pipelineDebug?.goldBackfillDebug?.to ?? "—")}</li>
                <li>fetched min/max date: {(pipelineDebug?.goldBackfillDebug?.fetchedMinDate ?? "—")} → {(pipelineDebug?.goldBackfillDebug?.fetchedMaxDate ?? "—")}</li>
                <li>fetched row count: {pipelineDebug?.goldBackfillDebug?.fetchedRowCount ?? 0}</li>
                <li>stored min/max date: {(pipelineDebug?.goldBackfillDebug?.mergedMinDate ?? "—")} → {(pipelineDebug?.goldBackfillDebug?.mergedMaxDate ?? "—")}</li>
                <li>stored row count: {pipelineDebug?.goldBackfillDebug?.storedRowCount ?? 0}</li>
                <li>gold_usd resulting coverage10yPct: {pipelineDebug?.goldBackfillDebug?.resultingCoverage10yPct?.toFixed?.(1) ?? "—"}%</li>
                <li>gold_minus_real_yield_spread resulting coverage10yPct: {pipelineDebug?.goldBackfillDebug?.resultingSpreadCoverage10yPct?.toFixed?.(1) ?? "—"}%</li>
              </ul>

              <h4>Gold source diagnostics</h4>
              <ul>
                <li>macro series key: {pipelineDebug?.goldSourceDiagnostics?.macroSeriesKey ?? "gold_usd"}</li>
                <li>macro pipeline source: {pipelineDebug?.goldSourceDiagnostics?.macroPipelineSource ?? "unknown"}</li>
                <li>endpoint: {pipelineDebug?.goldSourceDiagnostics?.endpoint ?? "unknown"}</li>
                <li>symbol: {pipelineDebug?.goldSourceDiagnostics?.symbol ?? "unknown"}</li>
                <li>FMP mapping: {pipelineDebug?.goldSourceDiagnostics?.fmpMapping
                  ? `${pipelineDebug.goldSourceDiagnostics.fmpMapping.provider}/${pipelineDebug.goldSourceDiagnostics.fmpMapping.providerSymbol}`
                  : "not found"}</li>
                <li>{pipelineDebug?.goldSourceDiagnostics?.fmpMonthlyHistory.table ?? "price_history_monthly"} (present={String(pipelineDebug?.goldSourceDiagnostics?.fmpMonthlyHistory.tablePresent ?? false)}): {pipelineDebug?.goldSourceDiagnostics?.fmpMonthlyHistory.pointCount ?? 0} rows ({pipelineDebug?.goldSourceDiagnostics?.fmpMonthlyHistory.minDate ?? "—"} → {pipelineDebug?.goldSourceDiagnostics?.fmpMonthlyHistory.maxDate ?? "—"})</li>
                <li>{pipelineDebug?.goldSourceDiagnostics?.fmpEodMonthlyBlobs.table ?? "price_eod_monthly"} (present={String(pipelineDebug?.goldSourceDiagnostics?.fmpEodMonthlyBlobs.tablePresent ?? false)}): {pipelineDebug?.goldSourceDiagnostics?.fmpEodMonthlyBlobs.monthCount ?? 0} months ({pipelineDebug?.goldSourceDiagnostics?.fmpEodMonthlyBlobs.minYyyymm ?? "—"} → {pipelineDebug?.goldSourceDiagnostics?.fmpEodMonthlyBlobs.maxYyyymm ?? "—"})</li>
              </ul>
              <div style={{ overflowX: "auto", marginBottom: 8 }}>
                <table>
                  <thead>
                    <tr>
                      <th>macro_raw source</th>
                      <th>pointCount</th>
                      <th>latestDate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pipelineDebug?.goldSourceDiagnostics?.macroRawBySource ?? []).map((row) => (
                      <tr key={row.source}>
                        <td>{row.source}</td>
                        <td>{row.pointCount}</td>
                        <td>{row.latestDate ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
            </ExpandablePanel>
          </section>

          <AdminSection>
            {debugEnabled ? (
              <>
                <div style={{ marginBottom: 8 }}>
                  <label htmlFor="macro-admin-secret-input" style={{ display: "block", marginBottom: 4 }}>Admin secret (for debug actions)</label>
                  <input
                    id="macro-admin-secret-input"
                    type="password"
                    value={adminSecretInput}
                    onChange={(event) => setAdminSecretInput(event.target.value)}
                    placeholder="Enter ADMIN_SECRET/CRON_SECRET"
                    style={{ width: "100%", marginBottom: 8 }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runIngest("backfill", "US")}>{ingestRunningMode === "backfill" ? "Running backfill..." : "Run ingest backfill (US)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runIngest("latest", "US")}>{ingestRunningMode === "latest" ? "Running latest..." : "Run ingest latest (US)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runEngine("US")}>{engineRunning ? "Running engine..." : "Run engine (US)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runIngest("backfill", "EA")}>{ingestRunningMode === "backfill" ? "Running backfill..." : "Run ingest backfill (EA)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runIngest("latest", "EA")}>{ingestRunningMode === "latest" ? "Running latest..." : "Run ingest latest (EA)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runEngine("EA")}>{engineRunning ? "Running engine..." : "Run engine (EA)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runIngest("backfill", "SE")}>{ingestRunningMode === "backfill" ? "Running backfill..." : "Run ingest backfill (SE)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runIngest("latest", "SE")}>{ingestRunningMode === "latest" ? "Running latest..." : "Run ingest latest (SE)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runEngine("SE")}>{engineRunning ? "Running engine..." : "Run engine (SE)"}</button>
                  </div>
                </div>

                {ingestRunResult && (
                  <div>
                    <h4>Last manual ingest test result</h4>
                    <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 11 }}>{JSON.stringify(ingestRunResult, null, 2)}</pre>
                  </div>
                )}
                {engineRunResult && (
                  <div>
                    <h4>Last manual engine run result</h4>
                    <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 11 }}>{JSON.stringify(engineRunResult, null, 2)}</pre>
                  </div>
                )}

                <h4>Raw payload (?debug=1)</h4>
                <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 11 }}>{JSON.stringify(globalMacroRaw, null, 2)}</pre>
              </>
            ) : (
              <div className="status">Admin actions kräver <code>?debug=1</code> i URL.</div>
            )}
          </AdminSection>
        </div>
      </div>
    </div>
  );
}
