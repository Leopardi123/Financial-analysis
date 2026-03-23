import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFailingMetals, extractFallbackOrFailingPriceMetals, rowHasMetalRevenueFailure } from '../projectMetalRevenueDiagnostics.ts';

test('extractFailingMetals keeps only expected-but-missing computations', () => {
  const raw = {
    Pb: [
      { isExpectedToCompute: true, didCompute: false, t: 11 },
      { isExpectedToCompute: true, didCompute: true, t: 12 },
    ],
    Au: [
      { isExpectedToCompute: false, didCompute: false, t: 5 },
    ],
  };

  const out = extractFailingMetals(raw);
  assert.equal(Array.isArray(out.Pb), true);
  assert.equal(out.Pb.length, 1);
  assert.equal('Au' in out, false);
});

test('rowHasMetalRevenueFailure marks metal-specific rows and skips inactive labels', () => {
  const metals = ['Pb'];
  assert.equal(rowHasMetalRevenueFailure('Payable Pb (lb)', metals), true);
  assert.equal(rowHasMetalRevenueFailure('Revenue Pb (USD)', metals), true);
  assert.equal(rowHasMetalRevenueFailure('Payable Au (toz)', metals), false);
});

test('extractFallbackOrFailingPriceMetals returns manual/missing/expired metals', () => {
  const metals = extractFallbackOrFailingPriceMetals({
    Au: { priceSourceUsed: 'fmp' },
    Pb: { priceSourceUsed: 'manual' },
    Zn: { priceSourceUsed: 'missing' },
  });
  assert.deepEqual(metals, ['Pb', 'Zn']);
});
