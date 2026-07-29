import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runCorporateSnapshotPipeline } from '../../../lib/snapshot/runCorporateSnapshot.ts';
import { getProjectInputs } from '../../../lib/projectView/projectInputs.ts';
import { computeProjectViewMetrics } from '../../../lib/projectView/computeProjectPreRevenueView.ts';
import { buildValuationChartRenderModel } from '../valuationChartPresentation.ts';
import { buildValuationTimeline, selectCorporateProjectStartMilestones, selectTimelineChartSeries, selectValuationChart, withManualExtraShares } from '../../../lib/valuation/canonicalValuationTimeline.ts';

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
const startState = render.trace.selectedStartState!;
const preStartPoints = render.selection.points.filter((point) => point.periodIndex < (render.trace.selectedStartPeriod as number));
for (const point of preStartPoints) {
  const period = view.valuationTimeline.periods[point.periodIndex];
  const expected = point.isToday
    ? startState.dcfPresentValueTodayPerShareTarget
    : (startState.dcfPerShareTarget as number) * ((startState.discountFactorFromToday as number) / (period.discountFactorFromToday as number));
  assert.equal(point.high, expected);
  assert.notEqual(point.highSource, 'period-remaining-dcf');
}
for (let index = 0; index < preStartPoints.length; index += 1) {
  assert.ok((render.selection.points[index + 1].high as number) >= (render.selection.points[index].high as number));
}
const highSeriesTrace = render.selection.points.slice(0, (render.trace.selectedStartPeriod as number) + 1).map((point) => ({
  year: point.calendarYear,
  before: point.isToday ? point.high : view.valuationTimeline.periods[point.periodIndex].dcfPerShareTarget,
  after: point.high,
  source: point.highSource,
}));
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
  highSeriesTrace,
}));

// A-M: the one-project corporate path must be an identity transform.  Run two
// real project-labelled runtime cases whose model starts precede valuationYear;
// this is the boundary that regressed for Viscaria (2025 became 2026).
for (const projectCase of [
  { id: 'Viscaria', name: 'Viscaria Copper-Iron Project — FS+ Upside Case, full LoM', productionStartYear: 2027 },
  { id: 'AbraSilver', name: 'AbraSilver', productionStartYear: 2026 },
]) {
  const singleBody = structuredClone(body) as Record<string, any>;
  const raw = singleBody.projects[0].rawJson;
  singleBody.projects[0].projectId = projectCase.id;
  raw.meta.projectId = projectCase.id;
  raw.meta.projectName = projectCase.name;
  raw.version = 'project_json_v2';
  raw.time.productionStartYear = projectCase.productionStartYear;
  delete raw.time.periodEndDatesUtc;
  const manualExtraShares = projectCase.id === 'Viscaria' ? 250_000_000 : 0;
  if (projectCase.id === 'Viscaria') {
    singleBody.market.shares_current = 130_908_366;
    singleBody.financingPlan = { equity_fraction: 0, debt_fraction: 1, use_cash_first: false, cash_use_percent: 1 };
  }
  const singleResult = await runCorporateSnapshotPipeline({ body: singleBody, refresh: false, debug: true });
  assert.equal(singleResult.ok, true);
  if (!singleResult.ok) throw new Error(`${projectCase.name} corporate snapshot failed`);
  const singleSnapshot = singleResult.snapshot as Record<string, any>;
  const corporate = withManualExtraShares(singleSnapshot.canonicalValuationTimeline, manualExtraShares);
  const contributionFcff = corporate.periods.map((period: any) => period.projectContributions[0].fcffUSD);
  const project = buildValuationTimeline({
    scope: 'project',
    fcfUSD: contributionFcff,
    capexUSD: singleSnapshot.series.capexUSD,
    yearsByPeriod: corporate.periods.map((period: any) => period.calendarYear),
    discountRate: singleSnapshot.discountRate,
    fxUSDToTarget: singleSnapshot.fx_USD_to_TargetCurrency,
    valuationYear: singleBody.valuationYear,
    productionStartPeriod: raw.time.productionStartPeriod,
    cashTarget: corporate.periods[0].cashTarget,
    debtTarget: corporate.periods[0].debtTarget,
    sharesCurrent: corporate.periods[0].sharesCurrent,
    sharesPf: corporate.periods[0].sharesPf,
    newSharesCumulative: corporate.periods[0].newSharesCumulative,
    manualExtraShares,
  });

  assert.equal(project.periods[0].calendarYear, projectCase.productionStartYear - raw.time.productionStartPeriod); // A, K
  assert.notEqual(project.productionStartPeriod, null);
  assert.equal(project.periods[project.productionStartPeriod as number].calendarYear, projectCase.productionStartYear); // D
  assert.equal(project.periods[project.todayPeriod].calendarYear, singleBody.valuationYear); // C, J
  assert.equal(project.periods[project.todayPeriod].calendarYear, corporate.periods[corporate.todayPeriod].calendarYear); // E
  for (const historical of project.periods.slice(0, project.todayPeriod)) {
    assert.equal(historical.isHistoricalPeriod, true); // B
    assert.ok(historical.discountExponentFromToday < 0);
  }
  assert.equal(project.periods[project.todayPeriod].discountExponentFromToday, 0); // C
  for (let periodIndex = 0; periodIndex < project.periods.length; periodIndex += 1) {
    const projectPeriod = project.periods[periodIndex];
    const corporatePeriod = corporate.periods[periodIndex];
    assert.equal(projectPeriod.fcffUSD, corporatePeriod.projectContributions![0].fcffUSD); // A contribution
    assert.equal(projectPeriod.fcffUSD, corporatePeriod.fcffUSD); // A aggregate
    for (const key of [
      'calendarYear', 'discountExponentFromToday', 'discountFactorFromToday',
      'remainingUndiscountedFcffUSD', 'dcfAtPeriodUSD', 'dcfPresentValueTodayUSD',
      'npvAtPeriodUSD', 'dcfAtPeriodTarget', 'dcfPresentValueTodayTarget',
      'npvAtPeriodTarget', 'navAtPeriodTarget', 'sharesCurrent', 'sharesPf',
      'dcfPerShareTarget', 'dcfPresentValueTodayPerShareTarget',
      'npvPerShareTarget', 'navPerShareTarget',
    ] as const) assert.equal(projectPeriod[key], corporatePeriod[key], `${projectCase.id} period=${periodIndex} key=${key}`); // E-K
  }
  assert.deepEqual(selectTimelineChartSeries(project), selectTimelineChartSeries(corporate)); // L
  if (projectCase.id === 'Viscaria') {
    const canonicalShares = 380_908_366;
    assert.equal(corporate.periods[corporate.todayPeriod].sharesPf, canonicalShares); // A, B, L
    assert.equal(corporate.periods[corporate.todayPeriod].sharesPfBeforeManualExtra, 130_908_366);
    assert.equal(corporate.periods[corporate.todayPeriod].canonicalSharesForPerShare, canonicalShares);
    for (const period of corporate.periods) {
      assert.equal(period.dcfPerShareTarget, period.dcfAtPeriodTarget! / canonicalShares);
      assert.equal(period.npvPerShareTarget, period.npvAtPeriodTarget! / canonicalShares);
      assert.equal(period.navPerShareTarget, period.navAtPeriodTarget! / canonicalShares);
    }
    const selection = selectValuationChart(corporate, [corporate.productionStartPeriod as number]);
    const start = corporate.periods[corporate.productionStartPeriod as number];
    assert.equal(selection.today.high, start.dcfPresentValueTodayTarget! / canonicalShares); // C-H, K
    assert.ok((start.dcfPresentValueTodayTarget as number) < (start.dcfAtPeriodTarget as number));
    const milestone = selectCorporateProjectStartMilestones(corporate, [{
      projectId: projectCase.id, productionStartYear: projectCase.productionStartYear,
    }])[0];
    assert.equal(milestone.dcfPerShare, start.dcfAtPeriodTarget! / canonicalShares); // C-E
    assert.equal(milestone.navPerShare, start.navAtPeriodTarget! / canonicalShares);
    const renderModel = buildValuationChartRenderModel({
      timeline: corporate, scope: 'corporate', startPeriods: [start.periodIndex], priceToday: 1.25, format: String,
    });
    assert.equal(renderModel.trace.todayYear, singleBody.valuationYear);
    assert.equal(renderModel.trace.todayRowHigh, start.dcfPresentValueTodayTarget! / canonicalShares); // K
    const waterfall = singleSnapshot.financing.corporate_cash_waterfall;
    assert.equal(waterfall.totalInitialCashUsed, 0); // M
    assert.equal(singleSnapshot.financing.closing_corporate_cash_TargetCurrency, waterfall.rows.at(-1).closingCash * singleSnapshot.fx_USD_to_TargetCurrency); // O
    assert.notEqual(singleSnapshot.financing.cash_for_nav_TargetCurrency, singleSnapshot.financing.closing_corporate_cash_TargetCurrency);

    const cashFirstBody = structuredClone(singleBody);
    cashFirstBody.financingPlan.use_cash_first = true;
    const cashFirstResult = await runCorporateSnapshotPipeline({ body: cashFirstBody, refresh: false });
    assert.equal(cashFirstResult.ok, true);
    if (!cashFirstResult.ok) throw new Error('Viscaria cash-first snapshot failed');
    assert.ok(cashFirstResult.snapshot.financing.cash_used_for_build_TargetCurrency! > 0); // N
    assert.ok(cashFirstResult.snapshot.financing.remaining_funding_need_TargetCurrency! < singleSnapshot.financing.remaining_funding_need_TargetCurrency!);
  }
  console.log('Single-project Project/Corporate reconciliation', JSON.stringify({
    project: projectCase.name,
    input: { years: project.periods.map((row) => row.calendarYear), fcffUSD: contributionFcff, todayPeriod: project.todayPeriod, productionStartPeriod: project.productionStartPeriod },
    rows: project.periods.map((row, periodIndex) => ({ periodIndex, calendarYear: row.calendarYear, fcffUSD: row.fcffUSD, discountExponentFromToday: row.discountExponentFromToday, discountFactorFromToday: row.discountFactorFromToday, remainingDCF: row.dcfAtPeriodUSD, npv: row.npvAtPeriodTarget, nav: row.navAtPeriodTarget, dcf: row.dcfAtPeriodTarget, shares: row.sharesPf, cash: row.cashTarget, debt: row.debtTarget, netCash: row.netCashTarget, npvPerShare: row.npvPerShareTarget, navPerShare: row.navPerShareTarget, dcfPerShare: row.dcfPerShareTarget })),
  })); // M
}

// A-O regression: two projects share local t=2 but start in distinct calendar years.
const multiBody = JSON.parse(await readFile('scripts/fixtures/snapshot-requests/abra_minimal.json', 'utf8')) as Record<string, any>;
const projectA = multiBody.projects[0];
projectA.rawJson.version = 'project_json_v2';
projectA.projectId = 'A';
projectA.rawJson.meta.projectId = 'A';
projectA.rawJson.meta.projectName = 'Project A';
projectA.rawJson.time.productionStartPeriod = 2;
projectA.rawJson.time.productionStartYear = 2029;
const projectB = structuredClone(projectA);
projectB.projectId = 'B';
projectB.rawJson.meta.projectId = 'B';
projectB.rawJson.meta.projectName = 'Project B';
projectB.rawJson.time.productionStartYear = 2032;
multiBody.projects = [projectA, projectB];
const multiResult = await runCorporateSnapshotPipeline({ body: multiBody, refresh: false, debug: true });
assert.equal(multiResult.ok, true);
if (!multiResult.ok) throw new Error('Multi-project corporate snapshot failed');
const multiSnapshot = multiResult.snapshot as Record<string, any>;
const canonical = multiSnapshot.canonicalValuationTimeline;
const milestones = multiSnapshot.projectStartMilestones as Array<Record<string, any>>;
const multiRows = multiSnapshot.corporateValuationTimeSeries.rows as Array<Record<string, any>>;
assert.deepEqual(canonical.periods.map((period: any) => period.calendarYear), Array.from({ length: 14 }, (_, index) => 2026 + index)); // A, B
assert.equal(canonical.periods.some((period: any) => [-1, 2, 5].includes(period.calendarYear)), false); // B, N
assert.deepEqual(milestones.map((milestone) => milestone.calendarYear), [2029, 2032]); // C, M
assert.deepEqual(milestones.map((milestone) => milestone.corporatePeriodIndex), [3, 6]); // F, G
assert.equal(projectA.rawJson.time.productionStartYear, 2029);
assert.equal(projectB.rawJson.time.productionStartYear, 2032);
for (const milestone of milestones) {
  const row = multiRows[milestone.corporatePeriodIndex];
  assert.equal(row.year, milestone.calendarYear); // D, E, F, O
  assert.equal(canonical.periods[milestone.corporatePeriodIndex].calendarYear, milestone.calendarYear);
}
const year2029 = canonical.periods.find((period: any) => period.calendarYear === 2029);
const year2032 = canonical.periods.find((period: any) => period.calendarYear === 2032);
assert.notEqual(year2029.projectContributions.find((item: any) => item.projectId === 'A').fcffUSD, 0); // H
assert.equal(year2029.projectContributions.find((item: any) => item.projectId === 'B').fcffUSD, 0);
assert.notEqual(year2032.projectContributions.find((item: any) => item.projectId === 'B').fcffUSD, 0);
for (const period of canonical.periods) assert.equal(period.discountExponentFromToday, period.calendarYear - 2026); // I
const multiInputs = getProjectInputs({ snapshot: multiSnapshot });
const multiRender = buildValuationChartRenderModel({ timeline: canonical, scope: 'corporate', startPeriods: milestones.map((item) => item.corporatePeriodIndex), priceToday: multiInputs.price, format: String });
assert.equal(multiRender.displayRange.latestProjectStartYear, 2032); // J
assert.equal(multiRender.displayRange.chartEndYear, Math.min(2039, Math.max(2032, multiRender.selection.peakLow?.calendarYear ?? -Infinity, multiRender.selection.peakHigh?.calendarYear ?? -Infinity) + 3)); // K
assert.deepEqual(multiRender.selection.starts.map((point) => point.calendarYear), [2029, 2032]); // E, F, M
assert.deepEqual(milestones.map(({ projectId, projectName, corporatePeriodIndex, calendarYear, navPerShare, dcfPerShare, dcfPresentValueTodayPerShare }) => ({ projectId, projectName, corporatePeriodIndex, calendarYear, navPerShare, dcfPerShare, dcfPresentValueTodayPerShare })), milestones); // O exact shared shape
console.log('Multi-project Corporate calendar runtime trace', JSON.stringify(canonical.periods.map((period: any) => ({
  periodIndex: period.periodIndex, calendarYear: period.calendarYear,
  discountExponentFromToday: period.discountExponentFromToday, fcffUSD: period.fcffUSD,
  contributions: period.projectContributions, projectsStarting: milestones.filter((item) => item.corporatePeriodIndex === period.periodIndex).map((item) => item.projectId),
  low: period.navPerShareTarget, high: period.dcfPerShareTarget,
}))));
