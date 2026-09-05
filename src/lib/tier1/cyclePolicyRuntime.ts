import { aggregateProjectsCorporateV1 } from '../corporate/aggregateProjects.ts';
import type { CorporateProjectEngineSnapshot } from '../corporate/types.ts';
import { computeProjectEngineFullProductionV1 } from '../project/engineFullProductionV1.ts';
import { computeProjectPhase2 } from '../project/phase2.ts';
import { readHistoryRowsInRange } from '../prices/db/readHistory.ts';
import type { PriceKey } from '../prices/keys.ts';
import { analyzeRecentSustainedLows } from './recentSustainedLow.ts';
import type { Tier1Gate } from './preRevenueLegacySnapshot.ts';

export const TIER1_CYCLE_POLICY = {
  lookbackYears: 7,
  rollingMonths: 6,
  selectedLowCount: 3,
  minimumSeparationMonths: 12,
  classificationStressYears: 5,
  survivalStressYears: 7,
  discountRate: 0.10,
  tier1BetaMax: 0.85,
  tier2BetaMax: 1.15,
} as const;

export type Tier1CyclePolicyResult = {
  status: 'VERIFIED' | 'NOT_VERIFIED';
  gate: Tier1Gate;
  diagnostics: string[];
  projectCount: number;
  method: string;
  baseRevenueUsd: number | null;
  stressRevenueUsd: number | null;
  revenueRetention: number | null;
  baseNpv10Usd: number | null;
  stressNpv10Usd: number | null;
  npvRetention: number | null;
  downsideBeta: number | null;
  stressIrr: number | null;
  survivalNpv10Usd: number | null;
  multipliersByMetal: Record<string, number>;
};

export type Tier1CyclePreparedProject = {
  projectId: string;
  rawJson: unknown;
  physical: any;
  baseInput: any;
  baseOutput: any;
  productionStartYear: number;
  constructionStartYear: number;
};

type WindowEval = {
  baseRevenue: number;
  stressRevenue: number;
  revenueRetention: number;
  baseNpv: number;
  stressNpv: number;
  npvRetention: number;
  beta: number;
  stressIrr: number | null;
  multipliersByMetal: Record<string, number>;
};

type StressPriceResult = { value: number | null; reason: string | null };
type CycleRuntimeDeps = { loadStressPriceFn?: (key: string) => Promise<StressPriceResult> };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clone = <T>(v: T): T => typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)) as T;
function dateYearsAgo(to: string, n: number) { const d = new Date(`${to}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - n); return d.toISOString().slice(0, 10); }
function scalar(s: Array<number | null> | undefined) { if (!Array.isArray(s)) return null; const a = s.filter((v): v is number => finite(v) && v > 0); if (!a.length) return null; const f = a[0], tol = Math.max(1e-9, Math.abs(f) * 1e-9); return a.every(v => Math.abs(v - f) <= tol) ? f : null; }
function lastProd(payable: Record<string, Array<number | null>>, fallback: number) { let last = -1; for (const s of Object.values(payable)) for (let t = 0; t < s.length; t += 1) if (finite(s[t]) && (s[t] as number) > 0) last = Math.max(last, t); return last >= 0 ? last : fallback; }
function firstConstruction(capex: Array<number | null>, tp: number) { for (let t = 0; t <= tp; t += 1) if (finite(capex[t]) && Math.abs(capex[t] as number) > 1e-6) return t; return tp; }
function revenue(gross: Array<number | null>, credits: Array<number | null> | null | undefined, a: number, b: number) { let x = 0; for (let t = a; t <= b; t += 1) { if (!finite(gross[t])) return null; const c = credits?.[t]; if (c != null && !finite(c)) return null; x += (gross[t] as number) + (finite(c) ? c : 0); } return x; }

const method = `5-årig revenue-normaliserad NPV10 downside beta; stresspris = median av 3 separerade lågprisobservationer från 7 års historik med 6 månaders rullande medel; 7-årig survival-NPV10 är diagnostik och påverkar inte Tier; beta T1 ≤0,85x, T2 ≤1,15x, annars T3.`;

const stressPriceCache = new Map<string, { expiresAt: number; promise: Promise<StressPriceResult> }>();
const STRESS_PRICE_CACHE_TTL_MS = 60_000;

async function loadStressPriceUncached(key: string): Promise<StressPriceResult> {
  const to = new Date().toISOString().slice(0, 10);
  const from = dateYearsAgo(to, TIER1_CYCLE_POLICY.lookbackYears);
  try {
    const history = await readHistoryRowsInRange({ priceKey: key as PriceKey, from, to });
    const analysis = analyzeRecentSustainedLows(history.rows, {
      lookbackYears: TIER1_CYCLE_POLICY.lookbackYears,
      rollingMonths: TIER1_CYCLE_POLICY.rollingMonths,
      minimumSeparationMonths: TIER1_CYCLE_POLICY.minimumSeparationMonths,
      selectedLowCount: TIER1_CYCLE_POLICY.selectedLowCount,
    });
    if (analysis.status === 'COMPUTABLE' && finite(analysis.stressPrice)) return { value: analysis.stressPrice, reason: null };
    return { value: null, reason: `CYCLE_HISTORY_NOT_COMPUTABLE priceKey=${key}: 7-årig lagrad historik klarar inte 6m/3-lågpunktstestet. Ingen provider-refresh körs i Tier read-path.` };
  } catch (error) {
    return { value: null, reason: `CYCLE_HISTORY_READ_FAILED priceKey=${key}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function loadStressPrice(key: string): Promise<StressPriceResult> {
  const cacheKey = `${new Date().toISOString().slice(0, 10)}:${key}`;
  const now = Date.now();
  const cached = stressPriceCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.promise;
  const promise = loadStressPriceUncached(key);
  stressPriceCache.set(cacheKey, { expiresAt: now + STRESS_PRICE_CACHE_TTL_MS, promise });
  void promise.then((result) => {
    if (!finite(result.value) && stressPriceCache.get(cacheKey)?.promise === promise) stressPriceCache.delete(cacheKey);
  }, () => {
    if (stressPriceCache.get(cacheKey)?.promise === promise) stressPriceCache.delete(cacheKey);
  });
  return promise;
}

export function prepareTier1CycleProject(args: {
  projectId: string;
  rawJson: unknown;
  physical: any;
  baseInput: any;
  baseOutput: any;
}): Tier1CyclePreparedProject {
  const tp = args.physical.productionStartPeriod;
  const ct = firstConstruction(args.baseOutput.capexUSD_used, tp);
  return {
    ...args,
    productionStartYear: args.physical.yearsByPeriod[tp],
    constructionStartYear: args.physical.yearsByPeriod[ct],
  };
}

function snap(input: any, out: any): CorporateProjectEngineSnapshot {
  return { capexUSD: out.capexUSD_used, fcffUSD: out.phase1.fcffUSD, grossRevenueUSD: out.revenue.grossRevenueUSD, auPriceUSDPerOz: input.aisc.auPriceUSDPerOz, priceUSDByMetal: input.spotPriceUSDByMetal, priceKeyByMetal: input.priceKeyByMetal, sustainingCostUSD: out.phase1.sustainingCostUSD, payableAuEqOz: out.aisc.payableAuEqOz };
}
async function corp(ps: Tier1CyclePreparedProject[], runs: Array<{ input: any; output: any }>) {
  const byId = new Map(ps.map((p, i) => [p.projectId, snap(runs[i].input, runs[i].output)]));
  return aggregateProjectsCorporateV1({ discountRate: TIER1_CYCLE_POLICY.discountRate, projects: ps.map(p => ({ projectId: p.projectId, rawJson: p.rawJson })) }, { projectToSeries: async ({ projectId }) => { const s = byId.get(projectId); if (!s) throw new Error('missing cycle snapshot'); return s; } });
}
function phase(years: number[], fcff: Array<number | null>, prodYear: number, startYear: number) {
  const start = years.findIndex(y => y >= startYear); if (start < 0) return null;
  const f = fcff.slice(start), ys = years.slice(start); if (f.some(v => v === null)) return null;
  const tp0 = ys.findIndex(y => y >= prodYear), tp = tp0 >= 0 ? tp0 : 0;
  const o = computeProjectPhase2({ masterN: f.length - 1, productionStartPeriod: tp, discountRate: TIER1_CYCLE_POLICY.discountRate, fcffUSD: f });
  return finite(o.npvToday_USD) ? { npv: o.npvToday_USD, irr: finite(o.irr) ? o.irr : null } : null;
}

async function evaluate(ps: Tier1CyclePreparedProject[], stressPrices: Map<string, number>, windowYears: number): Promise<WindowEval | null> {
  let baseRev = 0, stressRev = 0;
  const baseRuns = ps.map(x => ({ input: x.baseInput, output: x.baseOutput }));
  const stressRuns: Array<{ input: any; output: any }> = [];
  const multipliersByMetal: Record<string, number> = {};
  for (const x of ps) {
    const input = clone(x.baseInput), from = x.physical.productionStartPeriod, to = Math.min(lastProd(x.physical.payableQtyByMetal, from), from + windowYears - 1);
    for (const [metal, series] of Object.entries(input.spotPriceUSDByMetal as Record<string, Array<number | null>>)) {
      const key = x.physical.priceKeyByMetal[metal]; if (!key) return null;
      const spot = scalar(x.baseInput.spotPriceUSDByMetal[metal]), low = stressPrices.get(key); if (!finite(spot) || !finite(low)) return null;
      const multiplier = Math.min(spot, low) / spot;
      multipliersByMetal[metal] = multiplier;
      for (let t = from; t <= to; t += 1) if (finite(series[t])) series[t] = (series[t] as number) * multiplier;
      const keyed = input.priceSeriesByKey?.[key]; if (keyed) for (let t = from; t <= to; t += 1) if (finite(keyed[t])) keyed[t] = (keyed[t] as number) * multiplier;
      if (metal === 'Au') for (let t = from; t <= to; t += 1) if (finite(input.aisc.auPriceUSDPerOz[t])) input.aisc.auPriceUSDPerOz[t] = (input.aisc.auPriceUSDPerOz[t] as number) * multiplier;
    }
    const output = computeProjectEngineFullProductionV1(input);
    const br = revenue(x.baseOutput.revenue.grossRevenueUSD, x.baseInput.phase1.byproductCreditsUSD, from, to);
    const sr = revenue(output.revenue.grossRevenueUSD, input.phase1.byproductCreditsUSD, from, to);
    if (!finite(br) || !finite(sr) || !(br > 0)) return null;
    baseRev += br; stressRev += sr; stressRuns.push({ input, output });
  }
  const [bc, sc] = await Promise.all([corp(ps, baseRuns), corp(ps, stressRuns)]);
  const years = bc.corporateYearsByPeriod;
  if (JSON.stringify(years) !== JSON.stringify(sc.corporateYearsByPeriod)) return null;
  const anchor = Math.min(...ps.map(x => x.constructionStartYear)), prod = Math.min(...ps.map(x => x.productionStartYear));
  const b = phase(years, bc.fcffUSD_total, prod, anchor), s = phase(years, sc.fcffUSD_total, prod, anchor);
  if (!b || !s || !(b.npv > 0)) return null;
  const revenueRetention = stressRev / baseRev, revenueDrawdown = 1 - revenueRetention, npvRetention = s.npv / b.npv;
  return { baseRevenue: baseRev, stressRevenue: stressRev, revenueRetention, baseNpv: b.npv, stressNpv: s.npv, npvRetention, beta: revenueDrawdown > 1e-9 ? (1 - npvRetention) / revenueDrawdown : NaN, stressIrr: s.irr, multipliersByMetal };
}

function notVerified(reason: string, projectCount = 0): Tier1CyclePolicyResult {
  return { status: 'NOT_VERIFIED', gate: { status: 'NOT_VERIFIED', tier: null, value: null, threshold: TIER1_CYCLE_POLICY.tier1BetaMax, unit: 'NPV downside beta', reason }, diagnostics: [reason], projectCount, method, baseRevenueUsd: null, stressRevenueUsd: null, revenueRetention: null, baseNpv10Usd: null, stressNpv10Usd: null, npvRetention: null, downsideBeta: null, stressIrr: null, survivalNpv10Usd: null, multipliersByMetal: {} };
}

export async function computeTier1CyclePolicyFromPreparedProjects(
  ps: Tier1CyclePreparedProject[],
  deps: CycleRuntimeDeps = {},
): Promise<Tier1CyclePolicyResult> {
  if (!ps.length) return notVerified('Inga förberedda project_json-projekt hittades för cykelresistens.');
  const keys = [...new Set(ps.flatMap(p => Object.values(p.physical.priceKeyByMetal) as string[]))];
  const loadStress = deps.loadStressPriceFn ?? loadStressPrice;
  const stressRows = await Promise.all(keys.map(async (key) => [key, await loadStress(key)] as const));
  const stressPrices = new Map<string, number>();
  const diagnostics: string[] = [];
  for (const [key, result] of stressRows) {
    if (!finite(result.value)) diagnostics.push(result.reason ?? `CYCLE_PRICE_NOT_VERIFIED priceKey=${key}`);
    else stressPrices.set(key, result.value);
  }
  if (diagnostics.length) return { ...notVerified(diagnostics.join(' '), ps.length), diagnostics };

  const [row5, row7] = await Promise.all([
    evaluate(ps, stressPrices, TIER1_CYCLE_POLICY.classificationStressYears),
    evaluate(ps, stressPrices, TIER1_CYCLE_POLICY.survivalStressYears),
  ]);
  if (!row5 || !row7 || !finite(row5.beta)) return notVerified('CYCLE_EVALUATION_FAILED: canonical Corporate kassaflöde/revenue kunde inte bilda ett verifierat 5y/7y cycle-resultat.', ps.length);

  const survivalPass = row7.stressNpv > 0;
  const tier = row5.beta <= TIER1_CYCLE_POLICY.tier1BetaMax ? 1 : row5.beta <= TIER1_CYCLE_POLICY.tier2BetaMax ? 2 : 3;
  const survivalText = survivalPass
    ? `7-årig survival NPV10 ${Math.round(row7.stressNpv).toLocaleString('sv-SE')} USD > 0 (PASS, diagnostik).`
    : `7-årig survival NPV10 ${Math.round(row7.stressNpv).toLocaleString('sv-SE')} USD ≤ 0 (FAIL, diagnostik; påverkar inte Tier).`;
  if (!survivalPass) {
    diagnostics.push(`CYCLE_SURVIVAL_DIAGNOSTIC_FAIL: 7-årig survival NPV10 ${Math.round(row7.stressNpv)} USD ≤ 0. Detta är diagnostik och påverkar inte Tier; 5-årig downside beta styr cycle-Tier.`);
  }
  const gate: Tier1Gate = {
    status: 'PASS',
    tier,
    value: row5.beta,
    threshold: TIER1_CYCLE_POLICY.tier1BetaMax,
    unit: 'NPV downside beta',
    reason: `5-årig normalized downside beta ${row5.beta.toFixed(2)}x · Tier ${tier}. Revenue retention ${(row5.revenueRetention * 100).toFixed(1)} %, NPV10 retention ${(row5.npvRetention * 100).toFixed(1)} %, stress-IRR ${finite(row5.stressIrr) ? `${(row5.stressIrr * 100).toFixed(1)} %` : 'Ej verifierad'}. ${survivalText}`,
  };
  return { status: 'VERIFIED', gate, diagnostics, projectCount: ps.length, method, baseRevenueUsd: row5.baseRevenue, stressRevenueUsd: row5.stressRevenue, revenueRetention: row5.revenueRetention, baseNpv10Usd: row5.baseNpv, stressNpv10Usd: row5.stressNpv, npvRetention: row5.npvRetention, downsideBeta: row5.beta, stressIrr: row5.stressIrr, survivalNpv10Usd: row7.stressNpv, multipliersByMetal: row5.multipliersByMetal };
}
