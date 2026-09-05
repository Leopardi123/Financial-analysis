import assert from 'node:assert/strict';
import { runCorporateSnapshotPipeline } from '../runCorporateSnapshot.ts';
import { VIZCACHITAS_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/vizcachitasPfs.ts';
import { parseProjectJsonV1 } from '../../project/jsonv1/parse.ts';
import { resolveProjectPricesToEngineInput } from '../../project/jsonv1/resolvePrices.ts';
import { computeProjectEngineFullProductionV1 } from '../../project/engineFullProductionV1.ts';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const raw = clone(VIZCACHITAS_PFS_V3);
raw.meta = { ...raw.meta, projectId: 'p1', projectName: 'Vizcachitas PFS v3' };
raw.time.runtimePlacement = {
  productionStart: {
    year: 2031,
    sourceId: 'v3-runtime-regression',
    pageOrTable: 'test runtime placement',
    asOfDate: '2026-08-31',
  },
};

assert.equal(Object.prototype.hasOwnProperty.call(raw.time, 'productionStartYear'), false, 'V3 must not store flat productionStartYear');
assert.equal(JSON.stringify(raw).includes('productionStartYear'), false, 'V3 storage must remain free of legacy productionStartYear');

const body = {
  targetCurrency: 'USD',
  valuationYear: 2026,
  discountRate: 0.1,
  market: {
    shares_current: 100_000_000,
    price_current_TargetCurrency: 1,
  },
  balanceSheet: {
    cash_t0_TargetCurrency: 0,
    debt_t0_TargetCurrency: 0,
  },
  scenario: {
    mode: 'fixed',
    fixedPriceByKey: {
      CU_USD_LB: 3.68,
      MO_USD_TONNE: 28439.63182122,
      XAG_USD_TOZ: 21.79,
      XAU_USD_TOZ: 2000,
    },
  },
  fx: {
    source: 'manual',
    anchor: 'today',
    manual_fx_USD_to_TargetCurrency: 1,
    scenario: { mode: 'spot' },
  },
  projects: [{ projectId: 'p1', rawJson: raw }],
};

const result = await runCorporateSnapshotPipeline({ body, refresh: false });
assert.equal(result.ok, true, result.ok ? 'V3 runtime snapshot succeeded' : JSON.stringify(result.diagnostics));
if (!result.ok) process.exit(1);

assert.equal(result.snapshot.aggregation.corporateYearsByPeriod[0], 2028, 'V3 t=0 must be derived from productionStart=2031 and tp=3');
assert.equal(result.snapshot.aggregation.corporateYearsByPeriod[3], 2031, 'V3 productionStartPeriod must map to runtimePlacement.productionStart.year');
assert.equal(result.snapshot.aggregation.corporateMasterN, 32);
assert.equal(result.snapshot.series?.periodIndex.length, 33);
assert.ok(result.snapshot.series?.fcffUSD.every((value) => typeof value === 'number' && Number.isFinite(value)), 'Project runtime FCFF must be numeric');

// parseProjectJsonV1 installs only a read-only in-memory compatibility projection for
// remaining legacy readers. It must never become stored V3 data.
assert.equal(Object.prototype.hasOwnProperty.call(raw.time, 'productionStartYear'), false);
assert.equal((raw.time as unknown as { productionStartYear?: number }).productionStartYear, 2031);
assert.equal(JSON.stringify(raw).includes('productionStartYear'), false);


// Regression: Corporate must not drop or rebuild project_json_v3 fiscal rules.
// This reproduces the Tocantinzinho class: 3% gross-revenue royalty booked as
// OPERATING_EXPENSE plus a flat tax model with loss carryforward.
const royaltyRaw = clone(raw);
royaltyRaw.meta = { ...royaltyRaw.meta, projectId: 'royalty-p1', projectName: 'V3 gross royalty regression' };
royaltyRaw.economics.fiscalTakeModel = {
  mode: 'RULES',
  items: [{
    id: 'gross-royalty-3pct',
    label: 'Gross royalty 3%',
    placement: 'OPERATING_EXPENSE',
    base: { line: 'GROSS_METAL_VALUE', floorAtZero: true },
    rate: { type: 'FIXED', rate: 0.03 },
    start_t: 3,
    end_t: 28,
    sourceId: 'runtime-regression',
    pageOrTable: 'test-only source fixture',
  }],
  reportLockedItems: null,
};
royaltyRaw.economics.taxModel = { mode: 'FLAT_RATE', taxRate: 0.1525, lossCarryforward: true };

const royaltyBody = {
  ...body,
  projects: [{ projectId: 'royalty-p1', rawJson: royaltyRaw }],
};
const royaltyCorporate = await runCorporateSnapshotPipeline({ body: royaltyBody, refresh: false });
assert.equal(royaltyCorporate.ok, true, royaltyCorporate.ok ? 'V3 royalty Corporate snapshot succeeded' : JSON.stringify(royaltyCorporate.diagnostics));
if (!royaltyCorporate.ok) process.exit(1);

const royaltyParsed = parseProjectJsonV1(royaltyRaw);
const royaltyProjectInput = await resolveProjectPricesToEngineInput({
  parsed: royaltyParsed,
  scenario: { mode: 'fixed', fixedPriceByKey: body.scenario.fixedPriceByKey },
  allowRefresh: false,
  projectId: 'royalty-p1',
});
const royaltyProject = computeProjectEngineFullProductionV1(royaltyProjectInput);
const localT = 3;
const projectYear = royaltyParsed.engineInputWithoutPrices.yearsByPeriod[localT];
const corporateT = royaltyCorporate.snapshot.aggregation.corporateYearsByPeriod.indexOf(projectYear);
assert.ok(corporateT >= 0, 'royalty regression year must exist on Corporate axis');
const expectedRoyalty = royaltyProject.nationalTake.totalRoyaltiesUSD[localT];
const corporateRoyalty = royaltyCorporate.snapshot.series?.royaltiesUSD[corporateT] ?? null;
assert.ok(typeof expectedRoyalty === 'number' && expectedRoyalty > 0, 'Project engine must compute a positive 3% royalty');
assert.ok(typeof corporateRoyalty === 'number' && Math.abs(corporateRoyalty - expectedRoyalty) < 1e-6, `Corporate royalty must equal Project canonical royalty: corporate=${String(corporateRoyalty)} project=${String(expectedRoyalty)}`);
for (const [label, corporateSeries, projectSeries] of [
  ['EBIT', royaltyCorporate.snapshot.series?.ebitUSD, royaltyProject.phase1.ebitUSD],
  ['tax', royaltyCorporate.snapshot.series?.taxUSD, royaltyProject.phase1.taxUSD],
  ['FCFF', royaltyCorporate.snapshot.series?.fcffUSD, royaltyProject.phase1.fcffUSD],
] as const) {
  const corporateValue = corporateSeries?.[corporateT] ?? null;
  const projectValue = projectSeries[localT] ?? null;
  assert.ok(typeof corporateValue === 'number' && typeof projectValue === 'number' && Math.abs(corporateValue - projectValue) < 1e-6, `${label} must preserve Project→Corporate fiscal SSOT: corporate=${String(corporateValue)} project=${String(projectValue)}`);
}
const royaltyDiag = royaltyCorporate.diagnostics.meta.royaltiesDiagnostics?.['royalty-p1'];
assert.equal(royaltyDiag?.royaltiesSource, 'project-engine-fiscal-rules');
assert.equal(royaltyDiag?.royaltiesComputedFromSeriesName, 'project-engine.nationalTake.totalRoyaltiesUSD');

console.log('v3RuntimeTimeline.test.ts passed');
