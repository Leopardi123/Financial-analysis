import test from 'node:test';
import assert from 'node:assert/strict';
import { buildValueRangeChartRow } from '../valueRangeCurve.ts';
import { buildValueRangeChartOptions, VALUE_RANGE_CHART_COLORS } from '../valueRangeChartOptions.ts';
import { buildValuationTimeline } from '../../../lib/valuation/canonicalValuationTimeline.ts';
import { withCanonicalViewMetrics } from '../../../lib/projectView/canonicalViewMetrics.ts';
import type { ProjectViewMetrics } from '../../../lib/projectView/computeProjectPreRevenueView.ts';

test('stacked range geometry stays positive when NAV is above DCF', () => {
  const row = buildValueRangeChartRow({
    year: 2040,
    low: 20,
    high: 8,
    currentPrice: null,
    annotateCurrent: false,
    annotateProductionStart: false,
    format: (value) => String(value),
  });

  assert.equal(row[1], 8, 'geometric base is the lower rendered value');
  assert.equal(row[2], 12, 'stacked band is always positive');
  assert.equal(row[3], 20, 'economic Low boundary remains NAV');
  assert.equal(row[4], 8, 'economic High boundary remains DCF');
});

test('DCF and NAV are peer boundary lines while the spread band owns the green color', () => {
  const options = buildValueRangeChartOptions({
    ticks: [],
    yearMin: 2026,
    yearMax: 2040,
    valueWindow: { min: 0, max: 30 },
  });
  const series = options.series as Record<number, Record<string, unknown>>;

  assert.equal(series[1].color, VALUE_RANGE_CHART_COLORS.rangeBand);
  assert.equal(series[2].color, VALUE_RANGE_CHART_COLORS.boundary);
  assert.equal(series[3].color, VALUE_RANGE_CHART_COLORS.boundary);
  assert.equal(series[2].lineWidth, series[3].lineWidth);
});

test('legend focus emphasizes only the selected DCF or NAV boundary without changing economics', () => {
  const navFocus = buildValueRangeChartOptions({
    ticks: [], yearMin: 2026, yearMax: 2040, valueWindow: { min: 0, max: 30 }, focusSeries: 'nav',
  }).series as Record<number, Record<string, unknown>>;
  const dcfFocus = buildValueRangeChartOptions({
    ticks: [], yearMin: 2026, yearMax: 2040, valueWindow: { min: 0, max: 30 }, focusSeries: 'dcf',
  }).series as Record<number, Record<string, unknown>>;

  assert.ok((navFocus[2].lineWidth as number) > (navFocus[3].lineWidth as number));
  assert.ok((dcfFocus[3].lineWidth as number) > (dcfFocus[2].lineWidth as number));
  assert.equal(navFocus[2].color, navFocus[3].color);
  assert.equal(dcfFocus[2].color, dcfFocus[3].color);
});

test('peak markers remain peer stars and follow legend focus emphasis', () => {
  const neutral = buildValueRangeChartOptions({
    ticks: [], yearMin: 2026, yearMax: 2040, valueWindow: { min: 0, max: 30 },
  }).series as Record<number, Record<string, unknown>>;
  const navFocus = buildValueRangeChartOptions({
    ticks: [], yearMin: 2026, yearMax: 2040, valueWindow: { min: 0, max: 30 }, focusSeries: 'nav',
  }).series as Record<number, Record<string, unknown>>;

  assert.equal(neutral[9].pointShape, 'star');
  assert.equal(neutral[10].pointShape, 'star');
  assert.equal(neutral[9].color, VALUE_RANGE_CHART_COLORS.boundary);
  assert.equal(neutral[10].color, VALUE_RANGE_CHART_COLORS.boundary);
  assert.equal(neutral[9].pointSize, neutral[10].pointSize);
  assert.ok((navFocus[9].pointSize as number) > (navFocus[10].pointSize as number));
});

function minimalView(): ProjectViewMetrics {
  return {
    marketBox: {},
    list2: {},
  } as unknown as ProjectViewMetrics;
}

test('Corporate NAV start scalar yields to the existing per-milestone NAV renderer while Project keeps its scalar', () => {
  const common = {
    fcfUSD: [0, 110],
    yearsByPeriod: [2026, 2027],
    discountRate: 0.1,
    fxUSDToTarget: 1,
    todayPeriod: 0,
    projectStartPeriod: 0,
    productionStartPeriod: 1,
    commercialProductionPeriod: 1,
    valuationMilestonePeriod: 1,
    cashTarget: 10,
    debtTarget: 0,
    sharesCurrent: 100,
    sharesPf: 100,
  };

  const corporate = withCanonicalViewMetrics(minimalView(), buildValuationTimeline({ scope: 'corporate', ...common }));
  const project = withCanonicalViewMetrics(minimalView(), buildValuationTimeline({ scope: 'project', ...common }));

  assert.equal(corporate.list2.NAV_prodStart.value, null);
  assert.equal(corporate.list2.NAV_prodStart_perShare.value, null);
  assert.equal(project.list2.NAV_prodStart.value, 120);
  assert.equal(project.list2.NAV_prodStart_perShare.value, 1.2);
});
