import { useMemo, useState } from "react";
import { getPresetById, SCREENING_PRESETS } from "../screening/presets";
import type { CompanySnapshot, ScreeningResult, UniverseType } from "../screening/types";

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
    const parsed = JSON.parse(value) as Record<string, Record<string, number>>;
    return parsed;
  } catch {
    return {} as Record<string, Record<string, number>>;
  }
}

async function loadSnapshot(ticker: string, manualData: Record<string, Record<string, number>>) {
  const [companyPayload, profilePayload] = await Promise.all([
    fetchJson(`/api/company?ticker=${encodeURIComponent(ticker)}&period=fy`).catch(() => null),
    fetchJson(`/api/company/profile?ticker=${encodeURIComponent(ticker)}`).catch(() => null),
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
  };
  return snapshot;
}

export default function ScreeningDashboard() {
  // Screening in this instrumentbräda is an explainable candidate finder:
  // choose universe -> choose preset -> optional params -> execute -> see include/exclude reasons -> click through.
  const [universe, setUniverse] = useState<UniverseType>("watchlist");
  const [presetId, setPresetId] = useState(SCREENING_PRESETS[0].id);
  const [sectorFilter, setSectorFilter] = useState("");
  const [manualTickers, setManualTickers] = useState("AAPL, MSFT");
  const [paramValue, setParamValue] = useState("2");
  const [manualJson, setManualJson] = useState('{"AAPL":{"founderFlag":1},"MSFT":{"insiderScore":1}}');
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

  async function runScreening() {
    setLoading(true);
    setError(null);
    try {
      const tickers = await resolveUniverse();
      const manualData = parseManualJson(manualJson);
      const params: Record<string, number> = {};
      if (preset.defaults) {
        Object.entries(preset.defaults).forEach(([key, value]) => {
          params[key] = Number.isFinite(Number(paramValue)) ? Number(paramValue) : value;
        });
      }

      const snapshots = await Promise.all(tickers.map((ticker) => loadSnapshot(ticker, manualData)));
      const evaluated = snapshots
        .filter((snapshot): snapshot is CompanySnapshot => snapshot !== null)
        .map((snapshot) => {
          const score = preset.evaluate(snapshot, params);
          return {
            ticker: snapshot.ticker,
            presetId: preset.id,
            matched: score.matched,
            score: score.score,
            includeReasons: score.includeReasons,
            excludeReasons: score.excludeReasons,
            metrics: score.metrics,
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

  return (
    <div className="screening-dashboard">
      <div className="breadcontainersinglecolumn">
        <h3 className="subrub small">Screening är kandidatjakt, inte köp/sälj-signal</h3>
        <p className="bread">
          Flöde: välj universum → välj preset → justera parameter (valfritt) → kör → läs varför
          bolag inkluderades/exkluderades → klicka vidare till Single Stock Dashboard.
        </p>
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
          <label>Preset</label>
          <select value={presetId} onChange={(event) => setPresetId(event.target.value)}>
            {SCREENING_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Parameter override</label>
          <input value={paramValue} onChange={(event) => setParamValue(event.target.value)} />
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

      <div className="breadcontainersinglecolumn">
        <p className="bread"><strong>Preset:</strong> {preset.description}</p>
        <p className="bread"><strong>Checks:</strong> {preset.checks.join(" • ")}</p>
        <p className="bread"><strong>Ignores:</strong> {preset.ignores.join(" • ")}</p>
        <p className="bread"><strong>Fallback:</strong> {preset.fallback}</p>
        <p className="bread"><strong>Required fields:</strong> {preset.requiredFields.join(", ")}</p>
      </div>

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
          <p className="status empty">Inga resultat ännu. Kör en preset för att se förklarade kandidater.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="sticky-col">Ticker</th>
                  <th>Score</th>
                  <th>Matched</th>
                  <th>Why included</th>
                  <th>Why excluded</th>
                  <th>Why did this match?</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((result) => (
                  <tr key={`${result.presetId}-${result.ticker}`}>
                    <td className="sticky-col">
                      <button type="button" onClick={() => openTicker(result.ticker)}>{result.ticker}</button>
                    </td>
                    <td>{result.score.toFixed(1)}</td>
                    <td>{result.matched ? "Ja" : "Nej"}</td>
                    <td>{result.includeReasons.join(" ") || "-"}</td>
                    <td>{result.excludeReasons.join(" ") || "-"}</td>
                    <td>
                      {result.metrics.map((item) => (
                        <div key={item.key}>
                          {item.label}: {item.value === null ? `(${item.state})` : item.value.toFixed(2)}
                        </div>
                      ))}
                    </td>
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
