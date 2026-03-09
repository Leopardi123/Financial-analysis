import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectGridPnl } from '../projectGridPnl.ts';

test('buildProjectGridPnl keeps P&L internally consistent and does not reuse stale EBIT/FCFF', () => {
  const pnl = buildProjectGridPnl({
    revenueByMetal_USD: {
      Au: [90],
      Ag: [510],
    },
    operatingCostsUSD: [58.95],
    siteGandA_USD: [2.8],
    royaltiesUSD: [0.86],
    taxUSD: [10],
    sustainingCapexUSD: [5],
    reclamationUSD: [1],
    workingCapitalDeltaUSD: [2],
    capexUSD: [3],
  }, 1);

  assert.deepEqual(pnl.grossRevenue, [600]);
  assert.deepEqual(pnl.royaltyRatePct, [null]);
  assert.equal(pnl.royaltiesSourceUsed, 'series.royaltiesUSD-fallback');
  assert.equal(Math.abs((pnl.ebitda[0] ?? 0) - 540.19) < 1e-9, true);
  assert.deepEqual(pnl.ebit, [537.39]);
  assert.deepEqual(pnl.fcff, [516.39]);
  assert.equal((pnl.ebit[0] ?? 0) > 0, true);

  // Guard: if stale snapshot EBIT/FCFF had been used, these values would not match.
  assert.notDeepEqual(pnl.ebit, [-61_750_000]);
  assert.notDeepEqual(pnl.fcff, [-61_750_000]);
});

test('buildProjectGridPnl resolves royalties detail source and shows royalty rate (%) for detail-driven royalties', () => {
  const pnl = buildProjectGridPnl({
    revenueByMetal_USD: {
      Au: [null, null, 100, 120],
    },
    operatingCostsUSD: [0, 0, 10, 10],
    siteGandA_USD: [0, 0, 0, 0],
    royaltiesUSD: [1, 1, 1, 1],
    royaltiesDetail: [
      {
        id: 'nsr',
        label: 'NSR',
        base: 'revenue',
        rateType: 'NSR_pct',
        rate: 5,
        royaltyUSD: [null, null, 5, 6],
      },
    ],
    taxUSD: [0, 0, 0, 0],
    sustainingCapexUSD: [0, 0, 0, 0],
    reclamationUSD: [0, 0, 0, 0],
    workingCapitalDeltaUSD: [0, 0, 0, 0],
    capexUSD: [0, 0, 0, 0],
  }, 4);

  assert.equal(pnl.royaltiesSourceUsed, 'royaltiesDetail-current-run');
  assert.deepEqual(pnl.royalties, [null, null, 5, 6]);
  assert.deepEqual(pnl.royaltyRatePct, [null, null, 5, 5]);
  assert.equal(pnl.computedPeriods, 2);
  assert.equal(pnl.skippedPeriods, 2);
  assert.deepEqual(pnl.grossRevenueNullPeriods, [0, 1]);
  assert.deepEqual(pnl.royaltiesRateTypes, ['NSR_pct']);
  assert.deepEqual(pnl.royaltiesBases, ['revenue']);

  assert.equal(pnl.grossProfit[2], 85);
  assert.equal(pnl.ebitda[2], 85);
  assert.equal(pnl.ebit[2], 85);
  assert.equal(pnl.fcff[2], 85);
});


test('buildProjectGridPnl prefers central engine EBIT/FCFF series when provided', () => {
  const pnl = buildProjectGridPnl({
    revenueByMetal_USD: {
      Au: [100],
    },
    totalRevenue_USD: [100],
    operatingCostsUSD: [1],
    siteGandA_USD: [1],
    royaltiesUSD: [1],
    byproductCreditsUSD: [0],
    depreciationUSD: [50],
    ebitdaUSD: [97],
    ebitUSD: [47],
    taxableIncomeUSD: [47],
    taxUSD: [16.45],
    effectiveTaxRate: [0.35],
    sustainingCapexUSD: [0],
    reclamationUSD: [0],
    workingCapitalDeltaUSD: [0],
    capexUSD: [0],
    fcffUSD: [30.55],
  }, 1);

  assert.deepEqual(pnl.ebitda, [97]);
  assert.deepEqual(pnl.ebit, [47]);
  assert.deepEqual(pnl.taxableIncome, [47]);
  assert.deepEqual(pnl.effectiveTaxRate, [0.35]);
  assert.deepEqual(pnl.fcff, [30.55]);
});
