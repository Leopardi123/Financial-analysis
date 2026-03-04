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

test('corporate modeled valuation markers use rolling timeline labels and tp index directly', () => {
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
      },
    ],
    yearsByPeriod: [2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034],
    fcfUSD_total: fcfUSDTotal,
    masterN,
    discountRate: 0.1,
    shares_post_financing: 100,
    fx_USD_to_TargetCurrency: 1,
    npvToday_USD: 1000,
    netCash_t0_post_TargetCurrency: 50,
    includeDebugSanity: true,
  });

  assert.equal(timeline.markers.length, 1);
  const marker = timeline.markers[0];

  assert.equal(marker.tp, 4);
  assert.equal(marker.corporateTpIndexUsed, 4);
  assert.equal(marker.yearLabelUsed, '2029');
  assert.equal(marker.sanity?.matchMode, 'exact');
  assert.equal(marker.sanity?.tpDate, null);
  assert.equal(marker.sanity?.corporateDateUsed, null);

  const expectedTailSum = fcfUSDTotal.slice(4, masterN + 1).reduce((sum, value) => sum + value, 0);
  assert.equal(marker.fcfTailSumUSD, expectedTailSum);
  assert.equal(marker.value_low, 3.960652215757741);
  assert.equal(marker.value_high, 3.460652215757741);
});


test('corporate modeled valuation marker year labels come directly from yearsByPeriod[tp]', () => {
  const yearsByPeriod = [
    2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033,
    2034, 2035, 2036, 2037, 2038, 2039, 2040, 2041, 2042, 2043,
  ];
  const timeline = buildCorporateModeledValuationTimeline({
    projects: [{ productionStartPeriod: 4 }],
    yearsByPeriod,
    fcfUSD_total: Array.from({ length: 19 }, () => 1),
    masterN: 18,
    discountRate: 0.1,
    shares_post_financing: 100,
    fx_USD_to_TargetCurrency: 1,
    npvToday_USD: 1000,
    netCash_t0_post_TargetCurrency: 50,
  });

  assert.equal(yearsByPeriod[0], 2025);
  assert.equal(yearsByPeriod[4], 2029);
  assert.equal(timeline.markers[0]?.yearLabelUsed, '2029');
});


test('corporate modeled valuation timeline throws when tp is outside yearsByPeriod bounds', () => {
  assert.throws(() => buildCorporateModeledValuationTimeline({
    projects: [{ productionStartPeriod: 4 }],
    yearsByPeriod: [2025, 2026, 2027],
    fcfUSD_total: [1, 1, 1],
    masterN: 2,
    discountRate: 0.1,
    shares_post_financing: 100,
    fx_USD_to_TargetCurrency: 1,
    npvToday_USD: 1000,
    netCash_t0_post_TargetCurrency: 50,
  }), /outside yearsByPeriod bounds/);
});


test('corporate modeled valuation marker low becomes null and emits diagnostics warning when NAV metric is missing', () => {
  const warnings: string[] = [];
  const timeline = buildCorporateModeledValuationTimeline({
    projects: [{ productionStartPeriod: 2 }],
    yearsByPeriod: [2025, 2026, 2027, 2028],
    fcfUSD_total: [10, 20, 30, 40],
    masterN: 3,
    discountRate: 0.1,
    shares_post_financing: 100,
    fx_USD_to_TargetCurrency: 1,
    npvToday_USD: 100,
    netCash_t0_post_TargetCurrency: null,
    diagnosticsWarnings: warnings,
  });

  assert.equal(timeline.markers[0]?.value_low, null);
  assert.equal(timeline.markers[0]?.value_high, 0.6636363636363636);
  assert.ok(warnings.includes('Missing NAV_prodStart_perShare_TargetCurrency for corporate modeled marker'));
});
