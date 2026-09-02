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

const LOOKBACK_YEARS = 7;
const ROLLING_MONTHS = 6;
const SEPARATION_MONTHS = 12;
const LOW_COUNT = 3;
const DISCOUNT_RATE = 0.10;
const CLASSIFICATION_STRESS_YEARS = 5;
const SURVIVAL_STRESS_YEARS = 7;
const T1_BETA_MAX = 0.85;
const T2_BETA_MAX = 1.15;

type Tier = 'T1' | 'T2' | 'T3' | 'FAIL';
type Prepared = {
  projectId: string;
  rawJson: unknown;
  physical: any;
  baseInput: any;
  baseOutput: any;
  productionStartYear: number;
  constructionStartYear: number;
};
type Eval = {
  symbol: string;
  projectCount: number;
  baseRevenue: number;
  stressRevenue: number;
  revenueRetention: number;
  baseNpv: number;
  stressNpv: number;
  npvRetention: number;
  beta: number;
  baseIrr: number | null;
  stressIrr: number | null;
};

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clone = <T>(v: T): T => typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)) as T;
function dateYearsAgo(to: string, n: number) { const d = new Date(`${to}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - n); return d.toISOString().slice(0, 10); }
function scalar(s: Array<number | null> | undefined) { if (!Array.isArray(s)) return null; const a = s.filter((v): v is number => finite(v) && v > 0); if (!a.length) return null; const f = a[0], tol = Math.max(1e-9, Math.abs(f) * 1e-9); return a.every(v => Math.abs(v - f) <= tol) ? f : null; }
function lastProd(payable: Record<string, Array<number | null>>, fallback: number) { let last = -1; for (const s of Object.values(payable)) for (let t = 0; t < s.length; t += 1) if (finite(s[t]) && (s[t] as number) > 0) last = Math.max(last, t); return last >= 0 ? last : fallback; }
function firstConstruction(capex: Array<number | null>, tp: number) { for (let t = 0; t <= tp; t += 1) if (finite(capex[t]) && Math.abs(capex[t] as number) > 1e-6) return t; return tp; }
function revenue(gross: Array<number | null>, credits: Array<number | null> | null | undefined, a: number, b: number) { let x = 0; for (let t = a; t <= b; t += 1) { if (!finite(gross[t])) return null; const c = credits?.[t]; if (c != null && !finite(c)) return null; x += (gross[t] as number) + (finite(c) ? c : 0); } return x; }

const historyCache = new Map<string, Awaited<ReturnType<typeof readHistoryRowsInRange>>>();
const stressCache = new Map<string, number | null>();
async function stressPrice(key: string) {
  if (stressCache.has(key)) return stressCache.get(key) ?? null;
  const to = new Date().toISOString().slice(0, 10), from = dateYearsAgo(to, LOOKBACK_YEARS);
  try {
    let h = historyCache.get(key);
    if (!h) { h = await readHistoryRowsInRange({ priceKey: key as PriceKey, from, to }); historyCache.set(key, h); }
    const a = analyzeRecentSustainedLows(h.rows, { lookbackYears: LOOKBACK_YEARS, rollingMonths: ROLLING_MONTHS, minimumSeparationMonths: SEPARATION_MONTHS, selectedLowCount: LOW_COUNT });
    const v = a.status === 'COMPUTABLE' && finite(a.stressPrice) ? a.stressPrice : null;
    stressCache.set(key, v);
    return v;
  } catch { stressCache.set(key, null); return null; }
}

const preparedCache = new Map<string, Prepared[] | null>();
async function prepare(symbol: string): Promise<Prepared[] | null> {
  if (preparedCache.has(symbol)) return preparedCache.get(symbol) ?? null;
  try {
    const loaded = await loadProjectsForSymbol(symbol);
    if (!loaded.length) { preparedCache.set(symbol, null); return null; }
    const out: Prepared[] = [];
    for (const p of loaded) {
      const parsed = parseProjectJsonV1(p.rawJson), physical = parsed.engineInputWithoutPrices;
      const baseInput = await resolveProjectPricesToEngineInput({ parsed, scenario: { mode: 'spot' }, allowRefresh: false, projectId: p.projectId });
      const baseOutput = computeProjectEngineFullProductionV1(baseInput);
      const tp = physical.productionStartPeriod, ct = firstConstruction(baseOutput.capexUSD_used, tp);
      out.push({ projectId: p.projectId, rawJson: p.rawJson, physical, baseInput, baseOutput, productionStartYear: physical.yearsByPeriod[tp], constructionStartYear: physical.yearsByPeriod[ct] });
    }
    preparedCache.set(symbol, out);
    return out;
  } catch { preparedCache.set(symbol, null); return null; }
}

function snap(input: any, out: any): CorporateProjectEngineSnapshot {
  return { capexUSD: out.capexUSD_used, fcffUSD: out.phase1.fcffUSD, grossRevenueUSD: out.revenue.grossRevenueUSD, auPriceUSDPerOz: input.aisc.auPriceUSDPerOz, priceUSDByMetal: input.spotPriceUSDByMetal, priceKeyByMetal: input.priceKeyByMetal, sustainingCostUSD: out.phase1.sustainingCostUSD, payableAuEqOz: out.aisc.payableAuEqOz };
}
async function corp(ps: Prepared[], runs: Array<{ input: any; output: any }>) {
  const byId = new Map(ps.map((p, i) => [p.projectId, snap(runs[i].input, runs[i].output)]));
  return aggregateProjectsCorporateV1({ discountRate: DISCOUNT_RATE, projects: ps.map(p => ({ projectId: p.projectId, rawJson: p.rawJson })) }, { projectToSeries: async ({ projectId }) => { const s = byId.get(projectId); if (!s) throw new Error('missing snapshot'); return s; } });
}
function phase(years: number[], fcff: Array<number | null>, prodYear: number, startYear: number) {
  const start = years.findIndex(y => y >= startYear); if (start < 0) return null;
  const f = fcff.slice(start), ys = years.slice(start); if (f.some(v => v === null)) return null;
  const tp0 = ys.findIndex(y => y >= prodYear), tp = tp0 >= 0 ? tp0 : 0;
  const o = computeProjectPhase2({ masterN: f.length - 1, productionStartPeriod: tp, discountRate: DISCOUNT_RATE, fcffUSD: f });
  return finite(o.npvToday_USD) ? { npv: o.npvToday_USD, irr: finite(o.irr) ? o.irr : null } : null;
}

async function evaluate(symbol: string, windowYears: number): Promise<Eval | null> {
  const ps = await prepare(symbol); if (!ps) return null;
  let baseRev = 0, stressRev = 0;
  const baseRuns = ps.map(x => ({ input: x.baseInput, output: x.baseOutput })), stressRuns: Array<{ input: any; output: any }> = [];
  for (const x of ps) {
    const input = clone(x.baseInput), from = x.physical.productionStartPeriod, to = Math.min(lastProd(x.physical.payableQtyByMetal, from), from + windowYears - 1);
    for (const [metal, series] of Object.entries(input.spotPriceUSDByMetal as Record<string, Array<number | null>>)) {
      const key = x.physical.priceKeyByMetal[metal]; if (!key) return null;
      const spot = scalar(x.baseInput.spotPriceUSDByMetal[metal]), low = await stressPrice(key); if (!finite(spot) || !finite(low)) return null;
      const multiplier = Math.min(spot, low) / spot;
      for (let t = from; t <= to; t += 1) if (finite(series[t])) series[t] = (series[t] as number) * multiplier;
      const keyed = input.priceSeriesByKey?.[key]; if (keyed) for (let t = from; t <= to; t += 1) if (finite(keyed[t])) keyed[t] = (keyed[t] as number) * multiplier;
      if (metal === 'Au') for (let t = from; t <= to; t += 1) if (finite(input.aisc.auPriceUSDPerOz[t])) input.aisc.auPriceUSDPerOz[t] = (input.aisc.auPriceUSDPerOz[t] as number) * multiplier;
    }
    const output = computeProjectEngineFullProductionV1(input), br = revenue(x.baseOutput.revenue.grossRevenueUSD, x.baseInput.phase1.byproductCreditsUSD, from, to), sr = revenue(output.revenue.grossRevenueUSD, input.phase1.byproductCreditsUSD, from, to);
    if (!finite(br) || !finite(sr) || !(br > 0)) return null;
    baseRev += br; stressRev += sr; stressRuns.push({ input, output });
  }
  const bc = await corp(ps, baseRuns), sc = await corp(ps, stressRuns), years = bc.corporateYearsByPeriod;
  if (JSON.stringify(years) !== JSON.stringify(sc.corporateYearsByPeriod)) return null;
  const anchor = Math.min(...ps.map(x => x.constructionStartYear)), prod = Math.min(...ps.map(x => x.productionStartYear));
  const b = phase(years, bc.fcffUSD_total, prod, anchor), s = phase(years, sc.fcffUSD_total, prod, anchor);
  if (!b || !s || !(b.npv > 0)) return null;
  const revenueRetention = stressRev / baseRev, revenueDrawdown = 1 - revenueRetention, npvRetention = s.npv / b.npv;
  return { symbol, projectCount: ps.length, baseRevenue: baseRev, stressRevenue: stressRev, revenueRetention, baseNpv: b.npv, stressNpv: s.npv, npvRetention, beta: revenueDrawdown > 1e-9 ? (1 - npvRetention) / revenueDrawdown : NaN, baseIrr: b.irr, stressIrr: s.irr };
}

function classify(row5: Eval, row7: Eval): Tier {
  if (!(row7.stressNpv > 0)) return 'FAIL';
  if (!finite(row5.beta)) return 'FAIL';
  if (row5.beta <= T1_BETA_MAX) return 'T1';
  if (row5.beta <= T2_BETA_MAX) return 'T2';
  return 'T3';
}

(async () => {
  const q = await query(`SELECT DISTINCT UPPER(symbol) AS symbol FROM company_projects ORDER BY UPPER(symbol)`) as Array<{ symbol?: string }>;
  const symbols = q.map(x => String(x.symbol ?? '').trim().toUpperCase()).filter(Boolean);
  const counts: Record<Tier, number> = { T1: 0, T2: 0, T3: 0, FAIL: 0 };
  const members: Record<Tier, string[]> = { T1: [], T2: [], T3: [], FAIL: [] };
  const unavailable: string[] = [];
  console.log(`CYCLE_EXACT_POLICY_BEGIN lookback=${LOOKBACK_YEARS} rollingMonths=${ROLLING_MONTHS} lowCount=${LOW_COUNT} separationMonths=${SEPARATION_MONTHS} classifyYears=${CLASSIFICATION_STRESS_YEARS} survivalYears=${SURVIVAL_STRESS_YEARS} discount=${DISCOUNT_RATE} t1BetaMax=${T1_BETA_MAX} t2BetaMax=${T2_BETA_MAX}`);
  for (const symbol of symbols) {
    const row5 = await evaluate(symbol, CLASSIFICATION_STRESS_YEARS), row7 = await evaluate(symbol, SURVIVAL_STRESS_YEARS);
    if (!row5 || !row7) { unavailable.push(symbol); console.log(`CYCLE_EXACT_POLICY ${symbol} status=NOT_VERIFIED`); continue; }
    const tier = classify(row5, row7); counts[tier] += 1; members[tier].push(symbol);
    console.log(`CYCLE_EXACT_POLICY ${symbol} projects=${row5.projectCount} baseRevenue=${row5.baseRevenue.toFixed(0)} stressRevenue=${row5.stressRevenue.toFixed(0)} revenueRetention=${row5.revenueRetention.toFixed(4)} baseNPV10=${row5.baseNpv.toFixed(0)} stressNPV10=${row5.stressNpv.toFixed(0)} npvRetention=${row5.npvRetention.toFixed(4)} beta=${row5.beta.toFixed(4)} baseIRR=${row5.baseIrr?.toFixed(4) ?? 'null'} stressIRR=${row5.stressIrr?.toFixed(4) ?? 'null'} survival7NPV10=${row7.stressNpv.toFixed(0)} survival7=${row7.stressNpv > 0 ? 'PASS' : 'FAIL'} cycleTier=${tier}`);
  }
  console.log(`CYCLE_EXACT_POLICY_SUMMARY T1=${counts.T1}[${members.T1.join(',')}] T2=${counts.T2}[${members.T2.join(',')}] T3=${counts.T3}[${members.T3.join(',')}] FAIL=${counts.FAIL}[${members.FAIL.join(',')}] NOT_VERIFIED=${unavailable.length}[${unavailable.join(',')}]`);
  console.log('CYCLE_EXACT_POLICY_END');
  console.log('cycleExactPolicyAudit.test.ts passed');
})().catch(e => { console.error(e); process.exitCode = 1; });