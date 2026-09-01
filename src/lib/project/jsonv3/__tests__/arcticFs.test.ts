import { computeProjectEngineFullProductionV1 } from '../../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../../jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../compile.ts';
import { reconcileProjectJsonV3ToReport } from '../reconciliation.ts';
import type { ProjectJsonV3 } from '../schema.ts';
import {
  ARCTIC_FS_V3,
  ARCTIC_REPORT_POST_TAX_FCFF_USD,
  ARCTIC_REPORT_PRE_TAX_FCFF_USD,
} from './fixtures/arcticFs.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function maxAbsDiff(actual: Array<number | null>, expected: readonly number[]): number {
  assert(actual.length === expected.length, `Series length mismatch: actual=${actual.length}, expected=${expected.length}`);
  let max = 0;
  for (let t = 0; t < actual.length; t += 1) {
    assert(finite(actual[t]), `Expected finite Arctic cash flow at t=${t}, received ${String(actual[t])}`);
    max = Math.max(max, Math.abs((actual[t] as number) - expected[t]));
  }
  return max;
}
function sumFinite(series: Array<number | null>): number {
  let total = 0;
  for (const value of series) {
    assert(finite(value), `Expected finite series value, received ${String(value)}`);
    total += value;
  }
  return total;
}

async function runEngine(raw: ProjectJsonV3, taxScenario: 'report' | 'runtime') {
  const report = raw.verification?.report;
  assert(report, 'Arctic fixture requires verification.report');
  const parsed = parseProjectJsonV3(raw, {
    requireRuntimePlacement: taxScenario === 'runtime',
    taxScenario,
    fiscalScenario: taxScenario,
  });
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey },
    allowRefresh: false,
    projectId: `arctic-${taxScenario}`,
  });
  input.phase2.discountRate = report.discountRate;
  return { parsed, output: computeProjectEngineFullProductionV1(input) };
}

(async function runArcticFsGoldenTest(): Promise<void> {
  assert(ARCTIC_FS_V3.time.masterN === 16, 'Arctic Table 22-4 must map to 17 relative periods');
  assert(ARCTIC_FS_V3.time.productionStartPeriod === 3, 'Arctic Year 1 production must be t=3 after Years -3,-2,-1');
  assert(ARCTIC_FS_V3.time.nameplateCapacityPeriod === 4, 'Arctic Year 2 must be the first 3.65Mt/y nameplate period');
  assert(ARCTIC_FS_V3.time.phaseByPeriod[3] === 'ramp_up', 'Arctic Year 1 must be represented as ramp-up');
  assert(ARCTIC_FS_V3.time.phaseByPeriod[16] === 'closure', 'Arctic Year 14 must be closure only');
  for (const metal of ['Cu', 'Zn', 'Pb', 'Au', 'Ag']) {
    assert(ARCTIC_FS_V3.metals.revenueBasisByMetal[metal] === 'PAYABLE_DIRECT', `${metal} must use directly reported payable production`);
  }

  const reconciliation = await reconcileProjectJsonV3ToReport(ARCTIC_FS_V3);
  assert(reconciliation.status === 'VERIFIED', `Arctic FS must reconcile: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(reconciliation.hardChecks.every((check) => check.status === 'PASS'), `Arctic hard checks must all pass: ${JSON.stringify(reconciliation.hardChecks)}`);
  assert(Math.abs(reconciliation.npvRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Arctic post-tax NPV must be within explicit report tolerance');
  assert(Math.abs(reconciliation.irrRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Arctic post-tax IRR must be within explicit report tolerance');
  assert(Math.abs(reconciliation.npvPreTaxRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Arctic pre-tax NPV must be within explicit report tolerance');
  assert(Math.abs(reconciliation.irrPreTaxRelativeDifference ?? Infinity) <= reconciliation.toleranceRelative, 'Arctic pre-tax IRR must be within explicit report tolerance');

  const reportRun = await runEngine(ARCTIC_FS_V3, 'report');
  const postTaxMaxDiff = maxAbsDiff(reportRun.output.phase1.fcffUSD, ARCTIC_REPORT_POST_TAX_FCFF_USD);
  assert(postTaxMaxDiff <= 1_000_000, `Arctic post-tax annual FCFF differs from rounded Table 22-4 by up to ${postTaxMaxDiff}; expected <=US$1m`);
  const preTaxFcff = reportRun.output.phase1.fcffUSD.map((value, t) => finite(value) && finite(reportRun.output.phase1.taxUSD[t])
    ? (value as number) + (reportRun.output.phase1.taxUSD[t] as number)
    : null);
  const preTaxMaxDiff = maxAbsDiff(preTaxFcff, ARCTIC_REPORT_PRE_TAX_FCFF_USD);
  assert(preTaxMaxDiff <= 1_000_000, `Arctic pre-tax annual FCFF differs from rounded Table 22-4 by up to ${preTaxMaxDiff}; expected <=US$1m`);

  const runtimeRun = await runEngine(ARCTIC_FS_V3, 'runtime');
  assert(runtimeRun.parsed.engineInputWithoutPrices.yearsByPeriod[0] === 2029, '2032 production anchor must imply Arctic t=0 in 2029');
  assert(runtimeRun.parsed.engineInputWithoutPrices.yearsByPeriod[3] === 2032, 'Arctic t=3 must map to production start 2032');
  assert(runtimeRun.parsed.engineInputWithoutPrices.yearsByPeriod[16] === 2045, 'Arctic closure t=16 must map to 2045');

  const reportTax = sumFinite(reportRun.output.phase1.taxUSD);
  const runtimeTax = sumFinite(runtimeRun.output.phase1.taxUSD);
  const runtimeTaxRatio = runtimeTax / reportTax;
  assert(Math.abs(reportTax - 922_700_000) < 100_000, `Arctic report tax must reproduce US$922.7m, received ${reportTax}`);
  assert(runtimeTax > reportTax, `Arctic runtime tax proxy must be conservative at the report deck: report=${reportTax}, runtime=${runtimeTax}`);
  assert(runtimeTaxRatio >= 1.05 && runtimeTaxRatio <= 1.15, `Arctic runtime tax proxy should be modestly conservative (5-15% above report tax), ratio=${runtimeTaxRatio}`);
  assert(runtimeRun.output.phase1.fcffUSD.every(finite), 'Arctic runtime FCFF must remain finite with conservative tax proxy');

  console.log(
    `Arctic FS V3 VERIFIED | NPV8 post report=${reconciliation.reportNPVPostTaxUSD} model=${reconciliation.modelNPVPostTaxUSD} relDiff=${reconciliation.npvRelativeDifference} | IRR post report=${reconciliation.reportIRRPostTax} model=${reconciliation.modelIRRPostTax} relDiff=${reconciliation.irrRelativeDifference} | NPV8 pre report=${reconciliation.reportNPVPreTaxUSD} model=${reconciliation.modelNPVPreTaxUSD} relDiff=${reconciliation.npvPreTaxRelativeDifference} | IRR pre report=${reconciliation.reportIRRPreTax} model=${reconciliation.modelIRRPreTax} relDiff=${reconciliation.irrPreTaxRelativeDifference} | maxFCFFdiff post=${postTaxMaxDiff} pre=${preTaxMaxDiff} | runtimeTax/reportTax=${runtimeTaxRatio}`,
  );
})();
