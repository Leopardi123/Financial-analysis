import assert from 'node:assert/strict';
import { buildValuationTimeline, selectValuationChart } from '../../../lib/valuation/canonicalValuationTimeline.ts';
import { buildValuationChartRenderModel, CHART_ORDINARY_HIGH_COLUMN, CHART_TODAY_HIGH_COORDINATE_COLUMN, CHART_TODAY_HIGH_LABEL_COLUMN } from '../valuationChartPresentation.ts';

const timeline = buildValuationTimeline({
  scope: 'corporate', fcfUSD: [-10, -5, 40, 30, 20, 1], capexUSD: [10, 5, 0, 0, 0, 0],
  yearsByPeriod: [2026, 2028, 2031, 2035, 2040, 2050], discountRate: 0.1, fxUSDToTarget: 1,
  productionStartPeriod: 4, cashTarget: 1, debtTarget: 0, sharesCurrent: 10, sharesPf: 10,
});
const startPeriods = [4, 2];
const tableSelection = selectValuationChart(timeline, startPeriods);
const render = buildValuationChartRenderModel({ timeline, scope: 'corporate', startPeriods, priceToday: 1, format: String });
const tableCorporateDcfPresentPerShare = tableSelection.today.high;

// A-D: shared earliest Corporate milestone survives selector -> row -> render coordinate/label.
assert.equal(tableSelection.selectedStartPeriod, 2);
assert.equal(render.trace.selectedStartPeriod, tableSelection.selectedStartPeriod);
assert.equal(render.trace.selectorTodayHigh, tableCorporateDcfPresentPerShare);
assert.equal(render.trace.todayRowHigh, tableCorporateDcfPresentPerShare);
assert.equal(render.trace.renderedTodayHighCoordinate, tableCorporateDcfPresentPerShare);
assert.equal(render.trace.renderedTodayHighLabel, `      ${String(tableCorporateDcfPresentPerShare)}`);
assert.equal(render.rows[0][CHART_ORDINARY_HIGH_COLUMN], tableCorporateDcfPresentPerShare);
assert.equal(render.rows[0][CHART_TODAY_HIGH_COORDINATE_COLUMN], tableCorporateDcfPresentPerShare);
assert.equal(render.rows[0][CHART_TODAY_HIGH_LABEL_COLUMN], `      ${String(tableCorporateDcfPresentPerShare)}`);

// E/L: Project range uses peak calendar years, not peak array indices.
const project = buildValuationTimeline({ scope: 'project', fcfUSD: [-10, -5, 40, 30, 20, 1], capexUSD: [10, 5, 0, 0, 0, 0], yearsByPeriod: [2026, 2028, 2031, 2035, 2040, 2050], discountRate: 0.1, fxUSDToTarget: 1, productionStartPeriod: 2, cashTarget: 1, debtTarget: 0, sharesCurrent: 10, sharesPf: 10 });
project.periods[1].navPerShareTarget = 100;
project.periods[2].dcfPerShareTarget = 200;
const projectRender = buildValuationChartRenderModel({ timeline: project, scope: 'project', startPeriods: [2], priceToday: null, format: String });
assert.equal(projectRender.displayRange.chartEndYear, 2034);
assert.deepEqual(projectRender.displayRange.points.map((point) => point.calendarYear), [2026, 2028, 2031]);

// F-H/K/L: full irregular Corporate axis determines peaks before display clipping.
timeline.periods[4].dcfPerShareTarget = 300;
timeline.periods[3].navPerShareTarget = 250;
const fullLength = timeline.periods.length;
const corporateRender = buildValuationChartRenderModel({ timeline, scope: 'corporate', startPeriods, priceToday: null, format: String });
assert.equal(corporateRender.selection.peakHigh?.calendarYear, 2040);
assert.equal(corporateRender.selection.peakLow?.calendarYear, 2035);
assert.equal(corporateRender.displayRange.latestProjectStartYear, 2040);
assert.equal(corporateRender.displayRange.chartEndYear, 2043);
assert.ok(corporateRender.displayRange.points.some((point) => point.calendarYear === 2040));
assert.ok(!corporateRender.displayRange.points.some((point) => point.calendarYear === 2050));
assert.equal(timeline.periods.length, fullLength, 'I full timeline remains unchanged');
assert.equal(tableSelection.today.high, tableCorporateDcfPresentPerShare, 'J table is unaffected by display clipping');
console.log('Valuation chart presentation A-L passed');
