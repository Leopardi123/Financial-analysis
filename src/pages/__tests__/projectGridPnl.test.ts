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
  assert.equal(pnl.royaltiesDetailPresent, true);
  assert.equal(pnl.royaltiesDetailRuleCount, 1);
  assert.equal(pnl.royaltiesDetailComputable, true);
  assert.equal(pnl.royaltiesDetailBaseNormalized, 'revenue');
  assert.equal(pnl.royaltiesDetailRateTypeNormalized, 'nsr_pct');
  assert.equal(pnl.royaltiesDetailRateParsed, 5);
  assert.equal(pnl.royaltyRatePercentResolved, 5);
  assert.equal(pnl.royaltiesFailureReason, null);
  assert.equal(pnl.royaltiesRuleDiagnostics.length, 1);
  assert.equal(pnl.royaltiesRuleDiagnostics[0]?.computable, true);
  assert.equal(pnl.royaltiesPeriodDiagnostics[2]?.failedAtStep, 'none');
  assert.equal(pnl.royaltiesPeriodDiagnostics[2]?.failureReason, null);

  assert.equal(pnl.grossProfit[2], 85);
  assert.equal(pnl.ebitda[2], 85);
  assert.equal(pnl.ebit[2], 85);
  assert.equal(pnl.fcff[2], 85);
});

test('buildProjectGridPnl computes royalties from royaltiesDetail revenue NSR_pct rate=0.5 even without royaltyUSD series', () => {
  const pnl = buildProjectGridPnl({
    revenueByMetal_USD: {
      Au: [null, null, 100, 120],
    },
    operatingCostsUSD: [0, 0, 10, 10],
    siteGandA_USD: [0, 0, 0, 0],
    royaltiesDetail: [
      {
        id: 'nsr',
        label: 'NSR',
        base: 'revenue',
        rateType: 'NSR_pct',
        rate: 0.5,
      },
    ],
    taxUSD: [0, 0, 0, 0],
    sustainingCapexUSD: [0, 0, 0, 0],
    reclamationUSD: [0, 0, 0, 0],
    workingCapitalDeltaUSD: [0, 0, 0, 0],
    capexUSD: [0, 0, 0, 0],
  }, 4);

  assert.equal(pnl.royaltiesSourceUsed, 'royaltiesDetail-current-run');
  assert.deepEqual(pnl.royaltyRatePct, [null, null, 0.5, 0.5]);
  assert.deepEqual(pnl.royalties, [null, null, 0.5, 0.6]);
  assert.equal(pnl.royaltiesDetailComputable, true);
  assert.equal(pnl.royaltyRatePercentResolved, 0.5);
  assert.equal(pnl.royaltiesResolvedNumeric, true);
  assert.equal(pnl.royaltiesPeriodDiagnostics[0]?.failedAtStep, 'gross-revenue-missing');
  assert.equal(pnl.royaltiesPeriodDiagnostics[2]?.failedAtStep, 'none');
});

test('buildProjectGridPnl keeps gross revenue computable when one metal revenue series is null while others are numeric', () => {
  const pnl = buildProjectGridPnl({
    revenueByMetal_USD: {
      Au: [100],
      Ag: [200],
      Pb: [null],
    },
    operatingCostsUSD: [50],
    siteGandA_USD: [10],
    royaltiesDetail: [
      {
        id: 'nsr',
        label: 'NSR',
        base: 'revenue',
        rateType: 'NSR_pct',
        rate: 0.5,
      },
    ],
    taxUSD: [0],
    sustainingCapexUSD: [0],
    reclamationUSD: [0],
    workingCapitalDeltaUSD: [0],
    capexUSD: [0],
  }, 1);

  assert.deepEqual(pnl.grossRevenue, [300]);
  assert.deepEqual(pnl.royaltyRatePct, [0.5]);
  assert.deepEqual(pnl.royalties, [1.5]);
  assert.deepEqual(pnl.ebit, [238.5]);
  assert.equal(pnl.royaltiesSourceUsed, 'royaltiesDetail-current-run');
});

test('buildProjectGridPnl treats revenue + numeric rate as computable even when rateType is missing', () => {
  const pnl = buildProjectGridPnl({
    revenueByMetal_USD: {
      Au: [100],
    },
    operatingCostsUSD: [10],
    siteGandA_USD: [0],
    royaltiesDetail: [
      {
        id: 'nsr-no-type',
        label: 'Revenue pct no type',
        base: 'revenue',
        rate: 0.5,
      },
    ],
    taxUSD: [0],
    sustainingCapexUSD: [0],
    reclamationUSD: [0],
    workingCapitalDeltaUSD: [0],
    capexUSD: [0],
  }, 1);

  assert.equal(pnl.royaltiesSourceUsed, 'royaltiesDetail-current-run');
  assert.deepEqual(pnl.royalties, [0.5]);
  assert.deepEqual(pnl.royaltyRatePct, [0.5]);
  assert.equal(pnl.royaltiesRuleDiagnostics[0]?.computable, true);
});
