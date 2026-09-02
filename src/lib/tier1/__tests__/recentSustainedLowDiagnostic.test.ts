import assert from 'node:assert/strict';
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

console.log('recentSustainedLowDiagnostic.test.ts passed');
