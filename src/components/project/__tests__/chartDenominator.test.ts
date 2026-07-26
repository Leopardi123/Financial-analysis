import assert from 'node:assert/strict';
import test from 'node:test';
import { rescalePerShareSeries } from '../chartDenominator.ts';

test('legacy time-series numerators are divided by canonical cash-first Shares PF', () => {
  // 4/share at 400 shares means numerator 1,600; canonical 320 shares => 5/share.
  assert.deepEqual(rescalePerShareSeries([4, null], 400, 320), [5, null]);
  assert.deepEqual(rescalePerShareSeries([4], null, 320), [4]);
});
