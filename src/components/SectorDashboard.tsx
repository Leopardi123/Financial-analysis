import { useEffect, useMemo, useState } from "react";

type ManualInput = {
  input_type: string;
  value: string;
  source?: string | null;
  note?: string | null;
  created_at: string;
};

type OverviewPayload = {
  todo?: string[];
  metrics?: Array<Record<string, unknown>>;
  computedMetrics?: Array<{ metric: string; value: number; sampleSize?: number }>;
  missingMetrics?: string[];
  suggestedFmpEndpoints?: string[];
};

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

const SECTORS = [
  { name: "Råvaror", subsectors: ["Guld", "Olja"] },
  { name: "Industri", subsectors: ["Verkstad"] },
  { name: "Tech", subsectors: ["Semiconductors"] },
];

const GENERIC_QUESTIONS = [
  {
    inputType: "market_structure",
    label: "Marknadsstruktur",
    options: ["Underutbud", "Balans", "Överutbud"],
  },
  {
    inputType: "inventory_data",
    label: "Finns lagerdata? (nivå/trend + källa)",
    options: ["Ja", "Nej"],
  },
  {
    inputType: "capex_trend",
    label: "CAPEX-trend",
    options: ["Accelererande", "Stabil", "Fallande"],
  },
  {
    inputType: "management_tone",
    label: "Bolagens kommunikation",
    options: ["Expansiv", "Försiktig", "Defensiv"],
  },
  {
    inputType: "geopolitics",
    label: "Geopolitik (ja/nej + kommentar)",
    options: ["Ja", "Nej"],
  },
  {
    inputType: "regulatory_risk",
    label: "Regulatoriska risker",
    options: ["Låg", "Medel", "Hög"],
  },
  {
    inputType: "structural_drivers",
    label: "Strukturella efterfrågedrivare",
    options: ["Starka", "Neutrala", "Svaga"],
  },
];

const GOLD_QUESTIONS = [
  {
    inputType: "gold_physical_market",
    label: "Fysisk marknad (guld)",
    options: ["Tight", "Balans", "Löst"],
  },
  {
    inputType: "gold_inventory_data",
    label: "Lagerdata (LBMA/ETF/centralbanker)",
    options: ["Ja", "Nej"],
  },
  {
    inputType: "central_bank_buying",
    label: "Centralbanksköp",
    options: ["Stigande", "Stabil", "Fallande"],
  },
  {
    inputType: "jewelry_demand",
    label: "Smycken/industriell efterfrågan",
    options: ["Stark", "Neutral", "Svag"],
  },
  {
    inputType: "gold_supply_projects",
    label: "Nya projekt online 3–5 år",
    options: ["Ja", "Nej"],
  },
  {
    inputType: "mine_life_trend",
    label: "Mine life-trend",
    options: ["Sjunkande", "Stabil", "Ökande"],
  },
  {
    inputType: "capital_discipline",
    label: "Kapitaldisciplin",
    options: ["Försiktiga", "Opportunistiska", "Slösaktiga"],
  },
  {
    inputType: "management_focus",
    label: "Ledningens fokus",
    options: ["Avkastning", "Volym", "Tillväxt till varje pris"],
  },
];

const OIL_QUESTIONS = [
  {
    inputType: "opec_discipline",
    label: "OPEC-disciplin",
    options: ["Hög", "Medel", "Låg"],
  },
  {
    inputType: "shale_response",
    label: "Shale-respons",
    options: ["Snabb", "Måttlig", "Trög"],
  },
  {
    inputType: "demand_elasticity",
    label: "Efterfrågeelasticitet",
    options: ["Hög", "Medel", "Låg"],
  },
  {
    inputType: "energy_policy",
    label: "Energipolitik/reglering",
    options: ["Stram", "Neutral", "Stödjande"],
  },
  {
    inputType: "inventory_oecd",
    label: "OECD/SPR lagerdata",
    options: ["Hög", "Normal", "Låg"],
  },
];

const COMPANY_CATEGORIES = [
  "Major",
  "Producer",
  "Junior developer",
  "Junior explorer - fyndighet",
  "Junior explorer - pre descovery",
];

export default function SectorDashboard() {
  const [sector, setSector] = useState(SECTORS[0].name);
  const [subsector, setSubsector] = useState(SECTORS[0].subsectors[0]);
  const [manualInputs, setManualInputs] = useState<ManualInput[]>([]);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [globalMacro, setGlobalMacro] = useState<GlobalMacroPayload | null>(null);
  const [globalMacroRaw, setGlobalMacroRaw] = useState<Record<string, unknown> | null>(null);
  const [globalMacroLoading, setGlobalMacroLoading] = useState(false);
  const [globalMacroError, setGlobalMacroError] = useState<string | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [inputSource, setInputSource] = useState("");
  const [inputNote, setInputNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [mappingTickers, setMappingTickers] = useState("");
  const [mappingCategory, setMappingCategory] = useState(COMPANY_CATEGORIES[0]);

  const subsectors = useMemo(() => {
    return SECTORS.find((item) => item.name === sector)?.subsectors ?? [];
  }, [sector]);

  const questions = useMemo(() => {
    if (sector === "Råvaror" && subsector === "Guld") {
      return [...GENERIC_QUESTIONS, ...GOLD_QUESTIONS];
    }
    if (sector === "Råvaror" && subsector === "Olja") {
      return [...GENERIC_QUESTIONS, ...OIL_QUESTIONS];
    }
    return GENERIC_QUESTIONS;
  }, [sector, subsector]);

  useEffect(() => {
    if (!subsectors.includes(subsector)) {
      setSubsector(subsectors[0] ?? "");
    }
  }, [subsector, subsectors]);

  useEffect(() => {
    let active = true;
    async function loadOverview() {
      const response = await fetch(
        `/api/sector/overview?sector=${encodeURIComponent(sector)}&subsector=${encodeURIComponent(subsector)}`
      );
      const payload = await response.json();
      if (active) {
        setOverview(payload);
      }
    }
    void loadOverview();

    return () => {
      active = false;
    };
  }, [sector, subsector]);

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

  useEffect(() => {
    let active = true;
    async function loadManualInputs() {
      const response = await fetch(
        `/api/sector/manual-input?sector=${encodeURIComponent(sector)}&subsector=${encodeURIComponent(subsector)}`
      );
      const payload = await response.json();
      if (active) {
        setManualInputs(payload.inputs ?? []);
      }
    }
    void loadManualInputs();
    return () => {
      active = false;
    };
  }, [sector, subsector]);

  const globalMacroIndicators = globalMacro?.indicators ?? [];
  const scoredCount = globalMacroIndicators.filter((item) => item.score !== null).length;
  const isPartialData =
    globalMacro?.stats?.partialData ??
    (globalMacroIndicators.length > 0 && scoredCount < globalMacroIndicators.length);
  const isNoData = !globalMacroLoading && !globalMacroError && (!globalMacro || globalMacroIndicators.length === 0);

  const blockRows: Array<{ key: "A_FISCAL" | "B_MONETARY" | "C_INFLATION" | "D_CREDIBILITY"; label: string }> = [
    { key: "A_FISCAL", label: "Fiscal" },
    { key: "B_MONETARY", label: "Monetary" },
    { key: "C_INFLATION", label: "Inflation" },
    { key: "D_CREDIBILITY", label: "Credibility" },
  ];

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

  async function submitInput(inputType: string, value: string) {
    if (!value) {
      setStatus("Välj ett värde innan du sparar.");
      return;
    }
    setStatus("Sparar...");
    const response = await fetch("/api/sector/manual-input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sector,
        subsector,
        inputType,
        value,
        source: inputSource,
        note: inputNote,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error ?? "Misslyckades att spara.");
      return;
    }
    setStatus("Sparad.");
    setManualInputs((prev) => [
      {
        input_type: inputType,
        value,
        source: inputSource,
        note: inputNote,
        created_at: payload.createdAt,
      },
      ...prev,
    ]);
  }

  return (
    <div className="sector-dashboard">
      <div className="sector-header">
        <div>
          <label htmlFor="sector-select">Sektor</label>
          <select
            id="sector-select"
            value={sector}
            onChange={(event) => setSector(event.target.value)}
          >
            {SECTORS.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="subsector-select">Undersektor</label>
          <select
            id="subsector-select"
            value={subsector}
            onChange={(event) => setSubsector(event.target.value)}
          >
            {subsectors.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <a className="sector-link" href="#singlestock">
          Gå till Single Stock Dashboard →
        </a>
      </div>

      <div className="sector-grid">
        <div className="sector-card">
          <h3>Sector Overview</h3>
          <p className="bread">
            Automatiska sektormått saknas ännu. Dessa ska komma från befintlig backend (EV/EBITDA,
            FCF yield, ROIC, CAPEX/OCF m.m.).
          </p>
          <ul className="todo-list">
            {(overview?.todo ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {overview?.computedMetrics && overview.computedMetrics.length > 0 && (
            <div className="metric-list">
              <h4>Beräknade metrics</h4>
              <ul>
                {overview.computedMetrics.map((metric) => (
                  <li key={metric.metric}>
                    {metric.metric}: {metric.value.toFixed(3)}
                    {metric.sampleSize ? ` (n=${metric.sampleSize})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {overview?.missingMetrics && overview.missingMetrics.length > 0 && (
            <div className="metric-list">
              <h4>Missing metrics</h4>
              <ul>
                {overview.missingMetrics.map((metric) => (
                  <li key={metric}>{metric}</li>
                ))}
              </ul>
            </div>
          )}
          {overview?.suggestedFmpEndpoints && overview.suggestedFmpEndpoints.length > 0 && (
            <div className="metric-list">
              <h4>FMP endpoints</h4>
              <ul>
                {overview.suggestedFmpEndpoints.map((endpoint) => (
                  <li key={endpoint}>{endpoint}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="sector-card">
          <h3>Global Macro</h3>
          <p className="bread">Read-only macrosektion under Sector. Hämtar live från <code>/api/sector/global-macro</code>.</p>

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

        <div className="sector-card">
          <h3>Manual inputs</h3>
          <p className="bread">
            Fyll i manuella inputs för cykelbedömning. Alla svar sparas med tidsstämpel och kopplas
            till sektor/undersektor.
          </p>
          <div className="manual-inputs">
            {questions.map((question) => (
              <div key={question.inputType} className="manual-input-row">
                <div>
                  <label htmlFor={question.inputType}>{question.label}</label>
                  <select
                    id={question.inputType}
                    value={inputValues[question.inputType] ?? ""}
                    onChange={(event) =>
                      setInputValues((prev) => ({
                        ...prev,
                        [question.inputType]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Välj</option>
                    {question.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void submitInput(question.inputType, inputValues[question.inputType] ?? "")
                  }
                >
                  Spara
                </button>
              </div>
            ))}
          </div>
          <div className="manual-meta">
            <div>
              <label htmlFor="manual-source">Källa</label>
              <input
                id="manual-source"
                value={inputSource}
                onChange={(event) => setInputSource(event.target.value)}
                placeholder="LBMA, OPEC, årsredovisning ..."
              />
            </div>
            <div>
              <label htmlFor="manual-note">Kommentar</label>
              <input
                id="manual-note"
                value={inputNote}
                onChange={(event) => setInputNote(event.target.value)}
                placeholder="Kort notering"
              />
            </div>
          </div>
          {status && <div className="status">{status}</div>}
        </div>

        <div className="sector-card">
          <h3>Map companies</h3>
          <p className="bread">
            Koppla tickers till vald sektor/undersektor för att beräkna automatiska sektormått.
          </p>
          <label htmlFor="mapping-category">Kategori</label>
          <select
            id="mapping-category"
            value={mappingCategory}
            onChange={(event) => setMappingCategory(event.target.value)}
          >
            {COMPANY_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            value={mappingTickers}
            onChange={(event) => setMappingTickers(event.target.value)}
            placeholder="AAPL, MSFT, ... "
          />
          <button
            type="button"
            onClick={async () => {
              if (!mappingTickers.trim()) {
                setStatus("Ange minst en ticker.");
                return;
              }
              setStatus("Sparar mappings...");
              const response = await fetch("/api/sector/map-companies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sector,
                  subsector,
                  category: mappingCategory,
                  tickers: mappingTickers
                    .split(",")
                    .map((ticker) => ticker.trim().toUpperCase())
                    .filter(Boolean),
                }),
              });
              const payload = await response.json();
              if (!response.ok) {
                setStatus(payload.error ?? "Misslyckades att spara mappings.");
                return;
              }
              setStatus(`Mappade ${payload.mapped} tickers.`);
            }}
          >
            Spara mapping
          </button>
        </div>

        <div className="sector-card">
          <h3>Cykelbedömning</h3>
          <p className="bread">
            Cykelstatus genereras först när både automatiska datapunkter och manuella inputs finns.
            Just nu saknas automatiska datapunkter, så status visas som TODO.
          </p>
          <div className="cycle-status">TODO: Kombinera datapunkter och manuella inputs.</div>
        </div>

        <div className="sector-card">
          <h3>Senaste inputs</h3>
          {manualInputs.length === 0 ? (
            <div className="status empty">Inga manuella inputs sparade än.</div>
          ) : (
            <ul className="input-log">
              {manualInputs.map((input) => (
                <li key={`${input.input_type}-${input.created_at}`}>
                  <strong>{input.input_type}</strong>: {input.value}
                  {input.source ? ` (Källa: ${input.source})` : ""}
                  <div className="input-meta">{new Date(input.created_at).toLocaleString()}</div>
                  {input.note ? <div className="input-note">{input.note}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
