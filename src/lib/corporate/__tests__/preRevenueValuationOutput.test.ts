import assert from 'node:assert/strict';
import { buildCorporatePreRevenueValuationOutput } from '../preRevenueValuationOutput.ts';

const canonicalValuationTimeline = {
  periods: [
    { periodIndex: 0, calendarYear: 2026, navPerShareTarget: 2, dcfPerShareTarget: 3 },
    { periodIndex: 1, calendarYear: 2027, navPerShareTarget: 4, dcfPerShareTarget: 8 },
    { periodIndex: 2, calendarYear: 2028, navPerShareTarget: 6, dcfPerShareTarget: 10 },
    { periodIndex: 3, calendarYear: 2029, navPerShareTarget: 7, dcfPerShareTarget: 11 },
  ],
};

const result = buildCorporatePreRevenueValuationOutput({
  valuationYear: 2026,
  canonicalValuationTimeline,
  projectStartMilestones: [
    { corporatePeriodIndex: 3, calendarYear: 2029 },
    { corporatePeriodIndex: 2, calendarYear: 2028 },
  ],
  corporateValuationTimeSeries: {
    rows: [
      { period: 0, year: 2026, evEbitda6xPerShare: null },
      { period: 1, year: 2027, evEbitda6xPerShare: 9 },
      { period: 2, year: 2028, evEbitda6xPerShare: 15 },
      { period: 3, year: 2029, evEbitda6xPerShare: 12 },
    ],
  },
});

assert.equal(result.sourcePath, 'snapshot.preRevenueValuation');
assert.deepEqual(result.target, {
  sourcePath: 'canonicalValuationTimeline.projectStartMilestone',
  calendarYear: 2028,
  periodIndex: 2,
  lowNavPerShareTargetCurrency: 6,
  highDcfPerShareTargetCurrency: 10,
  targetPriceTargetCurrency: 8,
});
assert.deepEqual(result.peak6x, {
  sourcePath: 'corporateValuationTimeSeries.canonicalPeriodRows',
  calendarYear: 2028,
  periodIndex: 2,
  valuePerShareTargetCurrency: 15,
});

const misaligned = buildCorporatePreRevenueValuationOutput({
  valuationYear: 2026,
  canonicalValuationTimeline,
  projectStartMilestones: [{ corporatePeriodIndex: 2, calendarYear: 2030 }],
  corporateValuationTimeSeries: { rows: [{ period: 8, year: 2034, evEbitda6xPerShare: 99 }] },
});
assert.equal(misaligned.target, null);
assert.equal(misaligned.peak6x, null);
assert.ok(misaligned.diagnostics.some((message) => message.includes('does not map exactly')));
assert.ok(misaligned.diagnostics.some((message) => message.includes('not aligned')));

console.log('preRevenueValuationOutput.test.ts passed');
