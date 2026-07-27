import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCanonicalHighSeries } from '../highSeries.ts';

test('High discounts one production-start anchor before TP and rolls from TP onward', () => {
  const rolling = [10, 20, 330, 440, 550];
  const high = buildCanonicalHighSeries({ rollingDcfSeries: rolling, productionStartPeriod: 2, discountRate: 0.1 });
  assert.deepEqual(high, [330 / 1.1 ** 2, 330 / 1.1, 330, 440, 550]);
});

test('High never adds initial CAPEX after production start', () => {
  const rolling = [0, 0, 100, 80];
  const capex = [40, 60, 50, 999];
  const high = buildCanonicalHighSeries({ rollingDcfSeries: rolling, productionStartPeriod: 2, discountRate: 0.1 });
  assert.equal(high[2], rolling[2]);
  assert.equal(high[3], rolling[3]);
  assert.notEqual(high[2], rolling[2] + capex[2]);
  assert.notEqual(high[3], rolling[3] + capex[3]);
});
