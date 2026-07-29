import assert from 'node:assert/strict';
import { buildValuationTimeline, selectTimelineChartSeries, selectTimelineDebugRows, selectTimelineMarker, selectTimelineNodes, selectValuationChart } from '../canonicalValuationTimeline.ts';

const input = { fcfUSD: [-100, -50, 80, 90, 20], capexUSD: [100, 50, 0, 0, 0], yearsByPeriod: [2026, 2027, 2028, 2029, 2030], discountRate: 0.1, fxUSDToTarget: 2, productionStartPeriod: 2, cashTarget: 40, debtTarget: 10, sharesCurrent: 10, sharesPf: 20 };
const project = buildValuationTimeline({ scope: 'project', ...input });
const nodes = selectTimelineNodes(project);
const chart = selectTimelineChartSeries(project);

// T1/T2: table adapters are exact node selectors.
assert.strictEqual(nodes.today, project.periods[0]);
assert.strictEqual(nodes.productionStart, project.periods[2]);
assert.equal(nodes.today.navPerShareTarget, project.periods[0].navPerShareTarget);
assert.equal(nodes.productionStart?.dcfPerShareTarget, project.periods[2].dcfPerShareTarget);
// T3/T4: chart and marker selectors retain canonical values/object identity.
for (const point of chart) {
  assert.equal(point.high, project.periods[point.period].dcfPerShareTarget);
  assert.equal(point.low, project.periods[point.period].navPerShareTarget);
}
assert.strictEqual(selectTimelineMarker(project, 2), nodes.productionStart);

// T6: one-project corporate without adjustments reconciles period for period.
const corporate = buildValuationTimeline({ scope: 'corporate', ...input });
for (let t = 0; t < project.periods.length; t += 1) {
  for (const key of ['dcfAtPeriodUSD', 'npvAtPeriodTarget', 'navAtPeriodTarget', 'dcfPerShareTarget', 'navPerShareTarget'] as const) {
    assert.equal(corporate.periods[t][key], project.periods[t][key], `one-project t=${t} ${key}`);
  }
}
// T7: present value reconciles through the stored canonical factor.
for (const state of project.periods) if (state.dcfAtPeriodUSD !== null && state.discountFactorFromToday !== null) assert.ok(Math.abs((state.dcfPresentValueTodayUSD ?? 0) - state.dcfAtPeriodUSD * state.discountFactorFromToday) < 1e-12);
// T8/T9: production index and calendar mapping are unchanged.
assert.equal(project.productionStartPeriod, input.productionStartPeriod);
assert.equal(nodes.productionStart?.calendarYear, input.yearsByPeriod[input.productionStartPeriod]);
assert.deepEqual(corporate.periods.map((row) => row.calendarYear), project.periods.map((row) => row.calendarYear));
// T10: High remains DCF and Low remains NAV; identity is not min/max ordering.
for (const point of chart) {
  assert.equal(point.high, project.periods[point.period].dcfPerShareTarget);
  assert.equal(point.low, project.periods[point.period].navPerShareTarget);
}
// T5/debug: debug/export returns the canonical objects and performs no valuation.
assert.strictEqual(selectTimelineDebugRows(project), project.periods);

// A-L: chart nodes, independent peaks and pre-rounding identity.
const projectChart = selectValuationChart(project);
const corporateChart = selectValuationChart(corporate);
assert.equal(projectChart.today.low, nodes.today.navPerShareTarget, 'A Project today Low = table NAV/share');
assert.equal(projectChart.today.high, nodes.productionStart?.dcfPresentValueTodayPerShareTarget, 'B Project today High = table start DCF PV/share');
assert.equal(corporateChart.today.low, corporate.periods[0].navPerShareTarget, 'C Corporate today Low = table NAV/share');
assert.equal(corporateChart.today.high, corporate.periods[2].dcfPresentValueTodayPerShareTarget, 'D Corporate today High = start DCF PV/share');
assert.equal(projectChart.starts[0].low, nodes.productionStart?.navPerShareTarget, 'E Project start Low');
assert.equal(projectChart.starts[0].high, nodes.productionStart?.dcfPerShareTarget, 'F Project start High');
assert.equal(corporateChart.starts[0].low, corporate.periods[2].navPerShareTarget, 'G Corporate start Low');
assert.equal(corporateChart.starts[0].high, corporate.periods[2].dcfPerShareTarget, 'H Corporate start High');
assert.ok(projectChart.peakLow && projectChart.peakHigh && corporateChart.peakLow && corporateChart.peakHigh, 'I both modes expose both peaks');
assert.equal(projectChart.peakLow?.low, Math.max(...projectChart.points.map((point) => point.low).filter((value): value is number => value !== null)), 'J Low peak is own-series maximum');
assert.equal(projectChart.peakHigh?.high, Math.max(...projectChart.points.map((point) => point.high).filter((value): value is number => value !== null)), 'J High peak is own-series maximum');
for (const point of projectChart.points) {
  assert.equal(point.low, project.periods[point.periodIndex].navPerShareTarget, 'K Low identity remains NAV');
  const expectedHigh: number | null | undefined = point.isToday ? nodes.productionStart?.dcfPresentValueTodayPerShareTarget : project.periods[point.periodIndex].dcfPerShareTarget;
  assert.equal(point.high, expectedHigh, 'K High identity remains DCF');
}
const crossing = buildValuationTimeline({ scope: 'project', ...input });
crossing.periods[1].navPerShareTarget = 100;
crossing.periods[1].dcfPerShareTarget = 2;
crossing.periods[2].navPerShareTarget = 1;
crossing.periods[2].dcfPerShareTarget = 200;
const crossingChart = selectValuationChart(crossing);
assert.equal(crossingChart.peakLow?.periodIndex, 1, 'I/J Low has its own peak marker');
assert.equal(crossingChart.peakHigh?.periodIndex, 2, 'I/J High has its own peak marker');
assert.equal(crossingChart.points[1].low, 100, 'K crossing does not rename Low');
assert.equal(crossingChart.points[1].high, 2, 'K crossing does not rename High');

// AbraSilver selector regression values are compared as raw numbers (before presentation rounding).
const abraSelectorFixture = buildValuationTimeline({ scope: 'project', ...input });
abraSelectorFixture.periods[0].npvPerShareTarget = 15.4;
abraSelectorFixture.periods[0].navPerShareTarget = 15.5;
abraSelectorFixture.periods[2].navPerShareTarget = 21.4;
abraSelectorFixture.periods[2].dcfPerShareTarget = 24.9;
abraSelectorFixture.periods[2].dcfPresentValueTodayPerShareTarget = 18.7;
const abraChart = selectValuationChart(abraSelectorFixture);
assert.equal(abraChart.today.low, 15.5, 'Abra today uses NAV/share, not NPV/share 15.4');
assert.equal(abraChart.today.high, 18.7, 'Abra today uses production-start DCF present value/share');
assert.equal(abraChart.starts[0].low, 21.4, 'Abra start Low remains NAV/share');
assert.equal(abraChart.starts[0].high, 24.9, 'Abra start High remains DCF/share');
console.log('Canonical valuation timeline T1-T10 passed');
