import { parseProjectJsonV1 } from '../../jsonv1/parse.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { computeIrr } from '../../../metrics/lista3.ts';
import { validateSnapshotRequest } from '../../../api/validateSnapshotRequest.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import { buildProjectJsonV3Template } from '../template.ts';
import type { ProjectJsonV3 } from '../schema.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
function near(actual: number | null | undefined, expected: number, tolerance = 1e-8): void {
  assert(typeof actual === 'number' && Number.isFinite(actual), `Expected finite value, received ${String(actual)}`);
  assert(Math.abs((actual as number) - expected) <= tolerance, `Expected ${expected}, received ${actual}`);
}
function assertThrows(fn: () => unknown, pattern: RegExp, message: string): void {
  let error: unknown;
  try { fn(); } catch (caught) { error = caught; }
  assert(error instanceof Error && pattern.test(error.message), message);
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fixture(): ProjectJsonV3 {
  return {
    version: 'project_json_v3',
    meta: { projectId: 'v3-fixture', projectName: 'V3 fixture', currency: 'USD' },
    time: {
      masterN: 3,
      productionStartPeriod: 1,
      reportPeriodLabels: ['-1', '1', '2', '3'],
      phaseByPeriod: ['construction', 'operations', 'operations', 'closure'],
      runtimePlacement: {
        constructionStart: {
          year: 2028,
          sourceId: 'fixture-construction-guidance',
          pageOrTable: 'Schedule guidance',
          asOfDate: '2026-08-31',
        },
        productionStart: {
          year: 2029,
          sourceId: 'fixture-production-guidance',
          pageOrTable: 'Schedule guidance',
          asOfDate: '2026-08-31',
        },
      },
    },
    metals: {
      payableQtyByMetal: { Au: [0, 1000, 1000, 0] },
      payableQtyUnitByMetal: { Au: 'toz' },
      priceKeyByMetal: { Au: 'XAU_USD_TOZ' },
      auPriceKey: 'XAU_USD_TOZ',
    },
    economics: {
      costModel: {
        mode: 'COMPONENTS',
        components: [
          { id: 'mine', category: 'mining', seriesUSD: [0, 300000, 300000, 0] },
          { id: 'plant', category: 'processing', seriesUSD: [0, 300000, 300000, 0] },
          { id: 'ga', category: 'site_ga', seriesUSD: [0, 50000, 50000, 0] },
        ],
      },
      sellingModel: {
        mode: 'COMPONENTS',
        components: [{ id: 'freight', category: 'transport', seriesUSD: [0, 1000, 1000, 0] }],
      },
      royaltyModel: { mode: 'NONE' },
      taxModel: { mode: 'FLAT_RATE', taxRate: 0.25 },
      depreciationUSD: [0, 0, 0, 0],
    },
    capital: {
      capexUSD: [1500000, 0, 0, 0],
      sustainingCapexUSD: [0, 0, 0, 0],
      closureUSD: [0, 0, 0, 10000],
      workingCapitalDeltaUSD: [0, 0, 0, 0],
      terminalProceedsUSD: [0, 0, 0, 0],
    },
    verification: {
      report: {
        sourceId: 'fixture-report',
        npvIrrPageOrTable: 'Table X',
        pricesPageOrTable: 'Table Y',
        periodsPageOrTable: 'Table periods',
        discountRate: 0.08,
        discountConvention: 'period_end',
        priceDeckByKey: { XAU_USD_TOZ: 2000 },
        reportNPVPostTaxUSD: 1,
        reportIRRPostTax: 0.1,
        toleranceRelative: 0.000001,
        reportInitialCapexUSD: 1500000,
        reportSustainingCapexUSD: 0,
        reportClosureUSD: 10000,
        reportClosurePeriod: 3,
      },
      reportedCostCheckpoints: [],
    },
  };
}

async function engineAtReportDeck(raw: ProjectJsonV3) {
  const parsed = parseProjectJsonV1(raw);
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: { XAU_USD_TOZ: 2000 } },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'v3-fixture',
  });
  input.phase2.discountRate = 0.08;
  return computeProjectEngineFullProductionV1(input);
}

(async function run(): Promise<void> {
  const blank = buildProjectJsonV3Template() as any;
  assert(Array.isArray(blank._how_to_fill) && blank._how_to_fill.length >= 24, 'Blank V3 template must carry complete filling instructions');
  assert(blank._template_status?.includes('NOT runtime-valid'), 'Blank V3 template must state that placeholders are not runtime-valid');
  assert(blank.time.runtimePlacement === null, 'Blank V3 template must not invent calendar anchors');
  assert(blank.time.reportPeriodLabels === null, 'Blank V3 template must not invent report period labels');
  assert(!Object.prototype.hasOwnProperty.call(blank.time, 'periodEndDatesUtc'), 'V3 relative economics must not contain fixed periodEndDatesUtc');
  assert(Object.keys(blank.metals.payableQtyByMetal).length === 0, 'Blank V3 template must not assume a metal');
  assert(Object.keys(blank.metals.priceKeyByMetal).length === 0, 'Blank V3 template must not guess a runtime price key');
  assert(blank.metals.auPriceKey === null, 'Blank V3 template must not assume an Au price key');
  assert(blank.economics.costModel.mode === 'UNKNOWN', 'Blank V3 cost source must start UNKNOWN');
  assert(blank.economics.sellingModel.mode === 'UNKNOWN', 'Blank V3 selling source must start UNKNOWN');
  assert(blank.economics.royaltyModel.mode === 'UNKNOWN', 'Blank V3 royalty source must start UNKNOWN');
  assert(blank.economics.taxModel.mode === 'UNKNOWN', 'Blank V3 tax source must start UNKNOWN');
  assert(blank.capital.capexUSD.every((value: unknown) => value === null), 'Blank V3 CAPEX must use null, never placeholder zero');
  assert(blank.capital.sustainingCapexUSD.every((value: unknown) => value === null), 'Blank V3 sustaining CAPEX must use null');
  assert(blank.capital.closureUSD.every((value: unknown) => value === null), 'Blank V3 closure must use null');
  assertThrows(
    () => parseProjectJsonV1(blank),
    /draft placeholder\(s\) must be resolved from the technical report before runtime/,
    'Blank V3 template must fail closed instead of becoming a plausible runtime project',
  );

  const raw = fixture();
  const parsed = parseProjectJsonV1(raw);
  assert(parsed.engineInputWithoutPrices.yearsByPeriod.join(',') === '2028,2029,2030,2031', 'Consistent construction/production anchors must map the relative axis into calendar years');
  near((parsed.engineInputWithoutPrices.phase1 as any).operatingCostsUSD[1], 600000);
  near((parsed.engineInputWithoutPrices.phase1 as any).siteGandA_USD[1], 50000);
  near((parsed.engineInputWithoutPrices.phase1 as any).sellingCostsUSD[1], 1000);

  const productionOnly = clone(raw);
  productionOnly.time.runtimePlacement = {
    productionStart: { year: 2029, sourceId: 'production-only-guidance' },
  };
  assert(parseProjectJsonV1(productionOnly).engineInputWithoutPrices.yearsByPeriod.join(',') === '2028,2029,2030,2031', 'Production-only anchor must derive construction calendar placement from productionStartPeriod');

  const constructionOnly = clone(raw);
  constructionOnly.time.runtimePlacement = {
    constructionStart: { year: 2028, sourceId: 'construction-only-guidance' },
  };
  assert(parseProjectJsonV1(constructionOnly).engineInputWithoutPrices.yearsByPeriod.join(',') === '2028,2029,2030,2031', 'Construction-only anchor must derive production calendar placement from productionStartPeriod');

  const conflictingPlacement = clone(raw);
  conflictingPlacement.time.runtimePlacement = {
    constructionStart: { year: 2028, sourceId: 'construction-guidance' },
    productionStart: { year: 2030, sourceId: 'production-guidance' },
  };
  assertThrows(
    () => parseProjectJsonV1(conflictingPlacement),
    /PLACEMENT_CONFLICT/,
    'Conflicting company calendar anchors must fail closed rather than stretch or shift the economic arrays',
  );

  const inlineRequest = validateSnapshotRequest({
    targetCurrency: 'USD',
    valuationYear: 2028,
    discountRate: 0.1,
    fx_USD_to_TargetCurrency: 1,
    projects: [{ projectId: 'v3-fixture', rawJson: raw }],
  });
  assert(inlineRequest.ok, 'Project inline snapshot request must accept valid project_json_v3');
  if (inlineRequest.ok) {
    assert(inlineRequest.value.projects[0].rawJson.version === 'project_json_v3', 'snapshot validator must restore original v3 document before runtime');
  }

  const output = await engineAtReportDeck(raw);
  near(output.phase1.sellingCostsUSD_effective?.[1], 1000);
  const expectedEbitda = 2_000_000 - 600_000 - 1_000 - 50_000;
  near(output.phase1.ebitdaUSD[1], expectedEbitda);

  const shifted = clone(raw);
  shifted.time.runtimePlacement = {
    constructionStart: { year: 2030, sourceId: 'later-construction-guidance' },
    productionStart: { year: 2031, sourceId: 'later-production-guidance' },
  };
  const shiftedParsed = parseProjectJsonV1(shifted);
  assert(shiftedParsed.engineInputWithoutPrices.yearsByPeriod.join(',') === '2030,2031,2032,2033', 'Changing consistent guidance anchors must shift only calendar placement');
  const shiftedOutput = await engineAtReportDeck(shifted);
  assert(JSON.stringify(shiftedOutput.phase1.fcffUSD) === JSON.stringify(output.phase1.fcffUSD), 'Calendar placement changes must not change relative Project FCFF economics');
  assert(JSON.stringify(shifted.capital) === JSON.stringify(raw.capital), 'Schedule guidance changes must not shift capital arrays');
  assert(JSON.stringify(shifted.metals) === JSON.stringify(raw.metals), 'Schedule guidance changes must not shift production arrays');

  const fcff = output.phase1.fcffUSD;
  assert(fcff.every((value) => typeof value === 'number' && Number.isFinite(value)), 'Fixture FCFF must be finite');
  const reportNpv = (fcff as number[]).reduce((sum, value, t) => sum + value / ((1 + 0.08) ** t), 0);
  const reportIrr = computeIrr(fcff, 0.08).selectedRoot;
  assert(typeof reportIrr === 'number' && Number.isFinite(reportIrr), 'Fixture IRR must be finite');
  raw.verification!.report!.reportNPVPostTaxUSD = reportNpv;
  raw.verification!.report!.reportIRRPostTax = reportIrr as number;

  const reportOnly = clone(raw);
  reportOnly.time.runtimePlacement = null;
  const reconciled = await reconcileProjectJsonV3ToReport(reportOnly);
  assert(reconciled.status === 'VERIFIED', `Expected calendar-independent VERIFIED reconciliation: ${JSON.stringify(reconciled.hardChecks)}`);
  assert(reconciled.hardChecks.every((check) => check.status === 'PASS'), 'Every hard reconciliation check must pass');
  assert(reconciled.hardChecks.some((check) => check.check === 'relative_period_mapping'), 'Reconciliation must expose relative-period mapping hard check');

  const unplacedRuntime = clone(raw);
  unplacedRuntime.time.runtimePlacement = null;
  assertThrows(
    () => parseProjectJsonV1(unplacedRuntime),
    /requires at least constructionStart or productionStart/,
    'Project/Corporate/Compare Stocks runtime must require a current sourced calendar anchor',
  );

  const staleCalendarAxis = fixture() as any;
  staleCalendarAxis.time.periodEndDatesUtc = ['2028-12-31', '2029-12-31', '2030-12-31', '2031-12-31'];
  assertThrows(
    () => parseProjectJsonV1(staleCalendarAxis),
    /forbids parallel source field\(s\): periodEndDatesUtc/,
    'V3 must reject a fixed periodEndDatesUtc axis beside the relative economic axis',
  );

  const staleRuntimePlacement = fixture() as any;
  staleRuntimePlacement.time.runtimePlacement = { productionStartYear: 2029, sourceId: 'legacy-shape' };
  assertThrows(
    () => parseProjectJsonV1(staleRuntimePlacement),
    /SOURCED_SCHEDULE_ANCHORS forbids parallel source field\(s\): productionStartYear, sourceId/,
    'V3 must reject the old single-field runtimePlacement shape so schedule provenance remains anchor-specific',
  );

  const invalid = fixture() as any;
  invalid.economics.costModel.operatingCostsUSD = [0, 1, 1, 0];
  assertThrows(
    () => parseProjectJsonV1(invalid),
    /forbids parallel source field\(s\): operatingCostsUSD/,
    'COMPONENTS mode must fail closed if an aggregate OPEX source is also supplied',
  );

  const invalidReport = fixture() as any;
  invalidReport.verification.report.reportPostTaxFCF_USD = [0, 1, 1, 0];
  assertThrows(
    () => parseProjectJsonV1(invalidReport),
    /CHECKPOINTS_ONLY forbids parallel source field\(s\): reportPostTaxFCF_USD/,
    'V3 verification must not carry a parallel report FCFF ledger',
  );

  console.log('project_json_v3 foundation tests passed');
})();
