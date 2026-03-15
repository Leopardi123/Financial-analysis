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

function AdminDebugSection({ children }: { children: ReactNode }) {
  return (
    <section style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "10px 12px", marginTop: 12, background: "#f8fafc" }}>
      <ExpandablePanel title="▶ Admin / Debug">{children}</ExpandablePanel>
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
  const [selectedOverlaySegment, setSelectedOverlaySegment] = useState<{
    overlayKey: "growth" | "stress" | "hard_asset";
    overlay: "Growth" | "Stress" | "Hard Asset";
    value: string;
    startDate: string;
    endDate: string;
    pointCount: number;
    explanation: string;
    contributors: string[];
  } | null>(null);
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
  const lowRobustnessCount = overlaySanity.filter((entry) => entry.lowRobustness).length;

  const overlaysPartialOrProxy = overlayEntries.filter(([, overlay]) => {
    const components = overlay.components ?? [];
    const missingCount = components.filter((component) => component.missing).length;
    const proxyCount = components.filter((component) => component.proxy).length;
    return missingCount > 0 || proxyCount > 0;
  }).length;

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
  const hasOverlayIntervals =
    overlayIntervals.growth.length > 0 || overlayIntervals.stress.length > 0 || overlayIntervals.hardAsset.length > 0;
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

  function overlayColor(name: "growth" | "stress" | "hard_asset", value: string) {
    if (name === "stress") {
      if (value === "Low") return "#5f7f63";
      if (value === "Medium") return "#8e744d";
      return "#865550";
    }
    if (value === "Weak") return "#865550";
    if (value === "Neutral") return "#8c7450";
    return "#5f7f63";
  }

  function overlayDescription(name: "growth" | "stress" | "hard_asset", value: string): string {
    if (name === "stress") {
      if (value === "Low") return "Låg marknadsstress och bättre riskaptit.";
      if (value === "Medium") return "Blandad stressbild med viss försiktighet.";
      return "Hög stress i makromiljön och defensiv riskregim.";
    }
    if (value === "Weak") return "Svag tillväxt/real tillgångsdynamik relativt neutral nivå.";
    if (value === "Neutral") return "Balansläge utan tydlig styrka eller svaghet.";
    return "Stark tillväxt/real tillgångsdynamik relativt historik.";
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

  function overlayContributors(overlay: "growth" | "stress" | "hard_asset"): string[] {
    const status = pipelineDebug?.overlayDataStatus?.[overlay];
    return status?.scoredInputs?.slice(0, 4) ?? [];
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


  function overlayIntensity(type: "growth" | "stress" | "hard_asset", value: string): number {
    if (type === "stress") return value === "High" ? 3 : value === "Medium" ? 2 : 1;
    return value === "Strong" ? 3 : value === "Neutral" ? 2 : 1;
  }

  function areaPath(top: Array<{ x: number; y: number }>, base: Array<{ x: number; y: number }>): string {
    if (top.length === 0 || base.length === 0) return "";
    const head = `M ${top[0].x} ${top[0].y}`;
    const topLine = top.slice(1).map((point) => `L ${point.x} ${point.y}`).join(" ");
    const back = base.slice().reverse().map((point) => `L ${point.x} ${point.y}`).join(" ");
    return `${head} ${topLine} ${back} Z`;
  }

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
                <div style={{ fontSize: 13, marginBottom: 10 }}>
                  <strong>Runtime proof</strong>
                  <ul>
                    <li>overlay engine used: {globalMacro.overlayRuntimeProof?.overlayEngineUsed ? "yes" : "no"}</li>
                    <li>overlay bundle present: {globalMacro.overlayRuntimeProof?.bundlePresent ? "yes" : "no"}</li>
                    <li>bundle keys: {(globalMacro.overlayRuntimeProof?.bundleKeys ?? []).join(", ") || "—"}</li>
                    <li>selected region: {selectedRegion}</li>
                    <li>raw series count used by overlay engine: {globalMacro.overlayEngineDiagnostics?.rawSeriesCount ?? 0}</li>
                  </ul>
                </div>

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

              <h4>Summary</h4>
              <ul>
                <li>Core Regime: <strong>{globalMacro.regime.coreRegimeLabel}</strong></li>
                <li>Macro score: {typeof globalMacro.regime.macroScoreTotal === "number" ? globalMacro.regime.macroScoreTotal.toFixed(1) : "—"}</li>
                <li>Confidence: {globalMacro.regime.macroConfidence}%</li>
                
                <li>Data status: {globalMacro.dataStatus}</li>
              </ul>

              <details>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Legacy overlays (deprecated)</summary>
                <div style={{ marginTop: 8, fontSize: 12 }}>growth={globalMacro.regime.growthOverlay}, stress={globalMacro.regime.stressOverlay}, hard_asset={globalMacro.regime.hardAssetOverlay}</div>
              </details>

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

                  <h5>3) Overlay Timelines</h5>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 6, fontSize: 12, marginBottom: 8 }}>
                      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 8px", background: "#f8fafc" }}>
                        <strong>Growth</strong>: {overlayIntervals.growth[overlayIntervals.growth.length - 1]?.value ?? "—"}<br />
                        Senast ändrad: {latestOverlayDate(overlayIntervals.growth)}
                      </div>
                      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 8px", background: "#f8fafc" }}>
                        <strong>Stress</strong>: {overlayIntervals.stress[overlayIntervals.stress.length - 1]?.value ?? "—"}<br />
                        Senast ändrad: {latestOverlayDate(overlayIntervals.stress)}
                      </div>
                      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 8px", background: "#f8fafc" }}>
                        <strong>Hard Asset</strong>: {overlayIntervals.hardAsset[overlayIntervals.hardAsset.length - 1]?.value ?? "—"}<br />
                        Senast ändrad: {latestOverlayDate(overlayIntervals.hardAsset)}
                      </div>
                    </div>

                    {!hasOverlayIntervals ? (
                      <div className="status empty">För lite overlay-historik för full tidslinje. Visar tillgängliga segment när data finns.</div>
                    ) : (
                      <div style={{ border: "1px solid #8e8678", borderRadius: 10, padding: "8px 10px", background: "#2f2b27" }}>
                        <svg
                          viewBox="0 0 1000 340"
                          style={{ width: "100%", height: "360px", display: "block" }}
                          onClick={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            const clickX = Math.max(72, Math.min(972, event.clientX - rect.left));
                            const clickY = Math.max(26, Math.min(286, event.clientY - rect.top));
                            const ratio = (clickX - 72) / 900;
                            const index = Math.round(ratio * Math.max(0, historyPoints.length - 1));
                            const point = historyPoints[index];
                            if (!point) return;

                            const layers = [
                              { key: "growth" as const, label: "Growth" as const, intensity: overlayIntensity("growth", point.growthOverlay) },
                              { key: "stress" as const, label: "Stress" as const, intensity: overlayIntensity("stress", point.stressOverlay) },
                              { key: "hard_asset" as const, label: "Hard Asset" as const, intensity: overlayIntensity("hard_asset", point.hardAssetOverlay) },
                            ];
                            const unit = 22;
                            const total = layers.reduce((sum, layer) => sum + layer.intensity, 0) * unit;
                            const valueFromBottom = ((286 - clickY) / 260) * total;
                            let cumulative = 0;
                            const clicked = layers.find((layer) => {
                              const start = cumulative;
                              cumulative += layer.intensity * unit;
                              return valueFromBottom >= start && valueFromBottom <= cumulative;
                            }) ?? layers[0];

                            const intervals = clicked.key === "growth" ? overlayIntervals.growth : clicked.key === "stress" ? overlayIntervals.stress : overlayIntervals.hardAsset;
                            const interval = intervals.find((item) => point.asOfDate >= item.startDate && point.asOfDate <= item.endDate);
                            if (!interval) return;
                            setSelectedOverlaySegment({
                              overlayKey: clicked.key,
                              overlay: clicked.label,
                              value: interval.value,
                              startDate: interval.startDate,
                              endDate: interval.endDate,
                              pointCount: interval.pointCount,
                              explanation: overlayDescription(clicked.key, interval.value),
                              contributors: overlayContributors(clicked.key),
                            });
                          }}
                        >
                          {[0, 1, 2, 3, 4].map((level) => (
                            <line key={`overlay-grid-${level}`} x1={72} y1={286 - level * 65} x2={972} y2={286 - level * 65} stroke="#5f564a" strokeWidth={1} />
                          ))}

                          {(() => {
                            const unit = 22;
                            const xOf = (index: number) => 72 + ((historyPoints.length <= 1 ? 0 : index / (historyPoints.length - 1)) * 900);
                            const gTop: Array<{ x: number; y: number }> = [];
                            const gBase: Array<{ x: number; y: number }> = [];
                            const sTop: Array<{ x: number; y: number }> = [];
                            const sBase: Array<{ x: number; y: number }> = [];
                            const hTop: Array<{ x: number; y: number }> = [];
                            const hBase: Array<{ x: number; y: number }> = [];

                            historyPoints.forEach((point, index) => {
                              const x = xOf(index);
                              const g = overlayIntensity("growth", point.growthOverlay) * unit;
                              const s = overlayIntensity("stress", point.stressOverlay) * unit;
                              const h = overlayIntensity("hard_asset", point.hardAssetOverlay) * unit;
                              const g0 = 0;
                              const g1 = g;
                              const s0 = g1;
                              const s1 = s0 + s;
                              const h0 = s1;
                              const h1 = h0 + h;
                              const y = (value: number) => 286 - value;
                              gBase.push({ x, y: y(g0) });
                              gTop.push({ x, y: y(g1) });
                              sBase.push({ x, y: y(s0) });
                              sTop.push({ x, y: y(s1) });
                              hBase.push({ x, y: y(h0) });
                              hTop.push({ x, y: y(h1) });
                            });

                            return (
                              <>
                                <path d={areaPath(gTop, gBase)} fill="#5f7f63" fillOpacity={0.62} stroke="#7c9b7f" strokeWidth={1.2} />
                                <path d={areaPath(sTop, sBase)} fill="#8c7450" fillOpacity={0.62} stroke="#af9368" strokeWidth={1.2} />
                                <path d={areaPath(hTop, hBase)} fill="#7b6676" fillOpacity={0.62} stroke="#9a8594" strokeWidth={1.2} />
                              </>
                            );
                          })()}

                          {historyPoints.filter((point) => point.overlayChanged).map((point) => {
                            const x = 72 + (segmentPosition(point.asOfDate, point.asOfDate).left / 100) * 900;
                            return <line key={`overlay-change-${point.asOfDate}`} x1={x} y1={26} x2={x} y2={286} stroke="#d4ccbf" strokeWidth={1} strokeDasharray="2 4" opacity={0.4} />;
                          })}

                          <line x1={72} y1={286} x2={972} y2={286} stroke="#b8afa1" strokeWidth={1} />
                          {axisTicks.map((tick) => {
                            const x = 72 + ((historyPoints.length <= 1 ? 0 : tick.index / (historyPoints.length - 1)) * 900);
                            return (
                              <g key={`overlay-x-${tick.index}`}>
                                <line x1={x} y1={286} x2={x} y2={290} stroke="#b8afa1" strokeWidth={1} />
                                <text x={x} y={311} textAnchor="middle" fontSize={11} fill="#d6cfc4">{tick.label}</text>
                              </g>
                            );
                          })}
                        </svg>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "#d6cfc4", marginTop: 4 }}>
                          <span><strong style={{ color: "#9fc4a4" }}>Growth</strong> (Weak/Neutral/Strong)</span>
                          <span><strong style={{ color: "#c6a87b" }}>Stress</strong> (Low/Medium/High)</span>
                          <span><strong style={{ color: "#b59db0" }}>Hard Asset</strong> (Weak/Neutral/Strong)</span>
                        </div>
                      </div>
                    )}

                    {selectedOverlaySegment && (
                      <div style={{ marginTop: 8, fontSize: 12, border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
                        <strong>{selectedOverlaySegment.overlay}</strong>: <strong>{selectedOverlaySegment.value}</strong> · {selectedOverlaySegment.startDate} → {selectedOverlaySegment.endDate} · {selectedOverlaySegment.pointCount} punkter<br />
                        {selectedOverlaySegment.explanation}<br />
                        Drivare: {selectedOverlaySegment.contributors.join(", ") || "Ej tillgängligt"}
                      </div>
                    )}

                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Debug: visa textintervall</summary>
                      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>Growth</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {overlayIntervals.growth.map((interval) => (
                              <span key={`ov-growth-debug-${interval.startDate}-${interval.endDate}-${interval.value}`} style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999, background: overlayColor("growth", interval.value) }}>
                                {interval.startDate} → {interval.endDate}: {interval.value} ({interval.pointCount})
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>Stress</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {overlayIntervals.stress.map((interval) => (
                              <span key={`ov-stress-debug-${interval.startDate}-${interval.endDate}-${interval.value}`} style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999, background: overlayColor("stress", interval.value) }}>
                                {interval.startDate} → {interval.endDate}: {interval.value} ({interval.pointCount})
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>Hard Asset</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {overlayIntervals.hardAsset.map((interval) => (
                              <span key={`ov-hard-debug-${interval.startDate}-${interval.endDate}-${interval.value}`} style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999, background: overlayColor("hard_asset", interval.value) }}>
                                {interval.startDate} → {interval.endDate}: {interval.value} ({interval.pointCount})
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </details>
                  </div>

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

          <AdminDebugSection>
            <h4>Overlay debug</h4>
            <ul>
              <li>overlayRuntimeProof: {JSON.stringify(globalMacro?.overlayRuntimeProof ?? null)}</li>
              <li>overlaysComputed: {(globalMacro?.overlayEngineDiagnostics?.overlaysReturned ?? []).join(", ") || "—"}</li>
              <li>overlaysMissing: {(globalMacro?.overlayEngineDiagnostics?.overlaysMissing ?? []).join(", ") || "—"}</li>
              <li>overlaysPartial: {overlaysPartialOrProxy}</li>
              <li>overlaysLowRobustness: {lowRobustnessCount}</li>
              <li>rawSeriesCountUsed: {globalMacro?.overlayEngineDiagnostics?.rawSeriesCount ?? 0}</li>
              <li>historyBuiltCount: {(globalMacro?.overlayEngineDiagnostics?.historyBuiltFor ?? []).length}</li>
              <li>regionKeysPresent: {(globalMacro?.overlayRuntimeProof?.regionKeysPresent ?? []).join(", ") || "—"}</li>
              <li>globalKeysPresent: {(globalMacro?.overlayRuntimeProof?.globalKeysPresent ?? []).join(", ") || "—"}</li>
            </ul>

            <h4>Overlay block debug</h4>
            <div style={{ marginTop: 8, overflowX: "auto", marginBottom: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #cbd5e1", padding: "4px 6px" }}>overlay</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #cbd5e1", padding: "4px 6px" }}>block</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #cbd5e1", padding: "4px 6px" }}>status</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #cbd5e1", padding: "4px 6px" }}>expected source</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #cbd5e1", padding: "4px 6px" }}>actual source used</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #cbd5e1", padding: "4px 6px" }}>proxy reason</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(globalMacro?.overlayBlockDiagnostics ?? {}).flatMap(([overlayName, blocks]) => blocks.map((row, idx) => (
                    <tr key={`admin-${overlayName}-${row.block}-${idx}`}>
                      <td style={{ borderBottom: "1px solid #e2e8f0", padding: "4px 6px" }}>{overlayName}</td>
                      <td style={{ borderBottom: "1px solid #e2e8f0", padding: "4px 6px" }}>{row.block}</td>
                      <td style={{ borderBottom: "1px solid #e2e8f0", padding: "4px 6px" }}>{row.status}</td>
                      <td style={{ borderBottom: "1px solid #e2e8f0", padding: "4px 6px" }}>{row.expectedSource || "—"}</td>
                      <td style={{ borderBottom: "1px solid #e2e8f0", padding: "4px 6px" }}>{row.actualSourceUsed || "—"}</td>
                      <td style={{ borderBottom: "1px solid #e2e8f0", padding: "4px 6px" }}>{row.reason || "—"}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>

            <h4>Overlay score debug</h4>
            <ul>
              {overlaySanity.map((item) => (
                <li key={`score-debug-${item.overlayKey}`}>
                  {item.overlayKey}: total={typeof activeOverlayBundle?.overlays?.[item.overlayKey]?.score === "number" ? activeOverlayBundle?.overlays?.[item.overlayKey]?.score?.toFixed(1) : "—"}, blockScores={item.normalizationInputs.join(" | ") || "—"}, dominantNegative={item.negative.join(", ") || "—"}, real={item.realBlocks}, proxy={item.proxyBlocks}, missing={item.missingBlocks}, robustness={item.lowRobustness ? "low robustness" : "ok"}
                </li>
              ))}
            </ul>

            <h4>Overlay history debug</h4>
            <ul>
              <li>historyBuilt: {String((globalMacro?.overlayEngineDiagnostics?.historyBuiltFor ?? []).length > 0)}</li>
              <li>historyPoints: {overlayHistoryPoints.length}</li>
              <li>earliestDate: {overlayHistoryPoints[0]?.asOfDate ?? "—"}</li>
              <li>latestDate: {overlayHistoryPoints[overlayHistoryPoints.length - 1]?.asOfDate ?? "—"}</li>
              <li>sourceUsed: macro_raw_datapoints(auto) + overlayEngine history builder</li>
            </ul>

            <ExpandablePanel title="Pipeline / Snapshot / Ingestion / Source debug" defaultOpen={false}>
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

              {debugEnabled && (
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
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runIngest("backfill", "US")}> 
                      {ingestRunningMode === "backfill" ? "Running backfill..." : "Run ingest backfill (US)"}
                    </button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runIngest("latest", "US")}> 
                      {ingestRunningMode === "latest" ? "Running latest..." : "Run ingest latest (US)"}
                    </button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runEngine("US")}>
                      {engineRunning ? "Running engine..." : "Run engine (US)"}
                    </button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runIngest("backfill", "EA")}>
                      {ingestRunningMode === "backfill" ? "Running backfill..." : "Run ingest backfill (EA)"}
                    </button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runIngest("latest", "EA")}>
                      {ingestRunningMode === "latest" ? "Running latest..." : "Run ingest latest (EA)"}
                    </button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runEngine("EA")}>
                      {engineRunning ? "Running engine..." : "Run engine (EA)"}
                    </button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runIngest("backfill", "SE")}>
                      {ingestRunningMode === "backfill" ? "Running backfill..." : "Run ingest backfill (SE)"}
                    </button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runIngest("latest", "SE")}>
                      {ingestRunningMode === "latest" ? "Running latest..." : "Run ingest latest (SE)"}
                    </button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runEngine("SE")}>
                      {engineRunning ? "Running engine..." : "Run engine (SE)"}
                    </button>
                  </div>
                </div>
              )}

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

              {debugEnabled && (
                <>
                  <h4>Raw payload (?debug=1)</h4>
                  <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 11 }}>{JSON.stringify(globalMacroRaw, null, 2)}</pre>
                </>
              )}
            </div>
            </ExpandablePanel>
          </AdminDebugSection>
        </div>
      </div>
    </div>
  );
}
