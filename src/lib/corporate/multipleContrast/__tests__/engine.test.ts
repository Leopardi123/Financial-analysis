import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { bridgeCorporateMultipleToEquity, computeCorporateQualityMultiples, fiveYearEbitdaConcentrationAdjustment } from '../engine.ts';
import { QUALITY_MULTIPLE_POLICY, type CorporateQualityMultipleInput } from '../types.ts';
import { runCorporateSnapshotPipeline } from '../../../snapshot/runCorporateSnapshot.ts';

const years = (length: number, start = 2030) => Array.from({ length }, (_, index) => start + index);
const input = (ebitda: Array<number | null>, overrides: Partial<CorporateQualityMultipleInput> = {}): CorporateQualityMultipleInput => ({
  calendarYears: years(ebitda.length), ebitdaUSD_total: ebitda,
  revenueUSD_total: ebitda.map((value) => value === null ? null : Math.max(value * 2, 100)),
  sustainingCapexUSD_total: ebitda.map(() => 2), netCashTarget: ebitda.map(() => 10),
  sharesPostFinancing: ebitda.map(() => 10), fxUSDToTarget: 1.25, ...overrides,
});
const first = (args: CorporateQualityMultipleInput) => computeCorporateQualityMultiples(args).rows[0];

test('policy constants are centralized and stable', () => {
  assert.deepEqual(QUALITY_MULTIPLE_POLICY, { base: 6, minimum: 3, maximum: 10, band: 1, fullWindowLength: 5, minimumWindowLength: 3 });
});

test('long stable high-quality profile receives a positive aggregate adjustment', () => {
  const row = first(input(new Array(16).fill(100), { revenueUSD_total: new Array(16).fill(200), sustainingCapexUSD_total: new Array(16).fill(4) }));
  assert.equal(row.remainingActiveEconomicYears, 16);
  assert.equal(row.stabilityAdjustment, 0.5);
  assert.equal(row.sustainingIntensityAdjustment, 0.5);
  assert.equal(row.marginAdjustment, 0.5);
  assert.ok((row.qualityMidMultiple ?? 0) > QUALITY_MULTIPLE_POLICY.base);
  assert.equal(row.qualityStatus, 'COMPUTABLE');
});

test('one or two remaining periods are not computable', () => {
  const row = first(input([100, 100]));
  assert.equal(row.forwardAverageEbitdaUSD, null);
  assert.equal(row.qualityMidMultiple, null);
  assert.ok(row.qualityDiagnostics.includes('INSUFFICIENT_REMAINING_PERIODS'));
});

test('three and four period tails use every remaining calendar period as a short window', () => {
  for (const length of [3, 4]) {
    const row = first(input(new Array(length).fill(100)));
    assert.equal(row.shortWindow, true);
    assert.equal(row.windowLength, length);
    assert.equal(row.forwardAverageEbitdaUSD, 100);
    assert.notEqual(row.qualityMidMultiple, null);
    assert.ok(row.qualityDiagnostics.includes('SHORT_WINDOW'));
  }
});

test('uniform 10-year and 20-year profiles are neutral so duration is not rewarded twice', () => {
  for (const length of [10, 20]) {
    const row = first(input(new Array(length).fill(100)));
    assert.equal(row.actualFiveYearEbitdaShare, 5 / length);
    assert.equal(row.expectedFiveYearEbitdaShare, 5 / length);
    assert.equal(row.fiveYearEbitdaConcentrationDeviation, 0);
    assert.equal(row.fiveYearEbitdaConcentrationAdjustment, 0);
  }
});

test('front- and back-loaded ten-year profiles are scored relative to a uniform profile', () => {
  const front = first(input([160, 150, 140, 130, 120, 60, 60, 60, 60, 60]));
  assert.ok(front.actualFiveYearEbitdaShare! > front.expectedFiveYearEbitdaShare!);
  assert.ok(front.fiveYearEbitdaConcentrationDeviation! > 0);
  assert.equal(front.fiveYearEbitdaConcentrationAdjustment, -0.5);
  const back = first(input([60, 60, 60, 60, 60, 120, 130, 140, 150, 160]));
  assert.ok(back.actualFiveYearEbitdaShare! < back.expectedFiveYearEbitdaShare!);
  assert.ok(back.fiveYearEbitdaConcentrationDeviation! < 0);
  assert.equal(back.fiveYearEbitdaConcentrationAdjustment, 0.25);
});

test('exact concentration-policy boundaries are deterministic', () => {
  assert.equal(fiveYearEbitdaConcentrationAdjustment(-0.20), 0.25);
  assert.equal(fiveYearEbitdaConcentrationAdjustment(-0.10), 0.125);
  assert.equal(fiveYearEbitdaConcentrationAdjustment(0.10), -0.25);
  assert.equal(fiveYearEbitdaConcentrationAdjustment(0.20), -0.5);
  assert.equal(fiveYearEbitdaConcentrationAdjustment(0.30), -0.75);
  assert.equal(fiveYearEbitdaConcentrationAdjustment(0.40), -1);
});

test('negative EBITDA tail is diagnostic only and concentration uses positive EBITDA', () => {
  const row = first(input([20, 20, 20, 20, 20, -10, -10, -10, -10, -10]));
  assert.equal(row.positiveRemainingEbitda, 100);
  assert.equal(row.positiveEbitdaFirstFiveYears, 100);
  assert.equal(row.actualFiveYearEbitdaShare, 1);
  assert.equal(row.expectedFiveYearEbitdaShare, 1);
  assert.equal(row.fiveYearEbitdaConcentrationDeviation, 0);
  assert.equal(row.fiveYearEbitdaConcentrationAdjustment, 0);
  assert.equal(row.negativeEbitdaTailShare, 0.5);
  const expected = 6 + (row.remainingEconomicYearsAdjustment as number) + (row.fiveYearEbitdaConcentrationAdjustment as number)
    + (row.stabilityAdjustment as number) + (row.sustainingIntensityAdjustment as number) + (row.marginAdjustment as number);
  assert.equal(row.rawQualityMultiple, expected);
});

test('uniform five-year and three-year profiles are neutral while two years are not computable', () => {
  for (const length of [5, 3]) {
    const row = first(input(new Array(length).fill(100)));
    assert.equal(row.actualFiveYearEbitdaShare, 1);
    assert.equal(row.expectedFiveYearEbitdaShare, 1);
    assert.equal(row.fiveYearEbitdaConcentrationDeviation, 0);
    assert.equal(row.fiveYearEbitdaConcentrationAdjustment, 0);
    assert.equal(row.shortWindow, length === 3);
  }
  const row = first(input([100, 100]));
  assert.equal(row.actualFiveYearEbitdaShare, null);
  assert.equal(row.fiveYearEbitdaConcentrationAdjustment, null);
  assert.ok(row.qualityDiagnostics.includes('INSUFFICIENT_REMAINING_PERIODS'));
});

test('gap years stay in the calendar window and active-year diagnostics remain explicit', () => {
  const row = first(input([100, 100, 0, 100, 100, 100, 100, 100]));
  assert.equal(row.positiveEbitdaFirstFiveYears, 400);
  assert.equal(row.positiveRemainingEbitda, 700);
  assert.equal(row.remainingActiveEconomicYears, 7);
  assert.equal(row.economicGapYears, 1);
  assert.equal(row.windowLength, 5);
});

test('null EBITDA or revenue in the mandatory tail nulls concentration without fallback', () => {
  const nullEbitda = first(input([100, 100, null, 100, 100, 100]));
  assert.equal(nullEbitda.fiveYearEbitdaConcentrationAdjustment, null);
  const nullRevenue = first(input(new Array(6).fill(100), { revenueUSD_total: [200, 200, 200, 200, 200, null] }));
  assert.equal(nullRevenue.actualFiveYearEbitdaShare, null);
  assert.equal(nullRevenue.fiveYearEbitdaConcentrationAdjustment, null);
  assert.ok(nullRevenue.qualityDiagnostics.includes('NULL_REVENUE'));
});

test('gap years affect diagnostics but introduce no sixth adjustment', () => {
  const row = first(input([100, 0, 100, 0, 100, 0, 100, 0]));
  assert.equal(row.remainingActiveEconomicYears, 4);
  assert.equal(row.remainingEconomicSpanYears, 7);
  assert.equal(row.economicGapYears, 3);
  assert.equal(row.remainingEconomicYearsAdjustment, -1);
});

test('non-positive EBITDA mean nulls stability and the mandatory quality multiple', () => {
  const row = first(input([-10, -10, -10, -10, -10]));
  assert.equal(row.ebitdaCv5Y, null);
  assert.equal(row.qualityMidMultiple, null);
  assert.ok(row.qualityDiagnostics.includes('NON_POSITIVE_EBITDA_MEAN'));
});

test('null inputs never become zero and produce series-specific diagnostics', () => {
  const row = first(input([100, null, 100, 100, 100], {
    revenueUSD_total: [200, null, 200, 200, 200], sustainingCapexUSD_total: [2, null, 2, 2, 2],
  }));
  assert.equal(row.forwardAverageEbitdaUSD, null);
  assert.equal(row.qualityMidMultiple, null);
  assert.ok(row.qualityDiagnostics.includes('NULL_EBITDA'));
  assert.ok(row.qualityDiagnostics.includes('NULL_REVENUE'));
  assert.ok(row.qualityDiagnostics.includes('NULL_SUSTAINING_CAPEX'));
});

test('negative sustaining CAPEX nulls its factor and reports an error diagnostic', () => {
  const row = first(input(new Array(5).fill(100), { sustainingCapexUSD_total: [2, 2, -1, 2, 2] }));
  assert.equal(row.sustainingIntensity5Y, null);
  assert.equal(row.sustainingIntensityAdjustment, null);
  assert.equal(row.qualityMidMultiple, null);
  assert.ok(row.qualityDiagnostics.includes('NEGATIVE_SUSTAINING_CAPEX'));
});

test('margin above 100% is retained, flagged, and receives the specified adjustment', () => {
  const row = first(input(new Array(5).fill(120), { revenueUSD_total: new Array(5).fill(100) }));
  assert.equal(row.ebitdaMargin5Y, 1.2);
  assert.equal(row.marginAdjustment, 0.75);
  assert.ok(row.qualityDiagnostics.includes('EBITDA_MARGIN_ABOVE_ONE'));
});

test('calendar-level input supports overlapping and successor projects without local indices', () => {
  const projectA = [100, 100, 100, 0, 0, 0];
  const projectB = [0, 0, 50, 50, 50, 50];
  const corporate = projectA.map((value, index) => value + projectB[index]);
  const row = first(input(corporate));
  assert.deepEqual(corporate, [100, 100, 150, 50, 50, 50]);
  assert.equal(row.remainingActiveEconomicYears, 6);
  assert.equal(row.economicGapYears, 0);
  assert.equal(row.forwardAverageEbitdaUSD, 90);
});

test('equity bridge has exact 5x/6x/7x parity with the existing overlay formula', () => {
  const result = bridgeCorporateMultipleToEquity({ selectedEbitdaUSD: 100, fxUSDToTarget: 1.25,
    lowMultiple: 5, midMultiple: 6, highMultiple: 7, netCashTarget: 20, sharesPostFinancing: 10 });
  assert.equal(result.enterpriseValueLowTarget, 625);
  assert.equal(result.enterpriseValueMidTarget, 750);
  assert.equal(result.enterpriseValueHighTarget, 875);
  assert.equal(result.valuePerShareLow, (625 + 20) / 10);
  assert.equal(result.valuePerShareMid, (750 + 20) / 10);
  assert.equal(result.valuePerShareHigh, (875 + 20) / 10);
});

async function loadSnapshotFixture(): Promise<Record<string, unknown>> {
  const raw = await readFile(path.resolve('scripts/fixtures/snapshot-requests/abra_minimal.json'), 'utf8');
  const body = JSON.parse(raw) as Record<string, unknown>;
  const currentYear = new Date().getUTCFullYear();
  for (const project of body.projects as Array<Record<string, unknown>>) {
    const json = project.rawJson as Record<string, unknown>;
    json.version = 'project_json_v2';
    const time = json.time as Record<string, unknown>;
    time.productionStartYear = currentYear + (time.productionStartPeriod as number);
  }
  return body;
}

test('snapshot attachment is additive and existing valuation/static multiple outputs retain exact formulas', async () => {
  const body = await loadSnapshotFixture();
  const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const snapshot = result.snapshot as unknown as Record<string, any>;
  assert.ok(snapshot.corporateQualityMultipleTimeSeries?.rows?.length > 0);
  const before = JSON.stringify({
    series: snapshot.series, aggregation: snapshot.aggregation, financing: snapshot.financing,
    canonicalValuationTimeline: snapshot.canonicalValuationTimeline,
    corporateValuationTimeSeries: snapshot.corporateValuationTimeSeries,
    lista2: snapshot.lista2, corporate: snapshot.corporate,
  });
  computeCorporateQualityMultiples({
    calendarYears: snapshot.corporateValuationTimeSeries.rows.map((row: any) => row.year),
    ebitdaUSD_total: snapshot.corporateQualityMultipleTimeSeries.rows.map((row: any) => row.annualEbitdaUSD),
    revenueUSD_total: snapshot.corporateQualityMultipleTimeSeries.rows.map((_: any, index: number) => snapshot.series.totalRevenue_USD[index] ?? 0),
    sustainingCapexUSD_total: snapshot.corporateQualityMultipleTimeSeries.rows.map((_: any, index: number) => snapshot.series.sustainingCapexUSD[index] ?? 0),
    netCashTarget: snapshot.canonicalValuationTimeline.periods.map((row: any) => row.netCashTarget),
    sharesPostFinancing: snapshot.canonicalValuationTimeline.periods.map((row: any) => row.sharesPf),
    fxUSDToTarget: snapshot.fx_USD_to_TargetCurrency,
  });
  assert.equal(JSON.stringify({
    series: snapshot.series, aggregation: snapshot.aggregation, financing: snapshot.financing,
    canonicalValuationTimeline: snapshot.canonicalValuationTimeline,
    corporateValuationTimeSeries: snapshot.corporateValuationTimeSeries,
    lista2: snapshot.lista2, corporate: snapshot.corporate,
  }), before, 'quality engine must not mutate any existing output');
  for (const row of snapshot.corporateValuationTimeSeries.rows) {
    if (row.ebitdaTarget === null) continue;
    assert.equal(row.ev5xTarget, row.ebitdaTarget * 5);
    assert.equal(row.ev6xTarget, row.ebitdaTarget * 6);
    assert.equal(row.ev7xTarget, row.ebitdaTarget * 7);
    const bridge = (multiple: number) => row.sharesPf > 0 ? ((row.ebitdaTarget * multiple) + snapshot.canonicalValuationTimeline.periods[row.period].netCashTarget) / row.sharesPf : null;
    assert.equal(row.evEbitda5xPerShare, bridge(5));
    assert.equal(row.evEbitda6xPerShare, bridge(6));
    assert.equal(row.evEbitda7xPerShare, bridge(7));
  }
});

test('real two-project fixtures are consumed only after Corporate calendar aggregation', async () => {
  const body = await loadSnapshotFixture();
  const fixtureNames = ['p5.los-ricos-north.project_json_v1.json', 'p6.los-ricos-south.project_json_v1.json'];
  body.projects = await Promise.all(fixtureNames.map(async (name) => {
    const raw = await readFile(path.resolve('src/lib/snapshot/__tests__/fixtures', name), 'utf8');
    const rawJson = JSON.parse(raw) as Record<string, any>;
    rawJson.version = 'project_json_v2';
    rawJson.time.productionStartYear = Number(rawJson.time.periodEndDatesUtc[rawJson.time.productionStartPeriod].slice(0, 4));
    return { projectId: rawJson.meta.projectId, rawJson };
  }));
  const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const snapshot = result.snapshot as unknown as Record<string, any>;
  const quality = snapshot.corporateQualityMultipleTimeSeries;
  const staticRows = snapshot.corporateValuationTimeSeries.rows;
  assert.equal(quality.rows.length, staticRows.length);
  assert.deepEqual(quality.rows.map((row: any) => row.calendarYear), staticRows.map((row: any) => row.year));
  assert.ok(quality.rows.some((row: any) => row.remainingActiveEconomicYears > 0));
  assert.ok(snapshot.aggregation.corporateYearsByPeriod.length > 0);
});
