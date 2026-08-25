import { useEffect, useMemo, useState } from 'react';
import ProducerCompareDashboard from './ProducerCompareDashboard.tsx';
import { listCompanyProjects, type CompanyProjectSummary } from '../lib/client/companyProjectsClient.ts';
import type { CorporateSnapshot } from '../lib/corporate/snapshot/types.ts';
import '../styles/compareStocks.css';

type CompareTab = 'producer' | 'pre-revenue';
type MetricKey = 'pNav' | 'evNav' | 'evEbitdaPeak' | 'targetPrice' | 'annualReturn' | 'tier' | 'irr' | 'payback' | 'lom' | 'initialCapex' | 'capexAnnualAueq' | 'annualAueq' | 'aueq10y' | 'aueqLom' | 'inSituAueq' | 'aueqPerShare' | 'mcap10yAueq' | 'mcapLomAueq' | 'evLomAueq';
type MetricColumn = readonly [key: MetricKey, label: string, help: string];
type MetricGroup = { label: string; columns: readonly MetricColumn[] };

type CompanyListResponse = { ok: boolean; companies?: Array<{ ticker: string; name: string }> };
type ProfileResponse = { ok?: boolean; profile?: Record<string, unknown> | null };
type CompanyResponse = { balance?: Record<string, Array<number | null>>; income?: Record<string, Array<number | null>> };
type SnapshotResponse = { ok: boolean; snapshot?: CorporateSnapshot & Record<string, unknown>; diagnostics?: { errors?: string[]; warnings?: string[] } };

type PreRevenueCompany = {
  ticker: string;
  name: string;
  projects: CompanyProjectSummary[];
  snapshot: (CorporateSnapshot & Record<string, unknown>) | null;
  price: number | null;
  sharesCurrent: number | null;
  targetCurrency: string | null;
  productionStartYear: number | null;
  metricError: string | null;
};

const METRIC_GROUPS: readonly MetricGroup[] = [
  { label: 'VÄRDERING IDAG', columns: [
    ['pNav', 'P/NAV', 'Corporate P/NAV'],
    ['evNav', 'EV/NAV', 'Corporate EV/NAV'],
    ['evEbitdaPeak', 'EV/EBITDA peak', 'Högsta/base EV/EBITDA från Corporate-värderingen'],
  ] },
  { label: 'TARGET / RE-RATING', columns: [
    ['targetPrice', 'Target / pris', 'Corporate target price relativt dagens pris'],
    ['annualReturn', 'Årlig avk. → prod.', 'Annualiserad utveckling från dagens pris till Corporate target vid produktion'],
  ] },
  { label: 'PROJEKTKVALITET', columns: [
    ['tier', 'Tier', 'Project tier'],
    ['irr', 'IRR', 'Kanonisk Corporate IRR'],
    ['payback', 'Payback', 'Kanonisk Corporate payback'],
    ['lom', 'LOM', 'Life of mine från Corporate produktionsserie'],
    ['initialCapex', 'Initial CAPEX', 'Initial construction CAPEX från Corporate canonical timeline'],
    ['capexAnnualAueq', 'CAPEX / annual AuEq', 'Kanonisk Corporate Lista 3-metrik'],
  ] },
  { label: 'SKALA', columns: [
    ['annualAueq', 'Annual AuEq', 'Genomsnittlig årlig payable AuEq-produktion'],
    ['aueq10y', '10y AuEq', 'Corporate AuEq under de första tio produktionsåren'],
    ['aueqLom', 'LOM AuEq', 'Corporate payable AuEq över LOM'],
    ['inSituAueq', 'In-situ AuEq', 'Geologisk in-situ AuEq; visas endast när Corporate exponerar måttet kanoniskt'],
    ['aueqPerShare', 'AuEq / aktie', 'In-situ AuEq per aktie; visas endast när Corporate exponerar måttet kanoniskt'],
  ] },
  { label: 'RELATIV VÄRDERING', columns: [
    ['mcap10yAueq', 'MCap / 10y AuEq', 'Market cap per Corporate 10y payable AuEq'],
    ['mcapLomAueq', 'MCap / LOM AuEq', 'Market cap per Corporate LOM payable AuEq'],
    ['evLomAueq', 'EV / LOM AuEq', 'Enterprise value per Corporate LOM payable AuEq'],
  ] },
];

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const readFinite = (value: unknown): number | null => finite(value) ? value : null;
const lastFinite = (values: Array<number | null> | undefined): number | null => {
  if (!Array.isArray(values)) return null;
  for (let i = values.length - 1; i >= 0; i -= 1) if (finite(values[i])) return values[i] as number;
  return null;
};

function resolveShares(statements: CompanyResponse): number | null {
  const candidates = [
    statements.balance?.commonStockSharesOutstanding,
    statements.balance?.commonStockSharesIssued,
    statements.income?.weightedAverageShsOutDil,
    statements.income?.weightedAverageShsOut,
  ];
  for (const series of candidates) {
    const value = lastFinite(series);
    if (value !== null && value > 0) return value;
  }
  return null;
}

function formatNumber(value: number | null, digits = 2): string {
  if (!finite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('sv-SE', { maximumFractionDigits: 1 })}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('sv-SE', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${(value / 1_000).toLocaleString('sv-SE', { maximumFractionDigits: 1 })}k`;
  return value.toLocaleString('sv-SE', { maximumFractionDigits: digits });
}
const formatPct = (value: number | null) => finite(value) ? `${(value * 100).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} %` : '—';
const formatMultiple = (value: number | null) => finite(value) ? `${value.toLocaleString('sv-SE', { maximumFractionDigits: 2 })}x` : '—';
const formatMoney = (value: number | null, currency: string | null) => finite(value) ? `${formatNumber(value)}${currency ? ` ${currency}` : ''}` : '—';

function sumPositive(values: Array<number | null> | undefined): { sum: number; count: number } | null {
  if (!Array.isArray(values)) return null;
  let sum = 0; let count = 0;
  for (const value of values) if (finite(value) && value > 0) { sum += value; count += 1; }
  return count > 0 ? { sum, count } : null;
}

function firstProductionYear(snapshot: CorporateSnapshot): number | null {
  const years = snapshot.series?.yearsByPeriod ?? snapshot.aggregation?.corporateYearsByPeriod ?? [];
  const aueq = snapshot.aggregation?.payableAuEqOz_total ?? [];
  for (let i = 0; i < aueq.length; i += 1) if (finite(aueq[i]) && (aueq[i] as number) > 0 && finite(years[i])) return years[i] as number;
  return null;
}

function getMetric(row: PreRevenueCompany, key: MetricKey): string {
  const s = row.snapshot;
  if (!s) return '—';
  const lista3 = s.corporate?.lista3Metrics;
  const aueq = sumPositive(s.aggregation?.payableAuEqOz_total);
  const lomAueq = aueq?.sum ?? null;
  const annualAueq = aueq ? aueq.sum / aueq.count : null;
  const marker = s.modeledValuationTimeline?.markers?.find((item) => finite(item.value_high) && finite(item.value_low)) ?? null;
  const target = marker && finite(marker.value_high) && finite(marker.value_low) ? (marker.value_high + marker.value_low) / 2 : null;
  const yearsToProduction = row.productionStartYear && row.productionStartYear > new Date().getUTCFullYear() ? row.productionStartYear - new Date().getUTCFullYear() : null;
  const annualReturn = finite(target) && finite(row.price) && row.price > 0 && finite(yearsToProduction) && yearsToProduction > 0 ? (target / row.price) ** (1 / yearsToProduction) - 1 : null;
  const ebitda = s.series?.ebitdaUSD ?? [];
  const evUsd = finite(s.EV_TargetCurrency) && finite(s.fx_USD_to_TargetCurrency) && (s.fx_USD_to_TargetCurrency as number) > 0 ? (s.EV_TargetCurrency as number) / (s.fx_USD_to_TargetCurrency as number) : null;
  const evEbitdaPeak = finite(evUsd) ? ebitda.reduce<number | null>((peak, value) => finite(value) && value > 0 ? Math.max(peak ?? -Infinity, evUsd / value) : peak, null) : null;
  const initialCapex = marker?.lista2Metrics?.InitialCAPEX_incremental_TargetCurrency ?? null;

  switch (key) {
    case 'pNav': return formatMultiple(s.P_over_NAV);
    case 'evNav': return formatMultiple(s.EV_over_NAV);
    case 'evEbitdaPeak': return formatMultiple(evEbitdaPeak);
    case 'targetPrice': return finite(target) && finite(row.price) && row.price > 0 ? `${formatMoney(target, row.targetCurrency)} · ${formatMultiple(target / row.price)}` : '—';
    case 'annualReturn': return formatPct(annualReturn);
    case 'tier': return '—';
    case 'irr': return formatPct(lista3?.IRR ?? s.project?.modeled?.npvSpotRange?.base?.irr ?? null);
    case 'payback': return finite(s.Payback_real_years) ? `${formatNumber(s.Payback_real_years, 1)} år` : finite(s.Payback_approx_years) ? `${formatNumber(s.Payback_approx_years, 1)} år` : '—';
    case 'lom': return aueq ? `${aueq.count} år` : '—';
    case 'initialCapex': return formatMoney(initialCapex, row.targetCurrency);
    case 'capexAnnualAueq': return formatNumber(lista3?.CAPEX_per_Annual_AuEq ?? null);
    case 'annualAueq': return finite(annualAueq) ? `${formatNumber(annualAueq)} oz` : '—';
    case 'aueq10y': return finite(s.AuEq_Oz_10Y) ? `${formatNumber(s.AuEq_Oz_10Y)} oz` : '—';
    case 'aueqLom': return finite(lomAueq) ? `${formatNumber(lomAueq)} oz` : '—';
    case 'inSituAueq': return '—';
    case 'aueqPerShare': return '—';
    case 'mcap10yAueq': return finite(s.MarketCap_TargetCurrency) && finite(s.AuEq_Oz_10Y) && s.AuEq_Oz_10Y > 0 ? formatMoney(s.MarketCap_TargetCurrency / s.AuEq_Oz_10Y, row.targetCurrency) : '—';
    case 'mcapLomAueq': return finite(s.MarketCap_TargetCurrency) && finite(lomAueq) && lomAueq > 0 ? formatMoney(s.MarketCap_TargetCurrency / lomAueq, row.targetCurrency) : '—';
    case 'evLomAueq': return finite(s.EV_TargetCurrency) && finite(lomAueq) && lomAueq > 0 ? formatMoney(s.EV_TargetCurrency / lomAueq, row.targetCurrency) : '—';
  }
}

async function loadCanonicalCompany(company: { ticker: string; name: string }): Promise<PreRevenueCompany | null> {
  const projects = await listCompanyProjects(company.ticker);
  if (projects.length === 0) return null;
  try {
    const [profileRes, statementsRes] = await Promise.all([
      fetch(`/api/company/profile?ticker=${encodeURIComponent(company.ticker)}`),
      fetch(`/api/company?ticker=${encodeURIComponent(company.ticker)}&period=fy`),
    ]);
    const profileBody = await profileRes.json() as ProfileResponse;
    const statements = await statementsRes.json() as CompanyResponse;
    const profile = profileBody.profile ?? null;
    const price = readFinite(profile?.price);
    const sharesCurrent = resolveShares(statements);
    const targetCurrency = typeof profile?.currency === 'string' && profile.currency.trim() ? profile.currency.trim().toUpperCase() : 'USD';
    if (!finite(price) || price <= 0 || !finite(sharesCurrent) || sharesCurrent <= 0) {
      return { ...company, projects, snapshot: null, price, sharesCurrent, targetCurrency, productionStartYear: null, metricError: 'Saknar kanoniskt marknadspris eller aktieantal.' };
    }
    const response = await fetch('/api/snapshot/corporate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: company.ticker,
        valuationYear: new Date().getUTCFullYear(),
        targetCurrency,
        discountRate: 0.1,
        market: { shares_current: sharesCurrent, price_current_TargetCurrency: price },
        scenario: { mode: 'spot' },
        fx: { source: targetCurrency === 'USD' ? 'manual' : 'auto', anchor: 'today', scenario: { mode: 'spot' }, manual_fx_USD_to_TargetCurrency: targetCurrency === 'USD' ? 1 : undefined },
      }),
    });
    const body = await response.json() as SnapshotResponse;
    const snapshot = response.ok && body.ok && body.snapshot ? body.snapshot : null;
    return { ...company, projects, snapshot, price, sharesCurrent, targetCurrency, productionStartYear: snapshot ? firstProductionYear(snapshot) : null, metricError: snapshot ? null : (body.diagnostics?.errors?.join(' · ') || 'Corporate snapshot kunde inte beräknas.') };
  } catch (error) {
    return { ...company, projects, snapshot: null, price: null, sharesCurrent: null, targetCurrency: null, productionStartYear: null, metricError: (error as Error).message };
  }
}

function PreRevenueCompareDashboard() {
  const [rows, setRows] = useState<PreRevenueCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(null);
      try {
        const response = await fetch('/api/company/list?limit=500', { signal: controller.signal });
        const body = await response.json() as CompanyListResponse;
        if (!response.ok || !body.ok || !Array.isArray(body.companies)) throw new Error('Kunde inte läsa bolagsuniversum.');
        const candidates = await Promise.all(body.companies.map(async (company) => {
          try { return await loadCanonicalCompany(company); } catch { return null; }
        }));
        if (!controller.signal.aborted) setRows(candidates.filter((row): row is PreRevenueCompany => row !== null));
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError((err as Error).message);
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, []);

  const metricColumns = useMemo<MetricColumn[]>(() => METRIC_GROUPS.flatMap((group) => [...group.columns]), []);

  return <div className="pre-revenue-compare">
    <div className="pre-revenue-compare__intro"><div><strong>PRE REVENUE · CORPORATE CANONICAL</strong><p>Jämför projektkvalitet, skala och priset marknaden betalar för den ekonomiskt relevanta metallbasen.</p></div><div className="pre-revenue-compare__basis"><strong>Kanonisk källa:</strong> samma Corporate snapshot som Corporate-vyn. Saknade mått visas som —; ingen separat ekonomisk motor används här.</div></div>
    {loading && <div className="producer-compare__state">Laddar Corporate snapshots…</div>}
    {error && <div className="producer-compare__error">{error}</div>}
    {!loading && !error && <div className="pre-revenue-compare__table-wrap"><table className="pre-revenue-compare__table"><thead><tr className="pre-revenue-compare__group-row"><th colSpan={4}>BOLAG</th>{METRIC_GROUPS.map((group) => <th key={group.label} colSpan={group.columns.length}>{group.label}</th>)}</tr><tr><th>Bolag</th><th>Ticker</th><th>Projekt</th><th>Corporate</th>{metricColumns.map(([, label, help]) => <th key={label} title={help}>{label}</th>)}</tr></thead><tbody>
      {rows.map((row) => <tr key={row.ticker}><td><strong>{row.name}</strong>{row.metricError && <small title={row.metricError}> · Ej beräkningsbar</small>}</td><td>{row.ticker}</td><td><div className="pre-revenue-compare__projects"><strong>{row.projects.length}</strong><small>{row.projects.map((project) => project.project_name || project.project_id).join(' · ')}</small></div></td><td><a href={`/company/${encodeURIComponent(row.ticker)}/corporate`}>Öppna</a></td>{metricColumns.map(([key]) => <td className={getMetric(row, key) === '—' ? 'pre-revenue-compare__pending' : undefined} key={`${row.ticker}-${key}`}>{getMetric(row, key)}</td>)}</tr>)}
      {rows.length === 0 && <tr><td colSpan={4 + metricColumns.length}>Inga bolag med sparade modellerade projekt hittades.</td></tr>}
    </tbody></table></div>}
  </div>;
}

export default function CompareStocksDashboard() {
  const [tab, setTab] = useState<CompareTab>('producer');
  return <div className="compare-stocks"><div className="compare-stocks__tabs" role="tablist" aria-label="Compare Stocks model"><button type="button" role="tab" aria-selected={tab === 'producer'} className={tab === 'producer' ? 'is-active' : ''} onClick={() => setTab('producer')}>PRODUCER</button><button type="button" role="tab" aria-selected={tab === 'pre-revenue'} className={tab === 'pre-revenue' ? 'is-active' : ''} onClick={() => setTab('pre-revenue')}>PRE REVENUE</button></div>{tab === 'producer' ? <ProducerCompareDashboard /> : <PreRevenueCompareDashboard />}</div>;
}
