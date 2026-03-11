import { useEffect, useMemo, useState } from "react";

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
      nullReason: string | null;
    }>;
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
    rootCauseHints: string[];
  };

};

export default function GlobalMacroDashboard() {
  const [globalMacro, setGlobalMacro] = useState<GlobalMacroPayload | null>(null);
  const [globalMacroRaw, setGlobalMacroRaw] = useState<Record<string, unknown> | null>(null);
  const [globalMacroLoading, setGlobalMacroLoading] = useState(false);
  const [globalMacroError, setGlobalMacroError] = useState<string | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [ingestRunningMode, setIngestRunningMode] = useState<"backfill" | "latest" | null>(null);
  const [engineRunning, setEngineRunning] = useState(false);
  const [adminSecretInput, setAdminSecretInput] = useState("");
  const [ingestRunResult, setIngestRunResult] = useState<Record<string, unknown> | null>(null);
  const [engineRunResult, setEngineRunResult] = useState<Record<string, unknown> | null>(null);

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

  async function loadGlobalMacro() {    setGlobalMacroLoading(true);
    setGlobalMacroError(null);
    try {
      const response = await fetch(`/api/sector/global-macro?region=US`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(String(payload?.error ?? "Kunde inte ladda Global Macro"));
      }
      setGlobalMacro(payload.globalMacro ?? null);
      setGlobalMacroRaw(payload);
    } catch (error) {
      setGlobalMacro(null);
      setGlobalMacroRaw(null);
      setGlobalMacroError(error instanceof Error ? error.message : "Okänt fel vid Global Macro-hämtning");
    } finally {
      setGlobalMacroLoading(false);
    }
  }

  useEffect(() => {
    void loadGlobalMacro();
  }, []);

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
                        <td>{row.nullReason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h4>Snapshot content</h4>
              <ul>
                <li>indicator snapshots: {pipelineDebug?.snapshotContent.indicatorSnapshotCount ?? "—"}</li>
                <li>regime snapshots: {pipelineDebug?.snapshotContent.regimeSnapshotCount ?? "—"}</li>
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
                  <li>fetched observations: {pipelineDebug.ingestionDebug.latestAttempt.fetchedObservationCount}</li>
                  <li>attempted inserts: {pipelineDebug.ingestionDebug.latestAttempt.attemptedInserts}</li>
                  <li>actual inserted rows: {pipelineDebug.ingestionDebug.latestAttempt.insertedRowCount}</li>
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
