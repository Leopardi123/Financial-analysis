import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import {
  PANUCO_FS_V3,
  PANUCO_REPORT_PERIODS,
  PANUCO_REPORT_POST_TAX_FCFF_USD,
  PANUCO_REPORT_PRE_TAX_FCFF_USD,
  PANUCO_REPORT_TOTAL_REVENUE_USD,
  PANUCO_REPORT_TOTAL_TAX_USD,
  PANUCO_SUMMARY_CLOSURE_USD,
  PANUCO_SUMMARY_EXPANSION_CAPEX_USD,
  PANUCO_SUMMARY_INITIAL_CAPEX_USD,
  PANUCO_SUMMARY_SUSTAINING_CAPEX_USD,
} from './fixtures/panucoFs.ts';

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
    assert(finite(value), `Expected finite Panuco value at t=${t}, received ${String(value)}`);
    return Math.max(max, Math.abs(value - expected[t]));
  }, 0);
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function runEngine(raw: ProjectJsonV3, leg: 'report' | 'runtime') {
  const report = raw.verification?.report;
  assert(report, 'Panuco fixture requires verification.report');
  const parsed = parseProjectJsonV3(raw, {
    requireRuntimePlacement: leg === 'runtime',
    taxScenario: leg,
    fiscalScenario: leg,
  });
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'panuco-fs-2025-golden',
  });
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runPanucoFsGoldenTest(): Promise<void> {
  const raw = PANUCO_FS_V3;

  assert(raw.time.masterN === 13, 'Table 22-2 Y-2,Y-1,Y1..Y12 must map to 14 periods / masterN=13');
  assert(raw.time.productionStartPeriod === 1, 'Report Y-1/t1 is the first period with mill feed and payable metal');
  assert(raw.time.nameplateCapacityPeriod === 5, 'Report Y4/t5 is the first 1.46 Mt / 4,000 tpd Phase 2 nameplate period');
  assert(PANUCO_REPORT_PERIODS.join(',') === raw.time.reportPeriodLabels?.join(','), 'Report period labels must be preserved exactly');
  assert(raw.time.phaseByPeriod[0] === 'construction', 'Report Y-2/t0 must remain pre-production construction');
  assert(raw.time.phaseByPeriod[1] === 'ramp_up', 'Report Y-1/t1 must remain pre-commercial ramp-up');
  assert(raw.time.phaseByPeriod[12] === 'closure' && raw.time.phaseByPeriod[13] === 'closure', 'Report Y11-Y12 terminal periods must remain closure');

  const placement = raw.time.runtimePlacement;
  assert(placement?.productionStart?.year === 2027, 'Current Vizsla guidance must place first silver in 2027');
  assert(placement?.constructionStart == null, 'Do not infer a construction-start calendar anchor from a construction-decision milestone');
  assert(placement?.nameplateCapacity == null, 'No current calendar nameplate anchor may be inferred');
  const runtimeParsed = parseProjectJsonV3(raw, { requireRuntimePlacement: true, taxScenario: 'runtime', fiscalScenario: 'runtime' });
  const runtimeYears = runtimeParsed.engineInputWithoutPrices.yearsByPeriod;
  assert(runtimeYears[1] === 2027, 'Runtime t1 / report Y-1 must map to the sourced 2027 first-silver year');
  assert(runtimeYears[0] === 2026, 'productionStartPeriod=1 plus first silver 2027 must place report Y-2/t0 in 2026');
  assert(runtimeYears[2] === 2028, 'Report Y1 must follow as 2028 without stretching the relative FS axis');

  assert(raw.metals.priceKeyByMetal.Ag === 'XAG_USD_TOZ', 'Panuco Ag must use the verified canonical silver price key');
  assert(raw.metals.priceKeyByMetal.Au === 'XAU_USD_TOZ', 'Panuco Au must use the verified canonical gold price key');
  assert(raw.metals.revenueBasisByMetal.Ag === 'METAL_IN_PRODUCT_WITH_PAYABILITY_DEDUCTION', 'Panuco Ag produced/payable metal must preserve the disclosed payability deduction');
  assert(raw.metals.revenueBasisByMetal.Au === 'METAL_IN_PRODUCT_WITH_PAYABILITY_DEDUCTION', 'Panuco Au produced/payable metal must preserve the disclosed payability deduction');
  assert(Math.abs(sum(raw.metals.payableQtyByMetal.Ag) - 94_725_000) <= 2_000, 'Rounded annual payable Ag must reconcile to the 94.725 Moz headline within table rounding');
  assert(sum(raw.metals.payableQtyByMetal.Au) === 776_000, 'Rounded annual payable Au must reconcile to the 776 koz headline');
  assert(raw.operations?.oreMilledTonnes?.[1] === 90_000, 'Y-1 pre-commercial mill feed must remain 90 kt');
  assert(raw.operations?.oreMilledTonnes?.[5] === 1_460_000, 'Y4 Phase 2 mill feed must remain 1.46 Mt');
  assert(raw.operations?.capacity.nameplateThroughput === 4_000 && raw.operations.capacity.throughputUnit === 'tpd', 'Final staged plant nameplate must be 4,000 tpd');

  const initialAnnual = sum(raw.capital.capexUSD.slice(0, 3));
  assert(Math.abs(initialAnnual - PANUCO_SUMMARY_INITIAL_CAPEX_USD) <= 500_000, `Rounded Table 22-2 initial capital ${initialAnnual} must reconcile to US$238.7m summary`);
  assert(Math.abs((raw.capital.capexUSD[4] ?? 0) - PANUCO_SUMMARY_EXPANSION_CAPEX_USD) <= 500_000, 'Report Y3/t4 expansion capital must reconcile to US$15.4m summary');
  assert(Math.abs(sum(raw.capital.sustainingCapexUSD) - PANUCO_SUMMARY_SUSTAINING_CAPEX_USD) <= 500_000, 'Rounded annual sustaining capital must reconcile to US$287.3m summary');
  assert(Math.abs(sum(raw.capital.closureUSD) - PANUCO_SUMMARY_CLOSURE_USD) <= 500_000, 'Rounded annual closure must reconcile to US$37.5m summary');
  assert(raw.capital.closureUSD[12] === 38_000_000, 'Closure must remain in report Y11/t12');
  assert(raw.capital.terminalProceedsUSD?.[12] === 10_000_000, 'US$10m salvage must remain terminal proceeds in report Y11/t12');
  assert(raw.capital.workingCapitalDeltaUSD?.[13] === -2_000_000, 'Final report Y12/t13 working-capital release must remain a US$2m cash inflow');

  const report = raw.verification?.report;
  assert(report, 'Panuco verification.report is required');
  assert(report.priceDeckByKey.XAG_USD_TOZ === 35.5, 'Report-deck Ag must be US$35.50/oz');
  assert(report.priceDeckByKey.XAU_USD_TOZ === 3100, 'Report-deck Au must be US$3,100/oz');
  assert(report.discountRate === 0.05, 'Report discount rate must be 5%');
  assert(report.discountConvention === 'mid_year', 'FS explicitly uses mid-period discounting');
  assert(report.reportNPVPostTaxUSD === 1_802_000_000 && report.reportIRRPostTax === 1.111, 'Post-tax headline must remain US$1.802bn / 111.1%');
  assert(report.reportNPVPreTaxUSD === 2_842_000_000 && report.reportIRRPreTax === 1.593, 'Pre-tax headline must remain US$2.842bn / 159.3%');

  assert(raw.economics.taxModel.mode === 'REPORT_LOCKED_WITH_RUNTIME_PROXY', 'Panuco must use the published annual tax series for report reconciliation');
  assert(Math.abs(-sum(raw.economics.taxModel.reportTaxCashFlowUSD) - PANUCO_REPORT_TOTAL_TAX_USD) <= 1, 'Table 22-2 combined taxes must total US$1.364bn');
  assert(raw.economics.depreciationUSD == null, 'Do not reintroduce the v2 calibrated depreciation/tax-shield proxy');

  assert(raw.economics.fiscalTakeModel.mode === 'RULES', 'Panuco must preserve report-locked and runtime fiscal legs');
  const bridge = raw.economics.fiscalTakeModel.items.find((item) => item.id === 'year1_report_royalty_bridge');
  assert(bridge && 'lockedSeriesUSD' in bridge && bridge.lockedSeriesUSD[2] === 32_900_000, 'Y1 commercial royalty bridge must remain source-locked at US$32.9m');
  const special = raw.economics.fiscalTakeModel.reportLockedItems?.find((item) => item.id === 'special_mining_tax_runtime_only');
  assert(special?.runtimeProxyRule && 'rate' in special.runtimeProxyRule && special.runtimeProxyRule.rate.type === 'FIXED' && special.runtimeProxyRule.rate.rate === 0.085, 'Runtime Special Mining Tax must use the disclosed 8.5% rule');

  const reconciliation = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciliation.status === 'VERIFIED', `Panuco FS must reconcile within the explicit 2% tolerance: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every((check) => check.status === 'PASS'), `Panuco reconciliation hard checks must all pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= 0.02, 'Panuco post-tax NPV must be within 2%');
  assert(Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= 0.02, 'Panuco post-tax IRR must be within 2%');
  assert(Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= 0.02, 'Panuco pre-tax NPV must be within 2%');
  assert(Math.abs(reconciliation.irrPreTaxRelativeDifference ?? Infinity) <= 0.02, 'Panuco pre-tax IRR must be within 2%');

  const reportOutput = await runEngine(raw, 'report');
  const reportRevenueAfterPayability = reportOutput.revenue.grossRevenueUSD.map((value, t) => {
    const deduction = reportOutput.payabilityDeductionUSDTotal?.[t];
    return finite(value) && finite(deduction) ? value - deduction : null;
  });
  const revenueDiff = maxAbsDiff(reportRevenueAfterPayability, PANUCO_REPORT_TOTAL_REVENUE_USD);
  assert(revenueDiff <= 2_000_000, `Panuco annual total revenue should remain within whole-US$M Table 22-2 rounding, max diff=${revenueDiff}`);

  const postTaxMaxDiff = maxAbsDiff(reportOutput.phase1.fcffUSD, PANUCO_REPORT_POST_TAX_FCFF_USD);
  assert(postTaxMaxDiff <= 5_000_000, `Panuco period post-tax FCFF differs from rounded Table 22-2 by ${postTaxMaxDiff}, expected <=US$5m`);
  const preTaxFcff = reportOutput.phase1.fcffUSD.map((value, t) =>
    finite(value) && finite(reportOutput.phase1.taxUSD[t]) ? value + reportOutput.phase1.taxUSD[t] : null
  );
  const preTaxMaxDiff = maxAbsDiff(preTaxFcff, PANUCO_REPORT_PRE_TAX_FCFF_USD);
  assert(preTaxMaxDiff <= 20_000_000, `Panuco period pre-tax FCFF differs from rounded annual Table 22-2 by ${preTaxMaxDiff}, expected <=US$20m; the FS itself evaluates monthly through Y3 and quarterly through Y9`);

  const runtimeOutput = await runEngine(clone(raw), 'runtime');
  assert(runtimeOutput.phase1.fcffUSD.every(finite), 'Panuco runtime FCFF must remain finite with explicit fiscal/tax proxies');
  assert(runtimeOutput.fiscalTake?.byRuleUSD.government_royalty_runtime_post_y1?.some((value) => finite(value) && value > 0), 'Runtime must reconstruct the 1% Government royalty dynamically after Y1');
  assert(runtimeOutput.fiscalTake?.byRuleUSD.private_nsr_runtime_post_y1?.some((value) => finite(value) && value > 0), 'Runtime must reconstruct the weighted private NSR proxy dynamically after Y1');
  assert(runtimeOutput.fiscalTake?.byRuleUSD.special_mining_tax_runtime?.some((value) => finite(value) && value > 0), 'Runtime must reconstruct the disclosed 8.5% Special Mining Tax separately');
  assert(
    runtimeOutput.phase1.taxUSD.some((value, t) => finite(value) && value !== reportOutput.phase1.taxUSD[t]),
    'Runtime 30% income-tax proxy must not silently reuse the report-locked annual tax series',
  );

  console.log(
    `Panuco FS V3 VERIFIED | NPV5 post report=${reconciliation.reportNPVPostTaxUSD} model=${reconciliation.modelNPVPostTaxUSD} relDiff=${reconciliation.npvRelativeDifference} | IRR post report=${reconciliation.reportIRRPostTax} model=${reconciliation.modelIRRPostTax} relDiff=${reconciliation.irrRelativeDifference} | NPV5 pre report=${reconciliation.reportNPVPreTaxUSD} model=${reconciliation.modelNPVPreTaxUSD} relDiff=${reconciliation.npvPreTaxRelativeDifference} | IRR pre report=${reconciliation.reportIRRPreTax} model=${reconciliation.modelIRRPreTax} relDiff=${reconciliation.irrPreTaxRelativeDifference} | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff} | maxRevenueDiff=${revenueDiff}`,
  );
})();
