import assert from 'node:assert/strict';
import { buildValuationTimeline, selectTimelineChartSeries, selectTimelineDebugRows, selectTimelineMarker, selectTimelineNodes } from '../canonicalValuationTimeline.ts';

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
console.log('Canonical valuation timeline T1-T10 passed');
