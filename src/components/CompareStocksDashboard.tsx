import { useEffect, useMemo, useState } from 'react';
import ProducerCompareDashboard from './ProducerCompareDashboard.tsx';
import Tier1StatusCell from './Tier1StatusCell.tsx';
import InvestmentScoreCell from './investmentScore/InvestmentScoreCell.tsx';
import { getCompanyProject, listCompanyProjects, type CompanyProjectSummary } from '../lib/client/companyProjectsClient.ts';
import { loadLiveCorporateFinancingState } from '../lib/client/corporateFinancingStateStore.ts';
import { postCorporateSnapshot } from '../lib/client/snapshotClient.ts';
import { getManualMetalPriceStore } from '../lib/engine/pricing/manualMetalPriceStore.ts';
import { resolveCanonicalCorporateSnapshotInputs } from '../lib/corporate/snapshotInputResolver.ts';
import {
  deriveCorporatePreRevenueMetrics,
  type CorporatePreRevenueMetrics,
} from '../lib/corporate/preRevenueMetrics.ts';
import type { CorporateSnapshot } from '../lib/corporate/snapshot/types.ts';
import {
  comparePreRevenueMetricValues,
  defaultPreRevenueSortDirection,
  isPreRevenueSortableMetricKey,
  type PreRevenueSortableMetricKey,
  type PreRevenueSortDirection,
} from './preRevenueCompareSorting.ts';
import { extraSharesStorageKey, parseExtraShares } from '../lib/market/extraShares.ts';
import '../styles/compareStocks.css';

type CompareTab = 'producer' | 'pre-revenue';
type MetricKey = 'investmentScore' | 'pNav' | 'evEbitdaPeak' | 'targetPrice' | 'annualReturn' | 'tier' | 'irr' | 'payback' | 'lom' | 'initialCapex' | 'capexAnnualAueq' | 'annualAueq' | 'aueq10y' | 'aueqLom' | 'aueqPerShare' | 'mcap10yAueq' | 'mcapLomAueq' | 'evLomAueq';
type MetricColumn = readonly [key: MetricKey, label: string, help: string];
type MetricGroup = { label: string; columns: readonly MetricColumn[] };

type CompanyListResponse = { ok: boolean; companies?: Array<{ ticker: string; name: string }> };
type ProfileResponse = { ok?: boolean; profile?: Record<string, unknown> | null };
type CompanyResponse = { balance?: Record<string, Array<number | null>>; income?: Record<string, Array<number | null>> };

type PreRevenueCompany = {
  ticker: string;
  name: string;
  projects: CompanyProjectSummary[];
  metals: string[];
  snapshot: CorporateSnapshot | null;
  metrics: CorporatePreRevenueMetrics | null;
  price: number | null;
  sharesCurrent: number | null;
  targetCurrency: string | null;
  manualExtraShares: number;
  metricError: string | null;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function metricGroups(referenceMetal: string): readonly MetricGroup[] {
  const eq = `${referenceMetal}Eq`;
  return [
    { label: 'INVESTERING', columns: [['investmentScore', 'Inv. score', 'Investment Score 1–10. Lägre är bättre. Bygger på canonical Tier, P/NAV PF, Peak 6x / pris, cycle/downside, management, optionality och fatal-flaw-evidence. v0 är kalibreringsversion.']] },
    { label: 'VÄRDERING IDAG', columns: [
      ['pNav', 'P/NAV PF', 'Dagens aktiekurs dividerad med NAV per aktie efter modellerad finansiering och manuellt tillagda extra aktier'],
      ['evEbitdaPeak', 'Peak 6x / pris', 'Högsta 6x EV/EBITDA-värde per aktie från Corporate-grafen relativt dagens pris'],
    ] },
    { label: 'TARGET / RE-RATING', columns: [
      ['targetPrice', 'Target / pris', 'Corporate target price vid nästa relevanta projektstart relativt dagens pris, justerat för manuellt tillagda extra aktier'],
      ['annualReturn', 'Årlig avk. → prod.', 'Annualiserad utveckling från dagens pris till Corporate target vid nästa framtida projektstart'],
    ] },
    { label: 'PROJEKTKVALITET', columns: [
      ['tier', 'Tier', 'Tier 1/2/3 för industriell projektkvalitet. Produktionsskala, LOM och after-tax IRR sätter Tier-taket; Tier 1 kräver även Q1-kostnadsposition och positiv NPV10 i tre års historiskt kalibrerad relativ lågcykel.'],
      ['irr', 'IRR', 'Kanonisk Corporate IRR'],
      ['payback', 'Payback', 'Kanonisk Corporate payback'],
      ['lom', 'LOM', 'Kronologiskt årsspann från första till sista period med positiv fysisk payable produktion i någon metall, inklusive eventuella nollproduktionsår mellan dessa perioder. Closure efter sista payable-produktionsperiod räknas inte.'],
      ['initialCapex', 'Initial CAPEX', 'Initial construction CAPEX från Corporate canonical timeline, visad i USD för jämförbarhet'],
      ['capexAnnualAueq', `CAPEX / annual ${eq}`, `Initial CAPEX i USD dividerat med annual ${eq}`],
    ] },
    { label: 'SKALA', columns: [
      ['annualAueq', `Annual ${eq}`, `LOM ${eq} dividerat med antal positiva produktionsår`],
      ['aueq10y', `10y ${eq}`, `Canonical spot-revenue uttryckt som ${eq} under de första upp till tio produktionsåren`],
      ['aueqLom', `LOM ${eq}`, `Canonical spot-revenue uttryckt som ${eq} över hela produktionsperioden`],
      ['aueqPerShare', `10y ${eq} / aktie`, `10y ${eq} dividerat med canonical aktier efter modellerad finansiering och manuellt tillagda extra aktier`],
    ] },
    { label: 'RELATIV VÄRDERING', columns: [
      ['mcap10yAueq', `MCap / 10y ${eq}`, `Market cap i USD per canonical 10y ${eq}`],
      ['mcapLomAueq', `MCap / LOM ${eq}`, `Market cap i USD per canonical LOM ${eq}`],
      ['evLomAueq', `EV / LOM ${eq}`, 'n/a — EV-definitionen är i karantän. Ingen proxy används innan separat EV-audit har låst en apples-to-apples enterprise-basis.'],
    ] },
  ];
}

function readManualExtraShares(ticker: string): number { if (typeof window === 'undefined') return 0; return parseExtraShares(window.localStorage.getItem(extraSharesStorageKey('corporate', ticker)) ?? '0'); }
function formatNumber(value: number | null, digits = 2): string {
  if (!finite(value)) return '—'; const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('sv-SE', { maximumFractionDigits: 1 })}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('sv-SE', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${(value / 1_000).toLocaleString('sv-SE', { maximumFractionDigits: 1 })}k`;
  return value.toLocaleString('sv-SE', { maximumFractionDigits: digits });
}
const formatPct = (value: number | null) => finite(value) ? `${(value * 100).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} %` : '—';
const formatMultiple = (value: number | null) => finite(value) ? `${value.toLocaleString('sv-SE', { maximumFractionDigits: 2 })}x` : '—';
const formatMoney = (value: number | null, currency: string | null) => finite(value) ? `${formatNumber(value)}${currency ? ` ${currency}` : ''}` : '—';

function getMetric(row: PreRevenueCompany, key: MetricKey, referenceMetal: string): string {
  const metrics = row.metrics;
  if (!metrics) return '—';
  const eq = metrics.equivalentByMetal[referenceMetal];
  const reference = metrics.byReferenceMetal[referenceMetal];
  const unit = eq?.unit ?? (referenceMetal === 'Au' ? 'oz' : 't');
  switch (key) {
    case 'investmentScore': return '—';
    case 'pNav': return formatMultiple(metrics.pNavPostFinancing);
    case 'evEbitdaPeak': return finite(metrics.peak6xValuePerShare) && finite(metrics.peak6xOverCurrentPrice) ? `${formatMoney(metrics.peak6xValuePerShare, row.targetCurrency)} · ${formatMultiple(metrics.peak6xOverCurrentPrice)}` : '—';
    case 'targetPrice': return finite(metrics.targetPrice) && finite(metrics.targetOverCurrentPrice) ? `${formatMoney(metrics.targetPrice, row.targetCurrency)} · ${formatMultiple(metrics.targetOverCurrentPrice)}` : '—';
    case 'annualReturn': return formatPct(metrics.annualizedReturnToTarget);
    case 'tier': return '—';
    case 'irr': return formatPct(metrics.irr);
    case 'payback': return finite(metrics.paybackYears) ? `${formatNumber(metrics.paybackYears, 1)} år` : '—';
    case 'lom': return finite(metrics.lomYears) ? `${metrics.lomYears} år` : '—';
    case 'initialCapex': return formatMoney(metrics.initialCapexUSD, 'USD');
    case 'capexAnnualAueq': return reference && finite(reference.capexPerAnnualEqUSD) ? `${formatNumber(reference.capexPerAnnualEqUSD)} USD/${unit}` : '—';
    case 'annualAueq': return eq?.status === 'OK' && finite(eq.annualEq) ? `${formatNumber(eq.annualEq)} ${unit}` : '—';
    case 'aueq10y': return eq?.status === 'OK' && finite(eq.tenYearEq) ? `${formatNumber(eq.tenYearEq)} ${unit}` : '—';
    case 'aueqLom': return eq?.status === 'OK' && finite(eq.lomEq) ? `${formatNumber(eq.lomEq)} ${unit}` : '—';
    case 'aueqPerShare': return reference && finite(reference.tenYearEqPerShare) ? `${formatNumber(reference.tenYearEqPerShare, 4)} ${unit}/aktie` : '—';
    case 'mcap10yAueq': return reference && finite(reference.marketCapPerTenYearEqUSD) ? `${formatNumber(reference.marketCapPerTenYearEqUSD)} USD/${unit}` : '—';
    case 'mcapLomAueq': return reference && finite(reference.marketCapPerLomEqUSD) ? `${formatNumber(reference.marketCapPerLomEqUSD)} USD/${unit}` : '—';
    case 'evLomAueq': return 'n/a';
  }
}

function extractMetals(rawProjects: Array<Record<string, unknown>>): string[] {
  const metals = new Set<string>();
  for (const raw of rawProjects) {
    const payable = (raw.metals as { payableQtyByMetal?: Record<string, unknown> } | undefined)?.payableQtyByMetal;
    if (payable && typeof payable === 'object') for (const metal of Object.keys(payable)) metals.add(metal);
  }
  return [...metals].sort((a, b) => a.localeCompare(b));
}

async function loadCanonicalCompany(company: { ticker: string; name: string }): Promise<PreRevenueCompany | null> {
  const projects = await listCompanyProjects(company.ticker);
  if (projects.length === 0) return null;
  const localExtraShares = readManualExtraShares(company.ticker);
  try {
    const [profileRes, statementsRes, persistedFinancing, projectRecords] = await Promise.all([
      fetch(`/api/company/profile?ticker=${encodeURIComponent(company.ticker)}`),
      fetch(`/api/company?ticker=${encodeURIComponent(company.ticker)}&period=fy`),
      loadLiveCorporateFinancingState(company.ticker),
      Promise.all(projects.map((project) => getCompanyProject(company.ticker, project.project_id))),
    ]);
    const profileBody = await profileRes.json() as ProfileResponse;
    const statements = await statementsRes.json() as CompanyResponse;
    const profile = profileBody.profile ?? null;
    const metals = extractMetals(projectRecords.map((record) => record.raw_json));
    const resolution = resolveCanonicalCorporateSnapshotInputs({
      symbol: company.ticker,
      profile,
      statements,
      projectIds: projects.map((project) => project.project_id),
      financingPlan: persistedFinancing?.financingPlan,
      financingPlanByProject: persistedFinancing?.financingPlanByProject,
      manualExtraShares: persistedFinancing?.extraShares ?? localExtraShares,
      manualMetalPrices: getManualMetalPriceStore(),
      valuationYear: new Date().getUTCFullYear(),
      discountRate: 0.1,
      scenario: { mode: 'spot' },
    });
    const price = resolution.currentPriceTargetCurrency;
    const sharesCurrent = resolution.sharesCurrent;
    const targetCurrency = resolution.targetCurrency;
    const manualExtraShares = resolution.manualExtraShares;
    if (!resolution.request) {
      return {
        ...company,
        projects,
        metals,
        snapshot: null,
        metrics: null,
        price,
        sharesCurrent,
        targetCurrency,
        manualExtraShares,
        metricError: resolution.diagnostics.join(' · ') || 'Kanoniska Corporate-inputs saknas.',
      };
    }

    const body = await postCorporateSnapshot(resolution.request, { refresh: targetCurrency !== 'USD' });
    const snapshot = body.ok && body.snapshot ? body.snapshot : null;
    const metrics = snapshot
      ? deriveCorporatePreRevenueMetrics({
          snapshot,
          currentPriceTargetCurrency: price,
          valuationYear: resolution.valuationYear,
          manualExtraShares,
          referenceMetals: metals,
        })
      : null;
    return {
      ...company,
      projects,
      metals,
      snapshot,
      metrics,
      price,
      sharesCurrent,
      targetCurrency,
      manualExtraShares,
      metricError: snapshot ? null : (body.diagnostics?.errors?.join(' · ') || 'Corporate snapshot kunde inte beräknas.'),
    };
  } catch (error) {
    return {
      ...company,
      projects,
      metals: [],
      snapshot: null,
      metrics: null,
      price: null,
      sharesCurrent: null,
      targetCurrency: null,
      manualExtraShares: localExtraShares,
      metricError: (error as Error).message,
    };
  }
}

function PreRevenueCompareDashboard() {
  const [rows, setRows] = useState<PreRevenueCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metalFilter, setMetalFilter] = useState<string>('ALL');
  const [sortKey, setSortKey] = useState<'company' | PreRevenueSortableMetricKey | null>(null);
  const [sortDirection, setSortDirection] = useState<PreRevenueSortDirection>('asc');
  useEffect(() => { const controller = new AbortController(); async function load() { setLoading(true); setError(null); try { const response = await fetch('/api/company/list?limit=500', { signal: controller.signal }); const body = await response.json() as CompanyListResponse; if (!response.ok || !body.ok || !Array.isArray(body.companies)) throw new Error('Kunde inte läsa bolagsuniversum.'); const candidates = await Promise.all(body.companies.map(async (company) => { try { return await loadCanonicalCompany(company); } catch { return null; } })); if (!controller.signal.aborted) setRows(candidates.filter((row): row is PreRevenueCompany => row !== null)); } catch (err) { if ((err as Error).name !== 'AbortError') setError((err as Error).message); } finally { if (!controller.signal.aborted) setLoading(false); } } void load(); return () => controller.abort(); }, []);
  const metals = useMemo(() => [...new Set(rows.flatMap((row) => row.metals))].sort((a, b) => a.localeCompare(b)), [rows]);
  const filteredRows = useMemo(() => metalFilter === 'ALL' ? rows : rows.filter((row) => row.metals.includes(metalFilter)), [rows, metalFilter]);
  const referenceMetal = metalFilter === 'ALL' ? 'Au' : metalFilter;
  const visibleRows = useMemo(() => {
    const next = [...filteredRows];
    if (sortKey === 'company') {
      next.sort((left, right) => {
        const compared = left.name.localeCompare(right.name, 'sv');
        const ordered = compared !== 0 ? compared : left.ticker.localeCompare(right.ticker, 'sv');
        return sortDirection === 'asc' ? ordered : -ordered;
      });
    } else if (sortKey) {
      next.sort((left, right) => {
        const compared = comparePreRevenueMetricValues(left.metrics, right.metrics, sortKey, referenceMetal, sortDirection);
        return compared !== 0 ? compared : left.name.localeCompare(right.name, 'sv');
      });
    }
    return next;
  }, [filteredRows, referenceMetal, sortDirection, sortKey]);
  const groups = useMemo(() => metricGroups(referenceMetal), [referenceMetal]);
  const metricColumns = useMemo<MetricColumn[]>(() => groups.flatMap((group) => [...group.columns]), [groups]);
  const requestSort = (key: 'company' | PreRevenueSortableMetricKey) => {
    if (sortKey === key) {
      setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'company' ? 'asc' : defaultPreRevenueSortDirection(key));
  };
  const ariaSort = (key: 'company' | PreRevenueSortableMetricKey): 'ascending' | 'descending' | 'none' =>
    sortKey === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';
  const sortIndicator = (key: 'company' | PreRevenueSortableMetricKey) =>
    sortKey === key ? (sortDirection === 'asc' ? '↑' : '↓') : '↕';
  return <div className="pre-revenue-compare">
    <div className="pre-revenue-compare__intro"><div><strong>PRE REVENUE · CORPORATE CANONICAL</strong><p>Jämför projektkvalitet, skala och priset marknaden betalar för den ekonomiskt relevanta metallbasen.</p></div><div className="pre-revenue-compare__basis"><strong>Kanonisk källa:</strong> samma Corporate snapshot, EV bridge och sparade finansieringsplan som Corporate-vyn. Finansieringsmix och extra aktier kan återanvändas mellan enheter.</div></div>
    {!loading && !error && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 14px' }} aria-label="Filtrera efter metall"><button type="button" onClick={() => setMetalFilter('ALL')} aria-pressed={metalFilter === 'ALL'} style={{ padding: '5px 10px', border: '1px solid currentColor', background: metalFilter === 'ALL' ? 'rgba(20,35,32,.14)' : 'transparent', font: 'inherit', fontSize: '.76rem', fontWeight: 700, cursor: 'pointer' }}>ALLA</button>{metals.map((metal) => <button key={metal} type="button" onClick={() => setMetalFilter(metal)} aria-pressed={metalFilter === metal} style={{ padding: '5px 10px', border: '1px solid currentColor', background: metalFilter === metal ? 'rgba(20,35,32,.14)' : 'transparent', font: 'inherit', fontSize: '.76rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}>{metal}</button>)}</div>}
    {loading && <div className="producer-compare__state">Laddar Corporate snapshots…</div>}{error && <div className="producer-compare__error">{error}</div>}
    {!loading && !error && <div className="pre-revenue-compare__table-wrap"><table className="pre-revenue-compare__table"><thead><tr className="pre-revenue-compare__group-row"><th>BOLAG</th>{groups.map((group) => <th key={group.label} colSpan={group.columns.length}>{group.label}</th>)}</tr><tr><th aria-sort={ariaSort('company')}><button type="button" className="pre-revenue-compare__sort-button" onClick={() => requestSort('company')}>Bolag <span aria-hidden="true" className="pre-revenue-compare__sort-indicator">{sortIndicator('company')}</span></button></th>{metricColumns.map(([key, label, help]) => {
      const sortable = isPreRevenueSortableMetricKey(key);
      return <th key={label} title={help} aria-sort={sortable ? ariaSort(key) : undefined}>{sortable ? <button type="button" className="pre-revenue-compare__sort-button" onClick={() => requestSort(key)}>{label} <span aria-hidden="true" className="pre-revenue-compare__sort-indicator">{sortIndicator(key)}</span></button> : label}</th>;
    })}</tr></thead><tbody>
      {visibleRows.map((row) => <tr key={row.ticker}><td className="pre-revenue-compare__company-cell"><a className="pre-revenue-compare__company-link" href={`/company/${encodeURIComponent(row.ticker)}/corporate`}><strong>{row.name}</strong></a>{row.metricError && <small className="pre-revenue-compare__company-error" title={row.metricError}> · Ej beräkningsbar</small>}<div className="pre-revenue-compare__company-meta"><span>{row.ticker}</span><span>{row.projects.length} projekt · {row.projects.map((project) => project.project_name || project.project_id).join(' · ')}</span></div></td>{metricColumns.map(([key]) => { const value = getMetric(row, key, referenceMetal); const content = key === 'investmentScore' ? <InvestmentScoreCell symbol={row.ticker} projectIds={row.projects.map((project) => project.project_id)} snapshot={row.snapshot} priceCurrentTargetCurrency={row.price} manualExtraShares={row.manualExtraShares} /> : key === 'tier' ? <Tier1StatusCell symbol={row.ticker} /> : value; return <td className={key !== 'tier' && key !== 'investmentScore' && value === '—' ? 'pre-revenue-compare__pending' : undefined} key={`${row.ticker}-${key}`}>{content}</td>; })}</tr>)}
      {visibleRows.length === 0 && <tr><td colSpan={1 + metricColumns.length}>Inga bolag med vald metall och sparade modellerade projekt hittades.</td></tr>}
    </tbody></table></div>}
  </div>;
}

export default function CompareStocksDashboard() { const [tab, setTab] = useState<CompareTab>('producer'); return <div className="compare-stocks"><div className="compare-stocks__tabs" role="tablist" aria-label="Compare Stocks model"><button type="button" role="tab" aria-selected={tab === 'producer'} className={tab === 'producer' ? 'is-active' : ''} onClick={() => setTab('producer')}>PRODUCER</button><button type="button" role="tab" aria-selected={tab === 'pre-revenue'} className={tab === 'pre-revenue' ? 'is-active' : ''} onClick={() => setTab('pre-revenue')}>PRE REVENUE</button></div>{tab === 'producer' ? <ProducerCompareDashboard /> : <PreRevenueCompareDashboard />}</div>; }
