import { query } from '../../../../api/_db.ts';
import { loadProjectsForSymbol } from '../../api/loadProjectsForSymbol.ts';
import { aggregateProjectsCorporateV1 } from '../../corporate/aggregateProjects.ts';
import type { CorporateProjectEngineSnapshot } from '../../corporate/types.ts';
import { computeProjectEngineFullProductionV1 } from '../../project/engineFullProductionV1.ts';
import { computeProjectPhase2 } from '../../project/phase2.ts';
import { parseProjectJsonV1 } from '../../project/jsonv1/parse.ts';
import { resolveProjectPricesToEngineInput } from '../../project/jsonv1/resolvePrices.ts';
import { readHistoryRowsInRange } from '../../prices/db/readHistory.ts';
import type { PriceKey } from '../../prices/keys.ts';
import { analyzeRecentSustainedLows } from '../recentSustainedLow.ts';

const COMPANY_PROJECTS_TABLE = 'company_projects';
const WINDOWS = [3, 5, 7] as const;
const LOOKBACK_YEARS = 7;
const ROLLING_MONTHS = 6;
const SEPARATION_MONTHS = 12;
const LOW_COUNT = 3;
const DISCOUNT_RATE = 0.10;
type WindowYears = typeof WINDOWS[number];
type Tier = 'T1' | 'T2' | 'T3' | 'FAIL';

type Basis = { npv: number; irr: number | null };
type Row = {
  symbol: string;
  projectCount: number;
  windowYears: WindowYears;
  constructionAnchorYear: number;
  calendar: Basis;
  project: Basis;
  stressCalendar: Basis;
  stressProject: Basis;
  revenueRetention: number;
  revenueDrawdown: number;
  calendarRetention: number;
  projectRetention: number;
  calendarBeta: number | null;
  projectBeta: number | null;
  stressProjectIrr: number | null;
};

type ProjectRun = {
  projectId: string;
  rawJson: unknown;
  years: number[];
  productionStartYear: number;
  constructionStartYear: number;
  baseInput: Awaited<ReturnType<typeof resolveProjectPricesToEngineInput>>;
  stressInput: Awaited<ReturnType<typeof resolveProjectPricesToEngineInput>>;
  baseOutput: ReturnType<typeof computeProjectEngineFullProductionV1>;
  stressOutput: ReturnType<typeof computeProjectEngineFullProductionV1>;
};

function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function clone<T>(value: T): T { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T; }
function dateYearsAgo(to: string, yearsAgo: number): string { const d = new Date(`${to}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - yearsAgo); return d.toISOString().slice(0, 10); }
function scalarPrice(series: Array<number | null> | undefined): number | null {
  if (!Array.isArray(series)) return null;
  const values = series.filter((v): v is number => finite(v) && v > 0);
  if (!values.length) return null;
  const first = values[0], tol = Math.max(1e-9, Math.abs(first) * 1e-9);
  return values.every((v) => Math.abs(v - first) <= tol) ? first : null;
}
function lastProductionPeriod(payable: Record<string, Array<number | null>>, fallback: number): number {
  let last = -1;
  for (const series of Object.values(payable)) for (let t = 0; t < series.length; t += 1) if (finite(series[t]) && (series[t] as number) > 0) last = Math.max(last, t);
  return last >= 0 ? last : fallback;
}
function firstConstructionPeriod(capex: Array<number | null>, productionStartPeriod: number): number {
  for (let t = 0; t <= productionStartPeriod; t += 1) if (finite(capex[t]) && Math.abs(capex[t] as number) > 1e-6) return t;
  return productionStartPeriod;
}
function sumEconomicRevenue(gross: Array<number | null>, credits: Array<number | null> | null | undefined, fromT: number, toT: number): number | null {
  let total = 0;
  for (let t = fromT; t <= toT; t += 1) {
    if (!finite(gross[t])) return null;
    const credit = credits?.[t];
    if (credit != null && !finite(credit)) return null;
    total += (gross[t] as number) + (finite(credit) ? credit : 0);
  }
  return total;
}
function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

const stressPriceCache = new Map<string, number | null>();
async function stressPrice(priceKey: string): Promise<number | null> {
  if (stressPriceCache.has(priceKey)) return stressPriceCache.get(priceKey) ?? null;
  const to = new Date().toISOString().slice(0, 10), from = dateYearsAgo(to, LOOKBACK_YEARS);
  try {
    const history = await readHistoryRowsInRange({ priceKey: priceKey as PriceKey, from, to });
    const a = analyzeRecentSustainedLows(history.rows, { lookbackYears: LOOKBACK_YEARS, rollingMonths: ROLLING_MONTHS, minimumSeparationMonths: SEPARATION_MONTHS, selectedLowCount: LOW_COUNT });
    const value = a.status === 'COMPUTABLE' && finite(a.stressPrice) ? a.stressPrice : null;
    stressPriceCache.set(priceKey, value); return value;
  } catch { stressPriceCache.set(priceKey, null); return null; }
}

function snapshot(run: ProjectRun, stressed: boolean): CorporateProjectEngineSnapshot {
  const input = stressed ? run.stressInput : run.baseInput;
  const out = stressed ? run.stressOutput : run.baseOutput;
  return {
    capexUSD: out.capexUSD_used,
    fcffUSD: out.phase1.fcffUSD,
    grossRevenueUSD: out.revenue.grossRevenueUSD,
    auPriceUSDPerOz: input.aisc.auPriceUSDPerOz,
    priceUSDByMetal: input.spotPriceUSDByMetal,
    priceKeyByMetal: input.priceKeyByMetal,
    sustainingCostUSD: out.phase1.sustainingCostUSD,
    payableAuEqOz: out.aisc.payableAuEqOz,
  };
}

async function aggregateCorporate(runs: ProjectRun[], stressed: boolean) {
  const byId = new Map(runs.map((r) => [r.projectId, snapshot(r, stressed)]));
  return aggregateProjectsCorporateV1(
    { discountRate: DISCOUNT_RATE, projects: runs.map((r) => ({ projectId: r.projectId, rawJson: r.rawJson })) },
    { projectToSeries: async ({ projectId }) => { const s = byId.get(projectId); if (!s) throw new Error(`Missing snapshot ${projectId}`); return s; } },
  );
}

function phase2ForAxis(years: number[], fcff: Array<number | null>, productionStartYear: number, startYear?: number): Basis | null {
  const start = startYear == null ? 0 : years.findIndex((y) => y >= startYear);
  if (start < 0) return null;
  const slicedYears = years.slice(start), slicedFcff = fcff.slice(start);
  if (slicedFcff.some((v) => v === null)) return null;
  const tpRaw = slicedYears.findIndex((y) => y >= productionStartYear);
  const tp = tpRaw >= 0 ? tpRaw : 0;
  const out = computeProjectPhase2({ masterN: slicedFcff.length - 1, productionStartPeriod: tp, discountRate: DISCOUNT_RATE, fcffUSD: slicedFcff });
  return finite(out.npvToday_USD) ? { npv: out.npvToday_USD, irr: finite(out.irr) ? out.irr : null } : null;
}

async function evaluate(symbol: string, windowYears: WindowYears): Promise<Row | null> {
  const loaded = await loadProjectsForSymbol(symbol);
  if (!loaded.length) return null;
  const runs: ProjectRun[] = [];
  let baseRevenueWindow = 0, stressRevenueWindow = 0;

  for (const project of loaded) {
    const parsed = parseProjectJsonV1(project.rawJson);
    const physical = parsed.engineInputWithoutPrices;
    const baseInput = await resolveProjectPricesToEngineInput({ parsed, scenario: { mode: 'spot' }, allowRefresh: false, projectId: project.projectId });
    const baseOutput = computeProjectEngineFullProductionV1(baseInput);
    const stressInput = clone(baseInput);
    const fromT = physical.productionStartPeriod;
    const toT = Math.min(lastProductionPeriod(physical.payableQtyByMetal, fromT), fromT + windowYears - 1);

    for (const [metal, series] of Object.entries(stressInput.spotPriceUSDByMetal)) {
      const priceKey = physical.priceKeyByMetal[metal]; if (!priceKey) return null;
      const spot = scalarPrice(baseInput.spotPriceUSDByMetal[metal]), low = await stressPrice(priceKey);
      if (!finite(spot) || !finite(low)) return null;
      const multiplier = Math.min(spot, low) / spot;
      for (let t = fromT; t <= toT; t += 1) if (finite(series[t])) series[t] = (series[t] as number) * multiplier;
      const keyed = stressInput.priceSeriesByKey?.[priceKey];
      if (keyed) for (let t = fromT; t <= toT; t += 1) if (finite(keyed[t])) keyed[t] = (keyed[t] as number) * multiplier;
      if (metal === 'Au') for (let t = fromT; t <= toT; t += 1) if (finite(stressInput.aisc.auPriceUSDPerOz[t])) stressInput.aisc.auPriceUSDPerOz[t] = (stressInput.aisc.auPriceUSDPerOz[t] as number) * multiplier;
    }

    const stressOutput = computeProjectEngineFullProductionV1(stressInput);
    const baseRev = sumEconomicRevenue(baseOutput.revenue.grossRevenueUSD, baseInput.phase1.byproductCreditsUSD, fromT, toT);
    const stressRev = sumEconomicRevenue(stressOutput.revenue.grossRevenueUSD, stressInput.phase1.byproductCreditsUSD, fromT, toT);
    if (!finite(baseRev) || !finite(stressRev) || !(baseRev > 0)) return null;
    baseRevenueWindow += baseRev; stressRevenueWindow += stressRev;
    const constructionT = firstConstructionPeriod(baseOutput.capexUSD_used, fromT);
    runs.push({ projectId: project.projectId, rawJson: project.rawJson, years: physical.yearsByPeriod, productionStartYear: physical.yearsByPeriod[fromT], constructionStartYear: physical.yearsByPeriod[constructionT], baseInput, stressInput, baseOutput, stressOutput });
  }

  const baseCorp = await aggregateCorporate(runs, false), stressCorp = await aggregateCorporate(runs, true);
  const years = baseCorp.corporateYearsByPeriod;
  if (JSON.stringify(years) !== JSON.stringify(stressCorp.corporateYearsByPeriod)) return null;
  const constructionAnchorYear = Math.min(...runs.map((r) => r.constructionStartYear));
  const productionStartYear = Math.min(...runs.map((r) => r.productionStartYear));
  const calendar = phase2ForAxis(years, baseCorp.fcffUSD_total, productionStartYear);
  const stressCalendar = phase2ForAxis(years, stressCorp.fcffUSD_total, productionStartYear);
  const projectBasis = phase2ForAxis(years, baseCorp.fcffUSD_total, productionStartYear, constructionAnchorYear);
  const stressProject = phase2ForAxis(years, stressCorp.fcffUSD_total, productionStartYear, constructionAnchorYear);
  if (!calendar || !stressCalendar || !projectBasis || !stressProject || !(calendar.npv > 0) || !(projectBasis.npv > 0)) return null;

  const revenueRetention = stressRevenueWindow / baseRevenueWindow, revenueDrawdown = 1 - revenueRetention;
  const calendarRetention = stressCalendar.npv / calendar.npv, projectRetention = stressProject.npv / projectBasis.npv;
  return {
    symbol, projectCount: runs.length, windowYears, constructionAnchorYear,
    calendar, project: projectBasis, stressCalendar, stressProject,
    revenueRetention, revenueDrawdown, calendarRetention, projectRetention,
    calendarBeta: revenueDrawdown > 1e-9 ? (1 - calendarRetention) / revenueDrawdown : null,
    projectBeta: revenueDrawdown > 1e-9 ? (1 - projectRetention) / revenueDrawdown : null,
    stressProjectIrr: stressProject.irr,
  };
}

type Policy = { name: string; t1Beta: number; t2Beta: number; t1Irr: number; t2Irr: number; requireSevenYearPositive: boolean };
const POLICIES: Policy[] = [
  { name: 'beta_085_115_irr20_12_survival7', t1Beta: 0.85, t2Beta: 1.15, t1Irr: 0.20, t2Irr: 0.12, requireSevenYearPositive: true },
  { name: 'beta_090_120_irr20_12_survival7', t1Beta: 0.90, t2Beta: 1.20, t1Irr: 0.20, t2Irr: 0.12, requireSevenYearPositive: true },
  { name: 'beta_080_110_irr25_15_survival7', t1Beta: 0.80, t2Beta: 1.10, t1Irr: 0.25, t2Irr: 0.15, requireSevenYearPositive: true },
  { name: 'beta_085_115_no_irr_survival7', t1Beta: 0.85, t2Beta: 1.15, t1Irr: -Infinity, t2Irr: -Infinity, requireSevenYearPositive: true },
];
function classify(row5: Row, row7: Row | undefined, p: Policy): Tier {
  if (p.requireSevenYearPositive && (!row7 || !(row7.stressProject.npv > 0))) return 'FAIL';
  const beta = row5.projectBeta, irr = row5.stressProjectIrr;
  if (!finite(beta) || !finite(irr)) return 'FAIL';
  if (beta <= p.t1Beta && irr >= p.t1Irr) return 'T1';
  if (beta <= p.t2Beta && irr >= p.t2Irr) return 'T2';
  return 'T3';
}

(async function run() {
  const symbolRows = await query(`SELECT DISTINCT UPPER(symbol) AS symbol FROM ${COMPANY_PROJECTS_TABLE} ORDER BY UPPER(symbol)`) as Array<{ symbol?: string }>;
  const symbols = symbolRows.map((r) => String(r.symbol ?? '').trim().toUpperCase()).filter(Boolean);
  const byWindow = new Map<WindowYears, Row[]>();
  console.log('PROJECT_NORMALIZED_CYCLE_BEGIN');

  for (const w of WINDOWS) {
    const rows: Row[] = [], unavailable: string[] = [];
    for (const symbol of symbols) {
      try { const r = await evaluate(symbol, w); if (r) rows.push(r); else unavailable.push(symbol); }
      catch (e) { unavailable.push(`${symbol}:${e instanceof Error ? e.message : String(e)}`); }
    }
    rows.sort((a, b) => (a.projectBeta ?? Infinity) - (b.projectBeta ?? Infinity)); byWindow.set(w, rows);
    for (const r of rows) console.log(`PROJECT_NORMALIZED ${w}y ${r.symbol} projects=${r.projectCount} anchor=${r.constructionAnchorYear} revenueRet=${r.revenueRetention.toFixed(4)} calRet=${r.calendarRetention.toFixed(4)} projRet=${r.projectRetention.toFixed(4)} calBeta=${r.calendarBeta?.toFixed(4) ?? 'null'} projBeta=${r.projectBeta?.toFixed(4) ?? 'null'} betaDelta=${finite(r.calendarBeta) && finite(r.projectBeta) ? (r.projectBeta-r.calendarBeta).toFixed(4) : 'null'} stressIRR=${r.stressProjectIrr?.toFixed(4) ?? 'null'}`);
    const betas = rows.map((r) => r.projectBeta).filter((v): v is number => finite(v));
    const deltas = rows.map((r) => finite(r.projectBeta) && finite(r.calendarBeta) ? r.projectBeta-r.calendarBeta : null).filter((v): v is number => finite(v));
    console.log(`PROJECT_NORMALIZED_DISTRIBUTION ${w}y beta p25=${percentile(betas,.25)?.toFixed(4) ?? 'null'} p50=${percentile(betas,.5)?.toFixed(4) ?? 'null'} p75=${percentile(betas,.75)?.toFixed(4) ?? 'null'} betaDeltaMedian=${percentile(deltas,.5)?.toFixed(4) ?? 'null'}`);
    if (unavailable.length) console.log(`PROJECT_NORMALIZED_UNAVAILABLE ${w}y ${unavailable.join('|')}`);
  }

  const rows5 = byWindow.get(5) ?? [], rows7 = byWindow.get(7) ?? [];
  for (const p of POLICIES) {
    const counts: Record<Tier, number> = { T1: 0, T2: 0, T3: 0, FAIL: 0 }, members: Record<Tier, string[]> = { T1: [], T2: [], T3: [], FAIL: [] };
    for (const r5 of rows5) { const tier = classify(r5, rows7.find((r) => r.symbol === r5.symbol), p); counts[tier] += 1; members[tier].push(r5.symbol); }
    console.log(`PROJECT_NORMALIZED_POLICY ${p.name} T1=${counts.T1}[${members.T1.join(',')}] T2=${counts.T2}[${members.T2.join(',')}] T3=${counts.T3}[${members.T3.join(',')}] FAIL=${counts.FAIL}[${members.FAIL.join(',')}]`);
  }
  console.log('PROJECT_NORMALIZED_CYCLE_END');
  console.log('cycleNormalizedDownsideDiagnostic.test.ts passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
