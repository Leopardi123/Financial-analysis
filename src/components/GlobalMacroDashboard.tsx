import { useEffect, useMemo, useState } from "react";
import { Chart } from "react-google-charts";

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
    topDrivers: Array<{ indicatorId: string; contribution: number }>;
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
  }>;
};
export default function GlobalMacroDashboard() {
  const [globalMacro, setGlobalMacro] = useState<GlobalMacroPayload | null>(null);
  const [globalMacroRaw, setGlobalMacroRaw] = useState<Record<string, unknown> | null>(null);
  const [macroHistory, setMacroHistory] = useState<MacroHistoryPayload | null>(null);
  const [historyResolution, setHistoryResolution] = useState<"WEEKLY" | "MONTHLY">("MONTHLY");
  const [historyRangeYears, setHistoryRangeYears] = useState<number | "MAX">(10);
  const [globalMacroLoading, setGlobalMacroLoading] = useState(false);
  const [globalMacroError, setGlobalMacroError] = useState<string | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [ingestRunningMode, setIngestRunningMode] = useState<"backfill" | "latest" | null>(null);
  const [engineRunning, setEngineRunning] = useState(false);
  const [adminSecretInput, setAdminSecretInput] = useState("");
  const [ingestRunResult, setIngestRunResult] = useState<Record<string, unknown> | null>(null);
  const [engineRunResult, setEngineRunResult] = useState<Record<string, unknown> | null>(null);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);

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
  }, [historyResolution, historyRangeYears]);

  async function loadGlobalMacro() {    setGlobalMacroLoading(true);
    setGlobalMacroError(null);
    try {
      const response = await fetch(`/api/sector/global-macro?region=US&historyResolution=${historyResolution}&historyRangeYears=${String(historyRangeYears)}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(String(payload?.error ?? "Kunde inte ladda Global Macro"));
      }
      setGlobalMacro(payload.globalMacro ?? null);
      setMacroHistory(payload.macroHistory ?? null);
      setGlobalMacroRaw(payload);
    } catch (error) {
      setGlobalMacro(null);
      setMacroHistory(null);
      setGlobalMacroRaw(null);
      setGlobalMacroError(error instanceof Error ? error.message : "Okänt fel vid Global Macro-hämtning");
    } finally {
      setGlobalMacroLoading(false);
    }
  }

  useEffect(() => {
    void loadGlobalMacro();
  }, [historyResolution, historyRangeYears]);

  const globalMacroIndicators = globalMacro?.indicators ?? [];
  const scoredCount = globalMacroIndicators.filter((item) => item.score !== null).length;
  const isPartialData =
    globalMacro?.stats?.partialData ??
    (globalMacroIndicators.length > 0 && scoredCount < globalMacroIndicators.length);
  const isNoData = !globalMacroLoading && !globalMacroError && (!globalMacro || globalMacroIndicators.length === 0);

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

  const pipelineDebug = globalMacro?.debug ?? null;
  const historyPoints = macroHistory?.points ?? [];

  const regimeIntervals = macroHistory?.intervals.regime ?? [];
  const overlayIntervals = macroHistory?.intervals.overlays ?? { growth: [], stress: [], hardAsset: [] };
  const latestHistoryPoint = historyPoints[historyPoints.length - 1] ?? null;
  const latestRegimeInterval = regimeIntervals[regimeIntervals.length - 1] ?? null;
  const selectedHistoryPoint = useMemo(() => {
    if (!historyPoints.length) return null;
    if (!selectedHistoryDate) return latestHistoryPoint;
    return historyPoints.find((point) => point.asOfDate === selectedHistoryDate) ?? latestHistoryPoint;
  }, [historyPoints, latestHistoryPoint, selectedHistoryDate]);

  const selectedHistoryDrivers = useMemo(() => {
    const selectedDriver = selectedHistoryPoint?.topDriver ? [selectedHistoryPoint.topDriver] : [];
    const latestDrivers = globalMacro?.regime.topDrivers.slice(0, 3).map((driver) => driver.indicatorId) ?? [];
    return Array.from(new Set([...selectedDriver, ...latestDrivers])).slice(0, 3);
  }, [globalMacro?.regime.topDrivers, selectedHistoryPoint?.topDriver]);

  const blockHistoryData = useMemo(() => {
    const rows = historyPoints.map((point) => {
      const fiscal = point.fiscalScore ?? 0;
      const monetary = point.monetaryScore ?? 0;
      const inflation = point.inflationScore ?? 0;
      const credibility = point.credibilityScore ?? 0;
      const total = fiscal + monetary + inflation + credibility;
      const denom = total > 0 ? total : 1;
      return [
        new Date(`${point.asOfDate}T00:00:00.000Z`),
        (fiscal / denom) * 100,
        (monetary / denom) * 100,
        (inflation / denom) * 100,
        (credibility / denom) * 100,
      ] as (Date | number)[];
    });
    return [["Date", "Fiscal", "Monetary", "Inflation", "Credibility"], ...rows];
  }, [historyPoints]);

  const regimeSummary = useMemo(() => {
    if (!regimeIntervals.length || !latestRegimeInterval) return null;
    const longest = regimeIntervals.reduce((max, current) => (
      current.pointCount > max.pointCount ? current : max
    ), regimeIntervals[0]);
    const driverCounts = new Map<string, number>();
    regimeIntervals.forEach((interval) => {
      if (!interval.topDriver) return;
      driverCounts.set(interval.topDriver, (driverCounts.get(interval.topDriver) ?? 0) + 1);
    });
    const topDriver = Array.from(driverCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    return {
      regimeChanges: macroHistory?.regimeChanges ?? 0,
      longest,
      currentDuration: latestRegimeInterval.pointCount,
      latestChange: (() => {
        const changes = historyPoints.filter((point) => point.regimeChanged);
        return changes.length ? changes[changes.length - 1].asOfDate : "—";
      })(),
      topDriver,
    };
  }, [historyPoints, latestRegimeInterval, macroHistory?.regimeChanges, regimeIntervals]);


  function regimeColor(regime: string) {
    if (regime === "MonetaryDominance") return "#dbeafe";
    if (regime === "Balanced") return "#dcfce7";
    if (regime === "FiscalPressureBuilding") return "#fef3c7";
    if (regime === "FiscalDominanceRisk") return "#fee2e2";
    return "#e5e7eb";
  }

  function overlayColor(name: "growth" | "stress" | "hard_asset", value: string) {
    if (name === "stress") {
      if (value === "Low") return "#dcfce7";
      if (value === "Medium") return "#fde68a";
      return "#fecaca";
    }
    if (value === "Weak") return "#fee2e2";
    if (value === "Neutral") return "#fde68a";
    return "#dcfce7";
  }

  async function runIngest(mode: "backfill" | "latest") {
    setIngestRunningMode(mode);
    setIngestRunResult(null);
    try {
      const response = await fetch(`/api/admin/macro/ingest?mode=${mode}&region=US`, {
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
        timestamp: new Date().toISOString(),
        authMethodUsed: adminSecretInput.trim() ? "x-admin-secret header (manual debug input)" : "none",
        adminActionAuth: "Failed",
        payload: { error: error instanceof Error ? error.message : "Unknown ingest error" },
      });
    } finally {
      setIngestRunningMode(null);
    }
  }

  async function runEngine() {
    setEngineRunning(true);
    setEngineRunResult(null);
    try {
      const response = await fetch(`/api/admin/macro/run-engine?region=US`, {
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
        timestamp: new Date().toISOString(),
        authMethodUsed: adminSecretInput.trim() ? "x-admin-secret header (manual debug input)" : "none",
        adminActionAuth: response.ok ? "OK" : "Failed",
      });
      await loadGlobalMacro();
    } catch (error) {
      setEngineRunResult({
        status: 0,
        ok: false,
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
        <div className="sector-card">
          <h3>Global Macro Dashboard</h3>
          <p className="bread">Read-only macrosektion på egen toppnivå. Hämtar live från <code>/api/sector/global-macro</code>.</p>

          {globalMacroLoading && <div className="status">Laddar Global Macro…</div>}
          {globalMacroError && <div className="status">Kunde inte ladda Global Macro: {globalMacroError}</div>}
          {isNoData && <div className="status empty">Ingen macrodata hittades ännu. Sektionen är aktiv men endpointen returnerade tomt.</div>}

          {!globalMacroLoading && !globalMacroError && globalMacro && (
            <>
              {isPartialData && (
                <div className="status">Partial data: {scoredCount}/{globalMacroIndicators.length} indikatorer är poängsatta.</div>
              )}

              <h4>Summary</h4>
              <ul>
                <li>Core Regime: <strong>{globalMacro.regime.coreRegimeLabel}</strong></li>
                <li>Macro score: {typeof globalMacro.regime.macroScoreTotal === "number" ? globalMacro.regime.macroScoreTotal.toFixed(1) : "—"}</li>
                <li>Confidence: {globalMacro.regime.macroConfidence}%</li>
                <li>Growth overlay: {globalMacro.regime.growthOverlay}</li>
                <li>Stress overlay: {globalMacro.regime.stressOverlay}</li>
                <li>Hard Asset overlay: {globalMacro.regime.hardAssetOverlay}</li>
                <li>Data status: {globalMacro.dataStatus}</li>
              </ul>

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

              <h4>Top drivers</h4>
              {globalMacro.regime.topDrivers.length === 0 ? (
                <div className="status empty">Inga top drivers tillgängliga ännu.</div>
              ) : (
                <ul>
                  {globalMacro.regime.topDrivers.slice(0, 5).map((driver) => (
                    <li key={driver.indicatorId}>{driver.indicatorId}: {driver.contribution.toFixed(2)}</li>
                  ))}
                </ul>
              )}

              <h4>Signal split</h4>
              <ul>
                <li>Clear signals: {globalMacroIndicators.filter((item) => item.signalClass === "clear").length} | strength {globalMacro.regime.clearSignalStrength ?? "—"}</li>
                <li>Speculative signals: {globalMacroIndicators.filter((item) => item.signalClass === "speculative").length} | strength {globalMacro.regime.speculativeSignalStrength ?? "—"}</li>
              </ul>


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
                  <h5>1) Macro Score + Regime Graph</h5>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>
                    <strong>Score zones:</strong> ≤{macroHistory.template.thresholds.monetaryDominanceMax} MonetaryDominance, {macroHistory.template.thresholds.monetaryDominanceMax + 1}–{macroHistory.template.thresholds.balancedMax} Balanced, {macroHistory.template.thresholds.balancedMax + 1}–{macroHistory.template.thresholds.fiscalPressureMax} FiscalPressureBuilding, &gt;{macroHistory.template.thresholds.fiscalPressureMax} FiscalDominanceRisk.
                  </div>
                  <div style={{ border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ background: regimeColor("MonetaryDominance"), height: 26, borderBottom: "1px solid #cbd5e1", display: "flex", alignItems: "center", fontSize: 11, paddingLeft: 8 }}>MonetaryDominance</div>
                    <div style={{ background: regimeColor("Balanced"), height: 26, borderBottom: "1px solid #cbd5e1", display: "flex", alignItems: "center", fontSize: 11, paddingLeft: 8 }}>Balanced</div>
                    <div style={{ background: regimeColor("FiscalPressureBuilding"), height: 26, borderBottom: "1px solid #cbd5e1", display: "flex", alignItems: "center", fontSize: 11, paddingLeft: 8 }}>FiscalPressureBuilding</div>
                    <div style={{ background: regimeColor("FiscalDominanceRisk"), height: 26, display: "flex", alignItems: "center", fontSize: 11, paddingLeft: 8 }}>FiscalDominanceRisk</div>
                  </div>
                  <Chart
                    chartType="LineChart"
                    data={[
                      ["Date", "Macro score", "Regime skifte"],
                      ...historyPoints.map((point) => [
                        new Date(`${point.asOfDate}T00:00:00.000Z`),
                        point.macroScoreTotal,
                        point.regimeChanged ? point.macroScoreTotal : null,
                      ]),
                    ]}
                    width="100%"
                    height="220px"
                    options={{
                      legend: { position: "bottom" },
                      backgroundColor: "#f8fafc",
                      vAxis: { minValue: 0, maxValue: 100 },
                      series: {
                        0: { color: "#0f172a", lineWidth: 2, pointSize: 2 },
                        1: { color: "#b91c1c", lineWidth: 0, pointSize: 3 },
                      },
                    }}
                  />
                  <div style={{ display: "flex", marginBottom: 10, height: 14, borderRadius: 999, overflow: "hidden", border: "1px solid #cbd5e1" }}>
                    {regimeIntervals.map((interval) => {
                      const start = new Date(`${interval.startDate}T00:00:00.000Z`).getTime();
                      const end = new Date(`${interval.endDate}T00:00:00.000Z`).getTime();
                      const duration = Math.max(1, end - start);
                      return (
                        <button
                          key={`score-band-${interval.startDate}-${interval.endDate}`}
                          type="button"
                          onClick={() => setSelectedHistoryDate(interval.endDate)}
                          title={`${interval.startDate} → ${interval.endDate} · ${interval.coreRegimeLabel}`}
                          style={{
                            flex: `${duration} 0 0`,
                            minWidth: 8,
                            border: 0,
                            padding: 0,
                            background: regimeColor(interval.coreRegimeLabel),
                            cursor: "pointer",
                          }}
                          aria-label={`${interval.coreRegimeLabel} ${interval.startDate} till ${interval.endDate}`}
                        />
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px" }}>
                    Vald punkt: <strong>{selectedHistoryPoint?.asOfDate ?? "—"}</strong> | Regim <strong>{selectedHistoryPoint?.coreRegimeLabel ?? "—"}</strong> | Score <strong>{typeof selectedHistoryPoint?.macroScoreTotal === "number" ? selectedHistoryPoint.macroScoreTotal.toFixed(1) : "—"}</strong> | Drivers <strong>{selectedHistoryDrivers.join(", ") || "—"}</strong>
                  </div>

                  <h5>2) Core Regime Timeline</h5>
                  <div style={{ display: "flex", width: "100%", minHeight: 28, borderRadius: 8, overflow: "hidden", border: "1px solid #cbd5e1", marginBottom: 8 }}>
                    {regimeIntervals.map((interval) => {
                      const start = new Date(`${interval.startDate}T00:00:00.000Z`).getTime();
                      const end = new Date(`${interval.endDate}T00:00:00.000Z`).getTime();
                      const duration = Math.max(1, end - start);
                      return (
                        <details key={`interval-${interval.startDate}-${interval.endDate}-${interval.coreRegimeLabel}`} style={{ flex: `${duration} 0 0`, minWidth: 30, background: regimeColor(interval.coreRegimeLabel), borderRight: "1px solid rgba(15,23,42,0.2)", padding: "4px 6px" }}>
                          <summary style={{ cursor: "pointer", listStyle: "none", fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{interval.coreRegimeLabel}</summary>
                          <div style={{ fontSize: 11, marginTop: 4 }}>
                            {interval.startDate} → {interval.endDate}<br />
                            duration: {interval.pointCount} punkter<br />
                            top driver: {interval.topDriver ?? "—"}
                          </div>
                        </details>
                      );
                    })}
                  </div>

                  <h5>3) Block Driver / Block History Visualization</h5>
                  <Chart
                    chartType="AreaChart"
                    data={blockHistoryData}
                    width="100%"
                    height="240px"
                    options={{
                      isStacked: true,
                      legend: { position: "bottom" },
                      backgroundColor: "#f8fafc",
                      vAxis: { minValue: 0, maxValue: 100, title: "Dominans (%)" },
                      series: {
                        0: { color: "#2563eb" },
                        1: { color: "#0ea5e9" },
                        2: { color: "#f97316" },
                        3: { color: "#64748b" },
                      },
                    }}
                  />

                  <h5>4) Overlay Timeline</h5>
                  <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                    {([
                      ["growth", "Growth", overlayIntervals.growth],
                      ["stress", "Stress", overlayIntervals.stress],
                      ["hard_asset", "Hard Asset", overlayIntervals.hardAsset],
                    ] as const).map(([key, label, intervals]) => (
                      <div key={key}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{label}</div>
                        <div style={{ display: "flex", minHeight: 24, border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden" }}>
                          {intervals.map((interval) => {
                            const start = new Date(`${interval.startDate}T00:00:00.000Z`).getTime();
                            const end = new Date(`${interval.endDate}T00:00:00.000Z`).getTime();
                            const duration = Math.max(1, end - start);
                            return (
                              <details key={`ov-${key}-${interval.startDate}-${interval.endDate}-${interval.value}`} style={{ flex: `${duration} 0 0`, minWidth: 20, background: overlayColor(key as "growth" | "stress" | "hard_asset", interval.value), borderRight: "1px solid rgba(15,23,42,0.15)", padding: "3px 5px" }}>
                                <summary style={{ cursor: "pointer", listStyle: "none", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{interval.value}</summary>
                                <div style={{ fontSize: 11, marginTop: 2 }}>{interval.startDate} → {interval.endDate} ({interval.pointCount}p)</div>
                              </details>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <h5>5) Compact Regime Summary</h5>
                  {regimeSummary ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginBottom: 10 }}>
                      <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, fontSize: 12 }}>Regime skiften<br /><strong>{regimeSummary.regimeChanges}</strong></div>
                      <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, fontSize: 12 }}>Längsta regim<br /><strong>{regimeSummary.longest.coreRegimeLabel}</strong> ({regimeSummary.longest.pointCount}p)</div>
                      <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, fontSize: 12 }}>Nuvarande varaktighet<br /><strong>{regimeSummary.currentDuration} punkter</strong></div>
                      <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, fontSize: 12 }}>Senaste skifte<br /><strong>{regimeSummary.latestChange}</strong></div>
                      <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, fontSize: 12 }}>Vanligaste top driver<br /><strong>{regimeSummary.topDriver}</strong></div>
                    </div>
                  ) : null}

                  <h5>6) Detailed Change Log</h5>
                  <div style={{ overflowX: "auto", marginBottom: 8 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Från</th>
                          <th>Till</th>
                          <th>Duration före (punkter)</th>
                          <th>Viktigaste driver</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyPoints.filter((point) => point.regimeChanged).map((point, index, changes) => (
                          <tr key={`change-${point.asOfDate}`}>
                            <td>{point.asOfDate}</td>
                            <td>{point.previousRegimeLabel ?? "—"}</td>
                            <td>{point.coreRegimeLabel}</td>
                            <td>{index === 0 ? "—" : changes[index - 1] ? Math.max(1, historyPoints.findIndex((x) => x.asOfDate === point.asOfDate) - historyPoints.findIndex((x) => x.asOfDate === changes[index - 1].asOfDate)) : "—"}</td>
                            <td>{point.topDriver ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <h5>7) Debug</h5>
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Visa history-debug</summary>
                    <ul style={{ fontSize: 12, marginTop: 6 }}>
                      <li>number of regime intervals: {regimeIntervals.length}</li>
                      <li>number of regime changes: {macroHistory.regimeChanges}</li>
                      <li>number of overlay intervals (growth/stress/hard asset): {overlayIntervals.growth.length}/{overlayIntervals.stress.length}/{overlayIntervals.hardAsset.length}</li>
                      <li>rendering mode block history: stacked-area-dominance</li>
                      <li>rendering mode overlay history: synced-timeline-bands</li>
                      <li>selected range: {macroHistory.requestedRangeYears}</li>
                      <li>selected resolution: {macroHistory.resolution}</li>
                    </ul>
                  </details>
                </>
              ) : (
                <div className="status empty">Ingen historik kunde genereras för vald period/upplösning.</div>
              )}

              <h4>Indicator drilldown</h4>
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
            </>
          )}
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>🔧 Pipeline Debug</summary>
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
                <li>history region: {macroHistory?.region ?? "US"}</li>
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
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runIngest("backfill")}>
                      {ingestRunningMode === "backfill" ? "Running backfill..." : "Run ingest backfill (US)"}
                    </button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runIngest("latest")}>
                      {ingestRunningMode === "latest" ? "Running latest..." : "Run ingest latest (US)"}
                    </button>
                    <button type="button" disabled={ingestRunningMode !== null || engineRunning} onClick={() => void runEngine()}>
                      {engineRunning ? "Running engine..." : "Run engine (US)"}
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
          </details>
        </div>
      </div>
    </div>
  );
}
