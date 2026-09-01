import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import {
  COPPER_CREEK_PEA_V3,
  COPPER_CREEK_REPORT_POST_TAX_FCFF_USD,
  COPPER_CREEK_REPORT_PRE_TAX_FCFF_USD,
  COPPER_CREEK_REPORT_YEARS,
} from './fixtures/copperCreekPea.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function sum(series: Array<number | null> | readonly number[]): number {
  return series.reduce<number>((total, value) => total + (finite(value) ? value : 0), 0);
}
function maxAbsDiff(actual: Array<number | null>, expected: readonly number[]): number {
  assert(actual.length === expected.length, `Series length mismatch: actual=${actual.length}, expected=${expected.length}`);
  let max = 0;
  for (let t = 0; t < actual.length; t += 1) {
    assert(finite(actual[t]), `Expected finite Copper Creek cash flow at t=${t}, received ${String(actual[t])}`);
    max = Math.max(max, Math.abs((actual[t] as number) - expected[t]));
  }
  return max;
}

async function runEngine(raw: ProjectJsonV3, scenarioLeg: 'report' | 'runtime') {
  const report = raw.verification?.report;
  assert(report, 'Copper Creek fixture requires verification.report');
  const parsed = parseProjectJsonV3(raw, {
    requireRuntimePlacement: false,
    taxScenario: scenarioLeg,
    fiscalScenario: scenarioLeg,
  });
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'copper-creek-golden',
  });
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runCopperCreekPeaGoldenTest(): Promise<void> {
  const raw = COPPER_CREEK_PEA_V3;
  assert(raw.time.masterN === 38, 'Copper Creek Table 22-3 must map to 39 relative annual periods');
  assert(COPPER_CREEK_REPORT_YEARS.length === 39 && COPPER_CREEK_REPORT_YEARS[0] === 2024 && COPPER_CREEK_REPORT_YEARS[38] === 2062, 'Table 22-3 report calendar evidence must remain 2024-2062');
  assert(raw.time.reportPeriodLabels === null, 'Stale PEA calendar years must not become canonical relative reportPeriodLabels');
  assert(raw.time.runtimePlacement === null, 'Golden reconciliation must not silently reuse the stale PEA calendar as current runtime placement');
  assert(raw.time.productionStartPeriod === 2, 'First payable production in report 2026 must map to t=2 after two construction periods');
  assert(raw.time.nameplateCapacityPeriod === 3, '30 ktpd concentrator nameplate is first reached in report 2027/t=3');
  assert(raw.time.phaseByPeriod.length === 39, 'Copper Creek phase map must have one phase per Table 22-3 period');
  assert(raw.time.phaseByPeriod[0] === 'construction' && raw.time.phaseByPeriod[1] === 'construction', 'First two periods must remain construction');
  assert(raw.time.phaseByPeriod[2] === 'ramp_up', 'First production period must remain ramp-up');
  assert(raw.time.phaseByPeriod[33] === 'operations' && raw.time.phaseByPeriod[34] === 'closure', 'Last production/process period is t=33 and post-production closure tail begins t=34');

  assert(raw.metals.revenueBasisByMetal.Cu === 'PAYABLE_DIRECT', 'Copper Creek Cu revenue must use direct Table 22-3 payable pounds');
  assert(raw.metals.revenueBasisByMetal.Ag === 'PAYABLE_DIRECT', 'Copper Creek Ag revenue must use direct Table 22-3 payable ounces');
  assert(raw.metals.revenueBasisByMetal.Mo === 'PAYABLE_DIRECT', 'Copper Creek Mo revenue must use direct Table 22-3 payable pounds');
  assert(raw.metals.priceKeyByMetal.Cu === 'CU_USD_LB' && raw.metals.priceKeyByMetal.Ag === 'XAG_USD_TOZ' && raw.metals.priceKeyByMetal.Mo === 'MO_USD_TONNE', 'Copper Creek must use verified canonical API price keys');

  const initialCapex = sum(raw.capital.capexUSD.slice(0, 2));
  const expansionCapexRounded = sum(raw.capital.capexUSD.slice(2));
  assert(Math.abs(initialCapex - 797_900_000) <= 1, `Initial CAPEX must equal report US$797.9m, got ${initialCapex}`);
  assert(Math.abs(expansionCapexRounded - 1_620_300_000) <= 1, `Rounded annual expansion CAPEX must sum to US$1,620.3m, got ${expansionCapexRounded}`);
  assert(Math.abs(expansionCapexRounded - 1_620_600_000) <= 500_000, 'Rounded annual expansion CAPEX must remain within US$0.5m of headline US$1,620.6m; no balancing entry is allowed');
  const sustainingRounded = sum(raw.capital.sustainingCapexUSD);
  assert(Math.abs(sustainingRounded - 68_700_000) <= 1, `Rounded annual sustaining CAPEX must sum to US$68.7m, got ${sustainingRounded}`);
  assert(Math.abs(sustainingRounded - 68_800_000) <= 200_000, 'Rounded annual sustaining CAPEX must remain within US$0.2m of headline US$68.8m');
  assert(Math.abs(sum(raw.capital.closureUSD) - 169_800_000) <= 1, 'Closure/reclamation must sum to report US$169.8m');
  const closurePeriods = raw.capital.closureUSD.flatMap((value, t) => finite(value) && value !== 0 ? [t] : []);
  assert(closurePeriods.join(',') === '29,30,31,32,33', `Progressive closure must remain in report periods t=29..33, got ${closurePeriods.join(',')}`);
  assert((raw.capital.workingCapitalDeltaUSD ?? []).every((value) => value === 0), 'Published Table 22-3 has no separate working-capital cash-flow leg');

  const reconciliation = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciliation.status === 'VERIFIED', `Copper Creek PEA must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every((check) => check.status === 'PASS'), `Copper Creek hard checks must all pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(finite(reconciliation.modelNPVPostTaxUSD) && finite(reconciliation.modelIRRPostTax), 'Copper Creek post-tax NPV/IRR must be finite');
  assert(finite(reconciliation.modelNPVPreTaxUSD) && finite(reconciliation.modelIRRPreTax), 'Copper Creek pre-tax NPV/IRR must be finite');
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Copper Creek post-tax NPV must be within report tolerance');
  assert(Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Copper Creek post-tax IRR must be within report tolerance');
  assert(Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Copper Creek pre-tax NPV must be within report tolerance');
  assert(Math.abs(reconciliation.irrPreTaxRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Copper Creek pre-tax IRR must be within report tolerance');

  const reportOutput = await runEngine(raw, 'report');
  const postTaxMaxDiff = maxAbsDiff(reportOutput.phase1.fcffUSD, COPPER_CREEK_REPORT_POST_TAX_FCFF_USD);
  assert(postTaxMaxDiff <= 2_500_000, `Copper Creek period-by-period post-tax FCFF differs from rounded Table 22-3 by up to ${postTaxMaxDiff}, expected <=US$2.5m`);
  const preTaxFcff = reportOutput.phase1.fcffUSD.map((value, t) => finite(value) && finite(reportOutput.phase1.taxUSD[t])
    ? (value as number) + (reportOutput.phase1.taxUSD[t] as number)
    : null);
  const preTaxMaxDiff = maxAbsDiff(preTaxFcff, COPPER_CREEK_REPORT_PRE_TAX_FCFF_USD);
  assert(preTaxMaxDiff <= 2_500_000, `Copper Creek period-by-period pre-tax FCFF differs from rounded Table 22-3 by up to ${preTaxMaxDiff}, expected <=US$2.5m`);

  const reportTaxTotal = sum(reportOutput.phase1.taxUSD);
  assert(Math.abs(reportTaxTotal - 542_300_000) <= 100_000, `Report-leg cash tax must preserve Table 22-3 US$542.3m, got ${reportTaxTotal}`);

  const runtimeFixture = clone(raw);
  runtimeFixture.time.runtimePlacement = {
    productionStart: {
      year: 2030,
      sourceId: 'golden-test-only',
      pageOrTable: 'test-only runtime placement',
      asOfDate: '2026-09-01',
    },
  };
  const runtimeOutput = await runEngine(runtimeFixture, 'runtime');
  assert(runtimeOutput.phase1.fcffUSD.every(finite), 'Copper Creek runtime FCFF must remain finite with explicit royalty/tax proxies');
  const runtimeTaxTotal = sum(runtimeOutput.phase1.taxUSD);
  const runtimeTaxRatio = runtimeTaxTotal / reportTaxTotal;
  assert(runtimeTaxRatio >= 1.05 && runtimeTaxRatio <= 1.15, `Copper Creek runtime tax proxy should be modestly conservative at report deck; ratio=${runtimeTaxRatio}`);

  const runtimeRoyalty = runtimeOutput.fiscalTake?.byRuleUSD.combined_south32_franco_royalties_runtime_proxy;
  assert(runtimeRoyalty && runtimeRoyalty.every(finite), 'Copper Creek runtime must replace report-locked combined royalty with explicit dynamic proxy');
  const reportRoyaltyTotal = 337_800_000;
  const runtimeRoyaltyTotal = sum(runtimeRoyalty as number[]);
  const runtimeRoyaltyRatio = runtimeRoyaltyTotal / reportRoyaltyTotal;
  assert(runtimeRoyaltyRatio >= 1 && runtimeRoyaltyRatio <= 1.10, `Copper Creek 3% all-project NSR proxy should be conservative but modest at report deck; ratio=${runtimeRoyaltyRatio}`);

  const runtimeReportDeckOutput = await runEngine(runtimeFixture, 'runtime');
  const runtimeFixtureShifted = clone(runtimeFixture);
  runtimeFixtureShifted.time.runtimePlacement = {
    productionStart: { year: 2035, sourceId: 'golden-test-only-later' },
  };
  const shiftedOutput = await runEngine(runtimeFixtureShifted, 'runtime');
  assert(JSON.stringify(shiftedOutput.phase1.fcffUSD) === JSON.stringify(runtimeReportDeckOutput.phase1.fcffUSD), 'Changing only runtime calendar placement must not shift Copper Creek economic arrays or FCFF');

  console.log(
    `Copper Creek PEA V3 VERIFIED | NPV7 post report=${reconciliation.reportNPVPostTaxUSD} model=${reconciliation.modelNPVPostTaxUSD} relDiff=${reconciliation.npvRelativeDifference} | IRR post report=${reconciliation.reportIRRPostTax} model=${reconciliation.modelIRRPostTax} relDiff=${reconciliation.irrRelativeDifference} | NPV7 pre report=${reconciliation.reportNPVPreTaxUSD} model=${reconciliation.modelNPVPreTaxUSD} relDiff=${reconciliation.npvPreTaxRelativeDifference} | IRR pre report=${reconciliation.reportIRRPreTax} model=${reconciliation.modelIRRPreTax} relDiff=${reconciliation.irrPreTaxRelativeDifference} | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff} | runtimeTax/reportTax=${runtimeTaxRatio} | runtimeRoyalty/reportRoyalty=${runtimeRoyaltyRatio}`,
  );
})();
