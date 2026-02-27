import test from 'node:test';
import assert from 'node:assert/strict';
import { convertPriceToCanonical, convertQuantityToCanonical } from '../conversion.ts';

function revenueForPeriod(metal: string, qty: number, qtyUnit: string, price: number, priceUnit: string): number | null {
  const qtyCanonical = convertQuantityToCanonical(metal, qty, qtyUnit);
  const priceCanonical = convertPriceToCanonical(metal, price, priceUnit);
  if (qtyCanonical === null || priceCanonical === null) {
    return null;
  }
  return qtyCanonical * priceCanonical;
}

test('Cu payable in tonne with USD_lb price converts tonne -> lb deterministically', () => {
  const revenue = revenueForPeriod('Cu', 1, 'tonne', 2, 'USD_lb');
  assert.ok(revenue !== null);
  assert.ok(Math.abs((revenue as number) - 4409.245243697551) < 1e-9);
});

test('Au payable in g with USD_toz price converts g -> toz', () => {
  const revenue = revenueForPeriod('Au', 31.1034768, 'g', 2000, 'USD_toz');
  assert.ok(revenue !== null);
  assert.ok(Math.abs((revenue as number) - 2000) < 1e-9);
});

test('unknown unit returns null revenue in deterministic conversion path', () => {
  const revenue = revenueForPeriod('Au', 100, 'unknown_unit', 2000, 'USD_toz');
  assert.equal(revenue, null);
});

test('mixed units across periods remain deterministic', () => {
  const periods = [
    revenueForPeriod('Cu', 1, 'tonne', 2, 'USD_lb'),
    revenueForPeriod('Cu', 1000, 'kg', 2, 'USD_lb'),
    revenueForPeriod('Cu', 2204.622621848776, 'lb', 2, 'USD_lb'),
  ];

  assert.ok(periods.every((value) => value !== null));
  assert.ok(Math.abs((periods[0] as number) - (periods[1] as number)) < 1e-6);
  assert.ok(Math.abs((periods[1] as number) - (periods[2] as number)) < 1e-6);
});
