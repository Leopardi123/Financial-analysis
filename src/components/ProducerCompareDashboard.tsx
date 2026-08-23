import { useEffect, useMemo, useState } from 'react';
import type { ProducerPeerTable, ProducerProductionEvidence } from '../lib/miningProducer/peerTable.ts';
import type { NumericClaim, ReportedMetric } from '../lib/miningProducer/types.ts';
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

type NumericRange = { low: number; high: number };

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

function formatUsdRange(range: NumericRange): string {
  return range.low === range.high ? formatUsd(range.low) : `${formatUsd(range.low)}–${formatUsd(range.high)}`;
}

function formatUsdPerOzRange(range: NumericRange): string {
  const low = `$${range.low.toLocaleString('sv-SE', { maximumFractionDigits: 0 })}`;
  const high = `$${range.high.toLocaleString('sv-SE', { maximumFractionDigits: 0 })}`;
  return range.low === range.high ? `${low}/oz` : `${low}–${high}/oz`;
}

function formatMultiple(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'Ej beräkningsbart' : `${value.toFixed(2)}×`;
}

function displayUnit(unit: string): string {
  if (unit === 'USD_per_toz_sold') return '$/oz sold';
  if (unit === 'USD_per_toz_produced') return '$/oz produced';
  if (unit === 'USD_per_toz') return '$/oz';
  if (unit === 'USD') return 'USD';
  return unit;
}

function formatNumericClaim(claim: NumericClaim, unit: string): string {
  const suffix = unit ? ` ${displayUnit(unit)}` : '';
  switch (claim.kind) {
    case 'point': return `${claim.value.toLocaleString('sv-SE')}${suffix}`;
    case 'approximate': return `~${claim.value.toLocaleString('sv-SE')}${suffix}`;
    case 'range': return `${claim.low.toLocaleString('sv-SE')}–${claim.high.toLocaleString('sv-SE')}${suffix}`;
    case 'upper_bound': return `<${claim.value.toLocaleString('sv-SE')}${suffix}`;
    case 'lower_bound': return `>${claim.value.toLocaleString('sv-SE')}${suffix}`;
  }
}

function formatClaim(metric: ReportedMetric | null): string {
  if (!metric) return 'Ej redovisat';
  return formatNumericClaim(metric.value, metric.unit);
}

function claimToClosedRange(claim: NumericClaim): NumericRange | null {
  if (claim.kind === 'point' || claim.kind === 'approximate') return { low: claim.value, high: claim.value };
  if (claim.kind === 'range') return { low: claim.low, high: claim.high };
  return null;
}

function reportedProductionToAuOzRange(metric: ReportedMetric | null): NumericRange | null {
  if (!metric || metric.metric !== 'production') return null;
  const raw = claimToClosedRange(metric.value);
  if (!raw) return null;
  let factor: number;
  if (metric.unit === 'toz' || metric.unit === 'oz') factor = 1;
  else if (metric.unit === 'koz') factor = 1_000;
  else if (metric.unit === 'Moz') factor = 1_000_000;
  else return null;
  return { low: raw.low * factor, high: raw.high * factor };
}

function reportedPerOzRange(metric: ReportedMetric | null): NumericRange | null {
  if (!metric) return null;
  if (!['USD_per_toz', 'USD_per_toz_sold', 'USD_per_toz_produced', '$/oz', '$/oz sold', '$/oz produced'].includes(metric.unit)) return null;
  return claimToClosedRange(metric.value);
}

function multiplyPositiveRanges(a: NumericRange, b: NumericRange): NumericRange {
  return { low: a.low * b.low, high: a.high * b.high };
}

function subtractRanges(a: NumericRange, b: NumericRange): NumericRange {
  return { low: a.low - b.high, high: a.high - b.low };
}

function marketCapPerProductionRange(marketCapUSD: number, productionOz: NumericRange): NumericRange | null {
  if (!Number.isFinite(marketCapUSD) || marketCapUSD < 0 || productionOz.low <= 0 || productionOz.high <= 0) return null;
  return {
    low: marketCapUSD / productionOz.high,
    high: marketCapUSD / productionOz.low,
  };
}

function formatEvidencePeriod(item: ProducerProductionEvidence): string {
  const period = item.period;
  if (period.kind === 'year') return String(period.year);
  if (period.kind === 'year_range_average') return `snitt ${period.startYear}–${period.endYear}`;
  if (period.kind === 'year_range_total') return `summa ${period.startYear}–${period.endYear}`;
  return `ej periodiserat: ${period.label}`;
}

function evidenceBasisLabel(item: ProducerProductionEvidence): string {
  return item.basis === 'project_100pct' ? '100% projekt' : 'attributable';
}

function ProductionEvidenceList({ items }: { items: ProducerProductionEvidence[] }) {
  if (items.length === 0) return <span>Ej beräkningsbart</span>;
  return (
    <div className="producer-compare__evidence-list">
      {items.map((item) => (
        <div className="producer-compare__evidence-item" key={`${item.projectId}-${item.sourceId}-${JSON.stringify(item.period)}`}>
          <strong>{item.projectName}: {formatNumericClaim(item.quantity, item.unit)}</strong>
          <small>{formatEvidencePeriod(item)} · {evidenceBasisLabel(item)} · {item.estimateClass}</small>
        </div>
      ))}
    </div>
  );
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
    case 'reported_only': return 'Rapporterad / evidens';
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
          placeholder="Ticker, t.ex. BTO.TO"
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
                    const auEvidence = row.productionEvidence.filter((item) => item.metal === 'Au' && item.measure === 'produced');
                    const deck = data.table.priceDecksByCompanyId[row.companyId];
                    const reportedAuRange = reportedProductionToAuOzRange(row.reportedProduction);
                    const selectedAuPrice = deck?.pricesByMetal.Au;
                    const reportedRevenueProxy = reportedAuRange && selectedAuPrice?.valueUSD !== null && selectedAuPrice?.valueUSD !== undefined && selectedAuPrice.unit === 'USD_per_toz'
                      ? multiplyPositiveRanges(reportedAuRange, { low: selectedAuPrice.valueUSD, high: selectedAuPrice.valueUSD })
                      : null;
                    const reportedCashCostPerOz = reportedPerOzRange(row.reportedCashCost);
                    const reportedAiscPerOz = reportedPerOzRange(row.reportedAisc);
                    const reportedCashCostSpend = reportedAuRange && reportedCashCostPerOz
                      ? multiplyPositiveRanges(reportedAuRange, reportedCashCostPerOz)
                      : null;
                    const reportedAiscSpend = reportedAuRange && reportedAiscPerOz
                      ? multiplyPositiveRanges(reportedAuRange, reportedAiscPerOz)
                      : null;
                    const operatingCashMarginProxy = reportedRevenueProxy && reportedCashCostSpend
                      ? subtractRanges(reportedRevenueProxy, reportedCashCostSpend)
                      : null;
                    const aiscMarginProxy = reportedRevenueProxy && reportedAiscSpend
                      ? subtractRanges(reportedRevenueProxy, reportedAiscSpend)
                      : null;
                    const marketCapPerReportedAu = row.marketCapUSD !== null && reportedAuRange
                      ? marketCapPerProductionRange(row.marketCapUSD, reportedAuRange)
                      : null;
                    return (
                      <tr key={row.companyId}>
                        <td className="producer-compare__company">
                          <div>{row.companyName}</div>
                          {symbol && <button type="button" onClick={() => openCorporateEditor(symbol)}>Redigera JSON</button>}
                        </td>
                        <td className="producer-compare__evidence-cell">
                          {row.auOz !== null ? formatCompact(row.auOz, ' oz') : row.reportedProduction ? (
                            <div className="producer-compare__evidence-item">
                              <strong>{formatClaim(row.reportedProduction)}</strong>
                              <small>Rapporterad bolagsproduktion · ej omräknad till kanonisk attributable Au</small>
                            </div>
                          ) : <ProductionEvidenceList items={auEvidence} />}
                        </td>
                        <td className="producer-compare__evidence-cell">
                          {row.auEqOz !== null ? formatCompact(row.auEqOz, ' oz') : row.reportedAuEq ? (
                            <div className="producer-compare__evidence-item">
                              <strong>{formatClaim(row.reportedAuEq)}</strong>
                              <small>Rapporterad AuEq · ej kanonisk fysisk AuEq</small>
                            </div>
                          ) : reportedAuRange ? (
                            <div className="producer-compare__evidence-item">
                              <strong>{formatClaim(row.reportedProduction)}</strong>
                              <small>Au-only reported production proxy · ej fysisk kanonisk AuEq</small>
                            </div>
                          ) : 'Ej beräkningsbart'}
                        </td>
                        <td>
                          <div>{row.productionEstimateClasses.length > 0 ? row.productionEstimateClasses.join(', ') : 'Saknas'}</div>
                          <span className={`producer-compare__quality producer-compare__quality--${row.productionQuality}`}>
                            {qualityLabel(row.productionQuality)}
                          </span>
                        </td>
                        <td className="producer-compare__evidence-cell">
                          {row.revenueUSD !== null ? formatUsd(row.revenueUSD) : row.reportedRevenue ? (
                            <div className="producer-compare__evidence-item">
                              <strong>{formatClaim(row.reportedRevenue)}</strong>
                              <small>Rapporterad revenue · ej reprissatt SPOT</small>
                            </div>
                          ) : reportedRevenueProxy ? (
                            <div className="producer-compare__evidence-item">
                              <strong>{formatUsdRange(reportedRevenueProxy)}</strong>
                              <small>Rapporterad Au-range × valt {data.table.priceMode}-pris · proxy, ej canonical attributable revenue</small>
                            </div>
                          ) : 'Ej beräkningsbart'}
                        </td>
                        <td>
                          <div>{formatClaim(row.reportedCashCost)}</div>
                          <small>Kanonisk/AuEq: {formatUsd(row.canonicalCashOperatingCostPerAuEqUSD)}</small>
                        </td>
                        <td>{formatClaim(row.reportedAisc)}</td>
                        <td className="producer-compare__evidence-cell">
                          {row.ebitdaUSD !== null ? formatUsd(row.ebitdaUSD) : row.reportedEbitda ? (
                            <div className="producer-compare__evidence-item">
                              <strong>{formatClaim(row.reportedEbitda)}</strong>
                              <small>Rapporterad EBITDA · ej kanonisk Producer-EBITDA</small>
                            </div>
                          ) : operatingCashMarginProxy ? (
                            <div className="producer-compare__evidence-item">
                              <strong>{formatUsdRange(operatingCashMarginProxy)}</strong>
                              <small>Cash-margin proxy = selected-price revenue − reported cash cost × reported production. Före royalty/G&A m.m.; <strong>inte EBITDA</strong>.</small>
                            </div>
                          ) : 'Ej beräkningsbart'}
                        </td>
                        <td className="producer-compare__evidence-cell">
                          {row.fcffBeforeGrowthUSD !== null ? formatUsd(row.fcffBeforeGrowthUSD) : row.reportedFcf ? (
                            <div className="producer-compare__evidence-item">
                              <strong>{formatClaim(row.reportedFcf)}</strong>
                              <small>Rapporterad FCF · visas som evidens, ersätter inte FCFF</small>
                            </div>
                          ) : aiscMarginProxy ? (
                            <div className="producer-compare__evidence-item">
                              <strong>{formatUsdRange(aiscMarginProxy)}</strong>
                              <small>AISC-margin proxy = selected-price revenue − reported AISC × reported production. Före cash tax/WC och med denominator-risk; <strong>inte FCFF</strong>.</small>
                            </div>
                          ) : 'Ej beräkningsbart'}
                        </td>
                        <td>{formatUsd(row.fcffAfterGrowthUSD)}</td>
                        <td>{formatUsd(row.growthCapexUSD)}</td>
                        <td>{formatUsd(row.marketCapUSD)}</td>
                        <td>{formatUsd(row.enterpriseValueUSD)}</td>
                        <td className="producer-compare__evidence-cell">
                          {row.marketCapPerAuOzUSD !== null ? `${formatUsd(row.marketCapPerAuOzUSD)}/oz` : marketCapPerReportedAu ? (
                            <div className="producer-compare__evidence-item">
                              <strong>{formatUsdPerOzRange(marketCapPerReportedAu)}</strong>
                              <small>MCap / rapporterad Au-range · ej canonical attributable multiple</small>
                            </div>
                          ) : 'Ej beräkningsbart'}
                        </td>
                        <td className="producer-compare__evidence-cell">
                          {row.marketCapPerAuEqOzUSD !== null ? `${formatUsd(row.marketCapPerAuEqOzUSD)}/oz` : marketCapPerReportedAu ? (
                            <div className="producer-compare__evidence-item">
                              <strong>{formatUsdPerOzRange(marketCapPerReportedAu)}</strong>
                              <small>Au-only proxy för MCap/AuEq · ej kanonisk fysisk AuEq</small>
                            </div>
                          ) : 'Ej beräkningsbart'}
                        </td>
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
            Stora numeriska värden är kanoniska Producer-mått. När kanonisk aggregering inte är möjlig visas rapporterad range/target som evidens i stället för att midpointas eller annualiseras. Revenue-proxy, cash-margin-proxy och AISC-margin-proxy märks uttryckligen som proxy och används aldrig i kanoniska EV-multiplar. EBITDA och FCFF blir först kanoniska när JSON uppfyller den dokumenterade input-bron.
          </div>
        </>
      )}
    </div>
  );
}
