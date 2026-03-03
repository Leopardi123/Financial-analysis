import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCorporateModeledValuationTimeline, mapProjectTpToCorporateIndex } from '../corporateModeledValuationTimeline.ts';

test('mapProjectTpToCorporateIndex returns exact match when corporate axis contains tpDate', () => {
  const projectDates = ['2025-12-31', '2026-12-31', '2027-12-31', '2028-12-31', '2029-12-31'];
  const corporateDates = ['2024-12-31', '2025-12-31', '2026-12-31', '2027-12-31', '2028-12-31', '2029-12-31'];

  const mapped = mapProjectTpToCorporateIndex(projectDates, 4, corporateDates);

  assert.equal(mapped.tpDate, '2029-12-31');
  assert.equal(mapped.corporateIndex, 5);
  assert.equal(mapped.matchMode, 'exact');
});

test('mapProjectTpToCorporateIndex finds index by date and does not assume tp equals corporate index', () => {
  const projectDates = ['2025-12-31', '2026-12-31', '2027-12-31', '2028-12-31', '2029-12-31'];
  const corporateDates = [
    '2025-09-30', '2025-12-31',
    '2026-09-30', '2026-12-31',
    '2027-09-30', '2027-12-31',
    '2028-09-30', '2028-12-31',
    '2029-09-30', '2029-12-31',
  ];

  const mapped = mapProjectTpToCorporateIndex(projectDates, 4, corporateDates);

  assert.equal(mapped.tpDate, '2029-12-31');
  assert.equal(mapped.corporateIndex, 9);
  assert.equal(mapped.matchMode, 'exact');
});

test('mapProjectTpToCorporateIndex uses first corporate date >= tpDate when exact date is missing', () => {
  const projectDates = ['2025-12-31', '2026-12-31', '2027-12-31', '2028-12-31', '2029-12-31'];
  const corporateDates = [
    '2025-09-30', '2025-12-31',
    '2026-09-30', '2026-12-31',
    '2027-09-30', '2027-12-31',
    '2028-09-30', '2028-12-31',
    '2029-09-30', '2030-03-31', '2030-12-31',
  ];

  const mapped = mapProjectTpToCorporateIndex(projectDates, 4, corporateDates);

  assert.equal(mapped.tpDate, '2029-12-31');
  assert.equal(mapped.corporateIndex, 9);
  assert.equal(mapped.matchMode, 'next_ge');
});

test('mapProjectTpToCorporateIndex returns missing when tp is out of range', () => {
  const mapped = mapProjectTpToCorporateIndex(['2025-12-31'], 3, ['2025-12-31']);

  assert.equal(mapped.tpDate, null);
  assert.equal(mapped.corporateIndex, null);
  assert.equal(mapped.matchMode, 'missing');
});

test('corporate modeled valuation markers map production start to corporate axis by date and slice FCF tail from mapped index', () => {
  const corporatePeriodEndDatesUtc = [
    '2025-09-30',
    '2025-12-31',
    '2026-09-30',
    '2026-12-31',
    '2027-09-30',
    '2027-12-31',
    '2028-09-30',
    '2028-12-31',
    '2029-09-30',
    '2029-12-31',
  ];
  const masterN = corporatePeriodEndDatesUtc.length - 1;
  const fcfUSDTotal = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  const timeline = buildCorporateModeledValuationTimeline({
    projects: [
      {
        productionStartPeriod: 4,
        periodEndDatesUtc: ['2025-12-31', '2026-12-31', '2027-12-31', '2028-12-31', '2029-12-31'],
      },
    ],
    corporatePeriodEndDatesUtc,
    fcfUSD_total: fcfUSDTotal,
    masterN,
    discountRate: 0.1,
    shares_post_financing: 100,
    fx_USD_to_TargetCurrency: 1,
    npvToday_USD: 1000,
    includeDebugSanity: true,
  });

  assert.equal(timeline.markers.length, 1);
  const marker = timeline.markers[0];

  assert.equal(marker.tp, 4);
  assert.equal(marker.corporateTpIndexUsed, 9);
  assert.equal(marker.yearLabelUsed, '2029-12-31');
  assert.equal(marker.sanity?.matchMode, 'exact');
  assert.equal(marker.sanity?.tpDate, '2029-12-31');
  assert.equal(marker.sanity?.corporateDateUsed, '2029-12-31');
  assert.equal(marker.sanity?.yearLabelUsed, marker.sanity?.corporateDateUsed);

  const oldBehaviorTailSum = fcfUSDTotal.slice(4, masterN + 1).reduce((sum, value) => sum + value, 0);
  const newBehaviorTailSum = fcfUSDTotal.slice(9, masterN + 1).reduce((sum, value) => sum + value, 0);
  assert.notEqual(oldBehaviorTailSum, newBehaviorTailSum);
  assert.equal(marker.fcfTailSumUSD, newBehaviorTailSum);
});
