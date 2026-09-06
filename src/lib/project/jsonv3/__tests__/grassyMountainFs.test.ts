import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import {
  GRASSY_MOUNTAIN_ANNUAL_PAYABLE_AG_OZ,
  GRASSY_MOUNTAIN_ANNUAL_RECOVERED_AG_OZ,
  GRASSY_MOUNTAIN_ANNUAL_SUSTAINING_CAPEX_USD,
  GRASSY_MOUNTAIN_FS_V3,
  GRASSY_MOUNTAIN_REPORT_PERIODS,
  GRASSY_MOUNTAIN_REPORT_POST_TAX_FCFF_USD,
  GRASSY_MOUNTAIN_REPORT_PRE_TAX_FCFF_USD,
  GRASSY_MOUNTAIN_REPORT_REVENUE_USD,
  GRASSY_MOUNTAIN_REPORT_TAX_USD,
  GRASSY_MOUNTAIN_SUMMARY_CLOSURE_USD,
  GRASSY_MOUNTAIN_SUMMARY_INITIAL_CAPEX_USD,
  GRASSY_MOUNTAIN_SUMMARY_PAYABLE_AG_OZ,
  GRASSY_MOUNTAIN_SUMMARY_RECOVERED_AG_OZ,
  GRASSY_MOUNTAIN_SUMMARY_SALVAGE_USD,
  GRASSY_MOUNTAIN_SUMMARY_SUSTAINING_CAPEX_USD,
} from './fixtures/grassyMountainFs.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function sum(series: Array<number | null> | readonly number[]): number {
  return series.reduce<number>((total, value) => total + (finite(value) ? value : 0), 0);
}
function maxAbsDiff(actual: Array<number | null>, expected: readonly number[]): number {
  assert(actual.length === expected.length, `Series length mismatch actual=${actual.length} expected=${expected.length}`);
  return actual.reduce<number>((max, value, t) => {
    assert(finite(value), `Expected finite Grassy Mountain value at t=${t}, received ${String(value)}`);
    return Math.max(max, Math.abs(value - expected[t]));
  }, 0);
}

async function runReportEngine() {
  const raw = GRASSY_MOUNTAIN_FS_V3;
  const report = raw.verification?.report;
  assert(report, 'Grassy Mountain fixture requires verification.report');
  const parsed = parseProjectJsonV3(raw, {
    requireRuntimePlacement: false,
    taxScenario: 'report',
    fiscalScenario: 'report',
  });
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'grassy-mountain-fs-2026-golden',
  });
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runGrassyMountainFsTest(): Promise<void> {
  const raw = GRASSY_MOUNTAIN_FS_V3;

  assert(raw.time.masterN === 11, 'Table 19-2 Y-2,Y-1,Y1..Y10 must map to 12 periods / masterN=11');
  assert(raw.time.productionStartPeriod === 1, 'Y-1/t1 is the first period with recovered/payable metal and revenue');
  assert(raw.time.reportPeriodLabels?.join(',') === GRASSY_MOUNTAIN_REPORT_PERIODS.join(','), 'Report period labels must remain exact');
  assert(raw.time.phaseByPeriod[0] === 'construction', 'Y-2/t0 must remain construction');
  assert(raw.time.phaseByPeriod[1] === 'ramp_up', 'Y-1/t1 must remain pre-commercial ramp-up');
  assert(raw.time.phaseByPeriod[11] === 'closure', 'Y10/t11 is the annualized terminal production/closure period');
  assert(raw.time.runtimePlacement == null, 'No construction/production calendar year may be guessed for Grassy Mountain');

  let runtimePlacementFailed = false;
  try {
    parseProjectJsonV3(raw, { requireRuntimePlacement: true, taxScenario: 'runtime', fiscalScenario: 'runtime' });
  } catch (error) {
    runtimePlacementFailed = error instanceof Error && error.message.includes('runtimePlacement');
  }
  assert(runtimePlacementFailed, 'Grassy Mountain must fail closed for runtime until Paramount publishes a sourced schedule year');

  assert(raw.metals.priceKeyByMetal.Au === 'XAU_USD_TOZ', 'Grassy Mountain Au must use the canonical gold price key');
  assert(raw.metals.priceKeyByMetal.Ag === 'XAG_USD_TOZ', 'Grassy Mountain Ag must use the canonical silver price key');
  assert(raw.metals.revenueBasisByMetal.Au === 'PAYABLE_DIRECT' && raw.metals.revenueBasisByMetal.Ag === 'PAYABLE_DIRECT', 'Table 19-2 payable ounces must be the direct revenue quantities');
  assert(sum(raw.metals.payableQtyByMetal.Au) === 385_500, 'Rounded annual payable Au must preserve the 385.5 koz Table 19-2 total');
  assert(sum(raw.metals.payableQtyByMetal.Ag) === GRASSY_MOUNTAIN_ANNUAL_PAYABLE_AG_OZ, 'Rounded annual payable Ag row must sum to 477.8 koz');
  assert(GRASSY_MOUNTAIN_ANNUAL_PAYABLE_AG_OZ - GRASSY_MOUNTAIN_SUMMARY_PAYABLE_AG_OZ === 100, 'Table 19-2 payable-Ag annual rows vs 477.7 koz summary discrepancy must remain explicit');
  assert(sum(raw.metals.metalInProductQtyByMetal?.Ag ?? []) === GRASSY_MOUNTAIN_ANNUAL_RECOVERED_AG_OZ, 'Rounded annual recovered Ag row must sum to 480.0 koz');
  assert(GRASSY_MOUNTAIN_SUMMARY_RECOVERED_AG_OZ - GRASSY_MOUNTAIN_ANNUAL_RECOVERED_AG_OZ === 100, 'Table 19-2 recovered-Ag 480.1 koz summary vs annual rows discrepancy must remain explicit');
  assert(raw.operations?.capacity.nameplateThroughput === 750 && raw.operations.capacity.throughputUnit === 'tpd', 'Report plant design must remain 750 short tons/day');
  assert(raw.operations?.oreMinedTonnes?.[1] === 5_200, 'Y-1 pre-commercial mined resource must remain 5.2 kt');

  assert(sum(raw.capital.capexUSD) === GRASSY_MOUNTAIN_SUMMARY_INITIAL_CAPEX_USD, 'Initial CAPEX must preserve US$189.8m');
  assert(sum(raw.capital.sustainingCapexUSD) === GRASSY_MOUNTAIN_ANNUAL_SUSTAINING_CAPEX_USD, 'Rounded annual Table 19-2 sustaining row must sum to US$64.9m');
  assert(GRASSY_MOUNTAIN_SUMMARY_SUSTAINING_CAPEX_USD - GRASSY_MOUNTAIN_ANNUAL_SUSTAINING_CAPEX_USD === 200_000, 'US$0.2m sustaining summary-vs-annual discrepancy must remain explicit');
  assert(sum(raw.capital.closureUSD) === GRASSY_MOUNTAIN_SUMMARY_CLOSURE_USD && raw.capital.closureUSD[11] === 21_100_000, 'Annualized Table 19-2 closure proxy must remain US$21.1m in Y10');
  assert(raw.capital.terminalProceedsUSD?.[11] === GRASSY_MOUNTAIN_SUMMARY_SALVAGE_USD, 'US$15.8m salvage must remain terminal proceeds in Y10');
  assert(sum(raw.capital.workingCapitalDeltaUSD ?? []) === 0, 'No separate working-capital line exists in the published annual cash-flow identity');

  const report = raw.verification?.report;
  assert(report, 'Grassy Mountain verification.report is required');
  assert(report.priceDeckByKey.XAU_USD_TOZ === 3600 && report.priceDeckByKey.XAG_USD_TOZ === 48, 'Report deck must remain Au US$3,600/oz and Ag US$48/oz');
  assert(report.discountRate === 0.05 && report.discountConvention === 'mid_year', 'Report explicitly requires 5% discounting with midpoint cash flows');
  assert(report.reportNPVPostTaxUSD === 374_700_000 && report.reportIRRPostTax === 0.389, 'Post-tax headline must remain US$374.7m / 38.9%');
  assert(report.reportNPVPreTaxUSD === 458_900_000 && report.reportIRRPreTax === 0.428, 'Pre-tax headline must remain US$458.9m / 42.8%');
  assert(report.reportSustainingCapexUSD === GRASSY_MOUNTAIN_ANNUAL_SUSTAINING_CAPEX_USD, 'Generic reconciliation must use the annual Table 19-2 sustaining row rather than balancing it to the US$65.1m summary');

  assert(raw.economics.taxModel.mode === 'REPORT_LOCKED_WITH_RUNTIME_PROXY', 'Published annual tax cash flow must be canonical for report reconciliation');
  assert(Math.abs(-sum(raw.economics.taxModel.reportTaxCashFlowUSD) - sum(GRASSY_MOUNTAIN_REPORT_TAX_USD)) < 1, 'Table 19-2 tax row must total US$117.2m');
  assert(raw.economics.depreciationUSD == null, 'Do not invent the unpublished MNP depreciation/tax-pool schedule');

  assert(raw.economics.fiscalTakeModel.mode === 'RULES', 'Grassy Mountain royalty must remain a canonical fiscal rule');
  const royalty = raw.economics.fiscalTakeModel.reportLockedItems?.find((item) => item.id === 'sherry_yates_royalty');
  assert(royalty?.runtimeProxyRule && 'rate' in royalty.runtimeProxyRule && royalty.runtimeProxyRule.rate.type === 'FIXED' && royalty.runtimeProxyRule.rate.rate === 0.015, 'Runtime royalty proxy must use the disclosed 1.5% gross-proceeds rate');
  assert(sum(royalty?.reportFiscalTakeUSD ?? []) === 21_100_000, 'Annual report royalty row must total US$21.1m');

  const output = await runReportEngine();
  const revenueDiff = maxAbsDiff(output.revenue.grossRevenueUSD, GRASSY_MOUNTAIN_REPORT_REVENUE_USD);
  assert(revenueDiff <= 200_000, `Payable-quantity revenue must remain within Table 19-2 0.1M rounding, max diff=${revenueDiff}`);
  const postTaxMaxDiff = maxAbsDiff(output.phase1.fcffUSD, GRASSY_MOUNTAIN_REPORT_POST_TAX_FCFF_USD);
  assert(postTaxMaxDiff <= 200_000, `Post-tax annual FCFF must reproduce Table 19-2 within 0.1M input rounding, max diff=${postTaxMaxDiff}`);
  const preTaxFcff = output.phase1.fcffUSD.map((value, t) => finite(value) && finite(output.phase1.taxUSD[t]) ? value + output.phase1.taxUSD[t] : null);
  const preTaxMaxDiff = maxAbsDiff(preTaxFcff, GRASSY_MOUNTAIN_REPORT_PRE_TAX_FCFF_USD);
  assert(preTaxMaxDiff <= 200_000, `Pre-tax annual FCFF must reproduce Table 19-2 within 0.1M input rounding, max diff=${preTaxMaxDiff}`);

  const reconciliation = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciliation.status === 'NOT_VERIFIED', `Grassy Mountain must remain Ej verifierad because the public annualized table omits the detailed 20+ year closure timing and does not reproduce headline NPV/IRR within 2% under the report midpoint convention: ${JSON.stringify(reconciliation.hardChecks)}`);
  const structuralChecks = reconciliation.hardChecks.filter((check) =>
    !['npv_reconciliation', 'irr_reconciliation', 'npv_pre_tax_reconciliation', 'irr_pre_tax_reconciliation'].includes(check.check));
  assert(structuralChecks.every((check) => check.status === 'PASS'), `Grassy Mountain source-mapping/CAPEX/terminal/price hard checks must pass: ${JSON.stringify(structuralChecks)}`);
  const economicsChecks = reconciliation.hardChecks.filter((check) => ['npv_reconciliation', 'irr_reconciliation', 'npv_pre_tax_reconciliation', 'irr_pre_tax_reconciliation'].includes(check.check));
  assert(economicsChecks.some((check) => check.status === 'FAIL'), 'At least one NPV/IRR hard check must fail; do not widen tolerance or invent hidden closure timing to force verification');

  console.log(
    `Grassy Mountain FS V3 EJ VERIFIERAD | NPV5 post report=${reconciliation.reportNPVPostTaxUSD} model=${reconciliation.modelNPVPostTaxUSD} relDiff=${reconciliation.npvRelativeDifference}`
    + ` | IRR post report=${reconciliation.reportIRRPostTax} model=${reconciliation.modelIRRPostTax} relDiff=${reconciliation.irrRelativeDifference}`
    + ` | NPV5 pre report=${reconciliation.reportNPVPreTaxUSD} model=${reconciliation.modelNPVPreTaxUSD} relDiff=${reconciliation.npvPreTaxRelativeDifference}`
    + ` | IRR pre report=${reconciliation.reportIRRPreTax} model=${reconciliation.modelIRRPreTax} relDiff=${reconciliation.irrPreTaxRelativeDifference}`
    + ` | maxRevenueDiff=${revenueDiff} maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff}`,
  );
})();
