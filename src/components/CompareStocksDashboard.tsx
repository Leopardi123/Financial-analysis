import { useEffect, useMemo, useState } from 'react';
import ProducerCompareDashboard from './ProducerCompareDashboard.tsx';
import Tier1StatusCell from './Tier1StatusCell.tsx';
import InvestmentScoreCell from './investmentScore/InvestmentScoreCell.tsx';
import { getCompanyProject, listCompanyProjects, type CompanyProjectSummary } from '../lib/client/companyProjectsClient.ts';
import { loadLiveCorporateFinancingState } from '../lib/client/corporateFinancingStateStore.ts';
import type { CorporateSnapshot } from '../lib/corporate/snapshot/types.ts';
import { extraSharesStorageKey, parseExtraShares } from '../lib/market/extraShares.ts';
import { getPriceKeyDefinition } from '../lib/prices/keys.ts';
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
  metals: string[];
  snapshot: SnapshotWithValuationSeries | null;
  price: number | null;
  sharesCurrent: number | null;
  targetCurrency: string | null;
  productionStartYear: number | null;
  manualExtraShares: number;
  metricError: string | null;
};

type EqProductionStats = { lomEq: number; tenYearEq: number; annualEq: number; productionYears: number; unit: 'oz' | 't' };
type ValuationMarker = NonNullable<CorporateSnapshot['modeledValuationTimeline']>['markers'][number];

const LB_PER_TONNE = 2204.6226218;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const readFinite = (value: unknown): number | null => finite(value) ? value : null;
const clamp01 = (value: unknown, fallback: number): number => finite(value) ? Math.max(0, Math.min(1, value)) : fallback;
const lastFinite = (values: Array<number | null> | undefined): number | null => {
  if (!Array.isArray(values)) return null;
  for (let i = values.length - 1; i >= 0; i -= 1) if (finite(values[i])) return values[i] as number;
  return null;
};

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
      ['lom', 'LOM', `Antal år med positiv canonical payable ${eq}-produktion`],
      ['initialCapex', 'Initial CAPEX', 'Initial construction CAPEX från Corporate canonical timeline, visad i USD för jämförbarhet'],
      ['capexAnnualAueq', `CAPEX / annual ${eq}`, `Initial CAPEX i USD dividerat med annual ${eq}`],
    ] },
    { label: 'SKALA', columns: [
      ['annualAueq', `Annual ${eq}`, `LOM ${eq} dividerat med antal positiva produktionsår`],
      ['aueq10y', `10y ${eq}`, `Canonical spot-revenue uttryckt som ${eq} under de första upp till tio produktionsåren`],
      ['aueqLom', `LOM ${eq}`, `Canonical spot-revenue uttryckt som ${eq} över hela produktionsperioden`],
      ['aueqPerShare', `${eq} / aktie`, `LOM ${eq} dividerat med canonical aktier efter modellerad finansiering och manuellt tillagda extra aktier`],
    ] },
    { label: 'RELATIV VÄRDERING', columns: [
      ['mcap10yAueq', `MCap / 10y ${eq}`, `Market cap i USD per canonical 10y ${eq}`],
      ['mcapLomAueq', `MCap / LOM ${eq}`, `Market cap i USD per canonical LOM ${eq}`],
      ['evLomAueq', `EV / LOM ${eq}`, `Enterprise value i USD inklusive Corporate cash/debt/financing bridge per canonical LOM ${eq}`],
    ] },
  ];
}

function resolveShares(statements: CompanyResponse): number | null {
  const candidates = [statements.balance?.commonStockSharesOutstanding, statements.balance?.commonStockSharesIssued, statements.income?.weightedAverageShsOutDil, statements.income?.weightedAverageShsOut];
  for (const series of candidates) { const value = lastFinite(series); if (value !== null && value > 0) return value; }
  return null;
}
function resolveLatestCash(statements: CompanyResponse): number | null { return lastFinite(statements.balance?.cashAndCashEquivalents) ?? lastFinite(statements.balance?.cashAndShortTermInvestments); }
function resolveLatestDebt(statements: CompanyResponse): number | null {
  const direct = lastFinite(statements.balance?.totalDebt); if (direct !== null) return direct;
  const shortTerm = lastFinite(statements.balance?.shortTermDebt); const longTerm = lastFinite(statements.balance?.longTermDebt);
  return shortTerm === null && longTerm === null ? null : (shortTerm ?? 0) + (longTerm ?? 0);
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

function eqSeries(snapshot: SnapshotWithValuationSeries, metal: string): { values: Array<number | null>; unit: 'oz' | 't' } | null {
  const revenue = snapshot.aggregation?.grossRevenueUSD_total;
  const priceKey = snapshot.aggregation?.priceKeyByMetal?.[metal];
  const prices = snapshot.aggregation?.priceUSDByMetal?.[metal] ?? (metal === 'Au' ? snapshot.aggregation?.auPriceUSDPerOz : undefined);
  if (!Array.isArray(revenue) || !Array.isArray(prices) || revenue.length !== prices.length) return null;
  let canonicalUnit: 'USD_per_toz' | 'USD_per_lb' | 'USD_per_tonne';
  try {
    const unit = priceKey ? getPriceKeyDefinition(priceKey).canonicalUnit : metal === 'Au' ? 'USD_per_toz' : null;
    if (unit !== 'USD_per_toz' && unit !== 'USD_per_lb' && unit !== 'USD_per_tonne') return null;
    canonicalUnit = unit;
  } catch { return null; }
  const divisor = canonicalUnit === 'USD_per_lb' ? LB_PER_TONNE : 1;
  const unit: 'oz' | 't' = canonicalUnit === 'USD_per_toz' ? 'oz' : 't';
  return {
    unit,
    values: revenue.map((value, index) => finite(value) && value >= 0 && finite(prices[index]) && (prices[index] as number) > 0 ? (value / (prices[index] as number)) / divisor : null),
  };
}

function computeEqProductionStats(snapshot: SnapshotWithValuationSeries, metal: string): EqProductionStats | null {
  const eq = eqSeries(snapshot, metal); if (!eq || eq.values.length === 0) return null;
  const firstPositive = eq.values.findIndex((value) => finite(value) && value > 0); let lastPositive = -1;
  for (let i = eq.values.length - 1; i >= 0; i -= 1) if (finite(eq.values[i]) && (eq.values[i] as number) > 0) { lastPositive = i; break; }
  if (firstPositive < 0 || lastPositive < firstPositive) return null;
  const productionValues: number[] = [];
  for (let i = firstPositive; i <= lastPositive; i += 1) { const value = eq.values[i]; if (!finite(value) || value < 0) return null; if (value > 0) productionValues.push(value); }
  if (productionValues.length === 0) return null;
  const lomEq = productionValues.reduce((sum, value) => sum + value, 0);
  return { lomEq, tenYearEq: productionValues.slice(0, 10).reduce((sum, value) => sum + value, 0), annualEq: lomEq / productionValues.length, productionYears: productionValues.length, unit: eq.unit };
}

function markerYear(marker: ValuationMarker | null | undefined): number | null { if (!marker) return null; const raw = marker.yearLabelUsed; if (finite(raw)) return raw; if (typeof raw === 'string' && raw.trim()) { const parsed = Number(raw); return Number.isFinite(parsed) ? parsed : null; } return null; }
function validValuationMarkers(snapshot: SnapshotWithValuationSeries): ValuationMarker[] { const markers = snapshot.modeledValuationTimeline?.markers; return Array.isArray(markers) ? markers.filter((marker) => markerYear(marker) !== null && finite(marker.value_low) && finite(marker.value_high)) : []; }
function nextRelevantProjectMarker(snapshot: SnapshotWithValuationSeries, currentYear = new Date().getUTCFullYear()): ValuationMarker | null { const markers = validValuationMarkers(snapshot).sort((a, b) => (markerYear(a) ?? Infinity) - (markerYear(b) ?? Infinity)); return markers.find((marker) => (markerYear(marker) ?? -Infinity) > currentYear) ?? null; }
function canonicalMarkerTarget(marker: ValuationMarker | null): number | null { if (!marker) return null; if (finite(marker.value_mid_if_any)) return marker.value_mid_if_any; return finite(marker.value_low) && finite(marker.value_high) ? (marker.value_low + marker.value_high) / 2 : null; }
function extraShareScale(snapshot: SnapshotWithValuationSeries, extraShares: number): number { if (!(extraShares > 0)) return 1; const sharesPostFinancing = snapshot.financing?.shares_post_financing; if (!finite(sharesPostFinancing) || sharesPostFinancing <= 0) return 1; return sharesPostFinancing / (sharesPostFinancing + extraShares); }
function postFinancingShares(snapshot: SnapshotWithValuationSeries, extraShares: number): number | null { const modeledShares = snapshot.financing?.shares_post_financing; if (!finite(modeledShares) || modeledShares <= 0) return null; const manualShares = Number.isSafeInteger(extraShares) && extraShares >= 0 ? extraShares : 0; return modeledShares + manualShares; }
function pNavPostFinancing(snapshot: SnapshotWithValuationSeries, price: number | null, extraShares: number): number | null { const sharesPf = postFinancingShares(snapshot, extraShares); const nav = snapshot.NAV_today_TargetCurrency; if (!finite(price) || price < 0 || !finite(sharesPf) || sharesPf <= 0 || !finite(nav) || nav <= 0) return null; return (price * sharesPf) / nav; }
function peakSixTimesValuePerShare(snapshot: SnapshotWithValuationSeries, scale = 1): number | null { const rows = snapshot.corporateValuationTimeSeries?.rows; if (!Array.isArray(rows)) return null; let peak: number | null = null; for (const valuationRow of rows) if (finite(valuationRow.evEbitda6xPerShare)) { const adjusted = valuationRow.evEbitda6xPerShare * scale; peak = peak === null ? adjusted : Math.max(peak, adjusted); } return peak; }
function targetCurrencyToUsd(snapshot: SnapshotWithValuationSeries, value: number | null): number | null { if (!finite(value)) return null; const fx = readFinite(snapshot.fx_USD_to_TargetCurrency); if (!finite(fx) || fx <= 0) return null; return value / fx; }

function getMetric(row: PreRevenueCompany, key: MetricKey, referenceMetal: string): string {
  const s = row.snapshot; if (!s) return '—';
  const lista3 = s.corporate?.lista3Metrics; const eq = computeEqProductionStats(s, referenceMetal); const scale = extraShareScale(s, row.manualExtraShares);
  const marker = nextRelevantProjectMarker(s); const rawTarget = canonicalMarkerTarget(marker); const target = finite(rawTarget) ? rawTarget * scale : null;
  const targetYear = markerYear(marker) ?? row.productionStartYear; const currentYear = new Date().getUTCFullYear(); const yearsToProduction = finite(targetYear) && targetYear > currentYear ? targetYear - currentYear : null;
  const annualReturn = finite(target) && finite(row.price) && row.price > 0 && finite(yearsToProduction) && yearsToProduction > 0 ? (target / row.price) ** (1 / yearsToProduction) - 1 : null;
  const peak6xPerShare = peakSixTimesValuePerShare(s, scale); const peak6xVsPrice = finite(peak6xPerShare) && finite(row.price) && row.price > 0 ? peak6xPerShare / row.price : null;
  const initialCapexUsd = targetCurrencyToUsd(s, marker?.lista2Metrics?.InitialCAPEX_incremental_TargetCurrency ?? null); const sharesPf = postFinancingShares(s, row.manualExtraShares);
  const marketCapUsd = targetCurrencyToUsd(s, s.MarketCap_TargetCurrency); const evUsd = targetCurrencyToUsd(s, s.EV_TargetCurrency); const unit = eq?.unit ?? (referenceMetal === 'Au' ? 'oz' : 't');
  switch (key) {
    case 'investmentScore': return '—';
    case 'pNav': return formatMultiple(pNavPostFinancing(s, row.price, row.manualExtraShares));
    case 'evEbitdaPeak': return finite(peak6xPerShare) && finite(peak6xVsPrice) ? `${formatMoney(peak6xPerShare, row.targetCurrency)} · ${formatMultiple(peak6xVsPrice)}` : '—';
    case 'targetPrice': return finite(target) && finite(row.price) && row.price > 0 ? `${formatMoney(target, row.targetCurrency)} · ${formatMultiple(target / row.price)}` : '—';
    case 'annualReturn': return formatPct(annualReturn);
    case 'tier': return '—';
    case 'irr': return formatPct(lista3?.IRR ?? s.project?.modeled?.npvSpotRange?.base?.irr ?? null);
    case 'payback': return finite(s.Payback_real_years) ? `${formatNumber(s.Payback_real_years, 1)} år` : finite(s.Payback_approx_years) ? `${formatNumber(s.Payback_approx_years, 1)} år` : '—';
    case 'lom': return eq ? `${eq.productionYears} år` : '—';
    case 'initialCapex': return formatMoney(initialCapexUsd, 'USD');
    case 'capexAnnualAueq': return eq && finite(initialCapexUsd) && eq.annualEq > 0 ? `${formatNumber(initialCapexUsd / eq.annualEq)} USD/${unit}` : '—';
    case 'annualAueq': return eq ? `${formatNumber(eq.annualEq)} ${unit}` : '—';
    case 'aueq10y': return eq ? `${formatNumber(eq.tenYearEq)} ${unit}` : '—';
    case 'aueqLom': return eq ? `${formatNumber(eq.lomEq)} ${unit}` : '—';
    case 'aueqPerShare': return eq && finite(sharesPf) && sharesPf > 0 ? `${formatNumber(eq.lomEq / sharesPf, 4)} ${unit}/aktie` : '—';
    case 'mcap10yAueq': return eq && finite(marketCapUsd) && eq.tenYearEq > 0 ? `${formatNumber(marketCapUsd / eq.tenYearEq)} USD/${unit}` : '—';
    case 'mcapLomAueq': return eq && finite(marketCapUsd) && eq.lomEq > 0 ? `${formatNumber(marketCapUsd / eq.lomEq)} USD/${unit}` : '—';
    case 'evLomAueq': return eq && finite(evUsd) && eq.lomEq > 0 ? `${formatNumber(evUsd / eq.lomEq)} USD/${unit}` : '—';
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
  const projects = await listCompanyProjects(company.ticker); if (projects.length === 0) return null; const localExtraShares = readManualExtraShares(company.ticker);
  try {
    const [profileRes, statementsRes, persistedFinancing, projectRecords] = await Promise.all([
      fetch(`/api/company/profile?ticker=${encodeURIComponent(company.ticker)}`), fetch(`/api/company?ticker=${encodeURIComponent(company.ticker)}&period=fy`), loadLiveCorporateFinancingState(company.ticker), Promise.all(projects.map((project) => getCompanyProject(company.ticker, project.project_id))),
    ]);
    const profileBody = await profileRes.json() as ProfileResponse; const statements = await statementsRes.json() as CompanyResponse; const profile = profileBody.profile ?? null;
    const price = readFinite(profile?.price); const sharesCurrent = resolveShares(statements); const latestCash = resolveLatestCash(statements); const latestDebt = resolveLatestDebt(statements);
    const targetCurrency = typeof profile?.currency === 'string' && profile.currency.trim() ? profile.currency.trim().toUpperCase() : 'USD'; const manualExtraShares = persistedFinancing?.extraShares ?? localExtraShares; const metals = extractMetals(projectRecords.map((record) => record.raw_json));
    if (!finite(price) || price <= 0 || !finite(sharesCurrent) || sharesCurrent <= 0) return { ...company, projects, metals, snapshot: null, price, sharesCurrent, targetCurrency, productionStartYear: null, manualExtraShares, metricError: 'Saknar kanoniskt marknadspris eller aktieantal.' };
    const financingPlanByProject = Object.fromEntries(projects.map((project) => { const saved = persistedFinancing?.financingPlanByProject?.[project.project_id]; const equityFraction = clamp01(saved?.equity_fraction, 1); return [project.project_id, { equity_fraction: equityFraction, debt_fraction: 1 - equityFraction, equity_raise_price_TargetCurrency: price }]; }));
    const firstProjectId = projects[0]?.project_id ?? null; const firstProjectPlan = firstProjectId ? financingPlanByProject[firstProjectId] : null; const savedPlan = persistedFinancing?.financingPlan; const equityFraction = firstProjectPlan?.equity_fraction ?? clamp01(savedPlan?.equity_fraction, 1);
    const financingPlan = { equity_fraction: equityFraction, debt_fraction: 1 - equityFraction, use_cash_first: savedPlan?.use_cash_first === true, cash_use_percent: clamp01(savedPlan?.cash_use_percent, 1), minimum_cash_reserve_TargetCurrency: 0, equity_raise_price_TargetCurrency: price };
    const response = await fetch('/api/snapshot/corporate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: company.ticker, valuationYear: new Date().getUTCFullYear(), targetCurrency, discountRate: 0.1, market: { shares_current: sharesCurrent, price_current_TargetCurrency: price }, balanceSheet: { cash_t0_TargetCurrency: latestCash, debt_t0_TargetCurrency: latestDebt }, financingPlan, financingPlanByProject, scenario: { mode: 'spot' }, fx: { source: targetCurrency === 'USD' ? 'manual' : 'auto', anchor: 'today', scenario: { mode: 'spot' }, manual_fx_USD_to_TargetCurrency: targetCurrency === 'USD' ? 1 : undefined } }) });
    const body = await response.json() as SnapshotResponse; const snapshot = response.ok && body.ok && body.snapshot ? body.snapshot : null; const nextMarker = snapshot ? nextRelevantProjectMarker(snapshot) : null;
    return { ...company, projects, metals, snapshot, price, sharesCurrent, targetCurrency, productionStartYear: markerYear(nextMarker), manualExtraShares, metricError: snapshot ? null : (body.diagnostics?.errors?.join(' · ') || 'Corporate snapshot kunde inte beräknas.') };
  } catch (error) { return { ...company, projects, metals: [], snapshot: null, price: null, sharesCurrent: null, targetCurrency: null, productionStartYear: null, manualExtraShares: localExtraShares, metricError: (error as Error).message }; }
}

function PreRevenueCompareDashboard() {
  const [rows, setRows] = useState<PreRevenueCompany[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [metalFilter, setMetalFilter] = useState<string>('ALL');
  useEffect(() => { const controller = new AbortController(); async function load() { setLoading(true); setError(null); try { const response = await fetch('/api/company/list?limit=500', { signal: controller.signal }); const body = await response.json() as CompanyListResponse; if (!response.ok || !body.ok || !Array.isArray(body.companies)) throw new Error('Kunde inte läsa bolagsuniversum.'); const candidates = await Promise.all(body.companies.map(async (company) => { try { return await loadCanonicalCompany(company); } catch { return null; } })); if (!controller.signal.aborted) setRows(candidates.filter((row): row is PreRevenueCompany => row !== null)); } catch (err) { if ((err as Error).name !== 'AbortError') setError((err as Error).message); } finally { if (!controller.signal.aborted) setLoading(false); } } void load(); return () => controller.abort(); }, []);
  const metals = useMemo(() => [...new Set(rows.flatMap((row) => row.metals))].sort((a, b) => a.localeCompare(b)), [rows]);
  const visibleRows = useMemo(() => metalFilter === 'ALL' ? rows : rows.filter((row) => row.metals.includes(metalFilter)), [rows, metalFilter]);
  const referenceMetal = metalFilter === 'ALL' ? 'Au' : metalFilter; const groups = useMemo(() => metricGroups(referenceMetal), [referenceMetal]); const metricColumns = useMemo<MetricColumn[]>(() => groups.flatMap((group) => [...group.columns]), [groups]);
  return <div className="pre-revenue-compare">
    <div className="pre-revenue-compare__intro"><div><strong>PRE REVENUE · CORPORATE CANONICAL</strong><p>Jämför projektkvalitet, skala och priset marknaden betalar för den ekonomiskt relevanta metallbasen.</p></div><div className="pre-revenue-compare__basis"><strong>Kanonisk källa:</strong> samma Corporate snapshot, EV bridge och sparade finansieringsplan som Corporate-vyn. Finansieringsmix och extra aktier kan återanvändas mellan enheter.</div></div>
    {!loading && !error && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 14px' }} aria-label="Filtrera efter metall"><button type="button" onClick={() => setMetalFilter('ALL')} aria-pressed={metalFilter === 'ALL'} style={{ padding: '5px 10px', border: '1px solid currentColor', background: metalFilter === 'ALL' ? 'rgba(20,35,32,.14)' : 'transparent', font: 'inherit', fontSize: '.76rem', fontWeight: 700, cursor: 'pointer' }}>ALLA</button>{metals.map((metal) => <button key={metal} type="button" onClick={() => setMetalFilter(metal)} aria-pressed={metalFilter === metal} style={{ padding: '5px 10px', border: '1px solid currentColor', background: metalFilter === metal ? 'rgba(20,35,32,.14)' : 'transparent', font: 'inherit', fontSize: '.76rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}>{metal}</button>)}</div>}
    {loading && <div className="producer-compare__state">Laddar Corporate snapshots…</div>}{error && <div className="producer-compare__error">{error}</div>}
    {!loading && !error && <div className="pre-revenue-compare__table-wrap"><table className="pre-revenue-compare__table"><thead><tr className="pre-revenue-compare__group-row"><th>BOLAG</th>{groups.map((group) => <th key={group.label} colSpan={group.columns.length}>{group.label}</th>)}</tr><tr><th>Bolag</th>{metricColumns.map(([, label, help]) => <th key={label} title={help}>{label}</th>)}</tr></thead><tbody>
      {visibleRows.map((row) => <tr key={row.ticker}><td className="pre-revenue-compare__company-cell"><a className="pre-revenue-compare__company-link" href={`/company/${encodeURIComponent(row.ticker)}/corporate`}><strong>{row.name}</strong></a>{row.metricError && <small className="pre-revenue-compare__company-error" title={row.metricError}> · Ej beräkningsbar</small>}<div className="pre-revenue-compare__company-meta"><span>{row.ticker}</span><span>{row.projects.length} projekt · {row.projects.map((project) => project.project_name || project.project_id).join(' · ')}</span></div></td>{metricColumns.map(([key]) => { const value = getMetric(row, key, referenceMetal); const content = key === 'investmentScore' ? <InvestmentScoreCell symbol={row.ticker} projectIds={row.projects.map((project) => project.project_id)} snapshot={row.snapshot} priceCurrentTargetCurrency={row.price} manualExtraShares={row.manualExtraShares} /> : key === 'tier' ? <Tier1StatusCell symbol={row.ticker} /> : value; return <td className={key !== 'tier' && key !== 'investmentScore' && value === '—' ? 'pre-revenue-compare__pending' : undefined} key={`${row.ticker}-${key}`}>{content}</td>; })}</tr>)}
      {visibleRows.length === 0 && <tr><td colSpan={1 + metricColumns.length}>Inga bolag med vald metall och sparade modellerade projekt hittades.</td></tr>}
    </tbody></table></div>}
  </div>;
}

export default function CompareStocksDashboard() { const [tab, setTab] = useState<CompareTab>('producer'); return <div className="compare-stocks"><div className="compare-stocks__tabs" role="tablist" aria-label="Compare Stocks model"><button type="button" role="tab" aria-selected={tab === 'producer'} className={tab === 'producer' ? 'is-active' : ''} onClick={() => setTab('producer')}>PRODUCER</button><button type="button" role="tab" aria-selected={tab === 'pre-revenue'} className={tab === 'pre-revenue' ? 'is-active' : ''} onClick={() => setTab('pre-revenue')}>PRE REVENUE</button></div>{tab === 'producer' ? <ProducerCompareDashboard /> : <PreRevenueCompareDashboard />}</div>; }
