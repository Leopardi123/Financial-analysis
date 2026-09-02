import assert from 'node:assert/strict';
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
const ACTIVE_LOOKBACK_YEARS = 7;
const ACTIVE_ROLLING_MONTHS = 6;
const ACTIVE_SEPARATION_MONTHS = 12;
const ACTIVE_LOW_COUNT = 3;
const ACTIVE_STRESS_YEARS = 3;

function monthDate(index: number): string {
  const date = new Date(Date.UTC(2016 + Math.floor(index / 12), index % 12, 28));
  return date.toISOString().slice(0, 10);
}

const synthetic = Array.from({ length: 120 }, (_, index) => {
  let close = 100 + index * 0.1;
  if (index >= 20 && index <= 25) close = 60;
  if (index >= 50 && index <= 55) close = 70;
  if (index >= 85 && index <= 90) close = 80;
  return { date: monthDate(index), close };
});

const result = analyzeRecentSustainedLows(synthetic, {
  lookbackYears: 10,
  rollingMonths: 6,
  minimumSeparationMonths: 12,
  selectedLowCount: 3,
});
assert.equal(result.status, 'COMPUTABLE');
assert.equal(result.lows.length, 3);
assert.equal(result.stressPrice, 70);
assert.deepEqual(result.lows.map((row) => Number(row.rollingAverage.toFixed(6))), [60, 70, 80]);

const tooShort = analyzeRecentSustainedLows(synthetic.slice(0, 10), {
  lookbackYears: 10,
  rollingMonths: 6,
  minimumSeparationMonths: 12,
  selectedLowCount: 3,
});
assert.equal(tooShort.status, 'NOT_VERIFIED');
assert.equal(tooShort.stressPrice, null);

const SERIES = [
  'XAU_USD_TOZ', 'XAG_USD_TOZ', 'XPT_USD_TOZ', 'XPD_USD_TOZ',
  'CU_USD_LB', 'ZN_USD_LB', 'PB_USD_LB', 'NI_USD_LB', 'MO_USD_TONNE',
] as const;
const LOOKBACK_YEARS = [5, 6, 7, 8, 9, 10] as const;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function dateYearsAgo(to: string, yearsAgo: number): string {
  const date = new Date(`${to}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - yearsAgo);
  return date.toISOString().slice(0, 10);
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
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

type StressReference = { stressPrice: number; lows: Array<{ date: string; rollingAverage: number }> };
const stressReferenceCache = new Map<string, StressReference | null>();

async function loadStressReference(priceKey: string): Promise<StressReference | null> {
  if (stressReferenceCache.has(priceKey)) return stressReferenceCache.get(priceKey) ?? null;
  const to = new Date().toISOString().slice(0, 10);
  const from = dateYearsAgo(to, ACTIVE_LOOKBACK_YEARS);
  try {
    const history = await readHistoryRowsInRange({ priceKey: priceKey as PriceKey, from, to });
    const analysis = analyzeRecentSustainedLows(history.rows, {
      lookbackYears: ACTIVE_LOOKBACK_YEARS,
      rollingMonths: ACTIVE_ROLLING_MONTHS,
      minimumSeparationMonths: ACTIVE_SEPARATION_MONTHS,
      selectedLowCount: ACTIVE_LOW_COUNT,
    });
    const value = analysis.status === 'COMPUTABLE' && finite(analysis.stressPrice)
      ? { stressPrice: analysis.stressPrice, lows: analysis.lows }
      : null;
    stressReferenceCache.set(priceKey, value);
    return value;
  } catch {
    stressReferenceCache.set(priceKey, null);
    return null;
  }
}

type CandidateTier = 'T1' | 'T2' | 'T3' | 'FAIL';
type CycleDiagnosticRow = {
  symbol: string;
  baseNpv: number;
  stressNpv: number;
  retention: number;
  drawdown: number;
  baseIrr: number;
  stressIrr: number | null;
  irrDropPp: number | null;
  baseNpvOverCapex: number | null;
  stressNpvOverCapex: number | null;
};

function candidateRetention(row: CycleDiagnosticRow): CandidateTier {
  if (!(row.stressNpv > 0)) return 'FAIL';
  if (row.retention >= 0.70) return 'T1';
  if (row.retention >= 0.30) return 'T2';
  return 'T3';
}

function candidateRetentionStressIrr(row: CycleDiagnosticRow): CandidateTier {
  if (!(row.stressNpv > 0)) return 'FAIL';
  if (finite(row.stressIrr) && row.retention >= 0.65 && row.stressIrr >= 0.20) return 'T1';
  if (finite(row.stressIrr) && row.retention >= 0.35 && row.stressIrr >= 0.12) return 'T2';
  return 'T3';
}

function candidateRetentionStressCapex(row: CycleDiagnosticRow): CandidateTier {
  if (!(row.stressNpv > 0)) return 'FAIL';
  if (finite(row.stressNpvOverCapex) && row.retention >= 0.65 && row.stressNpvOverCapex >= 0.50) return 'T1';
  if (finite(row.stressNpvOverCapex) && row.retention >= 0.35 && row.stressNpvOverCapex >= 0.15) return 'T2';
  return 'T3';
}

function candidateTriple(row: CycleDiagnosticRow): CandidateTier {
  if (!(row.stressNpv > 0)) return 'FAIL';
  if (finite(row.stressIrr) && finite(row.stressNpvOverCapex) && row.retention >= 0.65 && row.stressIrr >= 0.20 && row.stressNpvOverCapex >= 0.50) return 'T1';
  if (finite(row.stressIrr) && finite(row.stressNpvOverCapex) && row.retention >= 0.35 && row.stressIrr >= 0.12 && row.stressNpvOverCapex >= 0.15) return 'T2';
  return 'T3';
}

function distribution(rows: CycleDiagnosticRow[], classifier: (row: CycleDiagnosticRow) => CandidateTier): string {
  const counts: Record<CandidateTier, number> = { T1: 0, T2: 0, T3: 0, FAIL: 0 };
  for (const row of rows) counts[classifier(row)] += 1;
  return `T1=${counts.T1} T2=${counts.T2} T3=${counts.T3} FAIL=${counts.FAIL}`;
}

async function evaluateCompany(symbol: string): Promise<CycleDiagnosticRow | null> {
  const loaded = await loadProjectsForSymbol(symbol);
  if (loaded.length === 0) return null;
  const baseProjects: Array<{ years: number[]; fcff: Array<number | null> }> = [];
  const stressProjects: Array<{ years: number[]; fcff: Array<number | null> }> = [];
  const productionYears = new Set<number>();
  let initialCapex = 0;

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
    const toT = Math.min(stressed.masterN, fromT + ACTIVE_STRESS_YEARS - 1);

    for (const [metal, series] of Object.entries(stressed.spotPriceUSDByMetal)) {
      const priceKey = physical.priceKeyByMetal[metal];
      if (!priceKey) return null;
      const spot = scalarPrice(baseInput.spotPriceUSDByMetal[metal]);
      const reference = await loadStressReference(priceKey);
      if (!finite(spot) || !reference) return null;
      const target = Math.min(spot, reference.stressPrice);
      if (!(target > 0)) return null;
      const multiplier = target / spot;
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
    baseProjects.push({ years: physical.yearsByPeriod, fcff: baseOutput.phase1.fcffUSD });
    stressProjects.push({ years: physical.yearsByPeriod, fcff: stressOutput.phase1.fcffUSD });
    for (const series of Object.values(physical.payableQtyByMetal)) {
      for (let t = 0; t < series.length; t += 1) if (finite(series[t]) && (series[t] as number) > 0) productionYears.add(physical.yearsByPeriod[t]);
    }
    for (let t = 0; t <= physical.productionStartPeriod; t += 1) {
      const capex = baseOutput.capexUSD_used[t];
      if (finite(capex)) initialCapex += capex;
    }
  }

  const baseCorporate = aggregateFcffByYear(baseProjects);
  const stressCorporate = aggregateFcffByYear(stressProjects);
  if (!baseCorporate || !stressCorporate) return null;
  const productionStartPeriod = firstProductionIndex(baseCorporate.years, productionYears);
  const basePhase2 = computeProjectPhase2({ masterN: baseCorporate.fcff.length - 1, productionStartPeriod, discountRate: 0.10, fcffUSD: baseCorporate.fcff });
  const stressPhase2 = computeProjectPhase2({ masterN: stressCorporate.fcff.length - 1, productionStartPeriod, discountRate: 0.10, fcffUSD: stressCorporate.fcff });
  const baseNpv = basePhase2.npvToday_USD;
  const stressNpv = stressPhase2.npvToday_USD;
  const baseIrr = basePhase2.irr;
  const stressIrr = stressPhase2.irr;
  if (!finite(baseNpv) || !(baseNpv > 0) || !finite(stressNpv) || !finite(baseIrr)) return null;
  const retention = stressNpv / baseNpv;
  return {
    symbol,
    baseNpv,
    stressNpv,
    retention,
    drawdown: 1 - retention,
    baseIrr,
    stressIrr: finite(stressIrr) ? stressIrr : null,
    irrDropPp: finite(stressIrr) ? (baseIrr - stressIrr) * 100 : null,
    baseNpvOverCapex: initialCapex > 0 ? baseNpv / initialCapex : null,
    stressNpvOverCapex: initialCapex > 0 ? stressNpv / initialCapex : null,
  };
}

async function runUniverseCycleDiagnostic(): Promise<void> {
  const symbolRows = await query(`SELECT DISTINCT UPPER(symbol) AS symbol FROM ${COMPANY_PROJECTS_TABLE} ORDER BY UPPER(symbol)`) as Array<{ symbol?: string }>;
  const symbols = symbolRows.map((row) => String(row.symbol ?? '').trim().toUpperCase()).filter(Boolean);
  const rows: CycleDiagnosticRow[] = [];
  const unavailable: string[] = [];
  console.log('CYCLE_TIER_UNIVERSE_DIAGNOSTIC_BEGIN');

  for (const symbol of symbols) {
    try {
      const row = await evaluateCompany(symbol);
      if (row) rows.push(row); else unavailable.push(symbol);
    } catch (error) {
      unavailable.push(`${symbol}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  rows.sort((a, b) => a.retention - b.retention || a.symbol.localeCompare(b.symbol));
  for (const row of rows) {
    console.log(
      `CYCLE_COMPANY ${row.symbol} retention=${row.retention.toFixed(4)} drawdown=${row.drawdown.toFixed(4)} ` +
      `baseIRR=${row.baseIrr.toFixed(4)} stressIRR=${row.stressIrr === null ? 'null' : row.stressIrr.toFixed(4)} ` +
      `irrDropPp=${row.irrDropPp === null ? 'null' : row.irrDropPp.toFixed(2)} ` +
      `baseNPV=${row.baseNpv.toFixed(0)} stressNPV=${row.stressNpv.toFixed(0)} ` +
      `baseNPV_CAPEX=${row.baseNpvOverCapex === null ? 'null' : row.baseNpvOverCapex.toFixed(4)} ` +
      `stressNPV_CAPEX=${row.stressNpvOverCapex === null ? 'null' : row.stressNpvOverCapex.toFixed(4)} ` +
      `retOnly=${candidateRetention(row)} retStressIRR=${candidateRetentionStressIrr(row)} ` +
      `retStressCapex=${candidateRetentionStressCapex(row)} triple=${candidateTriple(row)}`,
    );
  }

  const retentionValues = rows.map((row) => row.retention);
  const baseIrrValues = rows.map((row) => row.baseIrr);
  const stressIrrValues = rows.map((row) => row.stressIrr).filter((value): value is number => finite(value));
  const irrDropValues = rows.map((row) => row.irrDropPp).filter((value): value is number => finite(value));
  const stressCapexValues = rows.map((row) => row.stressNpvOverCapex).filter((value): value is number => finite(value));
  for (const [label, values] of [
    ['retention', retentionValues],
    ['baseIRR', baseIrrValues],
    ['stressIRR', stressIrrValues],
    ['irrDropPp', irrDropValues],
    ['stressNPV_CAPEX', stressCapexValues],
  ] as const) {
    console.log(`CYCLE_DISTRIBUTION ${label} p25=${percentile(values, 0.25)?.toFixed(4) ?? 'null'} p50=${percentile(values, 0.50)?.toFixed(4) ?? 'null'} p75=${percentile(values, 0.75)?.toFixed(4) ?? 'null'}`);
  }
  console.log(`CYCLE_CANDIDATE retention_70_30 ${distribution(rows, candidateRetention)}`);
  console.log(`CYCLE_CANDIDATE retention_plus_stressIRR ${distribution(rows, candidateRetentionStressIrr)}`);
  console.log(`CYCLE_CANDIDATE retention_plus_stressNPV_CAPEX ${distribution(rows, candidateRetentionStressCapex)}`);
  console.log(`CYCLE_CANDIDATE triple ${distribution(rows, candidateTriple)}`);
  if (unavailable.length > 0) console.log(`CYCLE_UNAVAILABLE ${unavailable.join('|')}`);
  console.log(`CYCLE_TIER_UNIVERSE_DIAGNOSTIC_END computable=${rows.length} totalSymbols=${symbols.length}`);
}

(async function runLiveDatabaseDiagnostic() {
  const to = new Date().toISOString().slice(0, 10);
  console.log('RECENT_LOW_LIVE_DIAGNOSTIC_BEGIN');
  for (const priceKey of SERIES) {
    for (const lookbackYears of LOOKBACK_YEARS) {
      const from = dateYearsAgo(to, lookbackYears);
      try {
        const history = await readHistoryRowsInRange({ priceKey: priceKey as PriceKey, from, to });
        const analysis = analyzeRecentSustainedLows(history.rows, { lookbackYears, rollingMonths: 6, minimumSeparationMonths: 12, selectedLowCount: 3 });
        const lows = analysis.lows.map((row) => `${row.date.slice(0, 7)}=${row.rollingAverage.toFixed(6)}`).join('|');
        console.log(`RECENT_LOW ${priceKey} ${lookbackYears}y status=${analysis.status} stress=${analysis.stressPrice === null ? 'null' : analysis.stressPrice.toFixed(6)} lows=${lows} monthly=${analysis.monthlyObservations} missingMonths=${history.missing}`);
      } catch (error) {
        console.log(`RECENT_LOW ${priceKey} ${lookbackYears}y status=NOT_VERIFIED error=${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  console.log('RECENT_LOW_LIVE_DIAGNOSTIC_END');
  await runUniverseCycleDiagnostic();
  console.log('recentSustainedLowDiagnostic.test.ts passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
