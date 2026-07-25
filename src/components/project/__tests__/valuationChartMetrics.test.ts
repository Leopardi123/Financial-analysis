import assert from 'node:assert/strict';
import test from 'node:test';
import { buildValuationChartModel } from '../valuationChartMetrics.ts';

test('chart model is categorical, direct from List 2, and keeps economic series stable', () => {
  const keys = ['NPV_perShare','NAV_perShare','NPV_prodStart_perShare','NAV_prodStart_perShare','DCF_perShare','DCF_Target_discounted_perShare','CF_LOM_Target_perShare'];
  const metrics = Object.fromEntries(keys.map((key, index) => [key, { value: 3.2 + index * .1 }]));
  const chart = buildValuationChartModel(metrics);
  assert.equal(chart.points.length, 7);
  for (const point of chart.points) assert.equal(point.value, metrics[point.metric].value);
  assert.deepEqual([...new Set(chart.points.map((point) => point.x))], [82, 250]);
  for (const series of chart.series.filter((item) => item.points.length === 2)) assert.deepEqual(series.points.map((point) => point.stage), ['now', 'production_start']);
  for (const stage of ['now','production_start']) { const labels = chart.points.filter((point) => point.stage === stage).sort((a,b)=>a.labelY-b.labelY); for(let i=1;i<labels.length;i++) assert.ok(labels[i].labelY-labels[i-1].labelY>=13); }
  const byValue = [...chart.points].sort((a,b)=>a.value-b.value); for(let i=1;i<byValue.length;i++) assert.ok(byValue[i].y < byValue[i-1].y);
});
