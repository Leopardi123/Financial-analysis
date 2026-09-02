import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import {
  NEW_POLARIS_CAD_TO_USD,
  NEW_POLARIS_FS_V3,
  NEW_POLARIS_REPORT_PERIODS,
  NEW_POLARIS_REPORT_POST_TAX_FCFF_USD,
  NEW_POLARIS_REPORT_PRE_TAX_FCFF_USD,
} from './fixtures/newPolarisFs.ts';

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
  assert(actual.length === expected.length, `Series length mismatch: actual=${actual.length}, expected=${expected.length}`);
  let max = 0;
  for (let t = 0; t < actual.length; t += 1) {
    assert(finite(actual[t]), `Expected finite New Polaris cash flow at t=${t}, received ${String(actual[t])}`);
    max = Math.max(max, Math.abs((actual[t] as number) - expected[t]));
  }
  return max;
}

async function runEngine(raw: ProjectJsonV3, scenarioLeg: 'report' | 'runtime') {
  const report = raw.verification?.report;
  assert(report, 'New Polaris fixture requires verification.report');
  const parsed = parseProjectJsonV3(raw, {
    requireRuntimePlacement: false,
    taxScenario: scenarioLeg,
    fiscalScenario: scenarioLeg,
  });
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'new-polaris-golden',
  });
  input.phase2.discountRate = report.discountRate;
  return computeProjectEngineFullProductionV1(input);
}

(async function runNewPolarisFsGoldenTest(): Promise<void> {
  const raw = NEW_POLARIS_FS_V3;

  assert(raw.time.masterN === 13, 'New Polaris Table 22-2 must map to 14 relative report periods');
  assert(NEW_POLARIS_REPORT_PERIODS.join(',') === '-2,-1,1,2,3,4,5,6,7,8,9,10,11,12', 'Table 22-2 report labels must be preserved exactly');
  assert(raw.time.productionStartPeriod === 2, 'First payable production in report Year 1 must map to t=2');
  assert(raw.time.nameplateCapacityPeriod === 3, 'First full annual production period must map to report Year 2/t=3');
  assert(raw.time.runtimePlacement === null, 'FS report periods must not be silently converted into current calendar guidance');
  assert(raw.metals.revenueBasisByMetal.Au === 'PAYABLE_DIRECT', 'New Polaris Au revenue must use directly reported payable ounces');
  assert(raw.metals.priceKeyByMetal.Au === 'XAU_USD_TOZ', 'New Polaris must use the canonical Au price key');

  assert(Math.abs(sum(raw.capital.capexUSD) - 250_400_000 * NEW_POLARIS_CAD_TO_USD) <= 1, 'Initial CAPEX must equal the report total after the disclosed FX conversion');
  assert(Math.abs(sum(raw.capital.sustainingCapexUSD) - 225_000_000 * NEW_POLARIS_CAD_TO_USD) <= 1, 'Sustaining CAPEX must equal the report total after FX conversion');
  assert(Math.abs(sum(raw.capital.closureUSD) - 20_500_000 * NEW_POLARIS_CAD_TO_USD) <= 1, 'Closure CAPEX must equal the report total after FX conversion');
  assert(Math.abs(sum(raw.capital.terminalProceedsUSD ?? []) - 19_100_000 * NEW_POLARIS_CAD_TO_USD) <= 1, 'Salvage value must equal the report total after FX conversion');
  assert(raw.economics.fiscalTakeModel.mode === 'NONE', 'The fixture must preserve the report decision to include no royalty');

  const reconciliation = await reconcileProjectJsonV3ToReport(raw);
  assert(reconciliation.status === 'VERIFIED', `New Polaris FS must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every((check) => check.status === 'PASS'), `New Polaris hard checks must all pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= 0.02, 'Post-tax NPV must be within 2% of the report');
  assert(Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= 0.02, 'Post-tax IRR must be within 2% of the report');
  assert(Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= 0.02, 'Pre-tax NPV must be within 2% of the report');
  assert(Math.abs(reconciliation.irrPreTaxRelativeDifference ?? Infinity) <= 0.02, 'Pre-tax IRR must be within 2% of the report');

  const reportOutput = await runEngine(raw, 'report');
  const postTaxMaxDiff = maxAbsDiff(reportOutput.phase1.fcffUSD, NEW_POLARIS_REPORT_POST_TAX_FCFF_USD);
  assert(postTaxMaxDiff <= 250_000, `New Polaris post-tax FCFF differs from rounded Table 22-2 by up to ${postTaxMaxDiff}; expected <=US$0.25m`);

  const preTaxFcff = reportOutput.phase1.fcffUSD.map((value, t) =>
    finite(value) && finite(reportOutput.phase1.taxUSD[t])
      ? (value as number) + (reportOutput.phase1.taxUSD[t] as number)
      : null);
  const preTaxMaxDiff = maxAbsDiff(preTaxFcff, NEW_POLARIS_REPORT_PRE_TAX_FCFF_USD);
  assert(preTaxMaxDiff <= 250_000, `New Polaris pre-tax FCFF differs from rounded Table 22-2 by up to ${preTaxMaxDiff}; expected <=US$0.25m`);

  const reportTaxTotal = sum(reportOutput.phase1.taxUSD);
  assert(Math.abs(reportTaxTotal - 343_000_000 * NEW_POLARIS_CAD_TO_USD) <= 1, 'Report-leg tax must preserve the Table 22-2 C$343.0m total after FX conversion');

  const runtimeFixture = JSON.parse(JSON.stringify(raw)) as ProjectJsonV3;
  runtimeFixture.time.runtimePlacement = {
    productionStart: {
      year: 2030,
      sourceId: 'golden-test-only',
      pageOrTable: 'test-only runtime placement',
      asOfDate: '2026-09-02',
    },
  };
  const runtimeOutput = await runEngine(runtimeFixture, 'runtime');
  assert(runtimeOutput.phase1.fcffUSD.every(finite), 'New Polaris runtime FCFF must remain finite with the disclosed 27% corporate-tax proxy');

  console.log(
    `New Polaris FS V3 VERIFIED | NPV5 post report=${reconciliation.reportNPVPostTaxUSD} model=${reconciliation.modelNPVPostTaxUSD} relDiff=${reconciliation.npvRelativeDifference} | IRR post report=${reconciliation.reportIRRPostTax} model=${reconciliation.modelIRRPostTax} relDiff=${reconciliation.irrRelativeDifference} | NPV5 pre report=${reconciliation.reportNPVPreTaxUSD} model=${reconciliation.modelNPVPreTaxUSD} relDiff=${reconciliation.npvPreTaxRelativeDifference} | IRR pre report=${reconciliation.reportIRRPreTax} model=${reconciliation.modelIRRPreTax} relDiff=${reconciliation.irrPreTaxRelativeDifference} | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff}`,
  );
})();
