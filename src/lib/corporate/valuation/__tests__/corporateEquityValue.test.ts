import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeCorporateCashWaterfall } from '../../financing/cashWaterfall.ts';
import { buildCorporateEquityValue } from '../corporateEquityValue.ts';

test('Corporate equity value uses opening cash and does not double-count same-year FCFF', () => {
  const waterfall = computeCorporateCashWaterfall({
    yearsByPeriod: [2026, 2027, 2028],
    latestQuarterlyCash: 100,
    useLatestQuarterlyCash: true,
    cashUsedPercent: 1,
    minimumCashReserve: 0,
    debtPercent: 0,
    projects: [{
      projectId: 'p1',
      constructionStartPeriod: 1,
      capexNeedByPeriod: [0, 50, 0],
      fcffIncludesConstructionCapex: true,
      fcffByPeriod: [30, -10, 40],
    }],
  });
  const output = buildCorporateEquityValue({
    valuationYear: 2026,
    reportedCashTarget: 1000,
    reportedDebtTarget: 200,
    fxUSDToTarget: 10,
    waterfall,
    dcfByYear: [
      { year: 2026, dcfTargetCurrency: 10_000 },
      { year: 2027, dcfTargetCurrency: 12_000 },
      { year: 2028, dcfTargetCurrency: 14_000 },
    ],
    productionStarts: [{ projectId: 'p1', year: 2028 }],
  });

  assert.equal(output.current?.openingCashTargetCurrency, 1000);
  assert.equal(output.current?.openingDebtTargetCurrency, 200);
  assert.equal(output.current?.valueTargetCurrency, 10_800);
  assert.equal(output.productionStarts[0]?.openingCashTargetCurrency, 1200);
  assert.equal(output.productionStarts[0]?.openingDebtTargetCurrency, 200);
  assert.equal(output.productionStarts[0]?.valueTargetCurrency, 15_000);
  // 2028 FCFF remains in the 2028 DCF; opening cash is exactly 2027 closing cash.
  assert.equal(waterfall.rows[2]?.openingCash, 120);
});

test('Debt raised during a year enters equity value from the following opening balance', () => {
  const waterfall = computeCorporateCashWaterfall({
    yearsByPeriod: [2026, 2027, 2028],
    latestQuarterlyCash: 10,
    useLatestQuarterlyCash: true,
    cashUsedPercent: 1,
    minimumCashReserve: 0,
    debtPercent: 1,
    projects: [{
      projectId: 'p1',
      constructionStartPeriod: 1,
      capexNeedByPeriod: [0, 100, 0],
      fcffIncludesConstructionCapex: true,
      fcffByPeriod: [0, -100, 0],
    }],
  });
  const output = buildCorporateEquityValue({
    valuationYear: 2026,
    reportedCashTarget: 100,
    reportedDebtTarget: 50,
    fxUSDToTarget: 10,
    waterfall,
    dcfByYear: [
      { year: 2026, dcfTargetCurrency: 1000 },
      { year: 2027, dcfTargetCurrency: 1100 },
      { year: 2028, dcfTargetCurrency: 1200 },
    ],
    productionStarts: [{ projectId: 'p1', year: 2028 }],
  });

  assert.equal(waterfall.rows[1]?.debtAdded, 90);
  assert.equal(output.productionStarts[0]?.openingDebtTargetCurrency, 950);
  assert.equal(output.productionStarts[0]?.openingCashTargetCurrency, 0);
  assert.equal(output.productionStarts[0]?.valueTargetCurrency, 250);
});
