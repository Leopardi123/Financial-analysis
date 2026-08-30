import { useEffect, useMemo, useState } from 'react';
import ProducerCompareDashboard from './ProducerCompareDashboard.tsx';
import Tier1StatusCell from './Tier1StatusCell.tsx';
import InvestmentScoreCell from './investmentScore/InvestmentScoreCell.tsx';
import { listCompanyProjects, type CompanyProjectSummary } from '../lib/client/companyProjectsClient.ts';
import { loadLiveCorporateFinancingState } from '../lib/client/corporateFinancingStateStore.ts';
import type { CorporateSnapshot } from '../lib/corporate/snapshot/types.ts';
import { extraSharesStorageKey, parseExtraShares } from '../lib/market/extraShares.ts';
import '../styles/compareStocks.css';

type CompareTab = 'producer' | 'pre-revenue';
type MetricKey = 'investmentScore' | 'pNav' | 'evEbitdaPeak' | 'targetPrice' | 'annualReturn' | 'tier' | 'irr' | 'payback' | 'lom' | 'initialCapex' | 'capexAnnualAueq' | 'annualAueq' | 'aueq10y' | 'aueqLom' | 'aueqPerShare' | 'mcap10yAueq' | 'mcapLomAueq' | 'evLomAueq';
type MetricColumn = readonly [key: MetricKey, label: string, help: string];
type MetricGroup = { label: string; columns: readonly MetricColumn[] };

type CompanyListResponse = { ok: boolean; companies?: Array<{ ticker: string; name: string }> };
type ProfileResponse = { ok?: boolean; profile?: Record<string, unknown> | null };
type CompanyResponse = { balance?: Record<string, Array<number | null>>; income?: Record<string, Array<number | null>> };
type SnapshotWithValuationSeries = CorporateSnapshot & Record<string, unknown> & {
  corporateValuationTimeSeries?: { rows?: Array<{ year?: number; evEbitda6xPerShare?: number | null }> };
};
type SnapshotResponse = { ok: boolean; snapshot?: SnapshotWithValuationSeries; diagnostics?: { errors?: string[]; warnings?: string[] } };

type PreRevenueCompany = {
  ticker: string;
  name: string;
  projects: CompanyProjectSummary[];
  snapshot: SnapshotWithValuationSeries | null;
  price: number | null;
  sharesCurrent: number | null;
  targetCurrency: string | null;
  productionStartYear: number | null;
  manualExtraShares: number;
  metricError: string | null;
};

type AuEqProductionStats = { lomAuEq: number; tenYearAuEq: number; annualAuEq: number; productionYears: number };
type ValuationMarker = NonNullable<CorporateSnapshot['modeledValuationTimeline']>['markers'][number];

const METRIC_GROUPS: readonly MetricGroup[] = [
  { label: 'INVESTERING', columns: [
    ['investmentScore', 'Inv. score', 'Investment Score 1–10. Lägre är bättre. Bygger på canonical Tier, P/NAV PF, Peak 6x / pris, cycle/downside, management, optionality och fatal-flaw-evidence. v0 är kalibreringsversion.'],
  ] },
  { label: 'VÄRDERING IDAG', columns: [
    ['pNav', 'P/NAV PF', 'Dagens aktiekurs dividerad med NAV per aktie efter modellerad finansiering och manuellt tillagda extra aktier'],
    ['evEbitdaPeak', 'Peak 6x / pris', 'Högsta 6x EV/EBITDA-värde per aktie från Corporate-grafen relativt dagens pris'],
  ] },
  { label: 'TARGET / RE-RATING', columns: [
    ['targetPrice', 'Target / pris', 'Corporate target price vid nästa relevanta projektstart relativt dagens pris, justerat för manuellt tillagda extra aktier'],
    ['annualReturn', 'Årlig avk. → prod.', 'Annualiserad utveckling från dagens pris till Corporate target vid nästa framtida projektstart'],
  ] },
  { label: 'PROJEKTKVALITET', columns: [
    ['tier', 'Tier', 'Tier 1/2/3 för industriell projektkvalitet. Produktionsskala, LOM och after-tax IRR sätter Tier-taket; Tier 1 kräver även Q1-kostnadsposition och positiv NPV10 i tre års historiskt kalibrerad relativ lågcykel. Mycket liten produktion (<0,40x combined scale) ger alltid högst Tier 3.'],
    ['irr', 'IRR', 'Kanonisk Corporate IRR'],
    ['payback', 'Payback', 'Kanonisk Corporate payback'],
    ['lom', 'LOM', 'Antal år med positiv canonical payable AuEq-produktion'],
    ['initialCapex', 'Initial CAPEX', 'Initial construction CAPEX från Corporate canonical timeline, visad i USD för jämförbarhet'],
    ['capexAnnualAueq', 'CAPEX / annual AuEq', 'Kanonisk Corporate Lista 3-metrik i USD per AuEq oz'],
  ] },
  { label: 'SKALA', columns: [
    ['annualAueq', 'Annual AuEq', 'LOM payable AuEq dividerat med antal år med positiv canonical payable AuEq-produktion'],
    ['aueq10y', '10y AuEq', 'Canonical payable AuEq under de första upp till tio produktionsåren'],
    ['aueqLom', 'LOM AuEq', 'Canonical payable AuEq över hela produktionsperioden'],
    ['aueqPerShare', 'AuEq / aktie', 'LOM payable AuEq dividerat med canonical aktier efter modellerad finansiering och manuellt tillagda extra aktier'],
  ] },
  { label: 'RELATIV VÄRDERING', columns: [
    ['mcap10yAueq', 'MCap / 10y AuEq', 'Market cap per canonical 10y payable AuEq'],
    ['mcapLomAueq', 'MCap / LOM AuEq', 'Market cap per canonical LOM payable AuEq'],
    ['evLomAueq', 'EV / LOM AuEq', 'Enterprise value inklusive Corporate cash/debt/financing bridge per canonical LOM payable AuEq'],
  ] },
];

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const readFinite = (value: unknown): number | null => finite(value) ? value : null;
const clamp01 = (value: unknown, fallback: number): number => finite(value) ? Math.max(0, Math.min(1, value)) : fallback;
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

function resolveLatestCash(statements: CompanyResponse): number | null {
  return lastFinite(statements.balance?.cashAndCashEquivalents) ?? lastFinite(statements.balance?.cashAndShortTermInvestments);
}

function resolveLatestDebt(statements: CompanyResponse): number | null {
  const direct = lastFinite(statements.balance?.totalDebt);
  if (direct !== null) return direct;
  const shortTerm = lastFinite(statements.balance?.shortTermDebt);
  const longTerm = lastFinite(statements.balance?.longTermDebt);
  return shortTerm === null && longTerm === null ? null : (shortTerm ?? 0) + (longTerm ?? 0);
}

function readManualExtraShares(ticker: string): number {
  if (typeof window === 'undefined') return 0;
  return parseExtraShares(window.localStorage.getItem(extraSharesStorageKey('corporate', ticker)) ?? '0');
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

function computeAuEqProductionStats(values: Array<number | null> | undefined): AuEqProductionStats | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  const firstPositive = values.findIndex((value) => finite(value) && value > 0);
  let lastPositive = -1;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (finite(values[i]) && (values[i] as number) > 0) { lastPositive = i; break; }
  }
  if (firstPositive < 0 || lastPositive < firstPositive) return null;
  const productionValues: number[] = [];
  for (let i = firstPositive; i <= lastPositive; i += 1) {
    const value = values[i];
    if (!finite(value) || value < 0) return null;
    if (value > 0) productionValues.push(value);
  }
  if (productionValues.length === 0) return null;
  const lomAuEq = productionValues.reduce((sum, value) => sum + value, 0);
  return {
    lomAuEq,
    tenYearAuEq: productionValues.slice(0, 10).reduce((sum, value) => sum + value, 0),
    annualAuEq: lomAuEq / productionValues.length,
    productionYears: productionValues.length,
  };
}

function markerYear(marker: ValuationMarker | null | undefined): number | null {
  if (!marker) return null;
  const raw = marker.yearLabelUsed;
  if (finite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function validValuationMarkers(snapshot: SnapshotWithValuationSeries): ValuationMarker[] {
  const markers = snapshot.modeledValuationTimeline?.markers;
  return Array.isArray(markers)
    ? markers.filter((marker) => markerYear(marker) !== null && finite(marker.value_low) && finite(marker.value_high))
    : [];
}

function nextRelevantProjectMarker(snapshot: SnapshotWithValuationSeries, currentYear = new Date().getUTCFullYear()): ValuationMarker | null {
  const markers = validValuationMarkers(snapshot).sort((a, b) => (markerYear(a) ?? Infinity) - (markerYear(b) ?? Infinity));
  return markers.find((marker) => (markerYear(marker) ?? -Infinity) > currentYear) ?? null;
}

function canonicalMarkerTarget(marker: ValuationMarker | null): number | null {
  if (!marker) return null;
  if (finite(marker.value_mid_if_any)) return marker.value_mid_if_any;
  return finite(marker.value_low) && finite(marker.value_high) ? (marker.value_low + marker.value_high) / 2 : null;
}

function extraShareScale(snapshot: SnapshotWithValuationSeries, extraShares: number): number {
  if (!(extraShares > 0)) return 1;
  const sharesPostFinancing = snapshot.financing?.shares_post_financing;
  if (!finite(sharesPostFinancing) || sharesPostFinancing <= 0) return 1;
  return sharesPostFinancing / (sharesPostFinancing + extraShares);
}

function postFinancingShares(snapshot: SnapshotWithValuationSeries, extraShares: number): number | null {
  const modeledShares = snapshot.financing?.shares_post_financing;
  if (!finite(modeledShares) || modeledShares <= 0) return null;
  const manualShares = Number.isSafeInteger(extraShares) && extraShares >= 0 ? extraShares : 0;
  return modeledShares + manualShares;
}

function pNavPostFinancing(snapshot: SnapshotWithValuationSeries, price: number | null, extraShares: number): number | null {
  const sharesPf = postFinancingShares(snapshot, extraShares);
  const nav = snapshot.NAV_today_TargetCurrency;
  if (!finite(price) || price < 0 || !finite(sharesPf) || sharesPf <= 0 || !finite(nav) || nav <= 0) return null;
  return (price * sharesPf) / nav;
}

function peakSixTimesValuePerShare(snapshot: SnapshotWithValuationSeries, scale = 1): number | null {
  const rows = snapshot.corporateValuationTimeSeries?.rows;
  if (!Array.isArray(rows)) return null;
  let peak: number | null = null;
  for (const valuationRow of rows) {
    if (finite(valuationRow.evEbitda6xPerShare)) {
      const adjusted = valuationRow.evEbitda6xPerShare * scale;
      peak = peak === null ? adjusted : Math.max(peak, adjusted);
    }
  }
  return peak;
}

function targetCurrencyToUsd(snapshot: SnapshotWithValuationSeries, targetCurrencyValue: number | null): number | null {
  if (!finite(targetCurrencyValue)) return null;
  const fx = readFinite(snapshot.fx_USD_to_TargetCurrency);
  if (!finite(fx) || fx <= 0) return null;
  return targetCurrencyValue / fx;
}

function getMetric(row: PreRevenueCompany, key: MetricKey): string {
  const s = row.snapshot;
  if (!s) return '—';
  const lista3 = s.corporate?.lista3Metrics;
  const aueq = computeAuEqProductionStats(s.aggregation?.payableAuEqOz_total);
  const scale = extraShareScale(s, row.manualExtraShares);
  const marker = nextRelevantProjectMarker(s);
  const rawTarget = canonicalMarkerTarget(marker);
  const target = finite(rawTarget) ? rawTarget * scale : null;
  const targetYear = markerYear(marker) ?? row.productionStartYear;
  const currentYear = new Date().getUTCFullYear();
  const yearsToProduction = finite(targetYear) && targetYear > currentYear ? targetYear - currentYear : null;
  const annualReturn = finite(target) && finite(row.price) && row.price > 0 && finite(yearsToProduction) && yearsToProduction > 0 ? (target / row.price) ** (1 / yearsToProduction) - 1 : null;
  const peak6xPerShare = peakSixTimesValuePerShare(s, scale);
  const peak6xVsPrice = finite(peak6xPerShare) && finite(row.price) && row.price > 0 ? peak6xPerShare / row.price : null;
  const initialCapexTargetCurrency = marker?.lista2Metrics?.InitialCAPEX_incremental_TargetCurrency ?? null;
  const initialCapexUsd = targetCurrencyToUsd(s, initialCapexTargetCurrency);
  const sharesPf = postFinancingShares(s, row.manualExtraShares);

  switch (key) {
    case 'investmentScore': return '—';
    case 'pNav': return formatMultiple(pNavPostFinancing(s, row.price, row.manualExtraShares));
    case 'evEbitdaPeak': return finite(peak6xPerShare) && finite(peak6xVsPrice) ? `${formatMoney(peak6xPerShare, row.targetCurrency)} · ${formatMultiple(peak6xVsPrice)}` : '—';
    case 'targetPrice': return finite(target) && finite(row.price) && row.price > 0 ? `${formatMoney(target, row.targetCurrency)} · ${formatMultiple(target / row.price)}` : '—';
    case 'annualReturn': return formatPct(annualReturn);
    case 'tier': return '—';
    case 'irr': return formatPct(lista3?.IRR ?? s.project?.modeled?.npvSpotRange?.base?.irr ?? null);
    case 'payback': return finite(s.Payback_real_years) ? `${formatNumber(s.Payback_real_years, 1)} år` : finite(s.Payback_approx_years) ? `${formatNumber(s.Payback_approx_years, 1)} år` : '—';
    case 'lom': return aueq ? `${aueq.productionYears} år` : '—';
    case 'initialCapex': return formatMoney(initialCapexUsd, 'USD');
    case 'capexAnnualAueq': return finite(lista3?.CAPEX_per_Annual_AuEq) ? `${formatNumber(lista3.CAPEX_per_Annual_AuEq)} USD/oz` : '—';
    case 'annualAueq': return aueq ? `${formatNumber(aueq.annualAuEq)} oz` : '—';
    case 'aueq10y': return aueq ? `${formatNumber(aueq.tenYearAuEq)} oz` : '—';
    case 'aueqLom': return aueq ? `${formatNumber(aueq.lomAuEq)} oz` : '—';
    case 'aueqPerShare': return aueq && finite(sharesPf) && sharesPf > 0 ? `${formatNumber(aueq.lomAuEq / sharesPf, 4)} oz/aktie` : '—';
    case 'mcap10yAueq': return aueq && finite(s.MarketCap_TargetCurrency) && aueq.tenYearAuEq > 0 ? formatMoney(s.MarketCap_TargetCurrency / aueq.tenYearAuEq, row.targetCurrency) : '—';
    case 'mcapLomAueq': return aueq && finite(s.MarketCap_TargetCurrency) && aueq.lomAuEq > 0 ? formatMoney(s.MarketCap_TargetCurrency / aueq.lomAuEq, row.targetCurrency) : '—';
    case 'evLomAueq': return aueq && finite(s.EV_TargetCurrency) && aueq.lomAuEq > 0 ? formatMoney(s.EV_TargetCurrency / aueq.lomAuEq, row.targetCurrency) : '—';
  }
}

async function loadCanonicalCompany(company: { ticker: string; name: string }): Promise<PreRevenueCompany | null> {
  const projects = await listCompanyProjects(company.ticker);
  if (projects.length === 0) return null;
  const localExtraShares = readManualExtraShares(company.ticker);
  try {
    const [profileRes, statementsRes, persistedFinancing] = await Promise.all([
      fetch(`/api/company/profile?ticker=${encodeURIComponent(company.ticker)}`),
      fetch(`/api/company?ticker=${encodeURIComponent(company.ticker)}&period=fy`),
      loadLiveCorporateFinancingState(company.ticker),
    ]);
    const profileBody = await profileRes.json() as ProfileResponse;
    const statements = await statementsRes.json() as CompanyResponse;
    const profile = profileBody.profile ?? null;
    const price = readFinite(profile?.price);
    const sharesCurrent = resolveShares(statements);
    const latestCash = resolveLatestCash(statements);
    const latestDebt = resolveLatestDebt(statements);
    const targetCurrency = typeof profile?.currency === 'string' && profile.currency.trim() ? profile.currency.trim().toUpperCase() : 'USD';
    const manualExtraShares = persistedFinancing?.extraShares ?? localExtraShares;
    if (!finite(price) || price <= 0 || !finite(sharesCurrent) || sharesCurrent <= 0) {
      return { ...company, projects, snapshot: null, price, sharesCurrent, targetCurrency, productionStartYear: null, manualExtraShares, metricError: 'Saknar kanoniskt marknadspris eller aktieantal.' };
    }

    const financingPlanByProject = Object.fromEntries(projects.map((project) => {
      const saved = persistedFinancing?.financingPlanByProject?.[project.project_id];
      const equityFraction = clamp01(saved?.equity_fraction, 1);
      return [project.project_id, {
        equity_fraction: equityFraction,
        debt_fraction: 1 - equityFraction,
        equity_raise_price_TargetCurrency: price,
      }];
    }));
    const firstProjectId = projects[0]?.project_id ?? null;
    const firstProjectPlan = firstProjectId ? financingPlanByProject[firstProjectId] : null;
    const savedPlan = persistedFinancing?.financingPlan;
    const equityFraction = firstProjectPlan?.equity_fraction ?? clamp01(savedPlan?.equity_fraction, 1);
    const financingPlan = {
      equity_fraction: equityFraction,
      debt_fraction: 1 - equityFraction,
      use_cash_first: savedPlan?.use_cash_first === true,
      cash_use_percent: clamp01(savedPlan?.cash_use_percent, 1),
      minimum_cash_reserve_TargetCurrency: 0,
      equity_raise_price_TargetCurrency: price,
    };

    const response = await fetch('/api/snapshot/corporate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: company.ticker,
        valuationYear: new Date().getUTCFullYear(),
        targetCurrency,
        discountRate: 0.1,
        market: { shares_current: sharesCurrent, price_current_TargetCurrency: price },
        balanceSheet: { cash_t0_TargetCurrency: latestCash, debt_t0_TargetCurrency: latestDebt },
        financingPlan,
        financingPlanByProject,
        scenario: { mode: 'spot' },
        fx: {
          source: targetCurrency === 'USD' ? 'manual' : 'auto',
          anchor: 'today',
          scenario: { mode: 'spot' },
          manual_fx_USD_to_TargetCurrency: targetCurrency === 'USD' ? 1 : undefined,
        },
      }),
    });
    const body = await response.json() as SnapshotResponse;
    const snapshot = response.ok && body.ok && body.snapshot ? body.snapshot : null;
    const nextMarker = snapshot ? nextRelevantProjectMarker(snapshot) : null;
    return {
      ...company,
      projects,
      snapshot,
      price,
      sharesCurrent,
      targetCurrency,
      productionStartYear: markerYear(nextMarker),
      manualExtraShares,
      metricError: snapshot ? null : (body.diagnostics?.errors?.join(' · ') || 'Corporate snapshot kunde inte beräknas.'),
    };
  } catch (error) {
    return { ...company, projects, snapshot: null, price: null, sharesCurrent: null, targetCurrency: null, productionStartYear: null, manualExtraShares: localExtraShares, metricError: (error as Error).message };
  }
}

function PreRevenueCompareDashboard() {
  const [rows, setRows] = useState<PreRevenueCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
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
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const metricColumns = useMemo<MetricColumn[]>(() => METRIC_GROUPS.flatMap((group) => [...group.columns]), []);

  return <div className="pre-revenue-compare">
    <div className="pre-revenue-compare__intro"><div><strong>PRE REVENUE · CORPORATE CANONICAL</strong><p>Jämför projektkvalitet, skala och priset marknaden betalar för den ekonomiskt relevanta metallbasen.</p></div><div className="pre-revenue-compare__basis"><strong>Kanonisk källa:</strong> samma Corporate snapshot, EV bridge och sparade finansieringsplan som Corporate-vyn. Finansieringsmix och extra aktier kan återanvändas mellan enheter.</div></div>
    {loading && <div className="producer-compare__state">Laddar Corporate snapshots…</div>}
    {error && <div className="producer-compare__error">{error}</div>}
    {!loading && !error && <div className="pre-revenue-compare__table-wrap"><table className="pre-revenue-compare__table"><thead><tr className="pre-revenue-compare__group-row"><th>BOLAG</th>{METRIC_GROUPS.map((group) => <th key={group.label} colSpan={group.columns.length}>{group.label}</th>)}</tr><tr><th>Bolag</th>{metricColumns.map(([, label, help]) => <th key={label} title={help}>{label}</th>)}</tr></thead><tbody>
      {rows.map((row) => <tr key={row.ticker}><td className="pre-revenue-compare__company-cell"><a className="pre-revenue-compare__company-link" href={`/company/${encodeURIComponent(row.ticker)}/corporate`}><strong>{row.name}</strong></a>{row.metricError && <small className="pre-revenue-compare__company-error" title={row.metricError}> · Ej beräkningsbar</small>}<div className="pre-revenue-compare__company-meta"><span>{row.ticker}</span><span>{row.projects.length} {row.projects.length === 1 ? 'projekt' : 'projekt'} · {row.projects.map((project) => project.project_name || project.project_id).join(' · ')}</span></div></td>{metricColumns.map(([key]) => {
        const value = getMetric(row, key);
        const content = key === 'investmentScore'
          ? <InvestmentScoreCell symbol={row.ticker} projectIds={row.projects.map((project) => project.project_id)} snapshot={row.snapshot} priceCurrentTargetCurrency={row.price} manualExtraShares={row.manualExtraShares} />
          : key === 'tier'
            ? <Tier1StatusCell symbol={row.ticker} />
            : value;
        return <td className={key !== 'tier' && key !== 'investmentScore' && value === '—' ? 'pre-revenue-compare__pending' : undefined} key={`${row.ticker}-${key}`}>{content}</td>;
      })}</tr>)}
      {rows.length === 0 && <tr><td colSpan={1 + metricColumns.length}>Inga bolag med sparade modellerade projekt hittades.</td></tr>}
    </tbody></table></div>}
  </div>;
}

export default function CompareStocksDashboard() {
  const [tab, setTab] = useState<CompareTab>('producer');
  return <div className="compare-stocks"><div className="compare-stocks__tabs" role="tablist" aria-label="Compare Stocks model"><button type="button" role="tab" aria-selected={tab === 'producer'} className={tab === 'producer' ? 'is-active' : ''} onClick={() => setTab('producer')}>PRODUCER</button><button type="button" role="tab" aria-selected={tab === 'pre-revenue'} className={tab === 'pre-revenue' ? 'is-active' : ''} onClick={() => setTab('pre-revenue')}>PRE REVENUE</button></div>{tab === 'producer' ? <ProducerCompareDashboard /> : <PreRevenueCompareDashboard />}</div>;
}
