import assert from 'node:assert/strict';
import {
  comparePreRevenueMetricValues,
  defaultPreRevenueSortDirection,
  isPreRevenueSortableMetricKey,
  preRevenueMetricSortValue,
} from '../preRevenueCompareSorting.ts';
import type { CorporatePreRevenueMetrics } from '../../lib/corporate/preRevenueMetrics.ts';

function metrics(overrides: Partial<CorporatePreRevenueMetrics>): CorporatePreRevenueMetrics {
  return {
    irr: null,
    paybackYears: null,
    lomYears: null,
    initialCapexUSD: null,
    initialCapexMarkerYear: null,
    initialCapexBasis: 'NEXT_PRODUCTION_MILESTONE_INCREMENTAL',
    sharesPostFinancing: null,
    marketCapUSD: null,
    enterpriseValueUSD: null,
    pNavPostFinancing: null,
    peak6xValuePerShare: null,
    peak6xOverCurrentPrice: null,
    nextProjectMarkerYear: null,
    targetPrice: null,
    targetOverCurrentPrice: null,
    annualizedReturnToTarget: null,
    valuationSourcePath: null,
    targetSourcePath: null,
    peak6xSourcePath: null,
    equivalentByMetal: {},
    byReferenceMetal: {},
    diagnostics: [],
    ...overrides,
  };
}

assert.equal(defaultPreRevenueSortDirection('pNav'), 'asc');
assert.equal(defaultPreRevenueSortDirection('payback'), 'asc');
assert.equal(defaultPreRevenueSortDirection('initialCapex'), 'asc');
assert.equal(defaultPreRevenueSortDirection('mcap10yAueq'), 'asc');
assert.equal(defaultPreRevenueSortDirection('evEbitdaPeak'), 'desc');
assert.equal(defaultPreRevenueSortDirection('targetPrice'), 'desc');
assert.equal(defaultPreRevenueSortDirection('irr'), 'desc');
assert.equal(defaultPreRevenueSortDirection('lom'), 'desc');
assert.equal(defaultPreRevenueSortDirection('annualAueq'), 'desc');
assert.equal(isPreRevenueSortableMetricKey('evLomAueq'), false, 'quarantined EV/LOM Eq must not be economically sortable');
assert.equal(isPreRevenueSortableMetricKey('tier'), false, 'Tier remains outside this semantic pass');
assert.equal(isPreRevenueSortableMetricKey('investmentScore'), false, 'Investment Score remains outside this semantic pass');

const left = metrics({
  peak6xValuePerShare: 100,
  peak6xOverCurrentPrice: 2,
  targetPrice: 200,
  targetOverCurrentPrice: 4,
});
const right = metrics({
  peak6xValuePerShare: 50,
  peak6xOverCurrentPrice: 5,
  targetPrice: 100,
  targetOverCurrentPrice: 8,
});
assert.equal(preRevenueMetricSortValue(left, 'evEbitdaPeak', 'Au'), 2, 'Peak sort must use the multiple, not absolute per-share value');
assert.equal(preRevenueMetricSortValue(right, 'targetPrice', 'Au'), 8, 'Target sort must use target/current multiple, not target amount');
assert.ok(comparePreRevenueMetricValues(left, right, 'evEbitdaPeak', 'Au', 'desc') > 0, 'higher Peak multiple must rank first');
assert.ok(comparePreRevenueMetricValues(left, right, 'targetPrice', 'Au', 'desc') > 0, 'higher Target multiple must rank first');

const lowPNav = metrics({ pNavPostFinancing: 0.25 });
const highPNav = metrics({ pNavPostFinancing: 0.75 });
assert.ok(comparePreRevenueMetricValues(lowPNav, highPNav, 'pNav', 'Au', 'asc') < 0, 'lower P/NAV must rank first');

const missing = metrics({ pNavPostFinancing: null });
assert.ok(comparePreRevenueMetricValues(missing, lowPNav, 'pNav', 'Au', 'asc') > 0, 'missing values must sort last in ascending investment order');
assert.ok(comparePreRevenueMetricValues(missing, lowPNav, 'pNav', 'Au', 'desc') > 0, 'missing values must sort last even after direction toggle');

await import('../../lib/snapshot/__tests__/producerNextProjectIrr.prebuild.test.ts');

console.log('preRevenueCompareSorting.test.ts passed');
