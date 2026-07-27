import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCashForNav } from '../navCashBridge.ts';

test('reported t0 remains the default and ignores funding allocation', () => {
  assert.equal(resolveCashForNav({ reportedCash: 3_000, initialCashUsedForFunding: 3_000 }), 3_000);
  assert.equal(resolveCashForNav({ definition: 'reported_t0', reportedCash: 3_000, initialCashUsedForFunding: 3_000 }), 3_000);
});

test('pro forma cash covers the three requested funding examples', () => {
  assert.equal(resolveCashForNav({ definition: 'pro_forma_after_funding', reportedCash: 3_000, initialCashUsedForFunding: 3_000 }), 0);
  assert.equal(resolveCashForNav({ definition: 'pro_forma_after_funding', reportedCash: 5_000, initialCashUsedForFunding: 3_000 }), 2_000);
  assert.equal(resolveCashForNav({ definition: 'pro_forma_after_funding', reportedCash: 1_000, initialCashUsedForFunding: 1_000 }), 0);
});

test('pro forma cash cannot fall below the configured reserve', () => {
  assert.equal(resolveCashForNav({ definition: 'pro_forma_after_funding', reportedCash: 1_000, initialCashUsedForFunding: 950, minimumCashReserve: 100 }), 100);
});
