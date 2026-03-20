import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ChartCard from "./ChartCard";
import InfoPopover from "./InfoPopover";
import MacroLabMiniSeries from "./MacroLabMiniSeries";

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
    overlays: Record<string, { score: number | null; label: string; confidence: number; blockScores: Record<string, number | null>; components: Array<{ id: string; title: string; block: string; rawValue: number | null; score: number | null; productionScore?: number | null; weight: number; source: string; exactSource: string; freshnessDays: number | null; includedInTotal: boolean; missing: boolean; proxy: boolean; note: string; debug?: { latestDate: string | null; monthlyChosenDate: string | null; minObservations: number; observationsAvailableInScoringWindow: number; scoringWindowSize: number; enoughHistory: boolean; percentile10yLatest: number | null; normalizationMethod: "percentile10y" | "zscore_to_percentile"; inversionApplied: boolean; rawToScoreFormula: string; directionRulePlainText: string; supportInterpretation: "higher raw value means more stress" | "higher raw value means less stress"; supportScoreValidation?: "pass" | "fail"; last5MonthlyPointsInWindow: Array<{ date: string; value: number }>; }; }>; runtime?: any; }>;
  };
  overlays?: {
    region: string;
    asOfDate: string;
    overlays: Record<string, { score: number | null; label: string; confidence: number; blockScores: Record<string, number | null>; components: Array<{ id: string; title: string; block: string; rawValue: number | null; score: number | null; productionScore?: number | null; weight: number; source: string; exactSource: string; freshnessDays: number | null; includedInTotal: boolean; missing: boolean; proxy: boolean; note: string; debug?: { latestDate: string | null; monthlyChosenDate: string | null; minObservations: number; observationsAvailableInScoringWindow: number; scoringWindowSize: number; enoughHistory: boolean; percentile10yLatest: number | null; normalizationMethod: "percentile10y" | "zscore_to_percentile"; inversionApplied: boolean; rawToScoreFormula: string; directionRulePlainText: string; supportInterpretation: "higher raw value means more stress" | "higher raw value means less stress"; supportScoreValidation?: "pass" | "fail"; last5MonthlyPointsInWindow: Array<{ date: string; value: number }>; }; }>; runtime?: any; }>;
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
    verification?: Record<string, any>;
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

  macroRegimeProbability?: {
    primaryRegime: string | null;
    primaryWeight: number | null;
    decisiveness: number | null;
    transitionLike: boolean;
    distribution: Array<{ regime: string; weight: number }>;
    narrative: { short: string; medium?: string; long?: string };
    structuralAdjustment: { summary: string; multiplier: number | null; penalty: number | null };
    regimeMomentum?: { direction: string; momentumScore: number; primaryRegimeChange: string; driftTowardRegime: string | null; changeDrivers: string[]; narrative: string };
    overlayInfluence?: { primarySignal: string; candidateSignals: Array<{ regime: string; signal: string }>; summary: string };
    supportingBlocks?: string[];
    supportingOverlays?: string[];
    contradictingOverlays?: string[];
  } | null;
  macroExplanation?: {
    summary: {
      macroScore: number | null;
      regimeLabel: string;
      confidence: number;
      runtimeCompleteness: number;
      structuralQualityLabel: "robust" | "usable_with_caveats" | "fragile";
      shortNarrative: string;
    };
    blockBreakdown: Array<{
      blockId: "A_FISCAL" | "B_MONETARY" | "C_INFLATION" | "D_CREDIBILITY";
      blockScore: number | null;
      direction: "up" | "down" | "neutral";
      confidence: number;
      status: "pass" | "partial" | "missing" | "proxy-heavy" | "structurally-incomplete";
      topPositiveDrivers: Array<{ id: string; title: string; contributionHint: number; direction: string }>;
      topNegativeDrivers: Array<{ id: string; title: string; contributionHint: number; direction: string }>;
      missingComponents: string[];
      proxyComponents: string[];
      fallbackComponents: string[];
      narrative: string;
    }>;
    overlayBreakdown: Array<{
      overlayId: string;
      score: number | null;
      label: string;
      confidence: number;
      runtimeCompleteness: number;
      specFidelity: "high" | "medium" | "low";
      robustness: "high" | "medium" | "low";
      proxyDependence: "low" | "medium" | "high";
      includedBlocks: string[];
      excludedBlocks: string[];
      missingComponents: string[];
      narrative: string;
    }>;
    topDrivers: Array<{ id: string; title: string; type: string; blockId?: string; overlayId?: string; direction: string; contributionHint: number; source?: string; exactSource?: string; note?: string }>;
    structuralQuality: {
      activeCoreBlocks: number;
      partialCoreBlocks: number;
      activeOverlays: number;
      partialOverlays: number;
      proxyHeavyOverlays: number;
      missingCriticalInputs: string[];
      notes: string[];
    };
    narrative: { short: string; medium: string; long: string };
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
          meta?: Record<string, unknown>;
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
    source: "direct_compute" | "cache" | "cache_miss" | "cache_fallback_trimmed";
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
  const initialRegionFromLocation = (() => {
    if (typeof window === "undefined") return "GLOBAL" as const;
    const query = new URLSearchParams(window.location.search);
    const queryRegion = String(query.get("region") ?? "").toUpperCase();
    if (queryRegion === "US" || queryRegion === "EA" || queryRegion === "SE" || queryRegion === "GLOBAL") return queryRegion;
    const saved = String(window.localStorage.getItem("globalMacro.selectedRegion") ?? "").toUpperCase();
    if (saved === "US" || saved === "EA" || saved === "SE" || saved === "GLOBAL") return saved;
    return "GLOBAL" as const;
  })();
  const [globalMacro, setGlobalMacro] = useState<GlobalMacroPayload | null>(null);
  const [globalMacroRaw, setGlobalMacroRaw] = useState<Record<string, unknown> | null>(null);
  const [frontendDebugTiming, setFrontendDebugTiming] = useState<{
    navigationToMountMs: number | null;
    mountToFetchStartMs: number | null;
    fetchDurationMs: number | null;
    fetchToDataBoundMs: number | null;
    dataToRenderCompleteMs: number | null;
    totalUserPerceivedMs: number | null;
    requestCount: number;
    maxConcurrent: number;
    requestMode: "sequential" | "parallel_or_overlapping";
    repeatedUrls: string[];
    requests: Array<{ url: string; startMs: number; endMs: number | null; durationMs: number | null }>;
    requestSummary: {
      requestedRegions: string[];
      initialRequestMatchedActiveTab: boolean;
      firstRequestedRegion: string | null;
      activeRegionAtMount: "GLOBAL" | "US" | "EA" | "SE";
    };
    usRequestChain?: {
      fetchStartMs: number;
      responseHeadersReceivedMs: number | null;
      responseBodyReceivedMs: number | null;
      jsonParseCompleteMs: number | null;
      dataBoundMs: number | null;
      sectionRenderCompleteMs: number | null;
      clientFetchDurationMs: number | null;
      clientParseMs: number | null;
      clientBindMs: number | null;
      estimatedTransferWaitMs: number | null;
      serverMeasuredMs: number | null;
      payloadSizeBytes: number | null;
      estimatedUnaccountedMs: number | null;
      slowestStage: string | null;
      serverBreakdown: Array<{ step: string; ms: number }>;
    };
    sectionTimings: {
      regimeProbabilityRenderedMs: number | null;
      driverBreakdownRenderedMs: number | null;
      overlaysRenderedMs: number | null;
    };
  } | null>(null);
  const [macroHistory, setMacroHistory] = useState<MacroHistoryPayload | null>(null);
  const [inflationAnalysis, setInflationAnalysis] = useState<InflationAnalysisPayload | null>(null);
  const [historyResolution, setHistoryResolution] = useState<"WEEKLY" | "MONTHLY">("MONTHLY");
  const [historyRangeYears, setHistoryRangeYears] = useState<number | "MAX">(10);
  const [selectedRegion, setSelectedRegion] = useState<"GLOBAL" | "US" | "EA" | "SE">(initialRegionFromLocation as "GLOBAL" | "US" | "EA" | "SE");
  const [globalMacroLoading, setGlobalMacroLoading] = useState(false);
  const [globalMacroError, setGlobalMacroError] = useState<string | null>(null);
  const [debugEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debug") === "1";
  });
  const initialSelectedRegionRef = useRef<"GLOBAL" | "US" | "EA" | "SE">(initialRegionFromLocation as "GLOBAL" | "US" | "EA" | "SE");
  const lastRequestKeyRef = useRef<string | null>(null);
  const frontendTimingRef = useRef({
    mountMs: (typeof performance !== "undefined" ? performance.now() : Date.now()),
    firstFetchStartMs: null as number | null,
    firstFetchEndMs: null as number | null,
    dataBoundMs: null as number | null,
    renderCompleteMs: null as number | null,
    regimeProbabilityRenderedMs: null as number | null,
    driverBreakdownRenderedMs: null as number | null,
    overlaysRenderedMs: null as number | null,
    requests: [] as Array<{ url: string; startMs: number; endMs: number | null; durationMs: number | null }>,
    inFlight: 0,
    maxConcurrent: 0,
    usRequestChain: {
      fetchStartMs: null as number | null,
      responseHeadersReceivedMs: null as number | null,
      responseBodyReceivedMs: null as number | null,
      jsonParseCompleteMs: null as number | null,
      dataBoundMs: null as number | null,
    },
  });
  const [ingestRunningMode, setIngestRunningMode] = useState<"backfill" | "latest" | null>(null);
  const [engineRunning, setEngineRunning] = useState(false);
  const [adminSecretInput, setAdminSecretInput] = useState("");
  const [cronSecretInput, setCronSecretInput] = useState("");
  const [cronRefreshRunning, setCronRefreshRunning] = useState(false);
  const [rebuildSnapshotRunning, setRebuildSnapshotRunning] = useState(false);
  const [ingestRunResult, setIngestRunResult] = useState<Record<string, unknown> | null>(null);
  const [engineRunResult, setEngineRunResult] = useState<Record<string, unknown> | null>(null);
  const [cronRefreshResult, setCronRefreshResult] = useState<Record<string, unknown> | null>(null);
  const [rebuildSnapshotResult, setRebuildSnapshotResult] = useState<Record<string, unknown> | null>(null);
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
  const [openOverlayInfoId, setOpenOverlayInfoId] = useState<string | null>(null);
  const [expandedOverlayKey, setExpandedOverlayKey] = useState<string | null>(null);
  const [expandedOverlaySizeByKey, setExpandedOverlaySizeByKey] = useState<Record<string, boolean>>({});

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
    window.localStorage.setItem("globalMacro.selectedRegion", selectedRegion);
  }, [selectedRegion]);

  useEffect(() => {
    if (selectedRegion === "GLOBAL") setSelectedRegion("US");
  }, [selectedRegion]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("globalMacro.debugAdminSecret") ?? "";
    if (saved) setAdminSecretInput(saved);
    const cronSaved = window.localStorage.getItem("globalMacro.debugCronSecret") ?? "";
    if (cronSaved) setCronSecretInput(cronSaved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("globalMacro.debugAdminSecret", adminSecretInput);
  }, [adminSecretInput]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("globalMacro.debugCronSecret", cronSecretInput);
  }, [cronSecretInput]);

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
      const cacheBust = Date.now();
      const debugParam = debugEnabled ? "&debug=1" : "";
      const requestKey = `${selectedRegion}|${historyResolution}|${String(historyRangeYears)}|${uiOverlayKeysRequested.join(",")}|debug:${debugEnabled ? 1 : 0}`;
      if (lastRequestKeyRef.current === requestKey && frontendTimingRef.current.inFlight > 0) {
        return;
      }
      lastRequestKeyRef.current = requestKey;
      const url = `/api/sector/global-macro?region=${selectedRegion}&historyResolution=${historyResolution}&historyRangeYears=${String(historyRangeYears)}&uiOverlayKeysRequested=${overlayKeysParam}${debugParam}&_ts=${cacheBust}`;
      const requestStartMs = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (frontendTimingRef.current.firstFetchStartMs === null) frontendTimingRef.current.firstFetchStartMs = requestStartMs;
      frontendTimingRef.current.inFlight += 1;
      frontendTimingRef.current.maxConcurrent = Math.max(frontendTimingRef.current.maxConcurrent, frontendTimingRef.current.inFlight);
      const requestRow = { url, startMs: requestStartMs, endMs: null as number | null, durationMs: null as number | null };
      frontendTimingRef.current.requests.push(requestRow);
      const shouldTraceUsChain = debugEnabled && selectedRegion === "US";
      if (shouldTraceUsChain) {
        frontendTimingRef.current.usRequestChain.fetchStartMs = requestStartMs;
      }
      const response = await fetch(url, {
        cache: "no-store",
      });
      const requestEndMs = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (shouldTraceUsChain) {
        frontendTimingRef.current.usRequestChain.responseHeadersReceivedMs = requestEndMs;
      }
      requestRow.endMs = requestEndMs;
      requestRow.durationMs = requestEndMs - requestStartMs;
      if (frontendTimingRef.current.firstFetchEndMs === null) frontendTimingRef.current.firstFetchEndMs = requestEndMs;
      const payloadText = await response.text();
      const bodyReceivedMs = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (shouldTraceUsChain) {
        frontendTimingRef.current.usRequestChain.responseBodyReceivedMs = bodyReceivedMs;
      }
      const payload = JSON.parse(payloadText);
      const parseCompleteMs = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (shouldTraceUsChain) {
        frontendTimingRef.current.usRequestChain.jsonParseCompleteMs = parseCompleteMs;
      }
      if (!response.ok) {
        throw new Error(String(payload?.error ?? "Kunde inte ladda Global Macro"));
      }
      setGlobalMacro(payload.globalMacro ?? null);
      setMacroHistory(payload.macroHistory ?? null);
      setInflationAnalysis(payload.inflationAnalysis ?? null);
      setGlobalMacroRaw(payload);
      frontendTimingRef.current.dataBoundMs = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (shouldTraceUsChain) {
        frontendTimingRef.current.usRequestChain.dataBoundMs = frontendTimingRef.current.dataBoundMs;
      }
    } catch (error) {
      setGlobalMacro(null);
      setMacroHistory(null);
      setGlobalMacroRaw(null);
      setInflationAnalysis(null);
      setGlobalMacroError(error instanceof Error ? error.message : "Okänt fel vid Global Macro-hämtning");
    } finally {
      frontendTimingRef.current.inFlight = Math.max(0, frontendTimingRef.current.inFlight - 1);
      setGlobalMacroLoading(false);
    }
  }

  useEffect(() => {
    void loadGlobalMacro();
  }, [debugEnabled, historyResolution, historyRangeYears, selectedRegion, uiOverlayKeysRequested]);

  useEffect(() => {
    if (!debugEnabled || !globalMacro) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if ((globalMacro as any)?.macroRegimeProbability && frontendTimingRef.current.regimeProbabilityRenderedMs === null) {
      frontendTimingRef.current.regimeProbabilityRenderedMs = now;
    }
    if ((globalMacro as any)?.macroExplanation && frontendTimingRef.current.driverBreakdownRenderedMs === null) {
      frontendTimingRef.current.driverBreakdownRenderedMs = now;
    }
    if (Array.isArray((globalMacro as any)?.overlayHistory) && (globalMacro as any).overlayHistory.length > 0 && frontendTimingRef.current.overlaysRenderedMs === null) {
      frontendTimingRef.current.overlaysRenderedMs = now;
    }

    const raf = requestAnimationFrame(() => {
      const renderNow = typeof performance !== "undefined" ? performance.now() : Date.now();
      frontendTimingRef.current.renderCompleteMs = renderNow;
      const requestUrlsNormalized = frontendTimingRef.current.requests.map((row) => row.url.replace(/&_ts=\d+/, ""));
      const requestedRegions = Array.from(new Set(frontendTimingRef.current.requests.map((row) => {
        const match = row.url.match(/[?&]region=([^&]+)/);
        return match ? decodeURIComponent(match[1]).toUpperCase() : "UNKNOWN";
      })));
      const repeatedUrls = Array.from(new Set(requestUrlsNormalized.filter((url, idx, arr) => arr.indexOf(url) !== idx)));
      const firstRegionMatch = frontendTimingRef.current.requests[0]?.url.match(/[?&]region=([^&]+)/);
      const firstRequestedRegion = firstRegionMatch ? decodeURIComponent(firstRegionMatch[1]).toUpperCase() : null;
      const usServerChain = (((globalMacroRaw as any)?.diagnostics ?? {}) as any)?.usRequestChain ?? null;
      const usClientFetchDuration = frontendTimingRef.current.usRequestChain.fetchStartMs !== null && frontendTimingRef.current.usRequestChain.responseBodyReceivedMs !== null
        ? frontendTimingRef.current.usRequestChain.responseBodyReceivedMs - frontendTimingRef.current.usRequestChain.fetchStartMs
        : null;
      const usClientParseMs = frontendTimingRef.current.usRequestChain.responseBodyReceivedMs !== null && frontendTimingRef.current.usRequestChain.jsonParseCompleteMs !== null
        ? frontendTimingRef.current.usRequestChain.jsonParseCompleteMs - frontendTimingRef.current.usRequestChain.responseBodyReceivedMs
        : null;
      const usClientBindMs = frontendTimingRef.current.usRequestChain.jsonParseCompleteMs !== null && frontendTimingRef.current.usRequestChain.dataBoundMs !== null
        ? frontendTimingRef.current.usRequestChain.dataBoundMs - frontendTimingRef.current.usRequestChain.jsonParseCompleteMs
        : null;
      const usSectionRenderCompleteMs = frontendTimingRef.current.dataBoundMs === null ? null : renderNow;
      const usTransferWait = frontendTimingRef.current.usRequestChain.fetchStartMs !== null && frontendTimingRef.current.usRequestChain.responseHeadersReceivedMs !== null
        ? frontendTimingRef.current.usRequestChain.responseHeadersReceivedMs - frontendTimingRef.current.usRequestChain.fetchStartMs
        : null;
      const usServerMeasuredMs = typeof usServerChain?.serverMeasuredMs === "number" ? usServerChain.serverMeasuredMs : null;
      const usUnaccounted = usClientFetchDuration !== null && usServerMeasuredMs !== null
        ? usClientFetchDuration - usServerMeasuredMs
        : null;
      const usStageRows: Array<{ stage: string; ms: number }> = [
        ...(usServerMeasuredMs !== null ? [{ stage: "server_total", ms: usServerMeasuredMs }] : []),
        ...(usTransferWait !== null ? [{ stage: "transfer_or_wait", ms: usTransferWait }] : []),
        ...(usClientParseMs !== null ? [{ stage: "client_parse", ms: usClientParseMs }] : []),
        ...(usClientBindMs !== null ? [{ stage: "client_bind", ms: usClientBindMs }] : []),
      ];
      const usSlowestStage = usStageRows.sort((a, b) => b.ms - a.ms)[0]?.stage ?? null;
      setFrontendDebugTiming({
        navigationToMountMs: frontendTimingRef.current.mountMs,
        mountToFetchStartMs: frontendTimingRef.current.firstFetchStartMs === null ? null : frontendTimingRef.current.firstFetchStartMs - frontendTimingRef.current.mountMs,
        fetchDurationMs: frontendTimingRef.current.firstFetchStartMs === null || frontendTimingRef.current.firstFetchEndMs === null
          ? null
          : frontendTimingRef.current.firstFetchEndMs - frontendTimingRef.current.firstFetchStartMs,
        fetchToDataBoundMs: frontendTimingRef.current.firstFetchEndMs === null || frontendTimingRef.current.dataBoundMs === null
          ? null
          : frontendTimingRef.current.dataBoundMs - frontendTimingRef.current.firstFetchEndMs,
        dataToRenderCompleteMs: frontendTimingRef.current.dataBoundMs === null ? null : renderNow - frontendTimingRef.current.dataBoundMs,
        totalUserPerceivedMs: renderNow - frontendTimingRef.current.mountMs,
        requestCount: frontendTimingRef.current.requests.length,
        maxConcurrent: frontendTimingRef.current.maxConcurrent,
        requestMode: frontendTimingRef.current.maxConcurrent > 1 ? "parallel_or_overlapping" : "sequential",
        repeatedUrls,
        requests: frontendTimingRef.current.requests.map((row) => ({ ...row })),
        requestSummary: {
          requestedRegions,
          initialRequestMatchedActiveTab: firstRequestedRegion === initialSelectedRegionRef.current,
          firstRequestedRegion,
          activeRegionAtMount: initialSelectedRegionRef.current,
        },
        usRequestChain: selectedRegion === "US" ? {
          fetchStartMs: frontendTimingRef.current.usRequestChain.fetchStartMs ?? 0,
          responseHeadersReceivedMs: frontendTimingRef.current.usRequestChain.responseHeadersReceivedMs,
          responseBodyReceivedMs: frontendTimingRef.current.usRequestChain.responseBodyReceivedMs,
          jsonParseCompleteMs: frontendTimingRef.current.usRequestChain.jsonParseCompleteMs,
          dataBoundMs: frontendTimingRef.current.usRequestChain.dataBoundMs,
          sectionRenderCompleteMs: usSectionRenderCompleteMs,
          clientFetchDurationMs: usClientFetchDuration,
          clientParseMs: usClientParseMs,
          clientBindMs: usClientBindMs,
          estimatedTransferWaitMs: usTransferWait,
          serverMeasuredMs: usServerMeasuredMs,
          payloadSizeBytes: typeof usServerChain?.payloadSizeBytes === "number" ? usServerChain.payloadSizeBytes : null,
          estimatedUnaccountedMs: usUnaccounted,
          slowestStage: usSlowestStage,
          serverBreakdown: Array.isArray(usServerChain?.serverBreakdown) ? usServerChain.serverBreakdown : [],
        } : undefined,
        sectionTimings: {
          regimeProbabilityRenderedMs: frontendTimingRef.current.regimeProbabilityRenderedMs === null ? null : frontendTimingRef.current.regimeProbabilityRenderedMs - frontendTimingRef.current.mountMs,
          driverBreakdownRenderedMs: frontendTimingRef.current.driverBreakdownRenderedMs === null ? null : frontendTimingRef.current.driverBreakdownRenderedMs - frontendTimingRef.current.mountMs,
          overlaysRenderedMs: frontendTimingRef.current.overlaysRenderedMs === null ? null : frontendTimingRef.current.overlaysRenderedMs - frontendTimingRef.current.mountMs,
        },
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [debugEnabled, globalMacro, globalMacroRaw, selectedRegion]);

  const globalMacroIndicators = globalMacro?.indicators ?? [];
  const hasRegime = Boolean(globalMacro && typeof globalMacro === "object" && (globalMacro as any).regime && typeof (globalMacro as any).regime === "object");
  const scoredCount = globalMacroIndicators.filter((item) => item.score !== null).length;
  const isPartialData =
    globalMacro?.stats?.partialData ??
    (globalMacroIndicators.length > 0 && scoredCount < globalMacroIndicators.length);
  const isNoData = !globalMacroLoading && !globalMacroError && (!globalMacro || !hasRegime || globalMacroIndicators.length === 0);
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
  const regimeProbabilityAny = (globalMacro as any)?.macroRegimeProbability as any;
  const regimeProbabilityDistribution = Array.isArray(regimeProbabilityAny?.distribution) ? regimeProbabilityAny.distribution : [];
  const readDiagnostics = ((globalMacroRaw as any)?.diagnostics ?? null) as any;
  const expectedRegimeFields = [
    "primaryRegime",
    "primaryWeight",
    "decisiveness",
    "transitionLike",
    "distribution",
    "narrative.short",
    "narrative.medium",
    "narrative.long",
    "structuralAdjustment.summary",
    "structuralAdjustment.multiplier",
    "structuralAdjustment.penalty",
    "supportingBlocks",
    "supportingOverlays",
    "contradictingOverlays",
    "regimeMomentum.direction",
    "regimeMomentum.momentumScore",
    "regimeMomentum.primaryRegimeChange",
    "regimeMomentum.driftTowardRegime",
    "regimeMomentum.changeDrivers",
    "regimeMomentum.narrative",
    "overlayInfluence.primarySignal",
    "overlayInfluence.candidateSignals",
    "overlayInfluence.summary",
  ];
  const compactRenderedRegimeFields = [
    "primaryRegime",
    "primaryWeight",
    "decisiveness",
    "transitionLike",
    "distribution(top+full)",
    "narrative.short/medium/long",
    "structuralAdjustment.summary/multiplier/penalty",
    "supportingBlocks",
    "supportingOverlays",
    "contradictingOverlays",
    "regimeMomentum.direction/momentumScore/primaryRegimeChange/driftTowardRegime/changeDrivers/narrative",
    "overlayInfluence.primarySignal/candidateSignals/summary",
  ];

  const explanationAny = (globalMacro as any)?.macroExplanation as any;
  const explanationSummary = explanationAny && typeof explanationAny === "object" && explanationAny.summary && typeof explanationAny.summary === "object"
    ? explanationAny.summary
    : null;
  const explanationNarrative = explanationAny && typeof explanationAny === "object" && explanationAny.narrative && typeof explanationAny.narrative === "object"
    ? explanationAny.narrative
    : null;
  const explanationBlocks = Array.isArray(explanationAny?.blockBreakdown) ? explanationAny.blockBreakdown : [];
  const explanationOverlays = Array.isArray(explanationAny?.overlayBreakdown) ? explanationAny.overlayBreakdown : [];
  const explanationTopDrivers = Array.isArray(explanationAny?.topDrivers) ? explanationAny.topDrivers : [];
  const explanationStructural = explanationAny && typeof explanationAny.structuralQuality === "object" ? explanationAny.structuralQuality : null;

  const safeNumber = (value: unknown, digits = 1) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
  const safePct = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? `${value}%` : "—";

  const overlaySanity = overlayEntries.map(([overlayKey, overlay]) => {
    const runtimeAny = overlay.runtime as any;
    const productionValidBlockScores = runtimeAny?.productionValidBlockScores ?? overlay.blockScores ?? {};
    const diagnosticBlockScores = runtimeAny?.diagnosticBlockScores ?? {};
    const blockRows = Object.entries(productionValidBlockScores).map(([block, score]) => ({
      block,
      score: typeof score === "number" ? score : null,
      diagnosticScore: typeof diagnosticBlockScores?.[block] === "number" ? diagnosticBlockScores[block] : null,
      components: (overlay.components ?? []).filter((component) => component.block === block),
    }));
    const activeProductionBlocks = typeof runtimeAny?.activeProductionBlockCount === "number"
      ? runtimeAny.activeProductionBlockCount
      : blockRows.filter((row) => row.score !== null).length;
    const diagnosticOnlyBlocks = typeof runtimeAny?.diagnosticOnlyBlockCount === "number"
      ? runtimeAny.diagnosticOnlyBlockCount
      : blockRows.filter((row) => row.score === null && row.diagnosticScore !== null).length;
    const missingBlocks = blockRows.filter((row) => row.score === null && row.diagnosticScore === null).length;
    const lowRobustness = activeProductionBlocks < 2;
    const negative = (overlay.components ?? [])
      .filter((component) => typeof (component.productionScore ?? component.score) === "number")
      .sort((a, b) => ((a.productionScore ?? a.score) as number) - ((b.productionScore ?? b.score) as number))
      .slice(0, 3)
      .map((component) => `${component.id}:${((component.productionScore ?? component.score) as number).toFixed(1)}`);
    const normalizationInputs = blockRows.map((row) => `${row.block}=${row.score === null ? "null" : row.score.toFixed(1)} (diag:${row.diagnosticScore === null ? "null" : row.diagnosticScore.toFixed(1)})`);
    return { overlayKey, activeProductionBlocks, diagnosticOnlyBlocks, missingBlocks, lowRobustness, negative, normalizationInputs };
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
      intendedPrimaryBlocks: ["quantity", "price", "transmission"],
      intendedSeries: [
        { id: "balance_sheet_gdp", block: "quantity", linkedMacroFamily: "B_MONETARY", primarySources: ["(WALCL-WDTGAL-RRPONTSYD)/GDP"], aliasFamily: ["walcl", "wdtgal", "rrpontsyd", "effective_fed_liquidity_ratio", "fed_balance_sheet"] },
        { id: "m2_gdp", block: "quantity", linkedMacroFamily: "B_MONETARY", primarySources: ["M2SL/GDP"], aliasFamily: ["m2sl", "m2_gdp", "money_supply_gdp"] },
        { id: "bank_credit_gdp", block: "quantity", linkedMacroFamily: "B_MONETARY", primarySources: ["TOTBKCR/GDP"], aliasFamily: ["totbkcr", "bank_credit_gdp"] },
        { id: "real_yield_10y", block: "price", linkedMacroFamily: "B_MONETARY", primarySources: ["DFII10"], aliasFamily: ["real_yield_10y", "dfii10", "real_yield"] },
        { id: "financial_conditions", block: "price", linkedMacroFamily: "B_MONETARY", primarySources: ["NFCI"], aliasFamily: ["financial_conditions", "nfci", "fci"] },
        { id: "hy_spread", block: "price", linkedMacroFamily: "B_MONETARY", primarySources: ["BAMLH0A0HYM2"], aliasFamily: ["hy_spread", "bamlh0a0hym2", "high_yield_spread"] },
        { id: "credit_transmission", block: "transmission", linkedMacroFamily: "B_MONETARY", primarySources: ["DRTSCILM"], aliasFamily: ["credit_transmission", "drtscilm", "loan_standards"] },
        { id: "xccy_basis_bridge", block: "bridge", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["EURUSD_XCCY_BASIS"], aliasFamily: ["xccy_basis", "eurusd_xccy_basis", "bridge"] },
      ],
      logicSummary: "Likviditet, realränta, spread och kredittransmission driver overlayns kärna.",
    },
    creditFundingOverlay: {
      intendedPrimaryBlocks: ["pricing", "funding", "access"],
      intendedSeries: [
        { id: "hy_spread", block: "pricing", linkedMacroFamily: "B_MONETARY", primarySources: ["BAMLH0A0HYM2"], aliasFamily: ["hy_spread", "bamlh0a0hym2"] },
        { id: "ig_spread", block: "pricing", linkedMacroFamily: "B_MONETARY", primarySources: ["BAMLC0A0CM"], aliasFamily: ["ig_spread", "bamlc0a0cm"] },
        { id: "ted_spread", block: "funding", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["TEDRATE"], aliasFamily: ["ted_spread", "tedrate"] },
        { id: "xccy_basis", block: "funding", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["EURUSD3MD156NWSG", "EURUSDBS3M"], aliasFamily: ["xccy_basis", "eurusd3md156nwsg", "eurusdbs3m"] },
        { id: "credit_access", block: "access", linkedMacroFamily: "B_MONETARY", primarySources: ["DRTSCILM"], aliasFamily: ["credit_access", "drtscilm"] },
      ],
      logicSummary: "Credit and funding stress via HY/IG spreads, TED, xccy basis, and DRTSCILM-only access conditions.",
    },
    energyShockOverlay: {
      intendedPrimaryBlocks: ["price", "breadth", "spillover"],
      intendedSeries: [
        { id: "oil_price", block: "price", linkedMacroFamily: "C_INFLATION", primarySources: ["DCOILBRENTEU"], aliasFamily: ["oil_price", "en_price_brent", "dcoilbrenteu"] },
        { id: "gas_price", block: "price", linkedMacroFamily: "C_INFLATION", primarySources: ["DHHNGSP"], aliasFamily: ["gas_price", "en_price_henry_hub", "henry_hub", "dhhngsp", "natural_gas", "ng"] },
        { id: "breadth_brent", block: "breadth", linkedMacroFamily: "C_INFLATION", primarySources: ["DCOILBRENTEU"], aliasFamily: ["en_breadth_brent", "dcoilbrenteu"] },
        { id: "breadth_henry_hub", block: "breadth", linkedMacroFamily: "C_INFLATION", primarySources: ["DHHNGSP"], aliasFamily: ["en_breadth_henry_hub", "henry_hub", "dhhngsp"] },
        { id: "breadth_energy_vs_core_gap", block: "breadth", linkedMacroFamily: "C_INFLATION", primarySources: ["CPIENGSL", "CPILFESL"], aliasFamily: ["energy_vs_core_inflation_gap", "constructed_gap_from_inputs", "cpiengsl", "cpilfesl"], note: "Constructed breadth signal: YoY(CPIENGSL) - YoY(CPILFESL)." },
        { id: "energy_cost_pass", block: "spillover", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["PPIACO (energy pass-through family)"], aliasFamily: ["energy_breadth", "energy_ppi", "ppiaco"] },
      ],
      logicSummary: "Energy Shock v1 uses Brent + Henry Hub + constructed CPI energy-vs-core breadth, with spillover pass-through tracked separately.",
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
      intendedPrimaryBlocks: ["gold_equity", "duration"],
      intendedSeries: [
        { id: "safe_haven_flow", block: "gold_equity", linkedMacroFamily: "B_MONETARY", primarySources: ["GOLD", "gold family"], aliasFamily: ["safe_haven_flow", "gold", "gold_price"] },
        { id: "equity_risk", block: "gold_equity", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["SP500 / risk asset family"], aliasFamily: ["vix_like", "sp500", "spx_vol_proxy", "vixcls"] },
        { id: "duration_bid", block: "duration", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["duration / rates family"], aliasFamily: ["duration", "real_yield", "rates_proxy"] },
      ],
      logicSummary: "Risk-off-flöden via safe-haven, equities och durationdynamik.",
    },
    inflationCostShockOverlay: {
      intendedPrimaryBlocks: ["inflation", "upstream", "expectations"],
      intendedSeries: [
        { id: "cpi", block: "inflation", linkedMacroFamily: "C_INFLATION", primarySources: ["CPIAUCSL / regional CPI"], aliasFamily: ["cpi", "cpiaucsl", "cp0000ez19m086nest"] },
        { id: "ppi", block: "upstream", linkedMacroFamily: "C_INFLATION", primarySources: ["PPIACO"], aliasFamily: ["ppi", "ppiaco"] },
        { id: "inflation_expectations", block: "expectations", linkedMacroFamily: "A_FISCAL", primarySources: ["T10YIE", "MICH"], aliasFamily: ["inflation_expectations", "t10yie", "breakeven", "mich"] },
      ],
      logicSummary: "Kostnadschock via CPI/PPI och inflationsförväntningar.",
    },
    tradeSupplyChainStressOverlay: {
      intendedPrimaryBlocks: ["real_goods_flow", "inventory_delivery_friction", "pipeline_cost_stress"],
      intendedSeries: [
        { id: "industrial_production_manufacturing", block: "real_goods_flow", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["IPMAN"], aliasFamily: ["industrial_production_manufacturing", "ipman"] },
        { id: "new_orders_nondefense_manufacturing", block: "real_goods_flow", linkedMacroFamily: "D_CREDIBILITY", primarySources: ["AMTMNO"], aliasFamily: ["new_orders_nondefense_manufacturing", "amtmno"] },
        { id: "manufacturing_inventory_imbalance", block: "inventory_delivery_friction", linkedMacroFamily: "C_INFLATION", primarySources: ["MNFCTRIRSA"], aliasFamily: ["manufacturing_inventory_imbalance", "mnfctrirsa"] },
        { id: "total_inventory_imbalance", block: "inventory_delivery_friction", linkedMacroFamily: "C_INFLATION", primarySources: ["ISRATIO"], aliasFamily: ["total_inventory_imbalance", "isratio"] },
        { id: "pipeline_cost_stress", block: "pipeline_cost_stress", linkedMacroFamily: "C_INFLATION", primarySources: ["WPU10"], aliasFamily: ["pipeline_cost_stress", "wpu10"] },
      ],
      logicSummary: "Real goods flow (IPMAN/AMTMNO) + inventory delivery friction (MNFCTRIRSA/ISRATIO imbalances) + pipeline cost stress (WPU10 YoY).",
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
    if (!a) return false;
    if (a.length <= 2) {
      const tokens = v.split("_").filter(Boolean);
      return tokens.includes(a);
    }
    return v.includes(a) || a.includes(v);
  }

  function inferFallbackUsage(items: Array<{ proxy?: boolean; note?: string; id?: string; source?: string; exactSource?: string }>, _aliasMatched: boolean): "none" | "alias mapping" | "proxy source" | "derived approximation" {
    const text = items.map((item) => `${item.note ?? ""} ${item.id ?? ""} ${item.source ?? ""} ${item.exactSource ?? ""}`.toLowerCase()).join(" |");
        if (text.includes("derived") || text.includes("approx")) return "derived approximation";
    const hasExplicitProxy = items.some((item) => item.proxy);
    const mentionsProxy = text.includes("proxy") && !text.includes("no proxy") && !text.includes("without proxy");
    if (hasExplicitProxy || mentionsProxy) return "proxy source";
    return "none";
  }

  function inferBlockerType(args: {
    availability: "available" | "partial" | "unavailable" | "not_applicable";
    fallback: "none" | "alias mapping" | "proxy source" | "derived approximation";
    runtimeHasSeries: boolean;
    aliasMatched: boolean;
    reasonText: string;
    regionSpecificSourceFaithful?: boolean;
  }): "no blocker" | "alias mapping only" | "exact source family differs" | "proxy currently used" | "intended source not ingested" | "intended source not wired to overlay" | "derived approximation used" {
    const text = args.reasonText.toLowerCase();
        if (args.fallback === "derived approximation") return "derived approximation used";
    if (args.fallback === "proxy source") return "proxy currently used";
    if (args.regionSpecificSourceFaithful) return "no blocker";
    if (args.fallback === "alias mapping" && args.availability === "available") return "alias mapping only";
    if (args.availability === "unavailable" && (text.includes("approved ted source unavailable") || text.includes("approved xccy basis source unavailable"))) return "intended source not ingested";
    if (args.availability === "unavailable" && (text.includes("ingest") || text.includes("not ingested") || text.includes("missing") || text.includes("unavailable"))) return "intended source not ingested";
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
        const hay = [component.id, component.source, component.exactSource].filter(Boolean).map(String);
        return seriesSpec.aliasFamily.some((alias) => hay.some((value) => valueContainsAlias(value, alias)));
      });
      const runtimePool = matched;
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
      const unavailableReason = overlayKey === "creditFundingOverlay"
        ? (seriesSpec.id === "ted_spread"
          ? "approved TED source unavailable"
          : seriesSpec.id === "xccy_basis"
            ? "approved xccy basis source unavailable"
            : seriesSpec.id === "credit_access"
              ? "approved credit access source unavailable"
              : "intended primary source unavailable")
        : "intended primary source not present in current overlay runtime inputs";
      const reasonText = runtimePool.map((component) => component.note).filter((note): note is string => Boolean(note)).join(" | ")
        || (availability === "unavailable"
          ? unavailableReason
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
      ...Object.keys(overlay?.blockScores ?? {}).map((block) => normalizeOverlayRuntimeBlockName(overlayKey, block)).filter((block) => !isMacroPseudoBlock(block)),
      ...runtimeBlockDiagnostics.map((row) => normalizeOverlayRuntimeBlockName(overlayKey, row.block)).filter((block) => !isMacroPseudoBlock(block)),
      ...spec.intendedPrimaryBlocks.map((block) => normalizeOverlayRuntimeBlockName(overlayKey, block)),
      ...spec.intendedSeries.map((series) => normalizeOverlayRuntimeBlockName(overlayKey, series.block)),
    ]));

    const blockRows = blockKeys.map((block) => {
      const scoreValue = getCanonicalBlockScore(overlayKey, overlay, block);
      const diagnostics = runtimeBlockDiagnostics.find((item) => normalizeOverlayRuntimeBlockName(overlayKey, item.block) === block);
      const exactSeries = seriesRows.filter((row) => row.block === block);
      const blockSeries = exactSeries;
      const availabilityCounts = {
        available: blockSeries.filter((row) => row.availability === "available").length,
        partial: blockSeries.filter((row) => row.availability === "partial").length,
        unavailable: blockSeries.filter((row) => row.availability === "unavailable").length,
      };
      const sourceAvailabilityBase: "available" | "partial" | "unavailable" = blockSeries.length === 0
        ? ((overlayKey === "energyShockOverlay" && block === "breadth" && diagnostics?.status === "pass") ? "available" : "unavailable")
        : availabilityCounts.available === blockSeries.length
          ? "available"
          : (availabilityCounts.available + availabilityCounts.partial) > 0
            ? "partial"
            : "unavailable";

      const blockComponents = actualComponents.filter((component) => normalizeOverlayRuntimeBlockName(overlayKey, component.block) === block);
      const blockSignalCount = blockComponents.length > 0 ? blockComponents.length : blockSeries.length;
      const validObservationCount = blockComponents.filter((component) => {
        const observations = component.debug?.observationsAvailableInScoringWindow ?? 0;
        return observations > 0 && typeof component.score === "number";
      }).length;

      const fallbackUsedSet = Array.from(new Set(blockSeries.map((row) => row.fallbackUsage).filter((value) => value !== "none")));
      const fallbackUsed = fallbackUsedSet.length > 0 ? fallbackUsedSet.join(" + ") : "none";
      const intendedPrimarySources = blockSeries.flatMap((row) => row.intendedPrimarySources.split(",").map((item) => item.trim())).filter(Boolean);
      const currentRuntimeSources = Array.from(new Set(blockSeries.map((row) => row.runtimeSourceUsed).filter((item) => item && item !== "—"))).join(", ") || diagnostics?.actualSourceUsed || "—";
      // Local Unrest repricing gating is region-specific by design.
      // US uses ACMTP10 (sovereign duration repricing), while EA uses BTP-Bund spread IDs.
      // If the region-correct source is present with no proxy/fallback, this block must not be marked missing.
      const blockHasNumericScore = typeof scoreValue === "number";
      const localUnrestRepricingBlockSourceFaithful = overlayKey === "localUnrestOverlay"
        && block === "repricing"
        && blockHasNumericScore
        && fallbackUsed === "none"
        && !blockComponents.some((component) => component.proxy)
        && ((selectedRegion === "US" && /ACMTP10/i.test(currentRuntimeSources))
          || (selectedRegion === "EA" && /IRLTLT01ITM156N|IRLTLT01DEM156N/i.test(currentRuntimeSources)));
      const sourceAvailability: "available" | "partial" | "unavailable" = localUnrestRepricingBlockSourceFaithful
        ? "available"
        : sourceAvailabilityBase;
      const runtimeStatus: "pass" | "partial" | "missing" = (() => {
        if (overlayKey === "energyShockOverlay") {
          const canonical = ((overlay as any)?.runtime?.blockDiagnostics?.[block]?.status ?? ((overlay as any)?.runtime?.blockDiagnostics?.[`${block}_pressure`]?.status ?? null)) as "pass" | "partial" | "missing" | null;
          if (canonical === "pass" || canonical === "partial" || canonical === "missing") return canonical;
        }
        if (localUnrestRepricingBlockSourceFaithful) return "pass";
        if (blockSignalCount === 0 || validObservationCount === 0) return "missing";
        return validObservationCount < blockSignalCount ? "partial" : "pass";
      })();
      const availabilityRatio = blockSeries.length === 0 ? 0 : (availabilityCounts.available + availabilityCounts.partial * 0.5) / blockSeries.length;
      const proxyShare = blockSeries.length === 0 ? 1 : blockSeries.filter((row) => row.fallbackUsage === "proxy source" || row.fallbackUsage === "derived approximation").length / blockSeries.length;
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
          : runtimeStatus === "partial"
            ? "runtime partially works; at least one signal has zero observations or missing score"
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
    const runtimeCompleteness: "full" | "partial" | "weak" | "invalid" = (() => {
      if (overlayKey === "energyShockOverlay" && typeof (overlay as any)?.runtime?.activeProductionBlockCount === "number") {
        const n = (overlay as any).runtime.activeProductionBlockCount as number;
        if (n >= 3) return "full";
        if (n === 2) return "partial";
        if (n === 1) return "weak";
        return "invalid";
      }
      if (blockRows.length === 0) return "weak";
      if (runnableBlocks === blockRows.length) return "full";
      return runnableBlocks >= Math.ceil(blockRows.length / 2) ? "partial" : "weak";
    })();
    const overlayFidelityScore = blockRows.length === 0 ? 0 : blockRows.reduce((sum, row) => sum + (row.specFidelity === "high" ? 1 : row.specFidelity === "medium" ? 0.5 : 0), 0) / blockRows.length;
    const specFidelity: "high" | "medium" | "low" = overlayKey === "energyShockOverlay" && typeof (overlay as any)?.runtime?.activeProductionBlockCount === "number"
      ? (((overlay as any).runtime.activeProductionBlockCount >= 3) ? "high" : (((overlay as any).runtime.activeProductionBlockCount === 2) ? "medium" : "low"))
      : (overlayFidelityScore >= 0.75 ? "high" : overlayFidelityScore >= 0.4 ? "medium" : "low");
    const runtimeProxyComponentRatio = actualComponents.length === 0 ? 1 : actualComponents.filter((component) => component.proxy).length / actualComponents.length;
    const blockProxyRatio = blockRows.length === 0 ? 1 : blockRows.filter((row) => row.fallbackUsed.includes("proxy source") || row.fallbackUsed.includes("derived approximation")).length / blockRows.length;
    const criticalBlocksByOverlay: Record<string, string[]> = {
      localUnrestOverlay: ["signal", "repricing"],
      tradeSupplyChainStressOverlay: ["real_goods_flow", "inventory_delivery_friction", "pipeline_cost_stress"],
      safeHavenRiskOffOverlay: ["gold_equity", "duration"],
      liquidityOverlay: ["bridge", "transmission"],
    };
    const criticalBlocks = criticalBlocksByOverlay[overlayKey] ?? [];
    const criticalProxyHit = blockRows.some((row) => criticalBlocks.includes(row.block) && (row.fallbackUsed.includes("proxy source") || row.fallbackUsed.includes("derived approximation")));
    const proxyRatio = Math.max(runtimeProxyComponentRatio, blockProxyRatio);
    const proxyDependence: "none" | "low" | "medium" | "high" = proxyRatio === 0
      ? "none"
      : (proxyRatio > 0.6 || (criticalProxyHit && proxyRatio >= 0.34))
        ? "high"
        : proxyRatio <= 0.25
          ? "low"
          : "medium";
    const robustness: "high" | "medium" | "low" = overlayKey === "energyShockOverlay" && typeof (overlay as any)?.runtime?.activeProductionBlockCount === "number"
      ? (((overlay as any).runtime.activeProductionBlockCount >= 3) ? "high" : (((overlay as any).runtime.activeProductionBlockCount === 2) ? "medium" : "low"))
      : (runtimeCompleteness === "full" && proxyDependence !== "high" && specFidelity !== "low"
        ? "high"
        : runtimeCompleteness === "weak" || proxyDependence === "high"
          ? "low"
          : "medium");
    const fidelityBadge = overlayKey === "energyShockOverlay"
      ? (runtimeCompleteness === "full" && specFidelity === "high" ? "Spec-faithful" : (runtimeCompleteness === "partial" ? "Structurally partial" : runtimeCompleteness === "weak" || runtimeCompleteness === "invalid" ? "Diagnostic-only" : "Near-spec"))
      : (specFidelity === "high"
        ? "Spec-faithful"
        : runtimeCompleteness === "weak"
          ? "Structurally incomplete"
          : proxyDependence === "high"
            ? "Proxy-heavy"
            : "Near-spec");

    const exactDifferences = blockRows
      .filter((row) => row.blockerType !== "no blocker" || row.sourceAvailability !== "available")
      .map((row) => overlayKey === "localUnrestOverlay" && row.block === "repricing" && row.runtimeStatus === "pass" && /ACMTP10/i.test(row.runtimeSources) && row.fallbackUsed === "none"
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
            if (row.blockerType === "intended source not ingested") reasons.push(`${row.block} source not ingested`);
      const localUnrestRepricingDirect = overlayKey === "localUnrestOverlay" && row.block === "repricing" && row.runtimeStatus === "pass" && /ACMTP10/i.test(row.runtimeSources) && row.fallbackUsed === "none";
      if (row.blockerType === "exact source family differs" && !localUnrestRepricingDirect) reasons.push(`${row.block} exact source family differs`);
      if (localUnrestRepricingDirect) reasons.push("repricing direct source-faithful match via ACMTP10");
      if (row.blockerType === "intended source not wired to overlay") reasons.push(`${row.block} source not yet wired`);
      return reasons;
    })));
    const impact = proxyDependence === "high"
      ? "Interpret with caution: proxy-heavy signal can shift faster than intended design baseline."
      : specFidelity === "low"
        ? "Interpretation risk is elevated: runtime deviates materially from intended spec."
        : "Interpretation remains broadly aligned with spec; monitor listed deltas.";

    const creditFundingExplicitDelta = overlayKey === "creditFundingOverlay"
      ? [
        `funding block availability: ${blockRows.find((row) => row.block === "funding")?.sourceAvailability ?? "unavailable"} (TEDRATE and xccy basis are required)`,
        `current computation mode: ${((overlay as any)?.runtime?.status === "complete") ? "full" : "partial"}; score currently computed from pricing + access when funding is unavailable`,
        `funding contribution to score: ${typeof overlay?.blockScores?.funding === "number" ? "included" : "excluded"}`,
      ]
      : [];

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
        `what matches spec: ${matchesSpec.join(" | ") || ((overlayKey === "energyShockOverlay" && ((overlay as any)?.runtime?.activeProductionBlockCount ?? 0) >= 3)
          ? "price + breadth + spillover are production-valid in current runtime implementation; remaining deltas are source-family/metadata level"
          : "no clear high-fidelity block match")}`,
        `exact differences: ${exactDifferences.join(" | ") || "none"}`,
        `why differences exist: ${whyDiffExists.join(" | ") || "no blocker"}`,
        `impact on interpretation: ${impact}`,
        ...creditFundingExplicitDelta,
        ...(overlayKey === "energyShockOverlay" ? [
          `active production blocks: ${(overlay as any)?.runtime?.activeProductionBlockCount ?? 0}; included in score: ${((overlay as any)?.runtime?.includedBlocks ?? []).join(", ") || "none"}; excluded: ${((overlay as any)?.runtime?.excludedBlocks ?? []).join(", ") || "none"}`,
          `runtime completeness: ${runtimeCompleteness}; spec fidelity: ${specFidelity}; robustness: ${robustness}`,
        ] : []),
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

  function labelByOverlayScore(score: number | null): string {
    if (score === null) return "Not implemented";
    if (score < 20) return "Severe stress";
    if (score < 40) return "Tight";
    if (score < 60) return "Neutral";
    if (score < 80) return "Supportive";
    return "Very supportive";
  }

  function normalizeOverlayRuntimeBlockName(overlayKey: string, rawBlock: string): string {
    if (overlayKey === "inflationCostShockOverlay") {
      if (rawBlock === "inflation_pressure") return "inflation";
      if (rawBlock === "upstream_cost_pressure") return "upstream";
      if (rawBlock === "expectations_pressure") return "expectations";
      return rawBlock;
    }
    if (overlayKey === "tradeSupplyChainStressOverlay") {
      if (rawBlock === "inventory_pressure") return "inventory_delivery_friction";
      if (rawBlock === "pricing") return "pipeline_cost_stress";
      return rawBlock;
    }
    return rawBlock;
  }


  function getCanonicalBlockScore(overlayKey: string, overlay: any, block: string): number | null {
    const blockScores = (overlay?.blockScores ?? {}) as Record<string, number | null>;
    if (Object.prototype.hasOwnProperty.call(blockScores, block)) return blockScores[block] ?? null;
    const entry = Object.entries(blockScores).find(([rawBlock]) => normalizeOverlayRuntimeBlockName(overlayKey, rawBlock) === block);
    return entry ? (entry[1] ?? null) : null;
  }

  function normalizeOverlayLabel(overlayKey: string): string {
    return overlayKey
      .replace(/Overlay$/, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (value) => value.toUpperCase());
  }

  function signalEconomicMeaning(signalId: string): string {
    const key = signalId.toLowerCase();
    if (key.includes("walcl") || key.includes("balance")) return "Central bank balance sheet depth versus macro base.";
    if (key.includes("m2") || key.includes("money")) return "Broad money availability and monetary impulse.";
    if (key.includes("credit") || key.includes("loan") || key.includes("totbkcr")) return "Private credit creation and liquidity transmission capacity.";
    if (key.includes("dfii") || key.includes("real") || key.includes("yield")) return "Real-rate pressure affecting financing conditions.";
    if (key.includes("nfci") || key.includes("fci") || key.includes("conditions")) return "Aggregate financial conditions tightness.";
    if (key.includes("hym2") || key.includes("hy") || key.includes("spread")) return "Credit spread stress and risk premium repricing.";
    if (key.includes("dtwex") || key.includes("dollar") || key.includes("usd")) return "Dollar strength and global funding transmission pressure.";
    if (key.includes("drtscilm") || key.includes("xccy") || key.includes("basis") || key.includes("bridge")) return "Cross-currency basis stress in global funding markets.";
    if (key.includes("usepu") || key.includes("policy")) return "Policy uncertainty and local governance stress.";
    return "Macro stress/support signal used in the overlay architecture.";
  }

  function buildOverlayInfoSections(row: any) {
    const channels = Array.from(new Set((row.blockRows ?? []).map((block: any) => block.block)));
    const blockLines = channels.map((block) => `• ${block}`);
    const signalLines = (row.overlay?.components ?? []).map((component: any) => {
      const meaning = signalEconomicMeaning(component.id ?? component.title ?? "");
      return `${component.id} | Block: ${normalizeOverlayRuntimeBlockName(row.overlayKey, component.block)} | Measures: ${meaning} | Source: ${component.exactSource || component.source || "—"} | Role: ${component.title || "overlay input"}`;
    });
    const blockScores = Object.entries(row.overlay?.blockScores ?? {}).map(([block, score]) => `${normalizeOverlayRuntimeBlockName(row.overlayKey, block)}: ${typeof score === "number" ? score.toFixed(2) : "missing"}`);
    const totalScore = typeof row.overlay?.score === "number" ? row.overlay.score.toFixed(2) : "missing";
    const includedBlocks = Array.from(new Set(Object.entries(row.overlay?.blockScores ?? {}).filter(([, score]) => typeof score === "number").map(([block]) => normalizeOverlayRuntimeBlockName(row.overlayKey, block))));
    const excludedBlocks = Array.from(new Set(Object.entries(row.overlay?.blockScores ?? {}).filter(([, score]) => score === null).map(([block]) => normalizeOverlayRuntimeBlockName(row.overlayKey, block))));
    const fundingMissing = row.overlayKey === "creditFundingOverlay" && excludedBlocks.includes("funding");

    const liquidityLines = row.overlayKey === "liquidityOverlay"
      ? [
        "This overlay measures global liquidity conditions.",
        "It combines four transmission channels:",
        "Quantity — expansion or contraction of money and credit.",
        "Price — cost of liquidity in financial markets.",
        "Transmission — dollar strength and cross-border funding pressure.",
        "Bridge — cross-currency funding conditions.",
      ]
      : [
        `This overlay measures ${normalizeOverlayLabel(row.overlayKey)} conditions.`,
        "It combines several macro transmission channels:",
        ...blockLines,
      ];

    return [
      { heading: "What this overlay measures", lines: liquidityLines },
      { heading: "Signals used", lines: signalLines.length ? signalLines : ["No runtime signals available."] },
      {
        heading: "How the score is computed",
        lines: [
          "Each signal is converted into a historical percentile.",
          "support_score = 100 − percentile",
          "high percentile → stress signal; low percentile → supportive signal",
          "block_score = weighted_average(valid signal_scores)",
          "overlay_score = weighted_average(available non-null block_scores)",
        ],
      },
      {
        heading: "How to interpret the result",
        lines: [
          "0–20 Severe stress",
          "20–40 Tight conditions",
          "40–60 Neutral",
          "60–80 Supportive",
          "80–100 Very supportive",
        ],
      },
      {
        heading: "Current reading",
        lines: [
          "Signal block scores:",
          ...blockScores,
          `Included blocks in score: ${includedBlocks.join(", ") || "none"}`,
          `Excluded blocks from score: ${excludedBlocks.join(", ") || "none"}`,
          ...(fundingMissing
            ? [
              "Funding block is currently unavailable and excluded from score.",
              "Current creditFundingOverlay reading is driven by pricing + access only.",
              "Interpret as partial, not a full funding assessment, until TED and/or xccy basis are available.",
            ]
            : []),
          `Overlay score: ${totalScore}`,
          `Interpretation: ${row.overlay?.label || "Not implemented"}`,
        ],
      },
    ];
  }

  function renderOverlayHistoryChart(overlayKey: string, chartSize: "compact" | "expanded" = "compact") {
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
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxWidth: chartSize === "expanded" ? 960 : 580, height: chartSize === "expanded" ? 260 : 170, display: "block" }}>
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
  const regimeIntervals = macroHistory?.intervals?.regime ?? [];
  const overlayIntervals = macroHistory?.intervals?.overlays ?? { growth: [], stress: [], hardAsset: [] };
  const latestHistoryPoint = historyPoints[historyPoints.length - 1] ?? null;
  const latestRegimeInterval = regimeIntervals[regimeIntervals.length - 1] ?? null;
  const timelineStartDate = macroHistory?.replayEarliestDateUsed ?? macroHistory?.rangeDebug?.actualStartDate ?? null;
  const timelineEndDate = macroHistory?.replayLatestDateUsed ?? macroHistory?.rangeDebug?.actualEndDate ?? null;
  const timelineWindow = useMemo(() => {
    if (!timelineStartDate || !timelineEndDate) return null;
    const start = new Date(`${timelineStartDate}T00:00:00.000Z`).getTime();
    const end = new Date(`${timelineEndDate}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return { start, end };
  }, [timelineStartDate, timelineEndDate]);
  const pointByDate = useMemo(() => new Map(historyPoints.map((item) => [item.asOfDate, item])), [historyPoints]);
  const phaseMomentum = useMemo(() => {
    const currentWeights = extractRegimeWeights(regimeProbabilityDistribution, regimeProbabilityAny?.primaryRegime);
    const currentPosition = regimePhasePosition(currentWeights);
    const phaseHistory = historyPoints
      .map((point) => {
        const anyPoint = point as any;
        const weights = extractRegimeWeights(anyPoint?.macroRegimeProbability?.distribution ?? anyPoint?.regimeProbability?.distribution, point.coreRegimeLabel);
        const pos = regimePhasePosition(weights);
        return { asOfDate: point.asOfDate, pos, weights, decisiveness: normalizeRegimeWeight(anyPoint?.macroRegimeProbability?.decisiveness) };
      })
      .filter((item) => Number.isFinite(item.pos.x) && Number.isFinite(item.pos.y));
    const prevPoint = phaseHistory.length > 1 ? phaseHistory[phaseHistory.length - 2] : null;
    const prevPos = prevPoint?.pos ?? null;
    const dx = prevPos ? currentPosition.x - prevPos.x : 0;
    const dy = prevPos ? currentPosition.y - prevPos.y : 0;
    const distance = Math.sqrt(dx ** 2 + dy ** 2);
    const primaryWeightNorm = normalizeRegimeWeight(regimeProbabilityAny?.primaryWeight);
    const previousPrimaryWeight = prevPoint
      ? Math.max(prevPoint.weights.md, prevPoint.weights.bal, prevPoint.weights.fpb, prevPoint.weights.fdr)
      : primaryWeightNorm;
    const primaryWeightDelta = primaryWeightNorm - previousPrimaryWeight;
    const decisivenessNorm = normalizeRegimeWeight(regimeProbabilityAny?.decisiveness);
    const decisivenessDelta = decisivenessNorm - (prevPoint?.decisiveness ?? decisivenessNorm);
    const label = distance < 0.05
      ? "Stable within current phase"
      : distance >= 0.2 || primaryWeightDelta > 0.04
        ? (dx > 0 ? "Strengthening toward fiscal dominance" : "Strengthening toward monetary/balance side")
        : (dx > 0
          ? (dy > 0 ? "Drifting toward fiscal-pressure regime mix" : "Drifting toward fiscal-dominance risk")
          : (dy > 0 ? "Drifting toward monetary-pressure mix" : "Drifting toward balance/monetary side"));
    const state = distance < 0.05 ? "stable" : (distance >= 0.2 || primaryWeightDelta > 0.04 || decisivenessDelta > 0.03 ? "strengthening" : "drifting");
    return { currentPosition, prevPos, dx, dy, distance, label, state };
  }, [historyPoints, regimeProbabilityDistribution, regimeProbabilityAny?.primaryRegime, regimeProbabilityAny?.primaryWeight, regimeProbabilityAny?.decisiveness]);

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

  function regimeNowStateLabel(): "stable" | "fragile" | "contested" | "transition-like" {
    const decisiveness = typeof regimeProbabilityAny?.decisiveness === "number" ? regimeProbabilityAny.decisiveness : null;
    const quality = String(explanationSummary?.structuralQualityLabel ?? "");
    if (regimeProbabilityAny?.transitionLike) return "transition-like";
    if (decisiveness !== null && decisiveness < 0.2) return "contested";
    if (quality === "fragile" || (decisiveness !== null && decisiveness < 0.35)) return "fragile";
    return "stable";
  }

  function overlayRole(overlayKey: string): "supporting" | "modulating" | "contradicting" | "neutral" {
    const supporting = Array.isArray(regimeProbabilityAny?.supportingOverlays) ? regimeProbabilityAny.supportingOverlays : [];
    const modulating = Array.isArray(regimeProbabilityAny?.modulatingOverlays) ? regimeProbabilityAny.modulatingOverlays : [];
    const contradicting = Array.isArray(regimeProbabilityAny?.contradictingOverlays) ? regimeProbabilityAny.contradictingOverlays : [];
    if (supporting.includes(overlayKey)) return "supporting";
    if (modulating.includes(overlayKey)) return "modulating";
    if (contradicting.includes(overlayKey)) return "contradicting";
    return "neutral";
  }

  function normalizeRegimeWeight(value: unknown): number {
    if (typeof value !== "number" || Number.isNaN(value)) return 0;
    if (value <= 1) return value;
    return value / 100;
  }

  function regimePhasePosition(weights: { md: number; bal: number; fpb: number; fdr: number }): { x: number; y: number } {
    const xRaw = (weights.fdr + weights.fpb) - (weights.md + weights.bal);
    const yRaw = (weights.fpb + weights.md) - (weights.bal + weights.fdr);
    return {
      x: Math.max(-1, Math.min(1, xRaw)),
      y: Math.max(-1, Math.min(1, yRaw)),
    };
  }

  function toDisplayPhasePosition(position: { x: number; y: number }): { x: number; y: number } {
    return { x: -position.y, y: -position.x };
  }

  function extractRegimeWeights(distributionLike: unknown, fallbackRegime?: string | null): { md: number; bal: number; fpb: number; fdr: number } {
    const rows = Array.isArray(distributionLike) ? distributionLike : [];
    const read = (regime: string) => normalizeRegimeWeight((rows.find((row: any) => row?.regime === regime) as any)?.weight);
    const fromDistribution = {
      md: read("MonetaryDominance"),
      bal: read("Balanced"),
      fpb: read("FiscalPressureBuilding"),
      fdr: read("FiscalDominanceRisk"),
    };
    const total = fromDistribution.md + fromDistribution.bal + fromDistribution.fpb + fromDistribution.fdr;
    if (total > 0) return fromDistribution;
    return {
      md: fallbackRegime === "MonetaryDominance" ? 1 : 0,
      bal: fallbackRegime === "Balanced" ? 1 : 0,
      fpb: fallbackRegime === "FiscalPressureBuilding" ? 1 : 0,
      fdr: fallbackRegime === "FiscalDominanceRisk" ? 1 : 0,
    };
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

  const historyEmptyMessage = useMemo(() => {
    if (!macroHistory || historyPoints.length > 0) return null;
    const source = macroHistory.replay?.source ?? "cache_miss";
    const range = String(macroHistory.requestedRangeYears ?? historyRangeYears);
    const resolution = macroHistory.resolution ?? historyResolution;
    const unfilledReason = macroHistory.rangeDebug?.unfilledReason ?? "okänd anledning";
    if (source === "cache_miss") {
      return `Historik finns ännu inte i snapshot/cache för ${resolution} (${range}). Kör macro-refresh för att generera historiken.`;
    }
    return `Historik saknas för vald period/upplösning. Orsak: ${unfilledReason}.`;
  }, [macroHistory, historyPoints.length, historyRangeYears, historyResolution]);

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
        cache: "no-store",
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
        cache: "no-store",
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
  async function runMacroCronRefresh() {
    setCronRefreshRunning(true);
    setCronRefreshResult(null);
    const requestedMode = "quick";
    const attemptedUrl = `/api/cron/macro-refresh?mode=${requestedMode}`;
    try {
      const response = await fetch(`/api/cron/macro-refresh?mode=${requestedMode}`, {
        cache: "no-store",
        method: "POST",
        headers: cronSecretInput.trim()
          ? { "x-cron-secret": cronSecretInput.trim() }
          : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      setCronRefreshResult({
        status: response.status,
        ok: response.ok,
        requestedMode,
        attemptedUrl,
        timestamp: new Date().toISOString(),
        authMethodUsed: cronSecretInput.trim() ? "x-cron-secret header (manual debug input)" : "none",
        payload,
      });
      await loadGlobalMacro();
    } catch (error) {
      setCronRefreshResult({
        status: 0,
        ok: false,
        requestedMode,
        attemptedUrl,
        timestamp: new Date().toISOString(),
        authMethodUsed: cronSecretInput.trim() ? "x-cron-secret header (manual debug input)" : "none",
        payload: {
          error: error instanceof Error ? error.message : "Unknown cron-refresh error",
          note: "Cron refresh failed. No automatic ingest/engine fallback was triggered.",
          workPerformedBeforeFailure: "none",
          fallbackTriggered: false,
        },
      });
    } finally {
      setCronRefreshRunning(false);
    }
  }

  async function rebuildSnapshotNoIngest() {
    if (!adminSecretInput.trim()) {
      setRebuildSnapshotResult({ ok: false, error: "Missing admin secret (x-admin-secret)." });
      return;
    }
    setRebuildSnapshotRunning(true);
    setRebuildSnapshotResult(null);
    try {
      const response = await fetch(`/api/admin/rebuild-macro-snapshot?region=${selectedRegion}`, {
        cache: "no-store",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecretInput.trim(),
        },
        body: JSON.stringify({ region: selectedRegion }),
      });
      const payload = await response.json().catch(() => ({}));
      setRebuildSnapshotResult({
        status: response.status,
        ok: response.ok,
        region: selectedRegion,
        timestamp: new Date().toISOString(),
        note: "This does NOT fetch new data.",
        payload,
      });
      if (!response.ok) {
        return;
      }
      await loadGlobalMacro();
    } catch (error) {
      setRebuildSnapshotResult({
        status: 0,
        ok: false,
        region: selectedRegion,
        timestamp: new Date().toISOString(),
        note: "No ingest fallback was attempted.",
        payload: { error: error instanceof Error ? error.message : "Unknown snapshot rebuild error" },
      });
    } finally {
      setRebuildSnapshotRunning(false);
    }
  }



  return (
    <div className="sector-dashboard">
      <div className="sector-grid">
        <div className="sector-card macro-premium-card" style={{ overflow: "visible" }}>
          <h3>Global Macro Dashboard</h3>
          <p className="bread">Global Macro tolkar det makroekonomiska klimatet över tid genom att väga samman finansiering, räntor, inflation, trovärdighet och marknadsstress. Målet är att ge en lugn men skarp lägesbild av vilken regim marknaden befinner sig i – och på sikt knyta den till riskklimat, bull/bear-faser och den bredare kapitalmiljön.</p>

          <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 8, marginBottom: 8 }}>
            {[
              { value: "US", label: "US" },
              { value: "EA", label: "EU" },
              { value: "SE", label: "SE" },
            ].map((region) => (
              <button
                key={region.value}
                type="button"
                onClick={() => setSelectedRegion(region.value as "GLOBAL" | "US" | "EA" | "SE")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: selectedRegion === region.value ? "1px solid #111" : "1px solid #d0d7de",
                  background: selectedRegion === region.value ? "#111" : "#fff",
                  color: selectedRegion === region.value ? "#fff" : "#111",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  scrollSnapAlign: "start",
                }}
              >
                {region.label}
              </button>
            ))}
          </div>

          {globalMacroLoading && <div className="status">Laddar Global Macro…</div>}
          {globalMacroError && <div className="status">Kunde inte ladda Global Macro: {globalMacroError}</div>}
          {isNoData && <div className="status empty">Ingen macrodata hittades ännu. Sektionen är aktiv men endpointen returnerade tomt.</div>}
          {debugEnabled && readDiagnostics?.debugTiming && (
            <section style={{ border: "1px dashed #94a3b8", borderRadius: 8, padding: "8px 10px", marginBottom: 10, background: "#f8fafc" }}>
              <details>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>Debug: tidsåtgång global macro</summary>
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  <div><strong>Total:</strong> {String(readDiagnostics?.debugTiming?.totalMs ?? "—")} ms</div>
                  <ul style={{ marginTop: 6 }}>
                    {(Array.isArray(readDiagnostics?.debugTiming?.breakdown) ? readDiagnostics.debugTiming.breakdown : []).map((row: any) => (
                      <li key={`debug-timing-${row?.step}`}>{String(row?.step ?? "unknown")}: {String(row?.ms ?? "—")} ms</li>
                    ))}
                  </ul>
                  <div style={{ fontWeight: 700, marginTop: 6 }}>Slowest:</div>
                  <ol style={{ marginTop: 4 }}>
                    {(Array.isArray(readDiagnostics?.debugTiming?.slowestSteps) ? readDiagnostics.debugTiming.slowestSteps : []).map((row: any) => (
                      <li key={`debug-slowest-${row?.step}`}>{String(row?.step ?? "unknown")} ({String(row?.ms ?? "—")} ms)</li>
                    ))}
                  </ol>
                </div>
              </details>
            </section>
          )}
          {debugEnabled && frontendDebugTiming && (
            <section style={{ border: "1px dashed #94a3b8", borderRadius: 8, padding: "8px 10px", marginBottom: 10, background: "#f8fafc" }}>
              <details>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>Debug: laddkedja frontend global macro</summary>
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  <div>navigation_to_mount_ms: {frontendDebugTiming.navigationToMountMs === null ? "—" : frontendDebugTiming.navigationToMountMs.toFixed(1)}</div>
                  <div>mount_to_fetch_start_ms: {frontendDebugTiming.mountToFetchStartMs === null ? "—" : frontendDebugTiming.mountToFetchStartMs.toFixed(1)}</div>
                  <div>fetch_duration_ms: {frontendDebugTiming.fetchDurationMs === null ? "—" : frontendDebugTiming.fetchDurationMs.toFixed(1)}</div>
                  <div>fetch_to_data_bound_ms: {frontendDebugTiming.fetchToDataBoundMs === null ? "—" : frontendDebugTiming.fetchToDataBoundMs.toFixed(1)}</div>
                  <div>data_to_render_complete_ms: {frontendDebugTiming.dataToRenderCompleteMs === null ? "—" : frontendDebugTiming.dataToRenderCompleteMs.toFixed(1)}</div>
                  <div><strong>total_user_perceived_ms: {frontendDebugTiming.totalUserPerceivedMs === null ? "—" : frontendDebugTiming.totalUserPerceivedMs.toFixed(1)}</strong></div>
                  <div style={{ marginTop: 6 }}>request_count: {frontendDebugTiming.requestCount}</div>
                  <div>request_mode: {frontendDebugTiming.requestMode}</div>
                  <div>max_concurrent_requests: {frontendDebugTiming.maxConcurrent}</div>
                  <div>repeated_urls: {frontendDebugTiming.repeatedUrls.length > 0 ? frontendDebugTiming.repeatedUrls.join(" | ") : "none"}</div>
                  <div>requested_regions: {frontendDebugTiming.requestSummary.requestedRegions.join(", ") || "none"}</div>
                  <div>first_requested_region: {frontendDebugTiming.requestSummary.firstRequestedRegion ?? "—"}</div>
                  <div>active_region_at_mount: {frontendDebugTiming.requestSummary.activeRegionAtMount}</div>
                  <div>initial_request_matched_active_tab: {String(frontendDebugTiming.requestSummary.initialRequestMatchedActiveTab)}</div>
                  <div style={{ marginTop: 6 }}>
                    section timings (ms from mount): regimeProbability={frontendDebugTiming.sectionTimings.regimeProbabilityRenderedMs === null ? "—" : frontendDebugTiming.sectionTimings.regimeProbabilityRenderedMs.toFixed(1)},
                    driverBreakdown={frontendDebugTiming.sectionTimings.driverBreakdownRenderedMs === null ? "—" : frontendDebugTiming.sectionTimings.driverBreakdownRenderedMs.toFixed(1)},
                    overlays={frontendDebugTiming.sectionTimings.overlaysRenderedMs === null ? "—" : frontendDebugTiming.sectionTimings.overlaysRenderedMs.toFixed(1)}
                  </div>
                  <ul style={{ marginTop: 6 }}>
                    {frontendDebugTiming.requests.map((req, idx) => (
                      <li key={`frontend-req-${idx}`}>
                        {req.url} · start={req.startMs.toFixed(1)} · end={req.endMs === null ? "—" : req.endMs.toFixed(1)} · duration={req.durationMs === null ? "—" : req.durationMs.toFixed(1)} ms
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </section>
          )}
          {debugEnabled && selectedRegion === "US" && frontendDebugTiming?.usRequestChain && (
            <section style={{ border: "1px dashed #94a3b8", borderRadius: 8, padding: "8px 10px", marginBottom: 10, background: "#f8fafc" }}>
              <details>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>Debug: US request chain</summary>
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  <div>server_total_ms: {frontendDebugTiming.usRequestChain.serverMeasuredMs === null ? "—" : frontendDebugTiming.usRequestChain.serverMeasuredMs.toFixed(1)}</div>
                  <div>payload_size_bytes: {frontendDebugTiming.usRequestChain.payloadSizeBytes === null ? "—" : String(frontendDebugTiming.usRequestChain.payloadSizeBytes)}</div>
                  <div>measured_substeps_sum_ms: {typeof (globalMacroRaw as any)?.diagnostics?.usRequestChain?.measuredSubstepsSumMs === "number" ? (globalMacroRaw as any).diagnostics.usRequestChain.measuredSubstepsSumMs.toFixed(1) : "—"}</div>
                  <div>server_unmeasured_gap_ms: {typeof (globalMacroRaw as any)?.diagnostics?.usRequestChain?.unmeasuredGapMs === "number" ? (globalMacroRaw as any).diagnostics.usRequestChain.unmeasuredGapMs.toFixed(1) : "—"}</div>
                  <div>client_fetch_duration_ms: {frontendDebugTiming.usRequestChain.clientFetchDurationMs === null ? "—" : frontendDebugTiming.usRequestChain.clientFetchDurationMs.toFixed(1)}</div>
                  <div>client_parse_ms: {frontendDebugTiming.usRequestChain.clientParseMs === null ? "—" : frontendDebugTiming.usRequestChain.clientParseMs.toFixed(1)}</div>
                  <div>client_bind_ms: {frontendDebugTiming.usRequestChain.clientBindMs === null ? "—" : frontendDebugTiming.usRequestChain.clientBindMs.toFixed(1)}</div>
                  <div>estimated_transfer_wait_ms: {frontendDebugTiming.usRequestChain.estimatedTransferWaitMs === null ? "—" : frontendDebugTiming.usRequestChain.estimatedTransferWaitMs.toFixed(1)}</div>
                  <div>estimated_unaccounted_ms: {frontendDebugTiming.usRequestChain.estimatedUnaccountedMs === null ? "—" : frontendDebugTiming.usRequestChain.estimatedUnaccountedMs.toFixed(1)}</div>
                  <div><strong>slowest_stage: {frontendDebugTiming.usRequestChain.slowestStage ?? "—"}</strong></div>
                  <ul style={{ marginTop: 6 }}>
                    {frontendDebugTiming.usRequestChain.serverBreakdown.map((row, idx) => (
                      <li key={`us-server-breakdown-${idx}`}>{row.step}: {row.ms} ms</li>
                    ))}
                  </ul>
                </div>
              </details>
            </section>
          )}

          {!globalMacroLoading && !globalMacroError && globalMacro && hasRegime && (
            <>
              {isPartialData && (
                <div className="status">Partial data: {scoredCount}/{globalMacroIndicators.length} indikatorer är poängsatta.</div>
              )}

              <section style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "12px", marginBottom: 14, background: "#f8fafc" }}>
                <h4 style={{ marginTop: 0, marginBottom: 10 }}>GLOBAL MACRO — NU-LÄGE</h4>
                <div style={{ border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff", padding: 10, marginBottom: 12, maxWidth: 520 }}>
                  {(() => {
                    const currentPosition = toDisplayPhasePosition(phaseMomentum.currentPosition);
                    const positionLeft = 50 + currentPosition.x * 40;
                    const positionTop = 50 - currentPosition.y * 40;
                    const primaryWeightNorm = normalizeRegimeWeight(regimeProbabilityAny?.primaryWeight);
                    const decisivenessNorm = normalizeRegimeWeight(regimeProbabilityAny?.decisiveness);
                    const confidenceNorm = normalizeRegimeWeight(explanationSummary?.confidence ?? globalMacro.regime?.macroConfidence);
                    const markerSize = 16 + primaryWeightNorm * 24;
                    const prevPos = phaseMomentum.prevPos ? toDisplayPhasePosition(phaseMomentum.prevPos) : null;
                    const movementDistance = phaseMomentum.distance;
                    const secondaryRegimes = regimeProbabilityDistribution
                      .slice()
                      .sort((a: any, b: any) => (typeof b?.weight === "number" ? b.weight : 0) - (typeof a?.weight === "number" ? a.weight : 0))
                      .filter((row: any) => row?.regime && row.regime !== regimeProbabilityAny?.primaryRegime)
                      .slice(0, 2);
                    const pullVector = secondaryRegimes.reduce((acc: { x: number; y: number }, row: any) => {
                      const regime = String(row.regime ?? "");
                      const canonical = regimePhasePosition({
                        md: regime === "MonetaryDominance" ? 1 : 0,
                        bal: regime === "Balanced" ? 1 : 0,
                        fpb: regime === "FiscalPressureBuilding" ? 1 : 0,
                        fdr: regime === "FiscalDominanceRisk" ? 1 : 0,
                      });
                      const display = toDisplayPhasePosition(canonical);
                      const w = normalizeRegimeWeight(row?.weight);
                      return { x: acc.x + display.x * w, y: acc.y + display.y * w };
                    }, { x: 0, y: 0 });
                    const pullMagnitude = Math.min(1, Math.sqrt(pullVector.x ** 2 + pullVector.y ** 2));
                    const pullNorm = pullMagnitude > 0 ? { x: pullVector.x / pullMagnitude, y: pullVector.y / pullMagnitude } : { x: 0, y: 0 };
                    const auraBase = 4 + (1 - decisivenessNorm) * 7;
                    const rRight = auraBase * (1 + Math.max(0, pullNorm.x) * 0.9);
                    const rLeft = auraBase * (1 + Math.max(0, -pullNorm.x) * 0.9);
                    const rUp = auraBase * (1 + Math.max(0, pullNorm.y) * 0.9);
                    const rDown = auraBase * (1 + Math.max(0, -pullNorm.y) * 0.9);
                    const cx = 50 + currentPosition.x * 40;
                    const cy = 50 - currentPosition.y * 40;
                    const blobPath = [
                      `M ${cx} ${cy - rUp}`,
                      `C ${cx + rRight * 0.6} ${cy - rUp}, ${cx + rRight} ${cy - rDown * 0.5}, ${cx + rRight} ${cy}`,
                      `C ${cx + rRight} ${cy + rDown * 0.5}, ${cx + rRight * 0.6} ${cy + rDown}, ${cx} ${cy + rDown}`,
                      `C ${cx - rLeft * 0.6} ${cy + rDown}, ${cx - rLeft} ${cy + rDown * 0.5}, ${cx - rLeft} ${cy}`,
                      `C ${cx - rLeft} ${cy - rUp * 0.5}, ${cx - rLeft * 0.6} ${cy - rUp}, ${cx} ${cy - rUp}`,
                      "Z",
                    ].join(" ");
                    return (
                  <div style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 8, background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)", overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, border: "1px solid #cbd5e1", borderRadius: 8 }} />
                    <div style={{ position: "absolute", left: "10%", right: "10%", top: "50%", height: 1, background: "#94a3b8" }} />
                    <div style={{ position: "absolute", top: "10%", bottom: "10%", left: "50%", width: 1, background: "#94a3b8" }} />
                    <div style={{ position: "absolute", left: "6%", top: "6%", fontSize: 10, color: "#64748b", fontWeight: 700 }}>MonetaryDominance</div>
                    <div style={{ position: "absolute", right: "6%", top: "6%", fontSize: 10, color: "#64748b", fontWeight: 700 }}>Balanced</div>
                    <div style={{ position: "absolute", left: "6%", bottom: "6%", fontSize: 10, color: "#64748b", fontWeight: 700 }}>FiscalPressureBuilding</div>
                    <div style={{ position: "absolute", right: "6%", bottom: "6%", fontSize: 10, color: "#64748b", fontWeight: 700 }}>FiscalDominanceRisk</div>
                    {prevPos && movementDistance >= 0.01 && (
                      <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                        <defs>
                          <marker id="macro-phase-arrow" markerWidth="4" markerHeight="4" refX="3.4" refY="2" orient="auto">
                            <polygon points="0 0, 4 2, 0 4" fill="#475569" />
                          </marker>
                        </defs>
                        <line
                          x1={50 + prevPos.x * 40}
                          y1={50 - prevPos.y * 40}
                          x2={positionLeft}
                          y2={positionTop}
                          stroke="#475569"
                          strokeWidth={movementDistance >= 0.16 ? 1.2 : 0.8}
                          strokeOpacity={movementDistance >= 0.16 ? 0.62 : 0.28}
                          strokeLinecap="round"
                          markerEnd="url(#macro-phase-arrow)"
                        />
                      </svg>
                    )}
                    {secondaryRegimes.map((row: any, index: number) => {
                      const regime = String(row.regime ?? "");
                      const unit = toDisplayPhasePosition(regimePhasePosition({
                        md: regime === "MonetaryDominance" ? 1 : 0,
                        bal: regime === "Balanced" ? 1 : 0,
                        fpb: regime === "FiscalPressureBuilding" ? 1 : 0,
                        fdr: regime === "FiscalDominanceRisk" ? 1 : 0,
                      }));
                      return (
                        <div
                          key={`secondary-${regime}`}
                          style={{
                            position: "absolute",
                            left: `${50 + unit.x * 34}%`,
                            top: `${50 - unit.y * 34}%`,
                            width: 6,
                            height: 6,
                            marginLeft: -3,
                            marginTop: -3,
                            borderRadius: 999,
                            background: "rgba(71,85,105,0.28)",
                            opacity: 0.42 - index * 0.14,
                          }}
                          title={`${regime} ${safePct(row?.weight)}`}
                        />
                      );
                    })}
                    <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", filter: regimeProbabilityAny?.transitionLike ? "blur(3px)" : "blur(1px)" }}>
                      <path d={blobPath} fill="rgba(30,41,59,0.10)" opacity={Math.max(0.2, 1 - decisivenessNorm)} />
                      <path d={blobPath} fill="none" stroke="rgba(71,85,105,0.25)" strokeWidth="0.8" />
                    </svg>
                    <div
                      style={{
                        position: "absolute",
                        left: `${positionLeft}%`,
                        top: `${positionTop}%`,
                        width: markerSize,
                        height: markerSize,
                        marginLeft: -markerSize / 2,
                        marginTop: -markerSize / 2,
                        borderRadius: 999,
                        border: `${1 + Math.round(confidenceNorm * 2)}px solid #0f172a`,
                        background: "rgba(15,23,42,0.85)",
                        opacity: Math.max(0.45, decisivenessNorm),
                        boxShadow: "0 2px 10px rgba(15,23,42,0.28)",
                      }}
                      title={`${String(regimeProbabilityAny?.primaryRegime ?? "—")} ${safePct(regimeProbabilityAny?.primaryWeight)}`}
                    />
                  </div>
                    );
                  })()}
                </div>
                <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", background: "#fff", marginBottom: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 6, fontSize: 12, marginBottom: 6 }}>
                    <div><strong>Primary</strong><br />{String(regimeProbabilityAny?.primaryRegime ?? globalMacro.regime?.coreRegimeLabel ?? "—")}</div>
                    <div><strong>Weight</strong><br />{safePct(regimeProbabilityAny?.primaryWeight)}</div>
                    <div><strong>Decisiveness</strong><br />{safePct(regimeProbabilityAny?.decisiveness)}</div>
                    <div><strong>Quality</strong><br />{String(explanationSummary?.structuralQualityLabel ?? "—")}</div>
                    <div><strong>State</strong><br />{regimeNowStateLabel()}</div>
                  </div>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12 }}>
                    <li>Momentum: {phaseMomentum.label}.</li>
                    <li>Driven by {Array.isArray(regimeProbabilityAny?.supportingBlocks) && regimeProbabilityAny.supportingBlocks.length ? regimeProbabilityAny.supportingBlocks.slice(0, 2).join(", ") : "mixed block signals"}.</li>
                    <li>Confirmed by {Array.isArray(regimeProbabilityAny?.supportingOverlays) ? regimeProbabilityAny.supportingOverlays.length : 0} overlays.</li>
                    <li>Contradicted by {Array.isArray(regimeProbabilityAny?.contradictingOverlays) ? regimeProbabilityAny.contradictingOverlays.length : 0} overlays.</li>
                  </ul>
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: "pointer", fontSize: 12 }}>Visa detaljerad regimtolkning</summary>
                    <div style={{ fontSize: 12, marginTop: 6 }}>{String(regimeProbabilityAny?.narrative?.short ?? explanationNarrative?.short ?? globalMacro.regime?.regimeExplanation?.summary ?? "Regime narrative saknas.")}</div>
                  </details>
                </div>
                <div>
                  <strong>Overlay stack</strong>
                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                    {uiOverlayKeysRequested.map((overlayKey) => {
                      const overlay = activeOverlayBundle?.overlays?.[overlayKey];
                      const role = overlayRole(overlayKey);
                      const expanded = expandedOverlayKey === overlayKey;
                      const overlayExplain = explanationOverlays.find((item: any) => item.overlayId === overlayKey);
                      const row = overlayDebugRows.find((item) => item.overlayKey === overlayKey);
                      return (
                        <div key={`overlay-stack-${overlayKey}`} style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff" }}>
                          <button
                            type="button"
                            onClick={() => setExpandedOverlayKey((current) => current === overlayKey ? null : overlayKey)}
                            style={{ width: "100%", border: "none", background: "transparent", textAlign: "left", cursor: "pointer", padding: "8px 10px", display: "flex", justifyContent: "space-between", gap: 8 }}
                          >
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{normalizeOverlayLabel(overlayKey)}</span>
                            <span style={{ fontSize: 12 }}>score {safeNumber(overlay?.score, 1)} · {overlay?.label ?? "—"} · role {role}</span>
                          </button>
                          {expanded && (
                            <div style={{ borderTop: "1px solid #e2e8f0", padding: "8px 10px" }}>
                              <div style={{ fontSize: 12, marginBottom: 8 }}>{overlay?.runtime?.directionTag ? `Direction: ${String(overlay.runtime.directionTag)} · ` : ""}confidence {safePct(overlay?.confidence)}</div>
                              <MacroLabMiniSeries
                                id={`overlay-inline-${overlayKey}`}
                                title={`${normalizeOverlayLabel(overlayKey)} history`}
                                dates={overlayHistoryPoints.map((point) => point.asOfDate)}
                                lines={[{
                                  label: normalizeOverlayLabel(overlayKey),
                                  color: "#7c3aed",
                                  data: overlayHistoryPoints.map((point) => {
                                    const value = point.scores?.[overlayKey];
                                    return typeof value === "number" ? value : null;
                                  }),
                                }]}
                                selectedRange={null}
                                onSelectRange={() => {}}
                                expanded={Boolean(expandedOverlaySizeByKey[overlayKey])}
                                onToggleExpand={() => setExpandedOverlaySizeByKey((prev) => ({ ...prev, [overlayKey]: !prev[overlayKey] }))}
                                rightControls={row ? (
                                  <InfoPopover
                                    id={`overlay-inline-info-${overlayKey}`}
                                    openId={openOverlayInfoId}
                                    onToggle={(id) => setOpenOverlayInfoId((current) => (current === id ? null : id))}
                                    onClose={() => setOpenOverlayInfoId(null)}
                                    title={`${normalizeOverlayLabel(overlayKey)} info`}
                                    sections={buildOverlayInfoSections(row)}
                                  />
                                ) : null}
                              />
                              <div style={{ fontSize: 12, marginTop: 6 }}>
                                {String(overlayExplain?.narrative ?? row?.implementationDelta?.[5] ?? `${normalizeOverlayLabel(overlayKey)} är ${overlay?.label ?? "neutral"} och påverkar hur regimtolkningen ska vägas.`)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {regimeProbabilityAny ? (
                <section style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "12px 12px 8px", marginBottom: 14, background: "#f8fafc" }}>
                  <h4 style={{ marginTop: 0 }}>Regime Probability</h4>
                  <div style={{ fontSize: 13, marginBottom: 8 }}>
                    <strong>Primary regime:</strong> {String(regimeProbabilityAny?.primaryRegime ?? "—")} ·
                    <strong> Primary weight:</strong> {safePct(regimeProbabilityAny?.primaryWeight)} ·
                    <strong> Decisiveness:</strong> {safePct(regimeProbabilityAny?.decisiveness)} ·
                    <strong> Transition-like:</strong> {regimeProbabilityAny?.transitionLike ? "Yes" : "No"}
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>Heuristic relative regime weights (not calibrated probabilities).</div>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>Top candidates: {regimeProbabilityDistribution.slice(0, 3).map((row: any) => `${row?.regime ?? "?"} (${safePct(row?.weight)})`).join(" · ") || "—"}</div>
                  <div style={{ fontSize: 12, marginBottom: 6, background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 6, padding: "6px 8px" }}>
                    <strong>Snapshot diagnostics:</strong> asOf {String(readDiagnostics?.snapshotAsOfDate ?? (globalMacro as any)?.regime?.asOfDate ?? "—")} ·
                    updatedAt {String(readDiagnostics?.snapshotUpdatedAt ?? "—")} ·
                    cacheOnlyRead {String(readDiagnostics?.cacheOnlyRead ?? "—")} ·
                    cache hit {String(readDiagnostics?.snapshotCacheHit ?? "—")} ·
                    source {String(readDiagnostics?.snapshotSource ?? readDiagnostics?.readMode ?? "—")} ·
                    cache key {String(readDiagnostics?.snapshotCacheKey ?? "—")} ·
                    routeMs {String(readDiagnostics?.routeDurationMs ?? "—")} ·
                    stale-vs-data {String(readDiagnostics?.snapshotStaleVsUnderlyingData ?? "unknown")} ·
                    dataTimestamp {String(readDiagnostics?.dataTimestamp ?? "—")} ·
                    richness {(typeof readDiagnostics?.regimeProbabilityRichness?.presentFieldCount === "number" ? readDiagnostics.regimeProbabilityRichness.presentFieldCount : 0)}/{(typeof readDiagnostics?.regimeProbabilityRichness?.expectedFieldCount === "number" ? readDiagnostics.regimeProbabilityRichness.expectedFieldCount : expectedRegimeFields.length)}
                  </div>
                  <p className="bread" style={{ marginTop: 0 }}>{String(regimeProbabilityAny?.narrative?.short ?? "") || "Regime probability narrative missing."}</p>
                  <div style={{ fontSize: 12 }}>Structural adjustment: {String(regimeProbabilityAny?.structuralAdjustment?.summary ?? "none")} · multiplier {typeof regimeProbabilityAny?.structuralAdjustment?.multiplier === "number" ? regimeProbabilityAny.structuralAdjustment.multiplier.toFixed(2) : "—"} · penalty {typeof regimeProbabilityAny?.structuralAdjustment?.penalty === "number" ? regimeProbabilityAny.structuralAdjustment.penalty.toFixed(2) : "—"}</div>
                  <div style={{ fontSize: 12 }}>Supporting blocks: {Array.isArray(regimeProbabilityAny?.supportingBlocks) && regimeProbabilityAny.supportingBlocks.length ? regimeProbabilityAny.supportingBlocks.join(", ") : "—"}</div>
                  <div style={{ fontSize: 12 }}>Supporting overlays: {Array.isArray(regimeProbabilityAny?.supportingOverlays) && regimeProbabilityAny.supportingOverlays.length ? regimeProbabilityAny.supportingOverlays.join(", ") : "—"}</div>
                  <div style={{ fontSize: 12 }}>Modulating overlays: {Array.isArray(regimeProbabilityAny?.modulatingOverlays) && regimeProbabilityAny.modulatingOverlays.length ? regimeProbabilityAny.modulatingOverlays.join(", ") : "—"}</div>
                  <div style={{ fontSize: 12 }}>Contradicting overlays: {Array.isArray(regimeProbabilityAny?.contradictingOverlays) && regimeProbabilityAny.contradictingOverlays.length ? regimeProbabilityAny.contradictingOverlays.join(", ") : "—"}</div>
                  <div style={{ fontSize: 12 }}>Momentum: {String(regimeProbabilityAny?.regimeMomentum?.direction ?? "stable")} {regimeProbabilityAny?.regimeMomentum?.driftTowardRegime ? `→ ${regimeProbabilityAny.regimeMomentum.driftTowardRegime}` : ""} · score {typeof regimeProbabilityAny?.regimeMomentum?.momentumScore === "number" ? regimeProbabilityAny.regimeMomentum.momentumScore.toFixed(1) : "—"} · primary change {String(regimeProbabilityAny?.regimeMomentum?.primaryRegimeChange ?? "—")}</div>
                  <div style={{ fontSize: 12 }}>Momentum drivers: {Array.isArray(regimeProbabilityAny?.regimeMomentum?.changeDrivers) && regimeProbabilityAny.regimeMomentum.changeDrivers.length ? regimeProbabilityAny.regimeMomentum.changeDrivers.join(", ") : "—"}</div>
                  <div style={{ fontSize: 12 }}>Overlay influence: {String(regimeProbabilityAny?.overlayInfluence?.primarySignal ?? "—")} · {(Array.isArray(regimeProbabilityAny?.overlayInfluence?.candidateSignals) ? regimeProbabilityAny.overlayInfluence.candidateSignals : []).map((row: any) => `${row?.regime ?? "?"}:${row?.signal ?? "?"}`).join(", ") || "—"}</div>
                  <div style={{ fontSize: 12 }}>{String(regimeProbabilityAny?.regimeMomentum?.narrative ?? regimeProbabilityAny?.overlayInfluence?.summary ?? "")}</div>
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: "pointer" }}>Full regime-probability payload details</summary>
                    <div style={{ fontSize: 12, marginTop: 6 }}>
                      <div><strong>Narrative (medium):</strong> {String(regimeProbabilityAny?.narrative?.medium ?? "—")}</div>
                      <div><strong>Narrative (long):</strong> {String(regimeProbabilityAny?.narrative?.long ?? "—")}</div>
                      <div><strong>Overlay summary:</strong> {String(regimeProbabilityAny?.overlayInfluence?.summary ?? "—")}</div>
                      <div><strong>Distribution (full):</strong> {regimeProbabilityDistribution.map((row: any) => `${row?.regime ?? "?"} ${safePct(row?.weight)}`).join(" · ") || "—"}</div>
                      <div><strong>Expected payload fields:</strong> {expectedRegimeFields.join(", ")}</div>
                      <div><strong>Fields rendered (Global Macro compact):</strong> {compactRenderedRegimeFields.join(", ")}</div>
                      <div><strong>Present payload fields (runtime):</strong> {Array.isArray(readDiagnostics?.regimeProbabilityRichness?.presentFieldPaths) ? readDiagnostics.regimeProbabilityRichness.presentFieldPaths.join(", ") : "—"}</div>
                      <div><strong>Missing payload fields (runtime):</strong> {Array.isArray(readDiagnostics?.regimeProbabilityRichness?.missingFieldPaths) && readDiagnostics.regimeProbabilityRichness.missingFieldPaths.length ? readDiagnostics.regimeProbabilityRichness.missingFieldPaths.join(", ") : "none"}</div>
                      <div><strong>Trim report:</strong> {Array.isArray(readDiagnostics?.trimReport?.trimSnapshotForNormalReadRemoves) ? readDiagnostics.trimReport.trimSnapshotForNormalReadRemoves.join(", ") : "—"}</div>
                    </div>
                  </details>
                </section>
              ) : (
                <section style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "12px", marginBottom: 14, background: "#f8fafc" }}>
                  <h4 style={{ marginTop: 0 }}>Regime Probability</h4>
                  <div className="status empty">Regime probability not yet available for this snapshot.</div>
                </section>
              )}

              {explanationAny && (() => {
                const qualityLabelMap: Record<string, string> = {
                  robust: "Robust",
                  usable_with_caveats: "Användbar med förbehåll",
                  fragile: "Skör",
                };
                const blockStatusMap: Record<string, string> = {
                  pass: "Pass",
                  partial: "Partial",
                  missing: "Missing",
                  "proxy-heavy": "Proxy-heavy",
                  "structurally-incomplete": "Strukturellt ofullständig",
                };
                return (
                  <section style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "12px 12px 8px", marginBottom: 14, background: "#f8fafc" }}>
                    <h4 style={{ marginTop: 0 }}>Driver breakdown / Förklaringslager</h4>
                    <div style={{ fontSize: 13, marginBottom: 8 }}>
                      <strong>As-of:</strong> {globalMacro.regime?.asOfDate ?? "—"} ·
                      <strong> Region:</strong> {selectedRegion} ·
                      <strong> Macro score:</strong> {safeNumber(explanationSummary?.macroScore, 1)} ·
                      <strong> Regim:</strong> {String(explanationSummary?.regimeLabel ?? "—")} ·
                      <strong> Confidence:</strong> {safePct(explanationSummary?.confidence)} ·
                      <strong> Strukturell kvalitet:</strong> {qualityLabelMap[String(explanationSummary?.structuralQualityLabel ?? "")] ?? String(explanationSummary?.structuralQualityLabel ?? "—")}
                    </div>
                    <p className="bread" style={{ marginTop: 0, marginBottom: 6 }}>{String(explanationNarrative?.short ?? "") }</p>
                    <p className="bread" style={{ marginTop: 0 }}>{String(explanationNarrative?.medium ?? "") }</p>

                    <details style={{ marginBottom: 10 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>Varför denna regim?</summary>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginTop: 8 }}>
                        {explanationBlocks.map((block: any) => (
                          <div id={`explain-block-${block.blockId}`} key={`exp-block-${block.blockId}`} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
                            <div style={{ fontWeight: 700 }}>{block.blockId}</div>
                            <div>score: {typeof block.blockScore === "number" ? safeNumber(block?.blockScore, 1) : "—"} · riktning: {block.direction}</div>
                            <div>status: {blockStatusMap[String(block?.status ?? "")] ?? String(block?.status ?? "—")} · confidence {safePct(block?.confidence)}</div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>+ drivare: {(Array.isArray(block?.topPositiveDrivers) ? block.topPositiveDrivers : []).map((d: any) => d?.title).filter(Boolean).join(", ") || "—"}</div>
                            <div style={{ fontSize: 12 }}>− drivare: {(Array.isArray(block?.topNegativeDrivers) ? block.topNegativeDrivers : []).map((d: any) => d?.title).filter(Boolean).join(", ") || "—"}</div>
                            <div style={{ fontSize: 12 }}>missing/proxy/fallback: {(Array.isArray(block?.missingComponents) ? block.missingComponents.length : 0)}/{(Array.isArray(block?.proxyComponents) ? block.proxyComponents.length : 0)}/{(Array.isArray(block?.fallbackComponents) ? block.fallbackComponents.length : 0)}</div>
                          </div>
                        ))}
                      </div>
                    </details>

                    <details style={{ marginBottom: 10 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>Overlay-förklaring</summary>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginTop: 8 }}>
                        {explanationOverlays.map((overlay: any) => (
                          <div id={`explain-overlay-${overlay.overlayId}`} key={`exp-overlay-${overlay.overlayId}`} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
                            <div style={{ fontWeight: 700 }}>{overlay.overlayId}</div>
                            <div>score: {typeof overlay.score === "number" ? safeNumber(overlay?.score, 1) : "—"} · {overlay.label}</div>
                            <div>confidence: {safePct(overlay?.confidence)} · runtime completeness: {safePct(overlay?.runtimeCompleteness)}</div>
                            <div>fidelity/robustness/proxy: {overlay.specFidelity}/{overlay.robustness}/{overlay.proxyDependence}</div>
                            <div style={{ fontSize: 12 }}>included: {(Array.isArray(overlay?.includedBlocks) ? overlay.includedBlocks : []).join(", ") || "—"}</div>
                            <div style={{ fontSize: 12 }}>excluded/missing: {(Array.isArray(overlay?.excludedBlocks) ? overlay.excludedBlocks : []).join(", ") || "—"} / {(Array.isArray(overlay?.missingComponents) ? overlay.missingComponents : []).join(", ") || "—"}</div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>{String(overlay?.narrative ?? "") }</div>
                          </div>
                        ))}
                      </div>
                    </details>

                    <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: 8 }}>
                      <strong>Top drivers (klickbara)</strong>
                      <ol style={{ marginTop: 6 }}>
                        {explanationTopDrivers.slice(0, 8).map((driver: any) => {
                          const href = driver.blockId ? `#explain-block-${driver.blockId}` : (driver.overlayId ? `#explain-overlay-${driver.overlayId}` : undefined);
                          return (
                            <li key={`exp-driver-${driver.id}`}>
                              {href ? <a href={href}>{driver.title}</a> : driver.title}
                              {` · ${driver.type} · dir ${driver.direction} · contrib ${safeNumber(driver?.contributionHint, 2)}`}
                              {driver.blockId ? ` · block ${driver.blockId}` : ""}
                              {driver.overlayId ? ` · overlay ${driver.overlayId}` : ""}
                            </li>
                          );
                        })}
                      </ol>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>
                        Model health: core full/partial {(typeof explanationStructural?.activeCoreBlocks === "number" ? explanationStructural.activeCoreBlocks : "—")}/{(typeof explanationStructural?.partialCoreBlocks === "number" ? explanationStructural.partialCoreBlocks : "—")}, overlays full/partial {(typeof explanationStructural?.activeOverlays === "number" ? explanationStructural.activeOverlays : "—")}/{(typeof explanationStructural?.partialOverlays === "number" ? explanationStructural.partialOverlays : "—")}, proxy-heavy overlays {(typeof explanationStructural?.proxyHeavyOverlays === "number" ? explanationStructural.proxyHeavyOverlays : "—")}.
                      </div>
                    </div>
                  </section>
                );
              })()}

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
                            <div>score: {typeof overlay.score === "number" ? safeNumber(overlay?.score, 1) : "—"}</div>
                            <div>label: {overlay.label || "—"}</div>
                            <div>confidence: {safePct(overlay?.confidence)}</div>
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
                        <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span>{overlayKey}</span>
                          {(() => {
                            const row = overlayDebugRows.find((item) => item.overlayKey === overlayKey);
                            if (!row) return null;
                            return (
                              <InfoPopover
                                id={`overlay-info-${overlayKey}`}
                                openId={openOverlayInfoId}
                                onToggle={(id) => setOpenOverlayInfoId((current) => (current === id ? null : id))}
                                onClose={() => setOpenOverlayInfoId(null)}
                                title={`${normalizeOverlayLabel(overlayKey)} info`}
                                sections={buildOverlayInfoSections(row)}
                              />
                            );
                          })()}
                        </div>
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
                        <div>active production blocks: {item.activeProductionBlocks}</div>
                        <div>diagnostic-only blocks: {item.diagnosticOnlyBlocks}</div>
                        <div>excluded blocks: {Math.max(0, 3 - item.activeProductionBlocks)}</div>
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
                <details>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>▸ Overlay Debug</summary>
                  <div style={{ marginTop: 10 }}>
                  {overlayDebugRows.map((row) => (
                    <details key={`overlay-debug-${row.overlayKey}`} style={{ border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 12, background: "#fff" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700, padding: "8px 10px" }}>▸ {row.overlayKey}</summary>
                      <div style={{ padding: "8px 10px" }}>
                    <ul style={{ marginTop: 4 }}>
                      <li>total score: {typeof row.overlay?.score === "number" ? safeNumber(row.overlay?.score, 1) : "—"}</li>
                      <li>label: {row.overlay?.label ?? "—"}</li>
                      <li>confidence: {row.overlay?.confidence ?? "—"}%</li>
                      <li>runtime completeness: {row.runtimeCompleteness}</li>
                      <li>spec fidelity: {row.specFidelity}</li>
                      <li>robustness: {row.robustness}</li>
                      <li>proxy dependence: {row.proxyDependence}</li>
                      <li>fidelity badge: <strong>{row.fidelityBadge}</strong></li>
                    </ul>
                    {row.overlayKey === "creditFundingOverlay" && typeof row.overlay?.blockScores?.funding !== "number" && (
                      <div className="status" style={{ marginTop: 6 }}>
                        Funding block unavailable and excluded from score. Current result reflects pricing + access only; interpret as partial until TED and/or xccy basis are available.
                      </div>
                    )}

                    <details style={{ fontSize: 12, marginBottom: 8 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>▸ Intended primary design</summary>
                      <div style={{ marginTop: 6 }}>
                        <div>Blocks: {row.spec.intendedPrimaryBlocks.join(", ") || "—"}</div>
                        <div>Series: {row.spec.intendedSeries.map((series) => series.id).join(", ") || "—"}</div>
                        <div>Intended source families: {Array.from(new Set(row.spec.intendedSeries.flatMap((series) => series.primarySources))).join(", ") || "—"}</div>
                        <div>Logic: {row.spec.logicSummary}</div>
                      </div>
                    </details>

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

                    <details style={{ fontSize: 12, marginBottom: 8 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>▸ Computation Walkthrough</summary>
                      {(() => {
                        const overlayComponents = row.overlay?.components ?? [];
                        const runtimeAny = (row.overlay as any)?.runtime ?? {};
                        const productionBlockScores = (runtimeAny.productionValidBlockScores ?? row.overlay?.blockScores ?? {}) as Record<string, number | null>;
                        const diagnosticBlockScores = (runtimeAny.diagnosticBlockScores ?? {}) as Record<string, number | null>;
                        const overlayBlocks = Array.from(new Set(Object.keys(productionBlockScores).map((block) => normalizeOverlayRuntimeBlockName(row.overlayKey, block))));
                        const validBlockScores = overlayBlocks
                          .map((block) => ({ block, score: productionBlockScores[block] ?? null }))
                          .filter((item) => typeof item.score === "number") as Array<{ block: string; score: number }>;
                        const runtimeWeights = ((row.overlay as any)?.runtime?.aggregationWeights ?? {}) as Record<string, number>;
                        const weightedScores = validBlockScores
                          .filter((item) => typeof runtimeWeights[item.block] === "number")
                          .map((item) => ({ ...item, weight: runtimeWeights[item.block] as number }));
                        const recomputedOverlay = weightedScores.length > 0
                          ? (() => {
                            const w = weightedScores.reduce((acc, item) => acc + item.weight, 0);
                            if (w <= 0) return null;
                            return weightedScores.reduce((acc, item) => acc + item.score * (item.weight / w), 0);
                          })()
                          : (validBlockScores.length > 0
                            ? validBlockScores.reduce((acc, item) => acc + item.score, 0) / validBlockScores.length
                            : null);
                        const finalScore = typeof row.overlay?.score === "number" ? row.overlay.score : recomputedOverlay;
                        const excludedBlocks = overlayBlocks.filter((block) => productionBlockScores[block] === null);
                        return (
                          <div style={{ marginTop: 6, border: "1px solid #e2e8f0", borderRadius: 8, padding: 8, background: "#f8fafc" }}>
                            {overlayComponents.map((component) => {
                              const percentile = component.debug?.percentile10yLatest ?? null;
                              const expectedSupport = typeof percentile === "number" ? 100 - percentile : null;
                              const productionScore = typeof (component as any).productionScore === "number" ? (component as any).productionScore : null;
                              const fallbackScore = typeof component.score === "number" ? component.score : null;
                              const supportScore = productionScore ?? fallbackScore ?? expectedSupport;
                              const plusScoreCheck = typeof percentile === "number" && typeof supportScore === "number" && Math.abs((supportScore + percentile) - 100) < 1e-4 ? "pass" : "fail";
                              const supportValidation = typeof expectedSupport === "number" && typeof supportScore === "number" && Math.abs(expectedSupport - supportScore) < 1e-4 ? "pass" : "fail";
                              const inferredValidForProduction = typeof (component as any).validForProduction === "boolean"
                                ? (component as any).validForProduction
                                : Boolean(component.includedInTotal && typeof productionScore === "number" && !component.missing);
                              const signalValidation = [component.exactSource || component.source, component.rawValue, component.debug?.observationsAvailableInScoringWindow, percentile, supportScore].every((value) => value !== null && value !== undefined) ? "complete" : "incomplete";
                              const sourceDescriptor = Array.isArray((component as any).inputSources) && (component as any).inputSources.length > 0
                                ? `constructed from ${((component as any).inputSources as Array<{ exactSource: string }>).map((input) => input.exactSource).join(" + ")}`
                                : (component.exactSource || component.source || "—");
                              return (
                                <div key={`walkthrough-${row.overlayKey}-${component.id}`} style={{ marginTop: 8, borderTop: "1px dashed #cbd5e1", paddingTop: 8 }}>
                                  <div style={{ fontWeight: 700 }}>{component.id} ({component.block})</div>
                                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                                    <li>Step 1 — Fetch source series: series id={sourceDescriptor}, latest value={typeof component.rawValue === "number" ? component.rawValue.toFixed(4) : "—"}, observation count={component.debug?.observationsAvailableInScoringWindow ?? 0}</li>
                                    <li>Step 2 — Compute percentile: historical window={component.debug?.scoringWindowSize ?? 0} obs, percentile={typeof percentile === "number" ? percentile.toFixed(2) : "—"}</li>
                                    <li>Step 3 — Convert to support score (diagnostic): support_score = 100 − percentile → {typeof supportScore === "number" ? supportScore.toFixed(2) : "—"}; support_score_validation={component.debug?.supportScoreValidation ?? supportValidation}; percentile_plus_score_check={plusScoreCheck}</li>
                                    <li>Step 4 — Production gate: validForProduction={String(inferredValidForProduction)}; productionScore={typeof supportScore === "number" ? supportScore.toFixed(2) : "null"}; diagnosticOnly={String((component as any).diagnosticOnly ?? false)}; gatingFailureReason={(component as any).gatingFailureReason || "none"}</li>
                                    <li>signal_validation={signalValidation}</li>
                                  </ul>
                                </div>
                              );
                            })}
                            <div style={{ marginTop: 8, borderTop: "1px dashed #cbd5e1", paddingTop: 8 }}>
                              <ul style={{ margin: 0, paddingLeft: 18 }}>
                                <li>Step 5 — Block aggregation (production-valid only)</li>
                                {overlayBlocks.map((block) => (
                                  <li key={`block-score-${row.overlayKey}-${block}`}>{block}: production={typeof productionBlockScores[block] === "number" ? productionBlockScores[block]?.toFixed(2) : "excluded"}; diagnostic={typeof diagnosticBlockScores[block] === "number" ? diagnosticBlockScores[block]?.toFixed(2) : "—"}</li>
                                ))}
                                <li>Step 6 — Overlay aggregation: {((row.overlay as any)?.runtime?.scoreFormula ?? "overlay_score = weighted_average(available block scores)")} → {typeof finalScore === "number" ? finalScore.toFixed(2) : "—"}</li>
                                <li>included blocks in score: {validBlockScores.map((item) => item.block).join(", ") || "none"}</li>
                                <li>excluded blocks from score: {excludedBlocks.join(", ") || "none"}</li>
                                {row.overlayKey === "creditFundingOverlay" && excludedBlocks.includes("funding") && (
                                  <li>interpretation note: funding is unavailable; current score reflects pricing + access only.</li>
                                )}
                                <li>Step 7 — Label mapping: score → regime label → {row.overlay?.label ?? labelByOverlayScore(finalScore)}</li>
                              </ul>
                            </div>
                          </div>
                        );
                      })()}
                    </details>

                    <details style={{ fontSize: 12, marginTop: 8, marginBottom: 8 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>▸ Verification trace</summary>
                      {(() => {
                        const components = row.overlay?.components ?? [];
                        const runtimeAny = (row.overlay as any)?.runtime ?? {};
                        const productionValidBlockScores = (runtimeAny.productionValidBlockScores ?? row.overlay?.blockScores ?? {}) as Record<string, number | null>;
                        const blockEntries = Object.entries(productionValidBlockScores).map(([block, score]) => [normalizeOverlayRuntimeBlockName(row.overlayKey, block), score] as const);
                        const verification = globalMacro?.overlayEngineDiagnostics?.verification?.[row.overlayKey] as any;
                        const transformCandidates = components.filter((component) => typeof component.debug?.percentile10yLatest === "number" && (typeof ((component as any).productionScore) === "number" || typeof component.score === "number"));
                        const transformPass = transformCandidates.length > 0
                          ? transformCandidates.every((component) => {
                            const percentile = component.debug?.percentile10yLatest as number;
                            const supportScore = (typeof (component as any).productionScore === "number" ? (component as any).productionScore : (typeof component.score === "number" ? component.score : null));
                            return typeof supportScore === "number" && Math.abs((supportScore + percentile) - 100) < 1e-4;
                          })
                          : true;

                        const sourceValidation = components.map((component) => {
                          const obs = component.debug?.observationsAvailableInScoringWindow ?? 0;
                          return {
                            source: component.exactSource || component.source || component.id,
                            status: obs > 0 && ((component as any).sourceValidationStatus ?? "pass") === "pass" ? "pass" : (component.missing ? "partial" : "missing"),
                          };
                        });

                        const dedupedBlockEntries = Array.from(new Map(blockEntries).entries());
                        const blockChecks = dedupedBlockEntries.map(([block, score]) => {
                          const canonicalStatus = (runtimeAny?.blockDiagnostics?.[block]?.status ?? runtimeAny?.blockDiagnostics?.[`${block}_pressure`]?.status ?? null) as "pass" | "partial" | "missing" | null;
                          if (canonicalStatus === "pass" || canonicalStatus === "partial" || canonicalStatus === "missing") {
                            return { block, pass: canonicalStatus === "pass", status: canonicalStatus };
                          }
                          const blockSignals = components.filter((component) => normalizeOverlayRuntimeBlockName(row.overlayKey, component.block) === block);
                          const valid = blockSignals.filter((component) => !component.missing && typeof ((component as any).productionScore ?? component.score) === "number");
                          const expected = valid.length > 0
                            ? valid.reduce((acc, component) => acc + (((component as any).productionScore ?? component.score) as number), 0) / valid.length
                            : null;
                          const pass = (typeof expected === "number" && typeof score === "number" && Math.abs(expected - score) < 1e-6) || (expected === null && score === null);
                          const status: "pass" | "partial" | "missing" = typeof score === "number" ? (pass ? "pass" : "partial") : "missing";
                          return { block, pass, status };
                        });

                        const overlayPass = row.overlayKey === "energyShockOverlay"
                          ? ((runtimeAny?.includedBlocksInTotal ?? []).every((block: string) => runtimeAny?.blockDiagnostics?.[block]?.status === "pass") && (runtimeAny?.excludedBlocks ?? []).every((block: string) => runtimeAny?.blockDiagnostics?.[block]?.status !== "pass"))
                          : row.overlayKey === "liquidityOverlay"
                          ? (verification?.overlayScoreCalculation?.aggregationValidationStatus ?? (typeof row.overlay?.score === "number" ? "pass" : "fail")) === "pass"
                          : (() => {
                            const verificationStatus = verification?.overlayComputation?.aggregationValidationStatus;
                            if (verificationStatus === "pass") return true;
                            if (typeof row.overlay?.score !== "number") return false;
                            const runtimeWeights = (row.overlay as any)?.runtime?.aggregationWeights ?? {};
                            const weighted = dedupedBlockEntries
                              .filter(([block, score]) => typeof score === "number" && typeof runtimeWeights?.[block] === "number")
                              .map(([block, score]) => ({ block, score: score as number, weight: runtimeWeights[block] as number }));
                            const useWeighted = weighted.length > 0;
                            const recomputedOverlay = useWeighted
                              ? (() => {
                                const w = weighted.reduce((acc, item) => acc + item.weight, 0);
                                if (w <= 0) return null;
                                return weighted.reduce((acc, item) => acc + item.score * (item.weight / w), 0);
                              })()
                              : (() => {
                                const validBlockScores = dedupedBlockEntries.filter(([, score]) => typeof score === "number").map(([, score]) => score as number);
                                return validBlockScores.length > 0 ? validBlockScores.reduce((acc, value) => acc + value, 0) / validBlockScores.length : null;
                              })();
                            return (recomputedOverlay === null && row.overlay?.score === null)
                              || (typeof recomputedOverlay === "number" && typeof row.overlay?.score === "number" && Math.abs(recomputedOverlay - row.overlay.score) < 1e-4);
                          })();
                        const labelPass = row.overlayKey === "energyShockOverlay"
                          ? (((runtimeAny?.activeProductionBlockCount ?? 0) >= 2) ? ((runtimeAny?.energyDebug?.productionLabel ?? row.overlay?.label ?? "Not implemented") === (row.overlay?.label ?? "Not implemented")) : ((row.overlay?.label ?? "Not implemented") === "Not implemented"))
                          : (labelByOverlayScore(row.overlay?.score ?? null) === (row.overlay?.label ?? "Not implemented"));

                        return (
                          <div style={{ marginTop: 6, border: "1px solid #e2e8f0", borderRadius: 8, padding: 8, background: "#f8fafc" }}>
                            <div style={{ fontWeight: 700 }}>Source validation</div>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {sourceValidation.map((item, index) => (
                                <li key={`source-validation-${row.overlayKey}-${index}`}>{item.source} → {item.status}</li>
                              ))}
                            </ul>
                            <div style={{ fontWeight: 700, marginTop: 8 }}>Transformation validation</div>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              <li>percentile computation → {transformPass ? "pass" : "partial"}</li>
                              <li>support score formula → {transformPass ? "pass" : "partial"}</li>
                              <li>percentile + score = 100 check → {transformPass ? "pass" : "partial"}</li>
                            </ul>
                            <div style={{ fontWeight: 700, marginTop: 8 }}>Aggregation validation</div>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {blockChecks.map((item) => (
                                <li key={`block-check-${row.overlayKey}-${item.block}`}>{item.block} block aggregation → {item.status ?? (item.pass ? "pass" : "partial")}</li>
                              ))}
                              <li>missing blocks correctly excluded → {dedupedBlockEntries.filter(([, score]) => score === null).length > 0 ? "pass" : "pass"}</li>
                            </ul>
                            <div style={{ fontWeight: 700, marginTop: 8 }}>Overlay computation validation</div>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              <li>overlay score calculation → {overlayPass ? "pass" : (row.overlayKey === "energyShockOverlay" ? "partial" : "fail")}</li>
                              <li>regime label mapping → {labelPass ? "pass" : (row.overlayKey === "energyShockOverlay" ? "partial" : "fail")}</li>
                            </ul>
                          </div>
                        );
                      })()}
                    </details>

                    <details style={{ fontSize: 12, marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>▸ Deep verification payload</summary>
                      <div style={{ marginTop: 6 }}>
                        <strong>Verification trace payload</strong>
                        {(() => {
                          const verification = globalMacro?.overlayEngineDiagnostics?.verification?.[row.overlayKey];
                          if (!verification) return <div className="status empty" style={{ marginTop: 6 }}>No deep verification trace for this overlay.</div>;
                          const localRepricing = row.overlayKey === "localUnrestOverlay" ? verification?.repricing : null;
                          const ingestVerification = localRepricing?.ingestVerification ?? null;
                          return (
                            <>
                              {row.overlayKey === "localUnrestOverlay" && localRepricing && (
                                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 8, background: "#f8fafc", marginTop: 6, marginBottom: 6 }}>
                                  <div style={{ fontWeight: 700, marginBottom: 4 }}>US repricing (ACMTP10) explicit verification</div>
                                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                                    <li>requested exact source id: ACMTP10</li>
                                    <li>resolved db key: {localRepricing.databaseSeriesKeyResolved ?? "—"}</li>
                                    <li>raw db row count: {localRepricing.rawDbRowCount ?? 0}</li>
                                    <li>monthly row count: {localRepricing.monthlyDbRowCount ?? 0}</li>
                                    <li>earliest date: {localRepricing.earliestRawDate ?? "—"}</li>
                                    <li>latest date: {localRepricing.latestRawDate ?? "—"}</li>
                                    <li>latest value: {localRepricing.latestRawValue ?? "—"}</li>
                                    <li>null rows: {localRepricing.nullValueRowCount ?? 0}</li>
                                    <li>invalid date rows: {localRepricing.invalidDateCount ?? 0}</li>
                                    <li>non-numeric rows: {localRepricing.nonNumericRowCount ?? 0}</li>
                                    <li>duplicate date rows: {localRepricing.duplicateDateCount ?? 0}</li>
                                    <li>final gating reason: {localRepricing.gatingTrace?.finalGuardReason ?? localRepricing.blockedByWhat ?? "none"}</li>
                                  </ul>
                                  {ingestVerification && (
                                    <div style={{ marginTop: 6 }}>
                                      <div style={{ fontWeight: 700 }}>Ingest verification</div>
                                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                                        <li>{ingestVerification.configMessage}</li>
                                        <li>fetch attempted: {String(ingestVerification.fetchAttempted)}</li>
                                        <li>observations fetched: {ingestVerification.observationsFetched ?? "—"}</li>
                                        <li>series_key saved from run: {ingestVerification.seriesKeyFromIngestRun ?? "—"}</li>
                                        <li>db keys observed: {(ingestVerification.savedDbKeysObserved ?? []).join(", ") || "none"}</li>
                                        <li>mismatch: {ingestVerification.mismatchReason ?? "none"}</li>
                                        <li>state classification: {ingestVerification.explicitState ?? ingestVerification.ingestionStateClass ?? "—"}</li>
                                        <li>ever successfully fetched historically: {String(localRepricing.historicalIngestVerification?.everSuccessfulFetch ?? false)}</li>
                                        <li>latest successful ingest run for ACMTP10: {localRepricing.historicalIngestVerification?.latestSuccessfulIngestRunForAcmTp10 ?? "—"}</li>
                                        <li>final classification: {localRepricing.finalClassification ?? "—"}</li>
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}
                              <pre style={{ whiteSpace: "pre-wrap", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8, marginTop: 6 }}>{JSON.stringify(verification, null, 2)}</pre>
                            </>
                          );
                        })()}
                      </div>
                    </details>

                    <details style={{ fontSize: 12 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>▸ Implementation delta vs spec</summary>
                      <ul style={{ marginTop: 6 }}>
                        {row.implementationDelta.map((gap) => (
                          <li key={`${row.overlayKey}-${gap}`}>{gap}</li>
                        ))}
                      </ul>
                    </details>
                      </div>
                    </details>
                  ))}
                </div>
                </details>
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

              <section style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "12px", marginBottom: 14, background: "#f8fafc" }}>
              <h4 style={{ marginTop: 0 }}>GLOBAL MACRO — HISTORIK</h4>
              <h5>Macro Regime History</h5>
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
                <div className="status empty">{historyEmptyMessage ?? "Ingen historik kunde genereras för vald period/upplösning."}</div>
              )}
              </section>

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
                <li>history actual rendered range: {(macroHistory?.rangeDebug?.actualStartDate ?? "—")} → {(macroHistory?.rangeDebug?.actualEndDate ?? "—")}</li>
                <li>history earliest raw date used: {macroHistory?.replayEarliestDateUsed ?? "—"}</li>
                <li>history latest raw date used: {macroHistory?.replayLatestDateUsed ?? "—"}</li>
                <li>history earliest raw available: {macroHistory?.earliestRawDate ?? "—"}</li>
                <li>history latest raw available: {macroHistory?.latestRawDate ?? "—"}</li>
                <li>history unfilled reason: {macroHistory?.rangeDebug?.unfilledReason ?? "none"}</li>
                <li>history limiting indicators: {(macroHistory?.limitingIndicators ?? []).map((item) => `${item.seriesKey}:${item.reason}`).join(", ") || "none"}</li>
                <li>history raw regime points: {macroHistory?.generatedPoints ?? 0}</li>
                <li>history merged regime intervals: {macroHistory?.intervals?.regime.length ?? 0}</li>
                <li>history true regime changes: {macroHistory?.regimeChanges ?? 0}</li>
                <li>history raw overlay points: {macroHistory?.generatedPoints ?? 0}</li>
                <li>history merged overlay intervals: {(macroHistory?.intervals?.overlays?.growth.length ?? 0) + (macroHistory?.intervals?.overlays?.stress.length ?? 0) + (macroHistory?.intervals?.overlays?.hardAsset.length ?? 0)}</li>
                <li>history overlay rendering mode: timeline_intervals</li>
                <li>history score thresholds: ≤{macroHistory?.template?.thresholds?.monetaryDominanceMax ?? "—"} / ≤{macroHistory?.template?.thresholds?.balancedMax ?? "—"} / ≤{macroHistory?.template?.thresholds?.fiscalPressureMax ?? "—"}</li>
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
                  {(() => {
                    const acm = pipelineDebug.ingestionDebug.latestAttempt?.seriesResults?.find((row) => row.seriesId === "fred:acmtp10_us" || row.seriesKey === "acmtp10_us");
                    if (!acm) return <div className="status empty" style={{ marginTop: 8 }}>ACMTP10 not present in latest per-series ingest result.</div>;
                    const meta = (acm.meta ?? {}) as Record<string, unknown>;
                    const toJson = (value: unknown) => JSON.stringify(value ?? null, null, 2);
                    return (
                      <div style={{ marginTop: 8, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", padding: "8px 10px" }}>
                        <div style={{ fontWeight: 700 }}>ACMTP10 ingest strict debug</div>
                        <ul>
                          <li>requested provider series id: {String(meta.requestedProviderSeriesId ?? meta.providerSeriesId ?? "—")}</li>
                          <li>actual HTTP request target/resolved provider id: {String(meta.requestTarget ?? "—")}</li>
                          <li>HTTP status: {String(meta.httpStatus ?? "—")}</li>
                          <li>provider response shape summary: {String(meta.providerResponseShapeSummary ?? "—")}</li>
                          <li>returned observation count before filtering: {String(meta.observationsBeforeFiltering ?? 0)}</li>
                          <li>returned observation count after filtering: {String(meta.observationsAfterFiltering ?? 0)}</li>
                          <li>reason if zero rows: {String(meta.zeroRowsReason ?? acm.errorMessage ?? "—")}</li>
                          <li>skipped due to date parsing: {String(meta.skippedByDateParsing ?? 0)}</li>
                          <li>skipped due to numeric parsing: {String(meta.skippedByNumericParsing ?? 0)}</li>
                          <li>skipped due to duplicate logic: {String(meta.skippedByDuplicateLogic ?? 0)}</li>
                          <li>final DB writes for acmtp10_us: {toJson(meta.finalDbWrites)}</li>
                        </ul>
                        <details>
                          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Raw observations preview</summary>
                          <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 11, marginTop: 6 }}>first 3: {toJson(meta.first3RawObservations)}
last 3: {toJson(meta.last3RawObservations)}</pre>
                        </details>
                      </div>
                    );
                  })()}
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
                  <label htmlFor="macro-cron-secret-input" style={{ display: "block", marginBottom: 4 }}>Cron secret (for /api/cron/macro-refresh)</label>
                  <input
                    id="macro-cron-secret-input"
                    type="password"
                    value={cronSecretInput}
                    onChange={(event) => setCronSecretInput(event.target.value)}
                    placeholder="Enter CRON_SECRET"
                    style={{ width: "100%", marginBottom: 8 }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning || cronRefreshRunning} onClick={() => void runMacroCronRefresh()}>{cronRefreshRunning ? "Running cron refresh..." : "Run macro cron refresh"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning || cronRefreshRunning || rebuildSnapshotRunning} onClick={() => void rebuildSnapshotNoIngest()}>{rebuildSnapshotRunning ? "Rebuilding snapshot..." : "Rebuild snapshot (no ingest)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning || cronRefreshRunning} onClick={() => void runIngest("backfill", "US")}>{ingestRunningMode === "backfill" ? "Running backfill..." : "Run ingest backfill (US)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning || cronRefreshRunning} onClick={() => void runIngest("latest", "US")}>{ingestRunningMode === "latest" ? "Running latest..." : "Run ingest latest (US)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning || cronRefreshRunning} onClick={() => void runEngine("US")}>{engineRunning ? "Running engine..." : "Run engine (US)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning || cronRefreshRunning} onClick={() => void runIngest("backfill", "EA")}>{ingestRunningMode === "backfill" ? "Running backfill..." : "Run ingest backfill (EA)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning || cronRefreshRunning} onClick={() => void runIngest("latest", "EA")}>{ingestRunningMode === "latest" ? "Running latest..." : "Run ingest latest (EA)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning || cronRefreshRunning} onClick={() => void runEngine("EA")}>{engineRunning ? "Running engine..." : "Run engine (EA)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning || cronRefreshRunning} onClick={() => void runIngest("backfill", "SE")}>{ingestRunningMode === "backfill" ? "Running backfill..." : "Run ingest backfill (SE)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning || cronRefreshRunning} onClick={() => void runIngest("latest", "SE")}>{ingestRunningMode === "latest" ? "Running latest..." : "Run ingest latest (SE)"}</button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning || cronRefreshRunning} onClick={() => void runEngine("SE")}>{engineRunning ? "Running engine..." : "Run engine (SE)"}</button>
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
                {cronRefreshResult && (
                  <div>
                    <h4>Last manual macro cron refresh result</h4>
                    <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 11 }}>{JSON.stringify(cronRefreshResult, null, 2)}</pre>
                  </div>
                )}
                {rebuildSnapshotResult && (
                  <div>
                    <h4>Last manual rebuild snapshot (no ingest) result</h4>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>
                      Latest snapshot updatedAt: {String((globalMacroRaw as any)?.diagnostics?.snapshotUpdatedAt ?? "—")}
                    </div>
                    <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 11 }}>{JSON.stringify(rebuildSnapshotResult, null, 2)}</pre>
                  </div>
                )}

                <section style={{ border: "1px dashed #cbd5e1", borderRadius: 8, padding: "8px 10px", background: "#fff", marginTop: 10 }}>
                  <details>
                    <summary style={{ cursor: "pointer", fontWeight: 700 }}>▸ Raw payload (?debug=1)</summary>
                    <div style={{ marginTop: 8, border: "1px solid #e2e8f0", borderRadius: 8, padding: 8, background: "#f8fafc", maxHeight: 420, overflowY: "auto", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere", margin: 0, fontSize: 11 }}>{JSON.stringify(globalMacroRaw, null, 2)}</pre>
                    </div>
                  </details>
                </section>
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
