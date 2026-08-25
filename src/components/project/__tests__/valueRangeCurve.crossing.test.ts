import test from 'node:test';
import assert from 'node:assert/strict';
import { buildValueRangeChartRow } from '../valueRangeCurve.ts';
import { buildValueRangeChartOptions, VALUE_RANGE_CHART_COLORS } from '../valueRangeChartOptions.ts';

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

test('peak markers are distinct stars while DCF/NAV colors remain identifiable', () => {
  const options = buildValueRangeChartOptions({
    ticks: [],
    yearMin: 2026,
    yearMax: 2040,
    valueWindow: { min: 0, max: 30 },
  });
  const series = options.series as Record<number, Record<string, unknown>>;

  assert.equal(series[9].pointShape, 'star');
  assert.equal(series[10].pointShape, 'star');
  assert.equal(series[9].color, VALUE_RANGE_CHART_COLORS.nav);
  assert.equal(series[10].color, VALUE_RANGE_CHART_COLORS.dcf);
});
