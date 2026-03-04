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
    capexUSD_total: [100, 100, 100, 100, 0, 0, 0, 0, 0, 0],
    masterN,
    shares_post_financing: 100,
    lista2MetricsByTp: {
      4: {
        NAV_prodStart_TargetCurrency: -3.934778424225897,
        NAV_prodStart_perShare_TargetCurrency: -0.03934778424225897,
        DCF_prodStart_exCapex_TargetCurrency: 346.0652215757741,
        DCF_prodStart_exCapex_perShare_TargetCurrency: 3.460652215757741,
      },
    },
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
  assert.equal(marker.debug?.sharesDenominatorType, 'shares_post_financing');
  assert.equal(marker.debug?.sharesDenominatorUsed, 100);
  assert.equal(marker.debug?.value_low_total_TargetCurrency, -3.934778424225897);
  assert.equal(marker.debug?.value_high_total_TargetCurrency, 346.0652215757741);
  assert.equal(marker.debug?.lista2_NAV_prodStart_TargetCurrency_used, -3.934778424225897);
  assert.equal(marker.debug?.lista2_DCF_prodStart_exCapex_TargetCurrency_used, 346.0652215757741);

  const expectedTailSum = fcfUSDTotal.slice(4, masterN + 1).reduce((sum, value) => sum + value, 0);
  assert.equal(marker.fcfTailSumUSD, expectedTailSum);
  assert.ok(Math.abs((marker.value_low ?? 0) - (-0.03934778424225897)) < 1e-12);
  assert.equal(marker.value_high, 3.460652215757741);
});


test('corporate modeled valuation marker totals are sourced directly from lista2 metrics with no time conversion', () => {
  const timeline = buildCorporateModeledValuationTimeline({
    projects: [{ productionStartPeriod: 4 }],
    yearsByPeriod: [2025, 2026, 2027, 2028, 2029, 2030],
    fcfUSD_total: [10, 20, 30, 40, 50, 60],
    capexUSD_total: [0, 0, 0, 0, 0, 0],
    masterN: 5,
    shares_post_financing: 100,
    lista2MetricsByTp: {
      4: {
        NAV_prodStart_TargetCurrency: 100,
        NAV_prodStart_perShare_TargetCurrency: 1,
        DCF_prodStart_exCapex_TargetCurrency: 250,
        DCF_prodStart_exCapex_perShare_TargetCurrency: 2.5,
      },
    },
    lista2DebugByTp: {
      4: {
        NAV_prodStart_TargetCurrency: 100,
        NAV_prodStart_perShare_TargetCurrency: 1,
        DCF_prodStart_exCapex_TargetCurrency: 250,
        DCF_prodStart_exCapex_perShare_TargetCurrency: 2.5,
      },
    },
    discountRateUsed: 0.10,
  });

  const marker = timeline.markers[0];
  assert.equal(marker.debug?.value_high_total_TargetCurrency, 250);
  assert.equal(marker.debug?.value_low_total_TargetCurrency, 100);
  assert.equal(marker.debug?.lista2_DCF_prodStart_exCapex_TargetCurrency_debug, 250);
  assert.equal(marker.debug?.lista2_NAV_prodStart_TargetCurrency_debug, 100);
  assert.equal(marker.debug?.lista2_DCF_match, true);
  assert.equal(marker.debug?.lista2_NAV_match, true);
  assert.equal(marker.debugTime?.appliedTimeConversion, 'none');
  assert.equal(marker.debugTime?.powFactor_used_if_any, null);
  assert.equal(marker.debugTime?.value_total_from_any_internal_recompute_high, null);
  assert.equal(marker.debugTime?.value_total_from_any_internal_recompute_low, null);
  assert.equal(marker.debugTime?.value_total_from_list2MetricsByTp_high, 250);
  assert.equal(marker.debugTime?.value_total_from_list2MetricsByTp_low, 100);
  assert.equal(marker.debugTime?.value_total_from_list2Debug_high, 250);
  assert.equal(marker.debugTime?.value_total_from_list2Debug_low, 100);
});

test('corporate modeled valuation timeline throws in dev/test when list2 byTp and debug differ', () => {
  assert.throws(() => buildCorporateModeledValuationTimeline({
    projects: [{ productionStartPeriod: 4 }],
    yearsByPeriod: [2025, 2026, 2027, 2028, 2029, 2030],
    fcfUSD_total: [10, 20, 30, 40, 50, 60],
    capexUSD_total: [0, 0, 0, 0, 0, 0],
    masterN: 5,
    shares_post_financing: 100,
    lista2MetricsByTp: {
      4: {
        NAV_prodStart_TargetCurrency: 100,
        NAV_prodStart_perShare_TargetCurrency: 1,
        DCF_prodStart_exCapex_TargetCurrency: 250,
        DCF_prodStart_exCapex_perShare_TargetCurrency: 2.5,
      },
    },
    lista2DebugByTp: {
      4: {
        NAV_prodStart_TargetCurrency: 99,
        NAV_prodStart_perShare_TargetCurrency: 0.99,
        DCF_prodStart_exCapex_TargetCurrency: 249,
        DCF_prodStart_exCapex_perShare_TargetCurrency: 2.49,
      },
    },
  }), /single source of truth violation in modeled valuation timeline/);
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
    capexUSD_total: Array.from({ length: 19 }, () => 0),
    masterN: 18,
    shares_post_financing: 100,
    lista2MetricsByTp: {
      4: {
        NAV_prodStart_TargetCurrency: 50,
        NAV_prodStart_perShare_TargetCurrency: 0.5,
        DCF_prodStart_exCapex_TargetCurrency: 150,
        DCF_prodStart_exCapex_perShare_TargetCurrency: 1.5,
      },
    },
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
    capexUSD_total: [0, 0, 0],
    masterN: 2,
    shares_post_financing: 100,
    lista2MetricsByTp: {},
  }), /outside yearsByPeriod bounds/);
});


test('corporate modeled valuation marker values become null when NAV metric is missing (no fallback)', () => {
  const warnings: string[] = [];
  const timeline = buildCorporateModeledValuationTimeline({
    projects: [{ productionStartPeriod: 2 }],
    yearsByPeriod: [2025, 2026, 2027, 2028],
    fcfUSD_total: [10, 20, 30, 40],
    capexUSD_total: [null, null, 0, 0],
    masterN: 3,
    shares_post_financing: 100,
    lista2MetricsByTp: {
      2: {
        NAV_prodStart_TargetCurrency: null,
        NAV_prodStart_perShare_TargetCurrency: null,
        DCF_prodStart_exCapex_TargetCurrency: 66.36363636363636,
        DCF_prodStart_exCapex_perShare_TargetCurrency: 0.6636363636363636,
      },
    },
    diagnosticsWarnings: warnings,
  });

  const marker = timeline.markers[0];
  assert.equal(marker?.value_low, null);
  assert.equal(marker?.value_high, null);
  assert.match(marker?.nullReasonIfAny ?? '', /missing/i);
  assert.equal(marker?.debug?.value_low_total_TargetCurrency, null);
  assert.equal(marker?.debug?.value_high_total_TargetCurrency, 66.36363636363636);
  assert.ok(warnings.some((warning) => /missing nav/i.test(warning)));
});

test('corporate modeled valuation marker values become null when DCF metric is missing (no fallback)', () => {
  const timeline = buildCorporateModeledValuationTimeline({
    projects: [{ productionStartPeriod: 2 }],
    yearsByPeriod: [2025, 2026, 2027, 2028],
    fcfUSD_total: [10, 20, 30, 40],
    capexUSD_total: [null, null, 0, 0],
    masterN: 3,
    shares_post_financing: 100,
    lista2MetricsByTp: {
      2: {
        NAV_prodStart_TargetCurrency: 66.36363636363636,
        NAV_prodStart_perShare_TargetCurrency: 0.6636363636363636,
        DCF_prodStart_exCapex_TargetCurrency: null,
        DCF_prodStart_exCapex_perShare_TargetCurrency: null,
      },
    },
  });

  const marker = timeline.markers[0];
  assert.equal(marker?.value_low, null);
  assert.equal(marker?.value_high, null);
  assert.match(marker?.nullReasonIfAny ?? '', /missing/i);
  assert.equal(marker?.debug?.value_low_total_TargetCurrency, 66.36363636363636);
  assert.equal(marker?.debug?.value_high_total_TargetCurrency, null);
});

test('corporate modeled valuation marker uses fd effective shares denominator over fallback shares_post_financing', () => {
  const timeline = buildCorporateModeledValuationTimeline({
    projects: [{ productionStartPeriod: 2 }],
    yearsByPeriod: [2025, 2026, 2027, 2028],
    fcfUSD_total: [0, 0, 0, 0],
    capexUSD_total: [0, 0, 0, 0],
    masterN: 3,
    shares_post_financing: 507023430,
    lista2MetricsByTp: {
      2: {
        NAV_prodStart_TargetCurrency: 0,
        NAV_prodStart_perShare_TargetCurrency: 0,
        DCF_prodStart_exCapex_TargetCurrency: 0,
        DCF_prodStart_exCapex_perShare_TargetCurrency: 0,
      },
    },
  });

  const marker = timeline.markers[0];
  assert.equal(marker.debug?.sharesDenominatorUsed, 507023430);
  assert.equal(marker.debug?.sharesDenominatorType, 'shares_post_financing');
});

test('corporate modeled valuation marker nulls values when shares denominator is invalid', () => {
  const timeline = buildCorporateModeledValuationTimeline({
    projects: [{ productionStartPeriod: 1 }],
    yearsByPeriod: [2025, 2026, 2027],
    fcfUSD_total: [10, 20, 30],
    capexUSD_total: [10, 0, 0],
    masterN: 2,
    shares_post_financing: 0,
    lista2MetricsByTp: {
      1: {
        NAV_prodStart_TargetCurrency: 10,
        NAV_prodStart_perShare_TargetCurrency: null,
        DCF_prodStart_exCapex_TargetCurrency: 20,
        DCF_prodStart_exCapex_perShare_TargetCurrency: null,
      },
    },
  });

  const marker = timeline.markers[0];
  assert.equal(marker.value_low, null);
  assert.equal(marker.value_high, null);
  assert.equal(marker.nullReasonIfAny, 'Invalid shares_post_financing denominator');
});
