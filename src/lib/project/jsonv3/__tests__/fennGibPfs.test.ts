import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import {
  FENN_GIB_CAD_TO_USD,
  FENN_GIB_PFS_V3,
  FENN_GIB_REPORT_CASHFLOW_SUSTAINING_CAPEX_CAD,
  FENN_GIB_REPORT_GROSS_REVENUE_USD,
  FENN_GIB_REPORT_PERIODS,
  FENN_GIB_REPORT_POST_TAX_FCFF_USD,
  FENN_GIB_REPORT_PRE_TAX_FCFF_USD,
  FENN_GIB_REPORT_SUMMARY_SUSTAINING_CAPEX_CAD,
} from './fixtures/fennGibPfs.ts';

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
    assert(finite(value), `Expected finite Fenn-Gib value at t=${t}, received ${String(value)}`);
    return Math.max(max, Math.abs(value - expected[t]));
  }, 0);
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function runEngine(raw: ProjectJsonV3, leg: 'report' | 'runtime') {
  const report = raw.verification?.report;
  assert(report, 'Fenn-Gib fixture requires verification.report');
  const parsed = parseProjectJsonV3(raw, {
    requireRuntimePlacement: leg === 'runtime',
    taxScenario: leg,
    fiscalScenario: leg,
  });
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'fenn-gib-golden',
  });
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runFennGibPfsGoldenTest(): Promise<void> {
  const raw = FENN_GIB_PFS_V3;
  assert(raw.time.masterN === 18, 'Table 22-2 Y-3..Y16 must map to 19 periods / masterN=18');
  assert(raw.time.productionStartPeriod === 3, 'Report Year 1 must be t=3 after Y-3,Y-2,Y-1');
  assert(raw.time.nameplateCapacityPeriod === 4, 'First full 1.752 Mt / 4,800 t/d year must be report Year 2 / t=4');
  assert(FENN_GIB_REPORT_PERIODS.join(',') === raw.time.reportPeriodLabels?.join(','), 'Report period labels must be preserved exactly');

  const placement = raw.time.runtimePlacement;
  assert(placement?.constructionStart?.year === 2026, 'Sourced Fenn-Gib construction start must be 2026');
  assert(placement?.productionStart?.year === 2029, 'Sourced Fenn-Gib first production must be 2029');
  assert(placement?.nameplateCapacity?.year === 2030, 'Sourced Fenn-Gib first full nameplate year must be 2030');
  parseProjectJsonV3(raw, { requireRuntimePlacement: true, taxScenario: 'runtime', fiscalScenario: 'runtime' });

  assert(raw.metals.priceKeyByMetal.Au === 'XAU_USD_TOZ', 'Fenn-Gib Au must use the verified canonical gold price key');
  assert(raw.metals.revenueBasisByMetal.Au === 'PAYABLE_DIRECT', 'Fenn-Gib report-derived payable Au must be the sole revenue basis');
  assert(raw.metals.payableQtyUnitByMetal.Au === 'toz', 'Fenn-Gib payable Au must be represented in troy ounces');

  assert(Math.abs(sum(raw.capital.capexUSD) - 450_000_000 * FENN_GIB_CAD_TO_USD) <= 1, 'Table 22-2 initial capital must sum to C$450.0m');
  assert(Math.abs(sum(raw.capital.sustainingCapexUSD) - FENN_GIB_REPORT_CASHFLOW_SUSTAINING_CAPEX_CAD * FENN_GIB_CAD_TO_USD) <= 1, 'Table 22-2 annual sustaining capital must sum to C$68.2m');
  assert(FENN_GIB_REPORT_SUMMARY_SUSTAINING_CAPEX_CAD === 60_900_000, 'Tables 21-1/22-1 summary sustaining capital checkpoint must remain C$60.9m');
  assert(
    FENN_GIB_REPORT_CASHFLOW_SUSTAINING_CAPEX_CAD - FENN_GIB_REPORT_SUMMARY_SUSTAINING_CAPEX_CAD === 7_300_000,
    'The report-internal C$7.3m sustaining-capital discrepancy must remain explicit rather than balanced away',
  );
  assert(raw.capital.closureUSD[18] === 49_400_000 * FENN_GIB_CAD_TO_USD, 'Y16/t18 closure must remain in the final report period');
  assert(raw.capital.workingCapitalDeltaUSD?.[18] === -3_100_000 * FENN_GIB_CAD_TO_USD, 'Y16/t18 working-capital unwind must remain in the final report period');
  assert(sum(raw.capital.terminalProceedsUSD ?? []) === 0, 'Fenn-Gib report does not disclose terminal proceeds');

  const report = raw.verification?.report;
  assert(report, 'Fenn-Gib verification.report is required');
  assert(report.priceDeckByKey.XAU_USD_TOZ === 3100, 'Report-deck Au must be US$3,100/oz');
  assert(report.discountRate === 0.05, 'Report discount rate must be 5%');
  assert(report.discountConvention === 'period_end_from_model_start', 'Report must use end-period discounting to start of construction');

  const reconciliation = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciliation.status === 'VERIFIED', `Fenn-Gib PFS must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every((check) => check.status === 'PASS'), `Fenn-Gib hard checks must all pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= 0.02, 'Fenn-Gib post-tax NPV must be within 2%');
  assert(Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= 0.02, 'Fenn-Gib post-tax IRR must be within 2%');
  assert(Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= 0.02, 'Fenn-Gib pre-tax NPV must be within 2%');
  assert(Math.abs(reconciliation.irrPreTaxRelativeDifference ?? Infinity) <= 0.02, 'Fenn-Gib pre-tax IRR must be within 2%');

  const reportOutput = await runEngine(raw, 'report');
  const revenueDiff = maxAbsDiff(reportOutput.revenue.grossRevenueUSD, FENN_GIB_REPORT_GROSS_REVENUE_USD);
  assert(revenueDiff <= 250_000, `Fenn-Gib annual gross revenue should stay within report rounding, max diff=${revenueDiff}`);

  const postTaxMaxDiff = maxAbsDiff(reportOutput.phase1.fcffUSD, FENN_GIB_REPORT_POST_TAX_FCFF_USD);
  assert(postTaxMaxDiff <= 250_000, `Fenn-Gib period post-tax FCFF differs from rounded Table 22-2 by ${postTaxMaxDiff}, expected <=250k USD`);
  const preTaxFcff = reportOutput.phase1.fcffUSD.map((value, t) =>
    finite(value) && finite(reportOutput.phase1.taxUSD[t]) ? value + reportOutput.phase1.taxUSD[t] : null
  );
  const preTaxMaxDiff = maxAbsDiff(preTaxFcff, FENN_GIB_REPORT_PRE_TAX_FCFF_USD);
  assert(preTaxMaxDiff <= 250_000, `Fenn-Gib period pre-tax FCFF differs from rounded Table 22-2 by ${preTaxMaxDiff}, expected <=250k USD`);

  const runtimeOutput = await runEngine(clone(raw), 'runtime');
  assert(runtimeOutput.phase1.fcffUSD.every(finite), 'Fenn-Gib runtime FCFF must remain finite with explicit royalty/tax proxies');
  const runtimeRoyalty = runtimeOutput.fiscalTake?.byRuleUSD.property_nsr_royalties_runtime;
  assert(runtimeRoyalty?.some((value) => finite(value) && value > 0), 'Fenn-Gib runtime must reconstruct the disclosed 1.7% LOM-average NSR proxy dynamically');
  assert(
    runtimeOutput.phase1.taxUSD.some((value, t) => finite(value) && value !== reportOutput.phase1.taxUSD[t]),
    'Fenn-Gib runtime tax proxy must not silently reuse the report-locked annual tax series',
  );

  console.log(
    `Fenn-Gib PFS V3 VERIFIED | NPV5 post report=${reconciliation.reportNPVPostTaxUSD} model=${reconciliation.modelNPVPostTaxUSD} relDiff=${reconciliation.npvRelativeDifference} | IRR post report=${reconciliation.reportIRRPostTax} model=${reconciliation.modelIRRPostTax} relDiff=${reconciliation.irrRelativeDifference} | NPV5 pre report=${reconciliation.reportNPVPreTaxUSD} model=${reconciliation.modelNPVPreTaxUSD} relDiff=${reconciliation.npvPreTaxRelativeDifference} | IRR pre report=${reconciliation.reportIRRPreTax} model=${reconciliation.modelIRRPreTax} relDiff=${reconciliation.irrPreTaxRelativeDifference} | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff} | maxRevenueDiff=${revenueDiff} | sustaining summary=C$${FENN_GIB_REPORT_SUMMARY_SUSTAINING_CAPEX_CAD / 1_000_000}m vs Table22-2=C$${FENN_GIB_REPORT_CASHFLOW_SUSTAINING_CAPEX_CAD / 1_000_000}m`,
  );
})();
