import { query } from '../../../../api/_db.ts';
import { loadProjectsForSymbol } from '../../api/loadProjectsForSymbol.ts';
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

type WindowYears = typeof WINDOWS[number];

type Row = {
  symbol: string;
  windowYears: WindowYears;
  baseNpv: number;
  stressNpv: number;
  npvRetention: number;
  revenueRetention: number;
  revenueDrawdown: number;
  npvDrawdown: number;
  npvDownsideBeta: number | null;
  baseIrr: number;
  stressIrr: number | null;
  irrDropPp: number | null;
  irrDropPerRevenueShock: number | null;
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function dateYearsAgo(to: string, yearsAgo: number): string {
  const date = new Date(`${to}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - yearsAgo);
  return date.toISOString().slice(0, 10);
}

function scalarPrice(series: Array<number | null> | undefined): number | null {
  if (!Array.isArray(series)) return null;
  const values = series.filter((value): value is number => finite(value) && value > 0);
  if (values.length === 0) return null;
  const first = values[0];
  const tolerance = Math.max(1e-9, Math.abs(first) * 1e-9);
  return values.every((value) => Math.abs(value - first) <= tolerance) ? first : null;
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}

function lastProductionPeriod(payableQtyByMetal: Record<string, Array<number | null>>, fallback: number): number {
  let last = -1;
  for (const series of Object.values(payableQtyByMetal)) {
    for (let t = 0; t < series.length; t += 1) {
      if (finite(series[t]) && (series[t] as number) > 0) last = Math.max(last, t);
    }
  }
  return last >= 0 ? last : fallback;
}

function aggregateFcffByYear(projects: Array<{ years: number[]; fcff: Array<number | null> }>): { years: number[]; fcff: number[] } | null {
  if (projects.length === 0) return null;
  const allYears = projects.flatMap((project) => project.years);
  const minYear = Math.min(...allYears);
  const maxYear = Math.max(...allYears);
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);
  const byYear = new Map<number, number>();
  for (const project of projects) {
    for (let t = 0; t < project.years.length; t += 1) {
      const value = project.fcff[t];
      if (!finite(value)) return null;
      const year = project.years[t];
      byYear.set(year, (byYear.get(year) ?? 0) + value);
    }
  }
  return { years, fcff: years.map((year) => byYear.get(year) ?? 0) };
}

function firstProductionIndex(years: number[], productionYears: Set<number>): number {
  const index = years.findIndex((year) => productionYears.has(year));
  return index >= 0 ? index : 0;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

function sumEconomicRevenue(
  grossRevenue: Array<number | null>,
  byproductCredits: Array<number | null> | null | undefined,
  fromT: number,
  toT: number,
): number | null {
  let total = 0;
  for (let t = fromT; t <= toT; t += 1) {
    const gross = grossRevenue[t];
    if (!finite(gross)) return null;
    const credit = byproductCredits?.[t];
    if (credit !== undefined && credit !== null && !finite(credit)) return null;
    total += gross + (finite(credit) ? credit : 0);
  }
  return total;
}

const stressPriceCache = new Map<string, number | null>();
async function stressPrice(priceKey: string): Promise<number | null> {
  if (stressPriceCache.has(priceKey)) return stressPriceCache.get(priceKey) ?? null;
  const to = new Date().toISOString().slice(0, 10);
  const from = dateYearsAgo(to, LOOKBACK_YEARS);
  try {
    const history = await readHistoryRowsInRange({ priceKey: priceKey as PriceKey, from, to });
    const analysis = analyzeRecentSustainedLows(history.rows, {
      lookbackYears: LOOKBACK_YEARS,
      rollingMonths: ROLLING_MONTHS,
      minimumSeparationMonths: SEPARATION_MONTHS,
      selectedLowCount: LOW_COUNT,
    });
    const value = analysis.status === 'COMPUTABLE' && finite(analysis.stressPrice) ? analysis.stressPrice : null;
    stressPriceCache.set(priceKey, value);
    return value;
  } catch {
    stressPriceCache.set(priceKey, null);
    return null;
  }
}

async function evaluate(symbol: string, windowYears: WindowYears): Promise<Row | null> {
  const loaded = await loadProjectsForSymbol(symbol);
  if (loaded.length === 0) return null;

  const baseProjects: Array<{ years: number[]; fcff: Array<number | null> }> = [];
  const stressProjects: Array<{ years: number[]; fcff: Array<number | null> }> = [];
  const productionYears = new Set<number>();
  let baseRevenueWindow = 0;
  let stressRevenueWindow = 0;

  for (const project of loaded) {
    const parsed = parseProjectJsonV1(project.rawJson);
    const physical = parsed.engineInputWithoutPrices;
    const baseInput = await resolveProjectPricesToEngineInput({
      parsed,
      scenario: { mode: 'spot' },
      allowRefresh: false,
      projectId: project.projectId,
    });
    const baseOutput = computeProjectEngineFullProductionV1(baseInput);
    const stressed = clone(baseInput);
    const fromT = physical.productionStartPeriod;
    const toT = Math.min(lastProductionPeriod(physical.payableQtyByMetal, fromT), fromT + windowYears - 1);

    for (const [metal, series] of Object.entries(stressed.spotPriceUSDByMetal)) {
      const priceKey = physical.priceKeyByMetal[metal];
      if (!priceKey) return null;
      const baseSpot = scalarPrice(baseInput.spotPriceUSDByMetal[metal]);
      const low = await stressPrice(priceKey);
      if (!finite(baseSpot) || !finite(low)) return null;
      const target = Math.min(baseSpot, low);
      if (!(target > 0)) return null;
      const multiplier = target / baseSpot;
      for (let t = fromT; t <= toT; t += 1) if (finite(series[t])) series[t] = (series[t] as number) * multiplier;
      const keyed = stressed.priceSeriesByKey?.[priceKey];
      if (keyed) for (let t = fromT; t <= toT; t += 1) if (finite(keyed[t])) keyed[t] = (keyed[t] as number) * multiplier;
      if (metal === 'Au') {
        for (let t = fromT; t <= toT; t += 1) {
          if (finite(stressed.aisc.auPriceUSDPerOz[t])) stressed.aisc.auPriceUSDPerOz[t] = (stressed.aisc.auPriceUSDPerOz[t] as number) * multiplier;
        }
      }
    }

    const stressOutput = computeProjectEngineFullProductionV1(stressed);
    const baseWindow = sumEconomicRevenue(baseOutput.revenue.grossRevenueUSD, baseInput.phase1.byproductCreditsUSD, fromT, toT);
    const stressWindow = sumEconomicRevenue(stressOutput.revenue.grossRevenueUSD, stressed.phase1.byproductCreditsUSD, fromT, toT);
    if (!finite(baseWindow) || !finite(stressWindow) || !(baseWindow > 0)) return null;
    baseRevenueWindow += baseWindow;
    stressRevenueWindow += stressWindow;

    baseProjects.push({ years: physical.yearsByPeriod, fcff: baseOutput.phase1.fcffUSD });
    stressProjects.push({ years: physical.yearsByPeriod, fcff: stressOutput.phase1.fcffUSD });
    for (const series of Object.values(physical.payableQtyByMetal)) {
      for (let t = 0; t < series.length; t += 1) {
        if (finite(series[t]) && (series[t] as number) > 0) productionYears.add(physical.yearsByPeriod[t]);
      }
    }
  }

  const baseCorporate = aggregateFcffByYear(baseProjects);
  const stressCorporate = aggregateFcffByYear(stressProjects);
  if (!baseCorporate || !stressCorporate) return null;
  const productionStartPeriod = firstProductionIndex(baseCorporate.years, productionYears);
  const basePhase2 = computeProjectPhase2({ masterN: baseCorporate.fcff.length - 1, productionStartPeriod, discountRate: 0.10, fcffUSD: baseCorporate.fcff });
  const stressPhase2 = computeProjectPhase2({ masterN: stressCorporate.fcff.length - 1, productionStartPeriod, discountRate: 0.10, fcffUSD: stressCorporate.fcff });
  if (!finite(basePhase2.npvToday_USD) || !(basePhase2.npvToday_USD > 0) || !finite(stressPhase2.npvToday_USD) || !finite(basePhase2.irr)) return null;

  const npvRetention = stressPhase2.npvToday_USD / basePhase2.npvToday_USD;
  const revenueRetention = stressRevenueWindow / baseRevenueWindow;
  const revenueDrawdown = 1 - revenueRetention;
  const npvDrawdown = 1 - npvRetention;
  const stressIrr = finite(stressPhase2.irr) ? stressPhase2.irr : null;
  const irrDropPp = stressIrr === null ? null : (basePhase2.irr - stressIrr) * 100;
  return {
    symbol,
    windowYears,
    baseNpv: basePhase2.npvToday_USD,
    stressNpv: stressPhase2.npvToday_USD,
    npvRetention,
    revenueRetention,
    revenueDrawdown,
    npvDrawdown,
    npvDownsideBeta: revenueDrawdown > 1e-9 ? npvDrawdown / revenueDrawdown : null,
    baseIrr: basePhase2.irr,
    stressIrr,
    irrDropPp,
    irrDropPerRevenueShock: revenueDrawdown > 1e-9 && irrDropPp !== null ? irrDropPp / revenueDrawdown : null,
  };
}

(async function run() {
  const symbolRows = await query(`SELECT DISTINCT UPPER(symbol) AS symbol FROM ${COMPANY_PROJECTS_TABLE} ORDER BY UPPER(symbol)`) as Array<{ symbol?: string }>;
  const symbols = symbolRows.map((row) => String(row.symbol ?? '').trim().toUpperCase()).filter(Boolean);
  console.log('NORMALIZED_CYCLE_DOWNSIDE_BEGIN');

  for (const windowYears of WINDOWS) {
    const rows: Row[] = [];
    const unavailable: string[] = [];
    for (const symbol of symbols) {
      try {
        const row = await evaluate(symbol, windowYears);
        if (row) rows.push(row); else unavailable.push(symbol);
      } catch (error) {
        unavailable.push(`${symbol}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
    rows.sort((a, b) => (a.npvDownsideBeta ?? Number.POSITIVE_INFINITY) - (b.npvDownsideBeta ?? Number.POSITIVE_INFINITY));
    for (const row of rows) {
      console.log(
        `NORMALIZED_CYCLE ${windowYears}y ${row.symbol} revenueRetention=${row.revenueRetention.toFixed(4)} revenueDrawdown=${row.revenueDrawdown.toFixed(4)} ` +
        `npvRetention=${row.npvRetention.toFixed(4)} npvDrawdown=${row.npvDrawdown.toFixed(4)} ` +
        `npvBeta=${row.npvDownsideBeta === null ? 'null' : row.npvDownsideBeta.toFixed(4)} ` +
        `baseIRR=${row.baseIrr.toFixed(4)} stressIRR=${row.stressIrr === null ? 'null' : row.stressIrr.toFixed(4)} ` +
        `irrDropPp=${row.irrDropPp === null ? 'null' : row.irrDropPp.toFixed(2)} irrShockBeta=${row.irrDropPerRevenueShock === null ? 'null' : row.irrDropPerRevenueShock.toFixed(2)}`,
      );
    }
    const revenueRetention = rows.map((row) => row.revenueRetention);
    const npvRetention = rows.map((row) => row.npvRetention);
    const beta = rows.map((row) => row.npvDownsideBeta).filter((value): value is number => finite(value));
    const stressIrr = rows.map((row) => row.stressIrr).filter((value): value is number => finite(value));
    console.log(`NORMALIZED_DISTRIBUTION ${windowYears}y revenueRetention p25=${percentile(revenueRetention, 0.25)?.toFixed(4) ?? 'null'} p50=${percentile(revenueRetention, 0.50)?.toFixed(4) ?? 'null'} p75=${percentile(revenueRetention, 0.75)?.toFixed(4) ?? 'null'}`);
    console.log(`NORMALIZED_DISTRIBUTION ${windowYears}y npvRetention p25=${percentile(npvRetention, 0.25)?.toFixed(4) ?? 'null'} p50=${percentile(npvRetention, 0.50)?.toFixed(4) ?? 'null'} p75=${percentile(npvRetention, 0.75)?.toFixed(4) ?? 'null'}`);
    console.log(`NORMALIZED_DISTRIBUTION ${windowYears}y npvBeta p25=${percentile(beta, 0.25)?.toFixed(4) ?? 'null'} p50=${percentile(beta, 0.50)?.toFixed(4) ?? 'null'} p75=${percentile(beta, 0.75)?.toFixed(4) ?? 'null'}`);
    console.log(`NORMALIZED_DISTRIBUTION ${windowYears}y stressIRR p25=${percentile(stressIrr, 0.25)?.toFixed(4) ?? 'null'} p50=${percentile(stressIrr, 0.50)?.toFixed(4) ?? 'null'} p75=${percentile(stressIrr, 0.75)?.toFixed(4) ?? 'null'}`);
    if (unavailable.length > 0) console.log(`NORMALIZED_UNAVAILABLE ${windowYears}y ${unavailable.join('|')}`);
  }

  console.log('NORMALIZED_CYCLE_DOWNSIDE_END');
  console.log('cycleNormalizedDownsideDiagnostic.test.ts passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
