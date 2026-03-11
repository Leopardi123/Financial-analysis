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
  };
};

export default function GlobalMacroDashboard() {
  const [globalMacro, setGlobalMacro] = useState<GlobalMacroPayload | null>(null);
  const [globalMacroRaw, setGlobalMacroRaw] = useState<Record<string, unknown> | null>(null);
  const [globalMacroLoading, setGlobalMacroLoading] = useState(false);
  const [globalMacroError, setGlobalMacroError] = useState<string | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = new URLSearchParams(window.location.search);
    setDebugEnabled(query.get("debug") === "1");
  }, []);

  useEffect(() => {
    let active = true;
    async function loadGlobalMacro() {
      setGlobalMacroLoading(true);
      setGlobalMacroError(null);
      try {
        const response = await fetch(`/api/sector/global-macro?region=US`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(String(payload?.error ?? "Kunde inte ladda Global Macro"));
        }
        if (active) {
          setGlobalMacro(payload.globalMacro ?? null);
          setGlobalMacroRaw(payload);
        }
      } catch (error) {
        if (active) {
          setGlobalMacro(null);
          setGlobalMacroRaw(null);
          setGlobalMacroError(error instanceof Error ? error.message : "Okänt fel vid Global Macro-hämtning");
        }
      } finally {
        if (active) {
          setGlobalMacroLoading(false);
        }
      }
    }
    void loadGlobalMacro();
    return () => {
      active = false;
    };
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

          {debugEnabled && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer" }}>Global Macro debug (debug=1)</summary>
              <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 11 }}>{JSON.stringify({
                rawPayload: globalMacroRaw,
                coreRegime: globalMacro?.regime.coreRegimeLabel ?? null,
                overlays: globalMacro ? {
                  growth: globalMacro.regime.growthOverlay,
                  stress: globalMacro.regime.stressOverlay,
                  hardAsset: globalMacro.regime.hardAssetOverlay,
                } : null,
                blockScores: globalMacro?.regime.blockScores ?? null,
                topDrivers: globalMacro?.regime.topDrivers ?? [],
                nullIndicators: globalMacroIndicators.filter((item) => item.score === null).map((item) => ({ id: item.indicatorId, reason: item.nullReason ?? "n/a" })),
              }, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
