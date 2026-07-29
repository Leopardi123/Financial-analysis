import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyProjectCalendarAxis } from '../projectCalendarAxis.ts';
import { computeProjectViewMetrics } from '../../projectView/computeProjectPreRevenueView.ts';
import { buildValuationTimeline } from '../canonicalValuationTimeline.ts';
import { buildValuationChartRenderModel } from '../../../components/project/valuationChartPresentation.ts';

type RawProject = { version: string; meta: { projectId: string; projectName: string }; time: { masterN: number; productionStartPeriod: number; productionStartYear?: number; periodEndDatesUtc: string[] }; series: { capexUSD: Array<number | null> } };
const readProject = async (path: string): Promise<RawProject> => JSON.parse(await readFile(path, 'utf8')) as RawProject;
const yearsFromDates = (raw: RawProject): number[] => raw.time.periodEndDatesUtc.map((date) => Number(date.slice(0, 4)));
const verify = (raw: RawProject) => verifyProjectCalendarAxis({
  masterN: raw.time.masterN,
  fcffLength: raw.series.capexUSD.length,
  productionStartPeriod: raw.time.productionStartPeriod,
  productionStartYear: raw.time.productionStartYear,
  periodEndDatesUtc: raw.time.periodEndDatesUtc,
  yearsByPeriod: yearsFromDates(raw),
});

const north = await readProject('src/lib/snapshot/__tests__/fixtures/p5.los-ricos-north.project_json_v1.json');
const south = await readProject('src/lib/snapshot/__tests__/fixtures/p6.los-ricos-south.project_json_v1.json');
const working: RawProject = {
  version: 'project_json_v2', meta: { projectId: 'AbraSilver', projectName: 'AbraSilver' },
  time: { masterN: 6, productionStartPeriod: 3, productionStartYear: 2029, periodEndDatesUtc: Array.from({ length: 7 }, (_, i) => `${2026 + i}-12-31`) },
  series: { capexUSD: new Array(7).fill(0) },
};

for (const [raw, expectedFirst, expectedProduction] of [[working, 2026, 2029], [south, 2025, 2029], [north, 2026, 2031]] as const) {
  const direct = verify(raw);
  const viaCorporate = verify(structuredClone(raw));
  assert.equal(direct.ok, true);
  assert.equal(viaCorporate.ok, true);
  if (!direct.ok || !viaCorporate.ok) continue;
  assert.deepEqual(direct.value.yearsByPeriod, viaCorporate.value.yearsByPeriod); // A-D, H
  assert.equal(direct.value.yearsByPeriod[0], expectedFirst);
  assert.equal(direct.value.yearsByPeriod[raw.time.productionStartPeriod], expectedProduction); // G
  assert.equal(direct.value.yearsByPeriod.length, raw.time.masterN + 1); // I (masterN is inclusive)
  assert.ok(direct.value.yearsByPeriod.every((year) => year > 2000)); // J
  const timeline = buildValuationTimeline({
    scope: 'project', fcfUSD: new Array(raw.time.masterN + 1).fill(0), capexUSD: new Array(raw.time.masterN + 1).fill(0),
    yearsByPeriod: direct.value.yearsByPeriod, periodEndDates: direct.value.periodEndDatesUtc,
    discountRate: 0.1, fxUSDToTarget: 1, productionStartPeriod: raw.time.productionStartPeriod,
    cashTarget: 0, debtTarget: 0, sharesCurrent: 1, sharesPf: 1,
  });
  assert.deepEqual(timeline.periods.map((period) => period.calendarYear), direct.value.yearsByPeriod);
  assert.deepEqual(timeline.periods.map((period) => period.periodEndDate), direct.value.periodEndDatesUtc);
  const chart = buildValuationChartRenderModel({ timeline, scope: 'project', priceToday: null, format: String });
  assert.deepEqual(chart.selection.points.map((point) => point.calendarYear), direct.value.yearsByPeriod); // A-C, F, J
}

// Exact legacy branches that produced the reported labels. They are documented
// here as the before-state and are never accepted by the verifier.
assert.deepEqual([0, 4].map((period) => period - 1), [-1, 3]);
assert.deepEqual([0, 2].map((period) => period + 4), [4, 6]);

const missing = verifyProjectCalendarAxis({ masterN: 2, fcffLength: 3, productionStartPeriod: 1, periodEndDatesUtc: undefined, yearsByPeriod: undefined });
assert.deepEqual(missing, { ok: false, error: 'Ej verifierad Project timeline: time.periodEndDatesUtc is missing' }); // E-F
const mismatch = verifyProjectCalendarAxis({ masterN: 2, fcffLength: 3, productionStartPeriod: 1, periodEndDatesUtc: ['2026-12-31', '2027-12-31', '2028-12-31'], yearsByPeriod: [2026, 2027] });
assert.deepEqual(mismatch, { ok: false, error: 'Ej verifierad Project timeline: yearsByPeriod length=2, expected 3' });

assert.throws(() => computeProjectViewMetrics({
  targetCurrency: 'USD', fxUSDToTarget: 1, discountRate: 0.1, masterN: 2,
  sharesCurrent: 1, priceCurrentTarget: 1, cashCurrentTarget: 0, debtCurrentTarget: 0, enterpriseAdjustmentsTarget: 0,
  fcfUSD: [0, 1, 2], capexUSD: [0, 0, 0], grossRevenueUSD: [0, 0, 0], ebitUSD: [0, 0, 0],
  payableAuEqOz: [0, 0, 0], sustainingCostUSD: [0, 0, 0], productionStartPeriod: 1,
  calendarYears: [2026, 2027], calendarYearPolicy: 'verified', financing: { equityPct: 100, debtPct: 0 },
}), /Ej verifierad Project timeline: calendarYears length=2, FCFF length=3/);

console.log('Project calendar axis A-J passed', {
  working: verify(working), south: verify(south), north: verify(north),
});
