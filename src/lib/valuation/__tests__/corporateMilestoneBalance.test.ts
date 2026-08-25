import test from 'node:test';
import assert from 'node:assert/strict';
import type { CashWaterfallResult } from '../../corporate/financing/cashWaterfall.ts';
import { buildCorporateMilestoneBalances } from '../corporateMilestoneBalance.ts';

function waterfall(args: {
  initialCashAvailable: number;
  rows: Array<Partial<CashWaterfallResult['rows'][number]> & { year: number; period: number }>;
}): CashWaterfallResult {
  return {
    initialCashAvailable: args.initialCashAvailable,
    rows: args.rows.map((row) => ({
      status: 'COMPUTABLE',
      openingCash: 0,
      closingCash: 0,
      minimumCashReserve: 0,
      debtAdded: 0,
      cumulativeCanonicalShares: 100,
      cumulativeNewShares: 0,
      ...row,
    })) as CashWaterfallResult['rows'],
  } as CashWaterfallResult;
}

test('future NAV uses beginning-of-period debt/shares and normalized cash, not same-year closing balance', () => {
  const result = buildCorporateMilestoneBalances({
    years: [2026, 2027, 2028],
    valuationYear: 2026,
    fxUSDToTarget: 1,
    reportedCashTarget: 100,
    currentDebtTarget: 5,
    currentShares: 100,
    todaySharesPf: 100,
    cashWaterfall: waterfall({
      initialCashAvailable: 40,
      rows: [
        { period: 0, year: 2027, minimumCashReserve: 20, closingCash: 999, debtAdded: 10, cumulativeCanonicalShares: 110, cumulativeNewShares: 10 },
        { period: 1, year: 2028, minimumCashReserve: 30, closingCash: 888, debtAdded: 5, cumulativeCanonicalShares: 115, cumulativeNewShares: 15 },
      ],
    }),
  });

  assert.equal(result.diagnostics.retainedCashOutsideWaterfallUSD, 60);
  assert.deepEqual(result.balances, [
    { year: 2026, cashTarget: 100, debtTarget: 5, sharesPf: 100, cumulativeNewShares: 0 },
    // 2027 DCF includes 2027 FCFF, so the matching balance is before 2027 financing.
    { year: 2027, cashTarget: 80, debtTarget: 5, sharesPf: 100, cumulativeNewShares: 0 },
    // 2028 sees only completed 2027 debt/equity; 2028 additions are not yet in the opening balance.
    { year: 2028, cashTarget: 90, debtTarget: 15, sharesPf: 110, cumulativeNewShares: 10 },
  ]);
});

test('cash excluded entirely from cash-first remains explicitly ring-fenced in future NAV', () => {
  const result = buildCorporateMilestoneBalances({
    years: [2026, 2027],
    valuationYear: 2026,
    fxUSDToTarget: 1,
    reportedCashTarget: 100,
    currentDebtTarget: 0,
    currentShares: 100,
    todaySharesPf: 100,
    cashWaterfall: waterfall({
      initialCashAvailable: 0,
      rows: [{ period: 0, year: 2027, minimumCashReserve: 10, closingCash: 500, debtAdded: 0, cumulativeCanonicalShares: 100, cumulativeNewShares: 0 }],
    }),
  });

  assert.equal(result.balances[1].cashTarget, 110);
});

test('accumulated operating cash is not capitalized into future NAV', () => {
  const result = buildCorporateMilestoneBalances({
    years: [2026, 2027, 2028],
    valuationYear: 2026,
    fxUSDToTarget: 1,
    reportedCashTarget: 50,
    currentDebtTarget: 0,
    currentShares: 100,
    todaySharesPf: 100,
    cashWaterfall: waterfall({
      initialCashAvailable: 50,
      rows: [
        { period: 0, year: 2027, minimumCashReserve: 5, closingCash: 500, debtAdded: 0, cumulativeCanonicalShares: 100, cumulativeNewShares: 0 },
        { period: 1, year: 2028, minimumCashReserve: 5, closingCash: 600, debtAdded: 0, cumulativeCanonicalShares: 100, cumulativeNewShares: 0 },
      ],
    }),
  });

  assert.equal(result.balances[1].cashTarget, 5);
  assert.equal(result.balances[2].cashTarget, 5);
});

test('opening balance remains known for a NOT_COMPUTABLE row, then future balances fail closed', () => {
  const result = buildCorporateMilestoneBalances({
    years: [2026, 2027, 2028, 2029],
    valuationYear: 2026,
    fxUSDToTarget: 1,
    reportedCashTarget: 50,
    currentDebtTarget: 0,
    currentShares: 100,
    todaySharesPf: 100,
    cashWaterfall: waterfall({
      initialCashAvailable: 50,
      rows: [
        { period: 0, year: 2027, minimumCashReserve: 5, debtAdded: 0, cumulativeCanonicalShares: 100, cumulativeNewShares: 0 },
        { period: 1, year: 2028, minimumCashReserve: 5, status: 'NOT_COMPUTABLE', debtAdded: null, cumulativeCanonicalShares: null, cumulativeNewShares: null },
      ],
    }),
  });

  assert.deepEqual(result.balances[1], { year: 2027, cashTarget: 5, debtTarget: 0, sharesPf: 100, cumulativeNewShares: 0 });
  assert.deepEqual(result.balances[2], { year: 2028, cashTarget: 5, debtTarget: 0, sharesPf: 100, cumulativeNewShares: 0 });
  assert.deepEqual(result.balances[3], { year: 2029, cashTarget: null, debtTarget: null, sharesPf: null, cumulativeNewShares: null });
});

test('years before the first waterfall row carry current balance; first row uses opening state', () => {
  const result = buildCorporateMilestoneBalances({
    years: [2026, 2027, 2028, 2029, 2030],
    valuationYear: 2026,
    fxUSDToTarget: 1,
    reportedCashTarget: 25,
    currentDebtTarget: 3,
    currentShares: 90,
    todaySharesPf: 95,
    cashWaterfall: waterfall({
      initialCashAvailable: 25,
      rows: [{ period: 0, year: 2029, minimumCashReserve: 5, debtAdded: 7, cumulativeCanonicalShares: 105, cumulativeNewShares: 10 }],
    }),
  });

  assert.deepEqual(result.balances[1], { year: 2027, cashTarget: 25, debtTarget: 3, sharesPf: 95, cumulativeNewShares: 0 });
  assert.deepEqual(result.balances[2], { year: 2028, cashTarget: 25, debtTarget: 3, sharesPf: 95, cumulativeNewShares: 0 });
  assert.deepEqual(result.balances[3], { year: 2029, cashTarget: 5, debtTarget: 3, sharesPf: 95, cumulativeNewShares: 0 });
  assert.deepEqual(result.balances[4], { year: 2030, cashTarget: 5, debtTarget: 10, sharesPf: 105, cumulativeNewShares: 10 });
});
