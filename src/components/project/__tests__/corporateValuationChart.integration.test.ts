import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runCorporateSnapshotPipeline } from '../../../lib/snapshot/runCorporateSnapshot.ts';
import { getProjectInputs } from '../../../lib/projectView/projectInputs.ts';
import { computeProjectViewMetrics } from '../../../lib/projectView/computeProjectPreRevenueView.ts';
import { buildValuationChartRenderModel } from '../valuationChartPresentation.ts';

const body = JSON.parse(await readFile('scripts/fixtures/snapshot-requests/abra_minimal.json', 'utf8'));
for (const project of body.projects) {
  project.rawJson.version = 'project_json_v2';
  project.rawJson.time.productionStartYear = body.valuationYear + project.rawJson.time.productionStartPeriod;
}
const result = await runCorporateSnapshotPipeline({ body, refresh: false });
assert.equal(result.ok, true);
if (!result.ok) throw new Error('Abra corporate snapshot failed');
const snapshot = result.snapshot as Record<string, any>;
const inputs = getProjectInputs({ snapshot });
const finiteSeries = (raw: number[] | null | undefined) => Array.isArray(raw)
  ? raw.map((value) => typeof value === 'number' && Number.isFinite(value) ? value : null)
  : [];
const timelineRows = snapshot.corporateValuationTimeSeries.rows as Array<{ period: number; year: number }>;
const view = computeProjectViewMetrics({
  meta: { projectId: 'corporate' }, targetCurrency: snapshot.targetCurrency,
  fxUSDToTarget: inputs.fx, discountRate: inputs.r, masterN: inputs.masterN,
  sharesCurrent: inputs.sharesCurrent, sharesPostFinancingInput: inputs.sharesPostFinancing,
  priceCurrentTarget: inputs.price, cashCurrentTarget: snapshot.financing.cash_for_nav_TargetCurrency ?? inputs.cash0,
  debtCurrentTarget: inputs.debt0, enterpriseAdjustmentsTarget: 0,
  fcfUSD: finiteSeries(inputs.series.fcfUSD), capexUSD: finiteSeries(inputs.series.capexUSD),
  grossRevenueUSD: finiteSeries(inputs.series.grossRevenueUSD), ebitUSD: finiteSeries(inputs.series.ebitUSD),
  payableAuEqOz: finiteSeries(inputs.series.payableAuEqOz), sustainingCostUSD: finiteSeries(inputs.series.sustainingCostUSD),
  productionStartPeriod: inputs.tp, calendarYears: timelineRows.map((row) => row.year), valuationPeriodOffset: 0,
  financing: { equityPct: 100, debtPct: 0, usePrecomputedFinancing: true },
});
const startPeriods = snapshot.corporateValuationTimeSeries.projectMarkers.flatMap((marker: { productionStartYear: number | null }) => {
  const period = timelineRows.find((row) => row.year === marker.productionStartYear)?.period;
  return Number.isInteger(period) ? [period as number] : [];
});
const render = buildValuationChartRenderModel({ timeline: view.valuationTimeline, scope: 'corporate', startPeriods, priceToday: inputs.price, format: String });
const sharesPf = view.marketBox.sharesPf.value;
assert.notEqual(sharesPf, null);
const tableRaw = snapshot.DCF_prodStart_present_TargetCurrency / (sharesPf as number);

assert.equal(render.trace.selectorTodayHigh, tableRaw);
assert.equal(render.trace.todayRowHigh, tableRaw);
assert.equal(render.trace.renderedTodayHighCoordinate, tableRaw);
assert.equal(render.trace.renderedTodayHighLabel, `      ${String(tableRaw)}`);
assert.equal(render.trace.selectedStartPeriod, startPeriods[0]);
assert.equal(render.displayRange.chartEndYear, 2031);
console.log('Abra Corporate runtime trace', JSON.stringify({
  todayPeriod: render.trace.todayPeriod, todayYear: render.trace.todayYear,
  projectStartPeriods: startPeriods, selectedStartPeriod: render.trace.selectedStartPeriod,
  dcfAtStartPerShare: render.trace.selectedStartState?.dcfPerShareTarget,
  dcfPresentAtStartPerShare: render.trace.selectedStartState?.dcfPresentValueTodayPerShareTarget,
  tableRaw, selectorTodayHigh: render.trace.selectorTodayHigh,
  todayRowHigh: render.trace.todayRowHigh, coordinate: render.trace.renderedTodayHighCoordinate,
  label: render.trace.renderedTodayHighLabel, peakLowYear: render.selection.peakLow?.calendarYear,
  peakHighYear: render.selection.peakHigh?.calendarYear, latestProjectStartYear: render.displayRange.latestProjectStartYear,
  chartEndYear: render.displayRange.chartEndYear,
}));
