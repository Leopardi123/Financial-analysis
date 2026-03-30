import { useMemo, useState } from "react";
import { evaluateScreen } from "../screening/engine";
import { SCREENING_FIELDS, SCREENING_FIELD_MAP } from "../screening/fieldCatalog";
import { getPresetById, SCREENING_PRESETS } from "../screening/presets";
import type { CompanySnapshot, ScreenDefinition, ScreenRule, ScreeningMode, ScreeningResult, UniverseType } from "../screening/types";

const WATCHLIST = ["AAPL", "MSFT", "BRK.B", "COST", "NVO"];

async function fetchJson(url: string) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Request failed"));
  }
  return payload;
}

function parseManualJson(value: string) {
  if (!value.trim()) {
    return {} as Record<string, Record<string, number>>;
  }
  try {
    return JSON.parse(value) as Record<string, Record<string, number>>;
  } catch {
    return {} as Record<string, Record<string, number>>;
  }
}

function asNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function unitLabel(unit: "percent" | "ratio" | "absolute" | "state") {
  if (unit === "percent") return "Value (%)";
  if (unit === "ratio") return "Value (x)";
  if (unit === "absolute") return "Value";
  return "Value";
}

function unitSuffix(unit: "percent" | "ratio" | "absolute" | "state") {
  if (unit === "percent") return "%";
  if (unit === "ratio") return "x";
  return "";
}

function liveInterpretation(fieldKey: string, value: string) {
  const numeric = asNumber(value);
  if (numeric === null) return null;
  if (fieldKey === "drawdown_20d") return `Matches stocks down at least ${numeric}% over last 20 days.`;
  if (fieldKey === "drawdown_60d") return `Matches stocks down at least ${numeric}% over last 60 days.`;
  if (fieldKey === "drawdown_252d") return `Matches stocks down at least ${numeric}% over last 252 days.`;
  if (fieldKey === "return_20d") return `Matches stocks with at least ${numeric}% return over last 20 days.`;
  if (fieldKey === "return_60d") return `Matches stocks with at least ${numeric}% return over last 60 days.`;
  return null;
}

function buildAdvancedScreen(rules: ScreenRule[]): ScreenDefinition {
  return {
    id: "advanced-custom",
    name: "Advanced custom screen",
    category: "Advanced",
    description: "Hypotesdriven screening via mustHave-regler (AND).",
    checks: ["Alla regler i mustHave måste passera"],
    ignores: ["Preset-opinionering"],
    requiredFields: rules.map((rule) => rule.field),
    optionalFields: [],
    fallback: "Saknade värden faller ut som fail i respektive regel.",
    rules: { mustHave: rules },
  };
}

async function loadSnapshot(ticker: string, manualData: Record<string, Record<string, number>>) {
  const [companyPayload, profilePayload, pricePayload] = await Promise.all([
    fetchJson(`/api/company?ticker=${encodeURIComponent(ticker)}&period=fy`).catch(() => null),
    fetchJson(`/api/company/profile?ticker=${encodeURIComponent(ticker)}`).catch(() => null),
    fetchJson(`/api/screening/price-snapshot?symbol=${encodeURIComponent(ticker)}`).catch(() => null),
  ]);

  if (!companyPayload || !Array.isArray(companyPayload.years)) {
    return null;
  }

  const snapshot: CompanySnapshot = {
    ticker,
    years: companyPayload.years,
    income: companyPayload.income ?? {},
    balance: companyPayload.balance ?? {},
    cashflow: companyPayload.cashflow ?? {},
    profile: profilePayload?.profile ?? null,
    manual: manualData[ticker] ?? {},
    price: pricePayload?.snapshot ?? null,
  };
  return snapshot;
}

export default function ScreeningDashboard() {
  const [mode, setMode] = useState<ScreeningMode>("simple");
  const [universe, setUniverse] = useState<UniverseType>("watchlist");
  const [presetId, setPresetId] = useState(SCREENING_PRESETS[0].id);
  const [sectorFilter, setSectorFilter] = useState("");
  const [manualTickers, setManualTickers] = useState("AAPL, MSFT");
  const [manualJson, setManualJson] = useState('{"AAPL":{"founderFlag":1},"MSFT":{"insiderScore":1}}');
  const [overrideValues, setOverrideValues] = useState<Record<string, string>>({});
  const [showManualOverrides, setShowManualOverrides] = useState(false);
  const [advancedRules, setAdvancedRules] = useState<ScreenRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScreeningResult[]>([]);
  const [sortBy, setSortBy] = useState<"score" | "ticker">("score");

  const preset = useMemo(() => getPresetById(presetId), [presetId]);

  const sortedResults = useMemo(() => {
    const next = [...results];
    if (sortBy === "score") {
      next.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
    } else {
      next.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }
    return next;
  }, [results, sortBy]);

  const activeScreen = useMemo(() => {
    if (mode === "advanced") {
      return buildAdvancedScreen(advancedRules);
    }
    return preset;
  }, [mode, preset, advancedRules]);

  const visibleColumns = useMemo(() => {
    const ruleFields = activeScreen.rules.mustHave.map((rule) => rule.field);
    const unique = [...new Set(ruleFields)].slice(0, 4);
    return unique;
  }, [activeScreen]);

  async function resolveUniverse(): Promise<string[]> {
    if (universe === "watchlist") {
      return WATCHLIST;
    }
    if (universe === "manual") {
      return manualTickers.split(",").map((ticker) => ticker.trim().toUpperCase()).filter(Boolean);
    }
    const payload = await fetchJson("/api/company/list");
    const list = Array.isArray(payload.tickers) ? payload.tickers.map((item: string) => String(item).toUpperCase()) : [];
    if (universe === "sector") {
      if (!sectorFilter.trim()) return [];
      const filtered: string[] = [];
      for (const ticker of list.slice(0, 40)) {
        const profilePayload = await fetchJson(`/api/company/profile?ticker=${encodeURIComponent(ticker)}`).catch(() => null);
        const sector = String(profilePayload?.profile?.sector ?? "").toLowerCase();
        if (sector.includes(sectorFilter.trim().toLowerCase())) {
          filtered.push(ticker);
        }
      }
      return filtered;
    }
    return list.slice(0, 40);
  }

  function resolveParams(screen: ScreenDefinition): Record<string, number> {
    const defaults = screen.defaults ?? {};
    const result: Record<string, number> = {};
    for (const [key, defaultValue] of Object.entries(defaults)) {
      const maybe = asNumber(overrideValues[key] ?? "");
      result[key] = maybe ?? defaultValue;
    }
    return result;
  }

  async function runScreening() {
    setLoading(true);
    setError(null);
    try {
      const tickers = await resolveUniverse();
      const manualData = parseManualJson(manualJson);
      const params = resolveParams(activeScreen);

      const snapshots = await Promise.all(tickers.map((ticker) => loadSnapshot(ticker, manualData)));
      const evaluated = snapshots
        .filter((snapshot): snapshot is CompanySnapshot => snapshot !== null)
        .map((snapshot) => {
          const score = evaluateScreen({ snapshot, screen: activeScreen, params });
          return {
            ticker: snapshot.ticker,
            presetId: activeScreen.id,
            matched: score.matched,
            score: score.score,
            includeReasons: score.includeReasons,
            excludeReasons: score.excludeReasons,
            metrics: score.metrics,
            ruleResults: score.ruleResults,
          } as ScreeningResult;
        });
      setResults(evaluated);
    } catch (err) {
      setError((err as Error).message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function openTicker(ticker: string) {
    window.dispatchEvent(new CustomEvent("screening:open-ticker", { detail: { ticker } }));
    window.location.hash = "singlestock";
  }

  function openPresetInAdvanced() {
    setAdvancedRules([...preset.rules.mustHave]);
    setMode("advanced");
  }

  function addAdvancedRule() {
    const field = SCREENING_FIELDS.find((item) => item.advanced)?.key ?? "return_20d";
    setAdvancedRules((prev) => [...prev, { id: `rule-${Date.now()}`, field, operator: ">", value: 0 }]);
  }

  function updateAdvancedRule(index: number, patch: Partial<ScreenRule>) {
    setAdvancedRules((prev) => prev.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)));
  }

  function removeAdvancedRule(index: number) {
    setAdvancedRules((prev) => prev.filter((_rule, idx) => idx !== index));
  }

  return (
    <div className="screening-dashboard">
      <div className="breadcontainersinglecolumn">
        <h3 className="subrub small">Screening är kandidatjakt, inte köp/sälj-signal</h3>
        <p className="bread">Snabbt läge för opinionerade presets, avancerat läge för hypotesdriven regelbyggnad — samma motor under huven.</p>
      </div>

      <div className="stock-selector-row form">
        <div>
          <label>Universe</label>
          <select value={universe} onChange={(event) => setUniverse(event.target.value as UniverseType)}>
            <option value="all">All</option>
            <option value="watchlist">Watchlist</option>
            <option value="sector">Sector</option>
            <option value="manual">Manual list</option>
          </select>
        </div>
        <div>
          <label>Mode</label>
          <select value={mode} onChange={(event) => setMode(event.target.value as ScreeningMode)}>
            <option value="simple">Simple</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
      </div>

      {universe === "sector" && (
        <div className="stock-selector-row form">
          <div>
            <label>Sector filter</label>
            <input value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value)} placeholder="e.g. Technology" />
          </div>
        </div>
      )}

      {universe === "manual" && (
        <div className="stock-selector-row form">
          <div>
            <label>Manual tickers</label>
            <input value={manualTickers} onChange={(event) => setManualTickers(event.target.value)} />
          </div>
        </div>
      )}

      {mode === "simple" ? (
        <>
          <div className="stock-selector-row form">
            <div>
              <label>Preset</label>
              <select value={presetId} onChange={(event) => setPresetId(event.target.value)}>
                {SCREENING_PRESETS.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Quick action</label>
              <button type="button" onClick={openPresetInAdvanced}>Öppna i avancerat läge</button>
            </div>
          </div>

          <div className="breadcontainersinglecolumn">
            <p className="bread"><strong>Preset:</strong> {preset.description}</p>
            <p className="bread"><strong>Detta tittar preset på:</strong> {preset.checks.join(" • ")}</p>
            <p className="bread"><strong>Detta ignorerar preset:</strong> {preset.ignores.join(" • ")}</p>
            <p className="bread"><strong>Fallback:</strong> {preset.fallback}</p>
          </div>

          {Object.keys(preset.defaults ?? {}).length > 0 && (
            <div className="stock-selector-row form">
              {Object.entries(preset.defaults ?? {}).slice(0, 4).map(([key, value]) => (
                <div key={key}>
                  <label>{key}</label>
                  <input
                    value={overrideValues[key] ?? String(value)}
                    onChange={(event) => setOverrideValues((prev) => ({ ...prev, [key]: event.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="breadcontainersinglecolumn">
            <p className="bread"><strong>Advanced:</strong> Bygg mustHave-regler (AND). Presets kan öppnas här och justeras.</p>
          </div>
          <div className="stock-selector-row">
            <button type="button" onClick={addAdvancedRule}>+ Lägg till regel</button>
          </div>

          {advancedRules.length === 0 && <p className="bread">Inga regler ännu. Lägg till en regel för att köra Advanced-screening.</p>}

          {advancedRules.map((rule, index) => (
            <div key={rule.id} className="stock-selector-row form">
              {(() => {
                const fieldDef = SCREENING_FIELD_MAP.get(rule.field);
                const suffix = unitSuffix(fieldDef?.unit ?? "absolute");
                const valueText = Array.isArray(rule.value) ? rule.value.join(",") : typeof rule.value === "object" ? "" : String(rule.value);
                return (
                  <>
              <div>
                <label>Field</label>
                <select value={rule.field} onChange={(event) => updateAdvancedRule(index, { field: event.target.value })}>
                  {SCREENING_FIELDS.filter((field) => field.advanced).map((field) => (
                    <option key={field.key} value={field.key}>{field.group.toUpperCase()} • {field.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Operator</label>
                <select value={rule.operator} onChange={(event) => updateAdvancedRule(index, { operator: event.target.value as ScreenRule["operator"] })}>
                  <option value=">">&gt;</option>
                  <option value=">=">&gt;=</option>
                  <option value="<">&lt;</option>
                  <option value="<=">&lt;=</option>
                  <option value="==">==</option>
                  <option value="!=">!=</option>
                  <option value="in">in (csv)</option>
                </select>
              </div>
              <div>
                <label>{unitLabel(fieldDef?.unit ?? "absolute")}</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    value={valueText}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      const asNum = Number(raw);
                      if (rule.operator === "in") {
                        updateAdvancedRule(index, { value: raw.split(",").map((item) => item.trim()).filter(Boolean) });
                      } else if (Number.isFinite(asNum)) {
                        updateAdvancedRule(index, { value: asNum });
                      } else {
                        updateAdvancedRule(index, { value: raw });
                      }
                    }}
                  />
                  {suffix && <span className="bread">{suffix}</span>}
                </div>
                {liveInterpretation(rule.field, valueText) && (
                  <p className="bread" style={{ marginTop: 6 }}>{liveInterpretation(rule.field, valueText)}</p>
                )}
              </div>
              <div>
                <label>&nbsp;</label>
                <button type="button" onClick={() => removeAdvancedRule(index)}>Ta bort</button>
              </div>
              {fieldDef && (
                <div style={{ width: "100%", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.04)", marginTop: 8 }}>
                  <p className="bread"><strong>{fieldDef.label}</strong></p>
                  {fieldDef.description && <p className="bread">{fieldDef.description}</p>}
                  {fieldDef.interpretation && <p className="bread">{fieldDef.interpretation}</p>}
                  {fieldDef.example && <p className="bread"><em>Exempel:</em> {fieldDef.example}</p>}
                </div>
              )}
                  </>
                );
              })()}
            </div>
          ))}
        </>
      )}

      <div className="breadcontainersinglecolumn">
        <button type="button" onClick={() => setShowManualOverrides((prev) => !prev)}>
          {showManualOverrides ? "Dölj" : "Visa"} Analyst / Manual overrides
        </button>
      </div>

      {showManualOverrides && (
        <div className="stock-selector-row form">
          <div style={{ width: "100%" }}>
            <label>Manual JSON input (per ticker metrics)</label>
            <textarea
              className="manual-json"
              value={manualJson}
              onChange={(event) => setManualJson(event.target.value)}
            />
          </div>
        </div>
      )}

      <div className="stock-selector-row">
        <button type="button" onClick={() => void runScreening()} disabled={loading}>
          {loading ? "Kör screening..." : "Kör screening"}
        </button>
        <label>Sortera</label>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value as "score" | "ticker")}>
          <option value="score">Score</option>
          <option value="ticker">Ticker</option>
        </select>
      </div>

      {error && <p className="status error">{error}</p>}

      <div className="viewer-table">
        {sortedResults.length === 0 && !loading ? (
          <p className="status empty">Inga resultat ännu. Kör en screen för att se kandidater.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="sticky-col">Ticker</th>
                  <th>Score</th>
                  <th>Pass/Fail</th>
                  <th>Why included</th>
                  <th>Why excluded</th>
                  {visibleColumns.map((column) => <th key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((result) => (
                  <tr key={`${result.presetId}-${result.ticker}`}>
                    <td className="sticky-col">
                      <button type="button" onClick={() => openTicker(result.ticker)}>{result.ticker}</button>
                    </td>
                    <td>{result.score.toFixed(1)}</td>
                    <td>{result.matched ? "Pass" : "Fail"}</td>
                    <td>{result.includeReasons.slice(0, 2).join(" ") || "-"}</td>
                    <td>{result.excludeReasons.slice(0, 2).join(" ") || "-"}</td>
                    {visibleColumns.map((column) => {
                      const metric = result.metrics.find((item) => item.key === column);
                      return <td key={`${result.ticker}-${column}`}>{metric?.value === null || metric?.value === undefined ? "-" : String(metric.value)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
