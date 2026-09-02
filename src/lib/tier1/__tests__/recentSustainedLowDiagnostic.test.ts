import assert from 'node:assert/strict';
import { readHistoryRowsInRange } from '../../prices/db/readHistory.ts';
import type { PriceKey } from '../../prices/keys.ts';
import { analyzeRecentSustainedLows } from '../recentSustainedLow.ts';

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

function dateYearsAgo(to: string, yearsAgo: number): string {
  const date = new Date(`${to}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - yearsAgo);
  return date.toISOString().slice(0, 10);
}

(async function runLiveDatabaseDiagnostic() {
  const to = new Date().toISOString().slice(0, 10);
  console.log('RECENT_LOW_LIVE_DIAGNOSTIC_BEGIN');
  for (const priceKey of SERIES) {
    for (const lookbackYears of [7, 10] as const) {
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
  console.log('recentSustainedLowDiagnostic.test.ts passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
