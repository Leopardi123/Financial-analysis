import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveValuationChartMetrics } from '../valuationChartMetrics.ts';

test('chart points are direct values from the same List 2 metrics object as the table', () => {
  const metrics = Object.fromEntries(['NPV_perShare','NAV_perShare','NPV_prodStart_perShare','NAV_prodStart_perShare','DCF_perShare','DCF_Target_discounted_perShare','CF_LOM_Target_perShare'].map((key, index) => [key, { value: index + 1 }]));
  const chart = resolveValuationChartMetrics(metrics);
  for (const [key, graphValue] of Object.entries(chart.parity)) assert.equal(graphValue, metrics[key].value);
  assert.deepEqual([chart.npvLow, chart.npvHigh, chart.tpLow, chart.tpHigh], [1, 6, 4, 5]);
});
