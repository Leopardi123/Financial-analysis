import assert from 'node:assert/strict';
import { query } from '../../../../api/_db.ts';
import tier1PreRevenueHandler from '../../../server/routes/tier1/pre-revenue.ts';
import { readHistoryRowsInRange } from '../../prices/db/readHistory.ts';
import type { PriceKey } from '../../prices/keys.ts';
import { analyzeRecentSustainedLows } from '../recentSustainedLow.ts';

const COMPANY_PROJECTS_TABLE = 'company_projects';

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

type CandidateTier = 'T1' | 'T2' | 'T3' | 'FAIL';

type CycleDiagnosticRow = {
  symbol: string;
  baseNpv: number;
  stressNpv: number;
  retention: number;
  drawdown: number;
  baseIrr: number;
  baseNpvOverCapex: number | null;
  stressNpvOverCapex: number | null;
  currentCycleStatus: string;
};

function candidateRetention(row: CycleDiagnosticRow): CandidateTier {
  if (!(row.stressNpv > 0)) return 'FAIL';
  if (row.retention >= 0.70) return 'T1';
  if (row.retention >= 0.30) return 'T2';
  return 'T3';
}

function candidateRetentionIrr(row: CycleDiagnosticRow): CandidateTier {
  if (!(row.stressNpv > 0)) return 'FAIL';
  if (row.retention >= 0.70 && row.baseIrr >= 0.25) return 'T1';
  if (row.retention >= 0.40 && row.baseIrr >= 0.20) return 'T2';
  return 'T3';
}

function candidateRetentionStressCapex(row: CycleDiagnosticRow): CandidateTier {
  if (!(row.stressNpv > 0)) return 'FAIL';
  if (finite(row.stressNpvOverCapex) && row.retention >= 0.65 && row.stressNpvOverCapex >= 0.50) return 'T1';
  if (finite(row.stressNpvOverCapex) && row.retention >= 0.35 && row.stressNpvOverCapex >= 0.15) return 'T2';
  return 'T3';
}

function distribution(rows: CycleDiagnosticRow[], classifier: (row: CycleDiagnosticRow) => CandidateTier): string {
  const counts: Record<CandidateTier, number> = { T1: 0, T2: 0, T3: 0, FAIL: 0 };
  for (const row of rows) counts[classifier(row)] += 1;
  return `T1=${counts.T1} T2=${counts.T2} T3=${counts.T3} FAIL=${counts.FAIL}`;
}

async function runTierHandler(symbol: string): Promise<any> {
  let payload: any = null;
  let statusCode = 200;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      payload = body;
      return this;
    },
  };
  await tier1PreRevenueHandler({ method: 'GET', query: { symbol } }, res);
  if (statusCode >= 400) throw new Error(`${symbol}: HTTP ${statusCode}`);
  return payload;
}

async function runUniverseCycleDiagnostic(): Promise<void> {
  const symbolRows = await query(
    `SELECT DISTINCT UPPER(symbol) AS symbol FROM ${COMPANY_PROJECTS_TABLE} ORDER BY UPPER(symbol)`,
  ) as Array<{ symbol?: string }>;
  const symbols = symbolRows.map((row) => String(row.symbol ?? '').trim().toUpperCase()).filter(Boolean);
  const rows: CycleDiagnosticRow[] = [];
  const unavailable: string[] = [];

  console.log('CYCLE_TIER_UNIVERSE_DIAGNOSTIC_BEGIN');
  for (const symbol of symbols) {
    try {
      const body = await runTierHandler(symbol);
      const assessment = body?.assessment;
      const support = assessment?.support;
      const baseNpv = support?.tierBaseNpv10Usd;
      const stressNpv = support?.cycleNpv10Usd;
      const baseIrr = support?.tierBaseIrr;
      const baseNpvOverCapex = support?.tierBaseNpvOverInitialCapex;
      if (!finite(baseNpv) || !(baseNpv > 0) || !finite(stressNpv) || !finite(baseIrr)) {
        unavailable.push(`${symbol}:${assessment?.status ?? 'NO_ASSESSMENT'}`);
        continue;
      }
      const retention = stressNpv / baseNpv;
      const stressNpvOverCapex = finite(baseNpvOverCapex) ? retention * baseNpvOverCapex : null;
      rows.push({
        symbol,
        baseNpv,
        stressNpv,
        retention,
        drawdown: 1 - retention,
        baseIrr,
        baseNpvOverCapex: finite(baseNpvOverCapex) ? baseNpvOverCapex : null,
        stressNpvOverCapex,
        currentCycleStatus: assessment?.gates?.cycle?.status ?? 'UNKNOWN',
      });
    } catch (error) {
      unavailable.push(`${symbol}:ERROR:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  rows.sort((a, b) => a.retention - b.retention || a.symbol.localeCompare(b.symbol));
  for (const row of rows) {
    console.log(
      `CYCLE_COMPANY ${row.symbol} retention=${row.retention.toFixed(4)} drawdown=${row.drawdown.toFixed(4)} ` +
      `baseIRR=${row.baseIrr.toFixed(4)} baseNPV=${row.baseNpv.toFixed(0)} stressNPV=${row.stressNpv.toFixed(0)} ` +
      `baseNPV_CAPEX=${row.baseNpvOverCapex === null ? 'null' : row.baseNpvOverCapex.toFixed(4)} ` +
      `stressNPV_CAPEX=${row.stressNpvOverCapex === null ? 'null' : row.stressNpvOverCapex.toFixed(4)} ` +
      `current=${row.currentCycleStatus} retOnly=${candidateRetention(row)} retIRR=${candidateRetentionIrr(row)} retStressCapex=${candidateRetentionStressCapex(row)}`,
    );
  }

  const retentionValues = rows.map((row) => row.retention);
  const irrValues = rows.map((row) => row.baseIrr);
  const stressCapexValues = rows.map((row) => row.stressNpvOverCapex).filter((value): value is number => finite(value));
  console.log(
    `CYCLE_DISTRIBUTION retention p25=${percentile(retentionValues, 0.25)?.toFixed(4) ?? 'null'} ` +
    `p50=${percentile(retentionValues, 0.50)?.toFixed(4) ?? 'null'} p75=${percentile(retentionValues, 0.75)?.toFixed(4) ?? 'null'}`,
  );
  console.log(
    `CYCLE_DISTRIBUTION baseIRR p25=${percentile(irrValues, 0.25)?.toFixed(4) ?? 'null'} ` +
    `p50=${percentile(irrValues, 0.50)?.toFixed(4) ?? 'null'} p75=${percentile(irrValues, 0.75)?.toFixed(4) ?? 'null'}`,
  );
  console.log(
    `CYCLE_DISTRIBUTION stressNPV_CAPEX p25=${percentile(stressCapexValues, 0.25)?.toFixed(4) ?? 'null'} ` +
    `p50=${percentile(stressCapexValues, 0.50)?.toFixed(4) ?? 'null'} p75=${percentile(stressCapexValues, 0.75)?.toFixed(4) ?? 'null'}`,
  );
  console.log(`CYCLE_CANDIDATE retention_70_30 ${distribution(rows, candidateRetention)}`);
  console.log(`CYCLE_CANDIDATE retention_plus_baseIRR ${distribution(rows, candidateRetentionIrr)}`);
  console.log(`CYCLE_CANDIDATE retention_plus_stressNPV_CAPEX ${distribution(rows, candidateRetentionStressCapex)}`);
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
        const analysis = analyzeRecentSustainedLows(history.rows, {
          lookbackYears,
          rollingMonths: 6,
          minimumSeparationMonths: 12,
          selectedLowCount: 3,
        });
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
