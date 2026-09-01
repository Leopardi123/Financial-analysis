import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { convertPriceToCanonical } from '../../../units/conversion.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import {
  BERG_PFS_V3,
  BERG_REPORT_POST_TAX_FCFF_USD,
  BERG_REPORT_PRE_TAX_FCFF_USD,
} from './fixtures/bergPfs.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function maxAbsDiff(actual: Array<number | null>, expected: readonly number[]): number {
  assert(actual.length === expected.length, `Series length mismatch: actual=${actual.length}, expected=${expected.length}`);
  let max = 0;
  for (let t = 0; t < actual.length; t += 1) {
    assert(finite(actual[t]), `Expected finite Berg cash flow at t=${t}, received ${String(actual[t])}`);
    max = Math.max(max, Math.abs((actual[t] as number) - expected[t]));
  }
  return max;
}

async function runReportEngine(raw: ProjectJsonV3) {
  const report = raw.verification?.report;
  assert(report, 'Berg golden fixture requires verification.report');
  const parsed = parseProjectJsonV3(raw, {
    requireRuntimePlacement: false,
    taxScenario: 'report',
    fiscalScenario: 'report',
  });
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'berg-golden',
  });
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runBergPfsGoldenTest(): Promise<void> {
  assert(BERG_PFS_V3.time.masterN === 31, 'Berg Table 22-4 must map to 32 relative periods');
  assert(BERG_PFS_V3.time.productionStartPeriod === 3, 'Berg production Year 1 must be t=3 after report Years -3,-2,-1');
  assert(BERG_PFS_V3.metals.revenueBasisByMetal.Cu === 'PAYABLE_DIRECT', 'Berg Cu revenue must use directly reported payable metal');
  assert(BERG_PFS_V3.metals.revenueBasisByMetal.Mo === 'PAYABLE_DIRECT', 'Berg Mo revenue must use directly reported payable metal');
  assert(BERG_PFS_V3.metals.payableQtyUnitByMetal.Mo === 'lb', 'Berg report payable Mo must remain represented in lb');

  const report = BERG_PFS_V3.verification?.report;
  assert(report, 'Berg fixture requires report assumptions');
  const moReportPriceUsdPerTonne = report.priceDeckByKey.MO_USD_TONNE;
  assert(finite(moReportPriceUsdPerTonne), 'Berg report deck must provide MO_USD_TONNE');
  const moReportPriceUsdPerLb = convertPriceToCanonical('Mo', moReportPriceUsdPerTonne, 'USD_tonne');
  assert(finite(moReportPriceUsdPerLb), 'Berg Mo USD/tonne must convert to canonical USD/lb');
  assert(Math.abs(moReportPriceUsdPerLb - 20) < 1e-9, `Berg report Mo price must convert from USD/tonne to $20/lb, received ${String(moReportPriceUsdPerLb)}`);
  const firstProductionMoLb = BERG_PFS_V3.metals.payableQtyByMetal.Mo[3];
  assert(finite(firstProductionMoLb), 'Berg Year 1 payable Mo must be finite');
  assert(Math.abs(firstProductionMoLb * moReportPriceUsdPerLb - 440_000_000) < 1, 'Berg Year 1 report-deck Mo revenue identity must be 22m lb × $20/lb = $440m before off-site/fiscal deductions');

  const reconciliation = await reconcileProjectJsonV3ToReport(BERG_PFS_V3);
  assert(reconciliation.status === 'VERIFIED', `Berg PFS must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every((check) => check.status === 'PASS'), `Berg hard checks must all pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(finite(reconciliation.modelNPVPostTaxUSD), 'Berg model post-tax NPV must be finite');
  assert(finite(reconciliation.modelIRRPostTax), 'Berg model post-tax IRR must be finite');
  assert(finite(reconciliation.modelNPVPreTaxUSD), 'Berg model pre-tax NPV must be finite');
  assert(finite(reconciliation.modelIRRPreTax), 'Berg model pre-tax IRR must be finite');
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Berg post-tax NPV must be within report tolerance');
  assert(Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Berg post-tax IRR must be within report tolerance');
  assert(Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Berg pre-tax NPV must be within report tolerance');
  assert(Math.abs(reconciliation.irrPreTaxRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Berg pre-tax IRR must be within report tolerance');

  const reportOutput = await runReportEngine(BERG_PFS_V3);
  const postTaxMaxDiff = maxAbsDiff(reportOutput.phase1.fcffUSD, BERG_REPORT_POST_TAX_FCFF_USD);
  assert(postTaxMaxDiff <= 12_000_000, `Berg period-by-period post-tax FCFF differs from rounded Table 22-4 by up to ${postTaxMaxDiff}, expected <=12m USD`);
  const preTaxFcff = reportOutput.phase1.fcffUSD.map((value, t) => finite(value) && finite(reportOutput.phase1.taxUSD[t])
    ? (value as number) + (reportOutput.phase1.taxUSD[t] as number)
    : null);
  const preTaxMaxDiff = maxAbsDiff(preTaxFcff, BERG_REPORT_PRE_TAX_FCFF_USD);
  assert(preTaxMaxDiff <= 12_000_000, `Berg period-by-period pre-tax FCFF differs from rounded Table 22-4 by up to ${preTaxMaxDiff}, expected <=12m USD`);

  const nsr = reportOutput.fiscalTake?.byRuleUSD.royal_gold_nsr_1pct;
  assert(nsr && nsr.some((value) => finite(value) && value > 0), 'Berg 1% NSR must be dynamically reconstructed by the fiscal engine');
  assert(Math.abs((nsr?.[3] ?? 0) - 16_254_910) < 100_000, 'Berg Year 1 dynamic NSR should reconcile to the rounded Table 22-4 royalty after CAD/USD translation');

  const runtimeFixture = clone(BERG_PFS_V3);
  runtimeFixture.time.runtimePlacement = {
    productionStart: {
      year: 2034,
      sourceId: 'golden-test-only',
      pageOrTable: 'test-only runtime placement',
      asOfDate: '2026-08-31',
    },
  };
  const runtimeReport = runtimeFixture.verification?.report;
  assert(runtimeReport, 'Berg runtime fixture requires report fixed deck for deterministic test');
  const runtimeParsed = parseProjectJsonV3(runtimeFixture, { taxScenario: 'runtime', fiscalScenario: 'runtime' });
  const runtimeInput = await resolveProjectPricesToEngineInput({
    parsed: runtimeParsed,
    scenario: { mode: 'fixed', fixedPriceByKey: runtimeReport.priceDeckByKey },
    allowRefresh: false,
    projectId: 'berg-golden-runtime',
  });
  runtimeInput.phase2.discountRate = runtimeReport.discountRate;
  const runtimeOutput = computeProjectEngineFullProductionV1(runtimeInput);
  assert(runtimeOutput.phase1.fcffUSD.every(finite), 'Berg runtime FCFF must remain finite with the simplified tax proxy');
  assert(runtimeOutput.phase1.taxUSD.some((value, t) => finite(value) && value !== reportOutput.phase1.taxUSD[t]), 'Berg runtime tax proxy must not silently reuse the Table 22-4 report tax series');

  console.log(
    `Berg PFS V3 VERIFIED | NPV8 post report=${reconciliation.reportNPVPostTaxUSD} model=${reconciliation.modelNPVPostTaxUSD} relDiff=${reconciliation.npvRelativeDifference} | IRR post report=${reconciliation.reportIRRPostTax} model=${reconciliation.modelIRRPostTax} relDiff=${reconciliation.irrRelativeDifference} | NPV8 pre report=${reconciliation.reportNPVPreTaxUSD} model=${reconciliation.modelNPVPreTaxUSD} relDiff=${reconciliation.npvPreTaxRelativeDifference} | IRR pre report=${reconciliation.reportIRRPreTax} model=${reconciliation.modelIRRPreTax} relDiff=${reconciliation.irrPreTaxRelativeDifference} | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff} | Mo report price=${moReportPriceUsdPerLb} USD/lb`,
  );
})();