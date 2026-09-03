import { parseProjectJsonV1 } from '../../jsonv1/parse.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { computeIrr } from '../../../metrics/lista3.ts';
import { validateSnapshotRequest } from '../../../api/validateSnapshotRequest.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import { buildProjectJsonV3Template } from '../template.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { isAlreadyProducingProjectJsonV3 } from '../productionStatus.ts';
import type { ProjectJsonV3 } from '../schema.ts';

function assert(condition: unknown, message: string): void { if (!condition) throw new Error(message); }
function near(actual: number | null | undefined, expected: number, tolerance = 1e-8): void {
  assert(typeof actual === 'number' && Number.isFinite(actual), `Expected finite value, received ${String(actual)}`);
  assert(Math.abs((actual as number) - expected) <= tolerance, `Expected ${expected}, received ${actual}`);
}
function assertThrows(fn: () => unknown, pattern: RegExp, message: string): void {
  let error: unknown;
  try { fn(); } catch (caught) { error = caught; }
  assert(error instanceof Error && pattern.test(error.message), message);
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function fixture(): ProjectJsonV3 {
  return {
    version: 'project_json_v3',
    meta: { projectId: 'v3-fixture', projectName: 'V3 fixture', currency: 'USD' },
    time: {
      masterN: 3,
      productionStartPeriod: 1,
      nameplateCapacityPeriod: 2,
      reportPeriodLabels: ['-1', '1', '2', '3'],
      phaseByPeriod: ['construction', 'operations', 'operations', 'closure'],
      runtimePlacement: {
        constructionStart: { year: 2028, sourceId: 'fixture-construction-guidance', pageOrTable: 'Schedule guidance', asOfDate: '2026-08-31' },
        productionStart: { year: 2029, sourceId: 'fixture-production-guidance', pageOrTable: 'Schedule guidance', asOfDate: '2026-08-31' },
        nameplateCapacity: { year: 2030, sourceId: 'fixture-nameplate-guidance', pageOrTable: 'Schedule guidance', asOfDate: '2026-08-31' },
      },
    },
    metals: {
      payableQtyByMetal: { Au: [0, 1000, 1000, 0] },
      metalInProductQtyByMetal: {},
      revenueBasisByMetal: { Au: 'PAYABLE_DIRECT' },
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
      sellingModel: { mode: 'COMPONENTS', components: [{ id: 'freight', category: 'transport', seriesUSD: [0, 1000, 1000, 0] }] },
      fiscalTakeModel: { mode: 'NONE' },
      taxModel: { mode: 'FLAT_RATE', taxRate: 0.25 },
      depreciationUSD: [0, 0, 0, 0],
    },
    capital: {
      capexUSD: [1500000, 500000, 0, 0],
      sustainingCapexUSD: [0, 0, 0, 0],
      closureUSD: [0, 0, 0, 10000],
      workingCapitalDeltaUSD: [0, 0, 0, 0],
      terminalProceedsUSD: [0, 0, 0, 0],
    },
    verification: {
      report: {
        sourceId: 'fixture-report', npvIrrPageOrTable: 'Table X', pricesPageOrTable: 'Table Y', periodsPageOrTable: 'Table periods',
        discountRate: 0.08, discountConvention: 'period_end', priceDeckByKey: { XAU_USD_TOZ: 2000 },
        reportNPVPostTaxUSD: 1, reportIRRPostTax: 0.1, toleranceRelative: 0.000001,
        reportInitialCapexUSD: 2000000, reportSustainingCapexUSD: 0, reportClosureUSD: 10000, reportClosurePeriod: 3,
      },
      reportedCostCheckpoints: [],
    },
  };
}

async function engineAtReportDeck(raw: ProjectJsonV3, taxScenario: 'runtime' | 'report' = 'runtime') {
  const parsed = parseProjectJsonV3(raw, { requireRuntimePlacement: false, taxScenario });
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
  assert(Array.isArray(blank._how_to_fill) && blank._how_to_fill.length >= 31, 'Blank V3 template must carry complete filling instructions');
  assert(blank._template_status?.includes('NOT runtime-valid'), 'Blank V3 template must state that placeholders are not runtime-valid');
  assert(blank.time.runtimePlacement === null, 'Blank V3 template must not invent calendar anchors');
  assert(blank.time.nameplateCapacityPeriod === null, 'Blank V3 template must not invent nameplate milestone');
  assert(Object.keys(blank.metals.revenueBasisByMetal).length === 0, 'Blank V3 template must not assume a revenue basis');
  assert(blank.economics.fiscalTakeModel.mode === 'UNKNOWN', 'Blank V3 fiscal take source must start UNKNOWN');
  assert(blank.capital.capexUSD.every((value: unknown) => value === null), 'Blank V3 CAPEX must use null, never placeholder zero');
  assertThrows(() => parseProjectJsonV1(blank), /draft placeholder\(s\) must be resolved/, 'Blank V3 must fail closed');

  const raw = fixture();
  assert(!isAlreadyProducingProjectJsonV3(raw), 'A future project must not be marked already producing');
  const producingStatus = clone(raw);
  producingStatus.time.productionStartPeriod = 0;
  producingStatus.time.phaseByPeriod = ['operations', 'operations', 'operations', 'closure'];
  assert(isAlreadyProducingProjectJsonV3(producingStatus), 'productionStartPeriod=0 must derive already-producing status');
  const parsed = parseProjectJsonV1(raw);
  assert(parsed.engineInputWithoutPrices.yearsByPeriod.join(',') === '2028,2029,2030,2031', 'Three consistent anchors must map the relative axis');
  near((parsed.engineInputWithoutPrices.phase1 as any).operatingCostsUSD[1], 600000);
  near((parsed.engineInputWithoutPrices.phase1 as any).siteGandA_USD[1], 50000);
  near((parsed.engineInputWithoutPrices.phase1 as any).sellingCostsUSD[1], 1000);

  const nameplateOnly = clone(raw);
  nameplateOnly.time.runtimePlacement = { nameplateCapacity: { year: 2030, sourceId: 'nameplate-only-guidance' } };
  assert(parseProjectJsonV1(nameplateOnly).engineInputWithoutPrices.yearsByPeriod.join(',') === '2028,2029,2030,2031', 'Nameplate-only anchor must resolve calendar when relative nameplate period is known');

  const conflict = clone(raw);
  conflict.time.runtimePlacement = {
    constructionStart: { year: 2028, sourceId: 'construction-guidance' },
    productionStart: { year: 2030, sourceId: 'production-guidance' },
    nameplateCapacity: { year: 2030, sourceId: 'nameplate-guidance' },
  };
  assertThrows(() => parseProjectJsonV1(conflict), /PLACEMENT_CONFLICT/, 'Conflicting schedule anchors must fail closed');

  const payableOutput = await engineAtReportDeck(raw);
  near(payableOutput.revenue.grossRevenueUSD[1], 2_000_000);
  near(payableOutput.payabilityDeductionUSDTotal?.[1], 0);
  near(payableOutput.phase1.sellingCostsUSD_effective?.[1], 1_000);

  const concentrateBasis = clone(raw);
  concentrateBasis.metals.payableQtyByMetal.Au = [0, 900, 900, 0];
  concentrateBasis.metals.metalInProductQtyByMetal = { Au: [0, 1000, 1000, 0] };
  concentrateBasis.metals.revenueBasisByMetal.Au = 'METAL_IN_PRODUCT_WITH_PAYABILITY_DEDUCTION';
  const concentrateOutput = await engineAtReportDeck(concentrateBasis);
  near(concentrateOutput.revenue.grossRevenueUSD[1], 2_000_000);
  near(concentrateOutput.payabilityDeductionUSDTotal?.[1], 200_000);
  near(concentrateOutput.phase1.sellingCostsUSD_effective?.[1], 201_000);

  const fiscal = clone(raw);
  fiscal.economics.fiscalTakeModel = {
    mode: 'RULES',
    items: [{
      id: 'source-defined-nsr', placement: 'OPERATING_EXPENSE',
      base: { line: 'GROSS_METAL_VALUE', deductions: ['TRANSPORT'] },
      rate: { type: 'FIXED', rate: 0.02 }, sourceId: 'fixture-report', pageOrTable: 'NSR terms',
    }],
  };
  const fiscalOutput = await engineAtReportDeck(fiscal);
  near(fiscalOutput.fiscalTake?.operatingExpenseUSD[1], (2_000_000 - 1_000) * 0.02);
  assert((fiscalOutput.phase1.ebitdaUSD[1] as number) < (payableOutput.phase1.ebitdaUSD[1] as number), 'Operating-expense fiscal take must reduce EBITDA');

  const hybrid = clone(raw);
  hybrid.economics.taxModel = {
    mode: 'REPORT_LOCKED_WITH_RUNTIME_PROXY',
    reportTaxCashFlowUSD: [0, -100000, -100000, 0],
    runtime: { method: 'NOMINAL_RATE_WITH_LOSS_CARRYFORWARD', taxRate: 0.25 },
    notes: 'Fixture report tax vs simplified runtime proxy',
  };
  const reportTaxOutput = await engineAtReportDeck(hybrid, 'report');
  const runtimeTaxOutput = await engineAtReportDeck(hybrid, 'runtime');
  near(reportTaxOutput.phase1.taxUSD[1], 100000);
  assert(runtimeTaxOutput.phase1.taxUSD[1] !== reportTaxOutput.phase1.taxUSD[1], 'Hybrid runtime must use dynamic proxy rather than report-locked tax series');

  const inlineRequest = validateSnapshotRequest({
    targetCurrency: 'USD', valuationYear: 2028, discountRate: 0.1, fx_USD_to_TargetCurrency: 1,
    projects: [{ projectId: 'v3-fixture', rawJson: raw }],
  });
  assert(inlineRequest.ok, 'Project inline snapshot request must accept valid project_json_v3');
  if (inlineRequest.ok) assert(inlineRequest.value.projects[0].rawJson.version === 'project_json_v3', 'snapshot validator must restore original v3');

  const shifted = clone(raw);
  shifted.time.runtimePlacement = {
    constructionStart: { year: 2030, sourceId: 'later-construction-guidance' },
    productionStart: { year: 2031, sourceId: 'later-production-guidance' },
    nameplateCapacity: { year: 2032, sourceId: 'later-nameplate-guidance' },
  };
  const shiftedOutput = await engineAtReportDeck(shifted);
  assert(JSON.stringify(shiftedOutput.phase1.fcffUSD) === JSON.stringify(payableOutput.phase1.fcffUSD), 'Calendar placement changes must not change relative Project FCFF');
  assert(JSON.stringify(shifted.capital) === JSON.stringify(raw.capital), 'Schedule guidance changes must not shift capital arrays');

  const reportFixture = hybrid;
  const reportOutput = reportTaxOutput;
  const fcff = reportOutput.phase1.fcffUSD;
  assert(fcff.every((value) => typeof value === 'number' && Number.isFinite(value)), 'Fixture report FCFF must be finite');
  const reportNpv = (fcff as number[]).reduce((sum, value, t) => sum + value / ((1 + 0.08) ** t), 0);
  const reportIrr = computeIrr(fcff, 0.08).selectedRoot;
  assert(typeof reportIrr === 'number' && Number.isFinite(reportIrr), 'Fixture IRR must be finite');
  reportFixture.verification!.report!.reportNPVPostTaxUSD = reportNpv;
  reportFixture.verification!.report!.reportIRRPostTax = reportIrr as number;
  reportFixture.time.runtimePlacement = null;
  const reconciled = await reconcileProjectJsonV3ToReport(reportFixture);
  assert(reconciled.status === 'VERIFIED', `Expected calendar-independent VERIFIED reconciliation: ${JSON.stringify(reconciled.hardChecks)}`);
  assert(reconciled.hardChecks.some((check) => check.check === 'initial_capex' && check.status === 'PASS'), 'Initial CAPEX must include report-defined capex in the production-start period');

  const irrNotApplicable = clone(reportFixture);
  irrNotApplicable.verification!.report!.reportIRRPostTax = null;
  irrNotApplicable.verification!.report!.irrApplicability = {
    status: 'not_applicable',
    reason: 'The producing operation has no initial investment before production and cash flow.',
    sourceId: 'fixture-report',
    pageOrTable: 'Section 22.5',
  };
  const reconciledWithoutIrr = await reconcileProjectJsonV3ToReport(irrNotApplicable);
  assert(reconciledWithoutIrr.status === 'VERIFIED', `Source-backed non-applicable IRR must not block NPV verification: ${JSON.stringify(reconciledWithoutIrr.hardChecks)}`);
  assert(reconciledWithoutIrr.reportIRRPostTax === null && reconciledWithoutIrr.modelIRRPostTax === null && reconciledWithoutIrr.irrRelativeDifference === null, 'Non-applicable IRR must remain null throughout reconciliation');
  assert(reconciledWithoutIrr.hardChecks.some((check) => check.check === 'irr_not_applicable_evidence' && check.status === 'PASS'), 'Non-applicable IRR evidence must be a visible hard check');

  const unsupportedMissingIrr = clone(reportFixture);
  unsupportedMissingIrr.verification!.report!.reportIRRPostTax = null;
  let missingIrrError: unknown;
  try { await reconcileProjectJsonV3ToReport(unsupportedMissingIrr); } catch (caught) { missingIrrError = caught; }
  assert(missingIrrError instanceof Error && /source-backed irrApplicability/.test(missingIrrError.message), 'Missing report IRR must fail closed without source-backed not-applicable evidence');

  const staleCalendarAxis = fixture() as any;
  staleCalendarAxis.time.periodEndDatesUtc = ['2028-12-31', '2029-12-31', '2030-12-31', '2031-12-31'];
  assertThrows(() => parseProjectJsonV1(staleCalendarAxis), /forbids parallel source field\(s\): periodEndDatesUtc/, 'V3 must reject fixed periodEndDatesUtc');
  const staleRoyalty = fixture() as any;
  staleRoyalty.economics.royaltyModel = { mode: 'NONE' };
  assertThrows(() => parseProjectJsonV1(staleRoyalty), /royaltyModel/, 'V3 must reject the old royaltyModel beside fiscalTakeModel');
  const invalidReport = fixture() as any;
  invalidReport.verification.report.reportPostTaxFCF_USD = [0, 1, 1, 0];
  assertThrows(() => parseProjectJsonV1(invalidReport), /CHECKPOINTS_ONLY/, 'V3 verification must not carry a parallel report FCFF ledger');

  console.log('project_json_v3 foundation tests passed');
})();
