import { useEffect, useMemo, useState } from 'react';
import type { ProducerPeerTable } from '../lib/miningProducer/peerTable.ts';
import type { ReportedMetric } from '../lib/miningProducer/types.ts';
import '../styles/producerCompare.css';

type ProducerPeerApiResponse =
  | {
      ok: true;
      dataset: { companies: string[]; symbols?: string[]; sourceContract: string };
      table: ProducerPeerTable;
      liveDiagnosticsByCompanyId: Record<string, string[]>;
    }
  | {
      ok: false;
      error: string;
      diagnostics?: string[];
    };

function formatCompact(value: number | null, suffix = ''): string {
  if (value === null || !Number.isFinite(value)) return 'Ej beräkningsbart';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} md${suffix}`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M${suffix}`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)} k${suffix}`;
  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}${suffix}`;
}

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Ej beräkningsbart';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)} md`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)} M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)} k`;
  return `$${value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })}`;
}

function formatMultiple(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'Ej beräkningsbart' : `${value.toFixed(2)}×`;
}

function formatClaim(metric: ReportedMetric | null): string {
  if (!metric) return 'Ej redovisat';
  const claim = metric.value;
  const unit = metric.unit === 'USD_per_toz_sold' ? '$/oz sold' : metric.unit;
  switch (claim.kind) {
    case 'point': return `${claim.value.toLocaleString('sv-SE')} ${unit}`;
    case 'approximate': return `~${claim.value.toLocaleString('sv-SE')} ${unit}`;
    case 'range': return `${claim.low.toLocaleString('sv-SE')}–${claim.high.toLocaleString('sv-SE')} ${unit}`;
    case 'upper_bound': return `<${claim.value.toLocaleString('sv-SE')} ${unit}`;
    case 'lower_bound': return `>${claim.value.toLocaleString('sv-SE')} ${unit}`;
  }
}

function priceUnitLabel(unit: string): string {
  if (unit === 'USD_per_toz') return '$/oz';
  if (unit === 'USD_per_tonne') return '$/t';
  if (unit === 'USD_per_lb') return '$/lb';
  return unit;
}

function qualityLabel(value: string): string {
  switch (value) {
    case 'exact': return 'Exakt';
    case 'approximation': return 'Approx.';
    case 'reported_only': return 'Rapporterad';
    default: return 'Ej beräkningsbart';
  }
}

export default function ProducerCompareDashboard() {
  const [year, setYear] = useState(2030);
  const [priceMode, setPriceMode] = useState<'SPOT' | 'LT' | 'REPORTED'>('SPOT');
  const [caseMode, setCaseMode] = useState<'BASE' | 'GROWTH'>('BASE');
  const [editorSymbol, setEditorSymbol] = useState('');
  const [data, setData] = useState<ProducerPeerApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    const params = new URLSearchParams({
      year: String(year),
      price: priceMode,
      case: caseMode,
    });

    fetch(`/api/producer/peers?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as ProducerPeerApiResponse;
        setData(body);
      })
      .catch((error: unknown) => {
        if ((error as Error)?.name === 'AbortError') return;
        setData({ ok: false, error: error instanceof Error ? error.message : 'Producer API request failed' });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [year, priceMode, caseMode]);

  const priceDeckRows = useMemo(() => {
    if (!data?.ok) return [];
    return Object.entries(data.table.priceDecksByCompanyId).map(([companyId, deck]) => ({ companyId, deck }));
  }, [data]);

  const symbolByCompanyId = useMemo(() => {
    if (!data?.ok) return new Map<string, string>();
    const symbols = data.dataset.symbols ?? [];
    return new Map(data.dataset.companies.map((companyId, index) => [companyId, symbols[index] ?? '']));
  }, [data]);

  function openCorporateEditor(symbol: string): void {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;
    window.location.href = `/company/${encodeURIComponent(normalized)}/corporate`;
  }

  return (
    <div className="producer-compare">
      <div className="producer-compare__editor-launcher">
        <div>
          <strong>CORPORATE JSON</strong>
          <div>Endast bolag med sparad producer_json_v1 visas i jämförelsen.</div>
        </div>
        <input
          value={editorSymbol}
          placeholder="Ticker, t.ex. BTO"
          onChange={(event) => setEditorSymbol(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === 'Enter') openCorporateEditor(editorSymbol);
          }}
        />
        <button type="button" disabled={!editorSymbol.trim()} onClick={() => openCorporateEditor(editorSymbol)}>
          Öppna / skapa JSON
        </button>
      </div>

      <div className="producer-compare__controls">
        <label>
          <span>ÅR</span>
          <input
            type="number"
            min={2024}
            max={2200}
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          />
        </label>
        <label>
          <span>PRIS</span>
          <select value={priceMode} onChange={(event) => setPriceMode(event.target.value as 'SPOT' | 'LT' | 'REPORTED')}>
            <option value="SPOT">SPOT</option>
            <option value="LT" disabled>LT — ej konfigurerad</option>
            <option value="REPORTED">REPORTED</option>
          </select>
        </label>
        <label>
          <span>CASE</span>
          <select value={caseMode} onChange={(event) => setCaseMode(event.target.value as 'BASE' | 'GROWTH')}>
            <option value="BASE">BASE</option>
            <option value="GROWTH">GROWTH</option>
          </select>
        </label>
      </div>

      {loading && <div className="producer-compare__state">Laddar Producer Model…</div>}

      {data && !data.ok && (
        <div className="producer-compare__error">
          <strong>{data.error}</strong>
          {data.diagnostics?.map((item) => <div key={item}>{item}</div>)}
        </div>
      )}

      {data?.ok && (
        <>
          <div className="producer-compare__basis">
            <div>
              <strong>{data.table.priceMode}</strong> · {data.table.caseMode} · {data.table.selectedYear} · värderingsdatum {data.table.valuationDateUtc}
            </div>
            <div>
              {data.table.comparisonBasis === 'canonical_shared_deck'
                ? 'Gemensamt kanoniskt prisdeck — apples-to-apples.'
                : 'Rapporterade prisdeck — inte apples-to-apples.'}
            </div>
          </div>

          {data.table.rows.length === 0 && (
            <div className="producer-compare__state">
              Inga Corporate Producer JSON är sparade. Ange ett ticker ovan och skapa producer_json_v1.
            </div>
          )}

          <div className="producer-compare__decks">
            {priceDeckRows.map(({ companyId, deck }) => (
              <div className="producer-compare__deck" key={companyId}>
                <strong>{companyId.toUpperCase()}</strong>
                <span>{deck.id}</span>
                {Object.entries(deck.pricesByMetal).map(([metal, price]) => (
                  <span key={metal}>
                    {metal}: {price.valueUSD === null ? 'Ej beräkningsbart' : `${price.valueUSD.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} ${priceUnitLabel(price.unit)}`}
                  </span>
                ))}
              </div>
            ))}
          </div>

          {data.table.rows.length > 0 && (
            <div className="producer-compare__table-wrap">
              <table className="producer-compare__table">
                <thead>
                  <tr>
                    <th>Bolag</th>
                    <th>Au</th>
                    <th>AuEq</th>
                    <th>Källa / kvalitet</th>
                    <th>Revenue</th>
                    <th>Cash cost</th>
                    <th>AISC</th>
                    <th>EBITDA</th>
                    <th>FCFF före growth</th>
                    <th>FCFF efter growth</th>
                    <th>Growth CAPEX</th>
                    <th>Market Cap</th>
                    <th>EV</th>
                    <th>MCap / Au</th>
                    <th>MCap / AuEq</th>
                    <th>EV / EBITDA</th>
                    <th>EV / FCFF före growth</th>
                    <th>EV / FCFF efter growth</th>
                    <th>Diagnostik</th>
                  </tr>
                </thead>
                <tbody>
                  {data.table.rows.map((row) => {
                    const symbol = symbolByCompanyId.get(row.companyId) ?? '';
                    return (
                      <tr key={row.companyId}>
                        <td className="producer-compare__company">
                          <div>{row.companyName}</div>
                          {symbol && <button type="button" onClick={() => openCorporateEditor(symbol)}>Redigera JSON</button>}
                        </td>
                        <td>{formatCompact(row.auOz, ' oz')}</td>
                        <td>{formatCompact(row.auEqOz, ' oz')}</td>
                        <td>
                          <div>{row.productionEstimateClasses.length > 0 ? row.productionEstimateClasses.join(', ') : 'Saknas'}</div>
                          <span className={`producer-compare__quality producer-compare__quality--${row.productionQuality}`}>
                            {qualityLabel(row.productionQuality)}
                          </span>
                        </td>
                        <td>{formatUsd(row.revenueUSD)}</td>
                        <td>
                          <div>{formatClaim(row.reportedCashCost)}</div>
                          <small>Kanonisk/AuEq: {formatUsd(row.canonicalCashOperatingCostPerAuEqUSD)}</small>
                        </td>
                        <td>{formatClaim(row.reportedAisc)}</td>
                        <td>{formatUsd(row.ebitdaUSD)}</td>
                        <td>{formatUsd(row.fcffBeforeGrowthUSD)}</td>
                        <td>{formatUsd(row.fcffAfterGrowthUSD)}</td>
                        <td>{formatUsd(row.growthCapexUSD)}</td>
                        <td>{formatUsd(row.marketCapUSD)}</td>
                        <td>{formatUsd(row.enterpriseValueUSD)}</td>
                        <td>{row.marketCapPerAuOzUSD === null ? 'Ej beräkningsbart' : `${formatUsd(row.marketCapPerAuOzUSD)}/oz`}</td>
                        <td>{row.marketCapPerAuEqOzUSD === null ? 'Ej beräkningsbart' : `${formatUsd(row.marketCapPerAuEqOzUSD)}/oz`}</td>
                        <td>{formatMultiple(row.evToEbitda)}</td>
                        <td>{formatMultiple(row.evToFcffBeforeGrowth)}</td>
                        <td>{formatMultiple(row.evToFcffAfterGrowth)}</td>
                        <td>
                          <details>
                            <summary>{row.diagnostics.length} poster</summary>
                            <ul>
                              {row.diagnostics.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="producer-compare__footnote">
            EBITDA och FCFF är kanoniska Producer-mått. EV/EBITDA och EV/FCFF är huvudmultiplar. Market Cap/EBITDA och Market Cap/FCFF beräknas i motorn men visas inte som standard eftersom de blandar equity value med enterprise/unlevered resultatmått.
          </div>
        </>
      )}
    </div>
  );
}
